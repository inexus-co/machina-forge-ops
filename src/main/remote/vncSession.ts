import { Socket } from "node:net";
import { t } from "../../shared/i18n";
import tls from "node:tls";
import type { RemoteScreenEvent } from "../../shared/remote";
import {
  RFB_WHEEL_DOWN,
  RFB_WHEEL_UP,
  RfbClient,
  rfbButtonMask,
  scancodeToKeysym,
  shiftedKeysym,
  unicodeToKeysym,
} from "./vnc/rfb";

/**
 * One VNC screen, spoken over a plain TCP socket.
 *
 * The shape is `RdpSession`'s on purpose: `start/stop/open/snapshot/mouse/wheel/key/unicode/
 * clipboard`, emitting `RemoteScreenEvent`. Everything above it — the canvas, the agent's screen
 * tools, the controller — already speaks that and does not learn which protocol answered. The RFB
 * protocol itself is in `vnc/rfb.ts`; this carries its bytes on a socket and turns the
 * application's idea of a keyboard into the one X has.
 *
 * VNC has no server certificate to pin (there is no key identity in RFB), so there is no
 * `onCertificate` here — the password, when there is one, is the whole of the authentication.
 */

export type VncEvents = {
  onScreen(event: RemoteScreenEvent): void;
  onClipboard?(text: string): void;
  /**
   * The certificate an X.509 server showed, reported on every connection.
   *
   * The same arrangement RDP has: the first is remembered and every change is refused, because
   * there is nobody to ask half-way through a handshake.
   */
  onCertificate?(fingerprint: string): void;
};

export type VncTarget = {
  host: string;
  port: number;
  /** Empty is allowed: a VNC server may offer no authentication at all. */
  password: string;
  /** Only the dialects that have one (VeNCrypt, Apple, UltraVNC) use this. */
  username?: string;
  /** The operator accepted that this host's password may cross the wire in the clear. */
  allowPlaintext?: boolean;
  /** What was recorded last time, or empty on a first meeting. */
  expectedFingerprint?: string;
  /** The address to name in messages, when `host` is a bastion forward on this machine. */
  displayAddress?: string;
};

/** Long enough for a slow handshake, short enough that a wrong address is not a minute of hope. */
const CONNECT_TIMEOUT_MS = 15_000;

export class VncSession {
  private socket?: Socket;
  private client?: RfbClient;
  private closed = false;
  private generation = 0;
  /** Which keysym each held key went down with, so the release matches and no key sticks. */
  private readonly held = new Map<number, number>();
  private shift = false;
  /** The buttons currently down, so a scroll does not let go of a drag. */
  private buttons = 0;
  /** The first half of a character outside the basic plane, waiting for its other half. */
  private surrogate?: number;
  /** What this machine had copied when the screen opened, offered once the far side is listening. */
  private priming?: string;
  /** The TLS around the socket, once a VeNCrypt X.509 sub-type has asked for one. */
  private secure?: tls.TLSSocket;
  /** The certificate this server showed last time, or empty on a first meeting. */
  private expectedFingerprint = "";

  constructor(private readonly events: VncEvents) {}

  get open(): boolean {
    return Boolean(this.socket) && !this.closed;
  }

  start(target: VncTarget) {
    this.closed = false;
    this.held.clear();
    this.shift = false;
    this.buttons = 0;
    this.surrogate = undefined;
    this.secure = undefined;
    const generation = ++this.generation;
    const where = target.displayAddress ?? `${target.host}:${target.port}`;

    const socket = new Socket();
    this.socket = socket;
    socket.setNoDelay(true);
    socket.setTimeout(CONNECT_TIMEOUT_MS);

    const client = new RfbClient(
      {
        onScreen: (event) => {
          if (generation === this.generation) this.events.onScreen(event);
        },
        onClipboard: (text) => {
          if (generation === this.generation) this.events.onClipboard?.(text);
        },
        onError: (detail) => {
          if (generation === this.generation) this.finish(detail);
        },
        onReady: () => {
          /*
           * Connected, and the desktop's size is known.
           *
           * The handshake's deadline is over — an idle connection is normal from here, because an
           * incremental update is a question the server holds until something moves. What is not
           * normal is the far side going away without saying so (a VPN dropping, a bastion dying),
           * which leaves a picture on screen that is no longer a claim about anything. TCP
           * keepalive is what notices that, so the session closes and the canvas goes dark.
           */
          socket.setTimeout(0);
          socket.setKeepAlive(true, 30_000);
          if (this.priming) {
            client.cutText(this.priming);
            this.priming = undefined;
          }
        },
        /* VeNCrypt's TLS sub-types: the rest of the conversation runs inside a tunnel, which only
           whoever owns the socket can build. */
        onUpgradeTls: () => {
          if (generation === this.generation) this.upgrade(socket, client, generation, where);
        },
      },
      (bytes) => {
        // The server speaks first, so by the first write the socket is connected.
        this.transport(socket).write(bytes);
      },
      {
        username: target.username ?? "",
        password: target.password,
        allowPlaintext: Boolean(target.allowPlaintext),
      },
    );
    this.client = client;
    this.expectedFingerprint = target.expectedFingerprint ?? "";

    socket.on("data", (chunk: Buffer) => {
      if (generation !== this.generation) return;
      /*
       * A throw here would leave the main process, not this session.
       *
       * The RDP helper is a process of its own and takes its failures with it; this parser runs
       * in the window's own process, where an unhandled error is the whole application.
       */
      try {
        client.receive(chunk);
      } catch (cause) {
        this.finish(cause instanceof Error ? cause.message : String(cause));
      }
    });
    socket.on("timeout", () => {
      if (generation === this.generation) this.finish(t("Could not reach {where} (timed out).", { where }));
    });
    socket.on("error", (cause: Error) => {
      if (generation === this.generation) this.finish(describeSocketError(cause, where));
    });
    socket.on("close", () => {
      if (generation === this.generation) this.finish(t("The connection to {where} went away.", { where }));
    });

    socket.connect(target.port, target.host);
  }

  /** Whichever socket is carrying the conversation: the raw one, or the TLS around it. */
  private transport(socket: Socket): Socket | tls.TLSSocket {
    return this.secure ?? socket;
  }

  /**
   * Put TLS around the connection, then hand the conversation back.
   *
   * Only the X.509 sub-types reach here — the anonymous ones are refused while choosing, because
   * Node's OpenSSL carries no anonymous cipher suites and the handshake would fail with an
   * explanation about record headers rather than about the server.
   *
   * The certificate is judged the way RDP's is: remembered on a first meeting, and any change
   * refuses the connection. There is nobody to ask in the middle of a handshake, and a screen
   * that quietly reconnects to a different machine is the thing worth preventing.
   */
  private upgrade(socket: Socket, client: RfbClient, generation: number, where: string) {
    socket.removeAllListeners("data");
    const secure = tls.connect({
      socket,
      /* Judged here by fingerprint, not by a certificate authority: these are a customer's own
         machines, and their certificates are self-signed by definition. */
      rejectUnauthorized: false,
    });
    this.secure = secure;

    secure.on("secureConnect", () => {
      if (generation !== this.generation) return;
      const fingerprint = secure.getPeerCertificate()?.fingerprint256 ?? "";
      if (!fingerprint) {
        this.finish(t("{where} presented no certificate.", { where }));
        return;
      }
      if (this.expectedFingerprint && this.expectedFingerprint !== fingerprint) {
        this.finish(
          t(
            "This server's certificate is not the one recorded. Either {where} was rebuilt, or it is a different server. If you rebuilt it, forget this server's key in the settings and then connect.",
            { where },
          ),
        );
        return;
      }
      this.events.onCertificate?.(fingerprint);
      client.secured((bytes) => secure.write(bytes));
    });
    secure.on("data", (chunk: Buffer) => {
      if (generation !== this.generation) return;
      try {
        client.receive(chunk);
      } catch (cause) {
        this.finish(cause instanceof Error ? cause.message : String(cause));
      }
    });
    secure.on("error", (cause: Error) => {
      if (generation === this.generation) {
        this.finish(
          t("Encryption (TLS) with {where} failed: {reason}", {
            where,
            reason: describeSocketError(cause, where),
          }),
        );
      }
    });
    secure.on("close", () => {
      if (generation === this.generation) this.finish(t("The connection to {where} went away.", { where }));
    });
  }

  /** `buttons` is the RDP-convention bit mask (1 left, 2 right, 4 middle). */
  mouse(x: number, y: number, buttons: number) {
    this.buttons = rfbButtonMask(buttons);
    this.client?.pointer(x, y, this.buttons);
  }

  /** One notch is 1; positive scrolls away from the operator (RFB button 4), else button 5. */
  wheel(x: number, y: number, notches: number) {
    const client = this.client;
    if (!client) return;
    const bit = notches > 0 ? RFB_WHEEL_UP : RFB_WHEEL_DOWN;
    for (let i = 0; i < Math.min(Math.abs(Math.round(notches)), 10); i++) {
      // Back to whatever was held, not to nothing: scrolling mid-drag must not drop the drag.
      client.pointer(x, y, this.buttons | bit);
      client.pointer(x, y, this.buttons);
    }
  }

  /**
   * One key, as a place on the keyboard.
   *
   * The press decides the keysym — shifted or not — and the release repeats whatever the press
   * sent. Sending `A` down and `a` up would leave the server holding a key nobody let go of.
   */
  key(scancode: number, down: boolean) {
    if (down) {
      const keysym = this.shift
        ? (shiftedKeysym(scancode) ?? scancodeToKeysym(scancode))
        : scancodeToKeysym(scancode);
      if (keysym === undefined) return;
      this.held.set(scancode, keysym);
      this.client?.keysym(keysym, true);
      if (scancode === 0x2a || scancode === 0x36) this.shift = true;
    } else {
      const keysym = this.held.get(scancode) ?? scancodeToKeysym(scancode);
      this.held.delete(scancode);
      if (keysym !== undefined) this.client?.keysym(keysym, false);
      if (scancode === 0x2a || scancode === 0x36) this.shift = false;
    }
  }

  /**
   * One character, pressed and released.
   *
   * The caller counts in UTF-16 code units (RDP's own currency) and X counts in code points, so
   * the two halves of anything outside the basic plane have to be put back together here — sent
   * apart they are two keysyms that name nothing and type nothing.
   */
  unicode(code: number) {
    if (code >= 0xd800 && code <= 0xdbff) {
      this.surrogate = code;
      return;
    }
    let point = code;
    if (code >= 0xdc00 && code <= 0xdfff) {
      if (this.surrogate === undefined) return;
      point = (this.surrogate - 0xd800) * 0x400 + (code - 0xdc00) + 0x10000;
    }
    this.surrogate = undefined;
    const keysym = unicodeToKeysym(point);
    this.client?.keysym(keysym, true);
    this.client?.keysym(keysym, false);
  }

  clipboard(text: string) {
    if (!this.client) return;
    // Before the handshake finishes there is nobody to send it to; kept for `onReady`.
    if (this.client.ready) this.client.cutText(text);
    else this.priming = text;
  }

  snapshot(): { width: number; height: number; data: Buffer } | undefined {
    return this.client?.snapshot();
  }

  stop() {
    const socket = this.socket;
    const secure = this.secure;
    this.socket = undefined;
    this.secure = undefined;
    // Emit "closed" while the generation still matches, then step past late socket events.
    this.finish();
    this.generation += 1;
    secure?.destroy();
    socket?.destroy();
  }

  /**
   * End the session once. The RFB client is the single emitter of the "closed" event (through the
   * generation-guarded callback above), so a second call — a socket `close` arriving after an
   * error, say — finds no client and does nothing.
   *
   * The socket is destroyed here as well: a protocol failure does not make the far side hang up,
   * and a connection left open would keep this machine attached to a customer's server with
   * nothing on screen to say so.
   */
  private finish(detail?: string) {
    const client = this.client;
    if (!client) return;
    this.client = undefined;
    this.closed = true;
    this.priming = undefined;
    this.held.clear();
    client.end(detail);
    this.secure?.destroy();
    this.socket?.destroy();
  }
}

/**
 * What went wrong, in the operator's language and about the server they named.
 *
 * Node says `connect ECONNREFUSED 127.0.0.1:54321`, which through a bastion is a port on this
 * machine that means nothing to anybody. The address here is the one that was asked for.
 */
function describeSocketError(cause: Error & { code?: string }, where: string): string {
  switch (cause.code) {
    case "ECONNREFUSED":
      return t("{where} refused the connection. Check that VNC is running and that the port is right.", { where });
    case "ETIMEDOUT":
      return t("Could not reach {where} (timed out).", { where });
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return t("{where} cannot be reached. Check the route and the firewall.", { where });
    case "ENOTFOUND":
      return t("No server by the name {where} could be found.", { where });
    case "ECONNRESET":
      return t("{where} cut the connection.", { where });
    default:
      return t("Connecting to {where} failed.", { where });
  }
}
