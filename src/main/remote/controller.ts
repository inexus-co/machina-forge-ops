import { randomUUID } from "node:crypto";
import { t } from "../../shared/i18n";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, clipboard, dialog, ipcMain, type WebContents } from "electron";
import { z } from "zod";
import type {
  RemoteClipboard,
  RemoteHostInput,
  RemoteHostState,
  RemoteScreenEvent,
  StoredRemoteHost,
} from "../../shared/remote";
import { keyForCharacter, scancodeOf } from "../../shared/scancodes";
import type { SecretCipher } from "../secretStore";
import {
  forgetHostSecrets,
  passphraseKey,
  readHosts,
  readSecretMap,
  secretKey,
  writeHosts,
  writeSecret,
} from "./hostStore";
import {
  disposeRemoteAgents,
  enqueueSettingsWrite,
  forgetRemoteAgent,
  registerRemoteAgentController,
} from "./agent/controller";
import { registerLocaleController } from "./localeController";
import {
  rdpExpectation,
  refusalFor,
  registerHostKeyController,
  rememberRdp,
  rememberVnc,
  vncExpectation,
  setHostKeyTarget,
  sshVerifier,
} from "./hostKeys";
import {
  disposeRemoteInventory,
  forgetRemoteInventory,
  registerRemoteInventoryController,
  stopRemoteInventoryFollow,
} from "./inventory/controller";
import {
  disposeRemoteFiles,
  forgetRemoteFiles,
  registerRemoteFilesController,
} from "./files/controller";
import { closeRemotePanels, registerRemotePanelsController } from "./panels/controller";
import { retitlePanels } from "./panels/window";
import { registerRemoteResourcesController } from "./agent/resourcesController";
import { registerRemotePluginsController } from "./agent/pluginsController";
import { readUiState, writeUiState } from "./uiState";
import {
  disposeRemoteStatus,
  forgetRemoteStatus,
  registerRemoteStatusController,
  stopRemoteStatusWatch,
} from "./status/controller";
import { registerRemoteHistoryController } from "./history/controller";
import { registerRemoteRecordingController } from "./recording/controller";
import { HistoryRecorder } from "./history/recorder";
import { JumpConnection } from "./jump";
import { identityFor, lineFor } from "../../shared/wayIn";
import { TmuxSession, killSession, listSessions, tmuxVersion } from "./tmux/client";
import { addressKey, readKnownHosts } from "./knownHosts";
import { RdpSession } from "./rdpSession";
import { VncSession } from "./vncSession";
import { CommandRunner } from "./commandRunner";
import { SshSession, type SshTarget } from "./sshSession";

/**
 * IPC boundary for remote maintenance.
 *
 * The renderer never holds a password and never speaks RDP or SSH: it asks for a session by host
 * id and receives pixels and bytes. The credential stays on this side of the bridge.
 *
 * Sessions are held per host, and a host may have both open at once: watching a Windows desktop
 * while tailing a log over SSH is one job, not two.
 */

const endpointSchema = z.object({
  host: z
    .string()
    .min(1)
    .max(255)
    .refine((value) => !/[\s/\\?#@]/.test(value), {
      message: t("A host name cannot contain URL punctuation."),
    }),
  port: z.number().int().min(1).max(65535),
  username: z.string().max(255),
  /* Empty means "keep the stored one": the value never travels back to the renderer. */
  password: z.string().max(512),
});

/**
 * The same, but the address may be missing.
 *
 * A machine reached by asking its provider for a shell has no address to write down — the
 * instance id is what names it, and that lives in `wayIn`. Which of the two is required is decided
 * below, where both are in view.
 */
const sshInputSchema = endpointSchema.extend({
  host: z.string().max(255).refine((value) => !/[\s/\\?#@]/.test(value), {
    message: t("A host name cannot contain URL punctuation."),
  }),
  auth: z.enum(["password", "key"]),
  tmux: z.boolean().optional(),
  keepLocal: z.boolean().optional(),
  keyPath: z.string().max(1024).optional(),
  /* Empty means "keep the stored one", the same rule the password follows. */
  passphrase: z.string().max(512).optional(),
});

/**
 * Standard VNC authentication has no user name; its dialects do.
 *
 * VeNCrypt (TigerVNC), Apple's screen sharing and UltraVNC's Windows logins all take one, so the
 * field is here and optional rather than absent.
 */
const vncInputSchema = z.object({
  host: endpointSchema.shape.host,
  port: endpointSchema.shape.port,
  username: z.string().max(255).optional(),
  password: endpointSchema.shape.password,
  /* The operator's acceptance that this host's password may travel as text. */
  allowPlaintext: z.boolean().optional(),
});

/** How this one is reached, when it is not reached directly. Bounded, not judged — see `hostStore.ts`. */
const wayInInputSchema = z.object({
  provider: z.string().min(1).max(32),
  values: z.record(z.string().max(64), z.string().max(2000)),
});

/** The same, crossing the bridge. Bounded, not judged — see `hostStore.ts`. */
const fileTransferInputSchema = z.object({
  via: z.string().min(1).max(32),
  values: z.record(z.string().max(64), z.string().max(2000)),
});

const hostInputSchema = z
  .object({
    name: z.string().max(120),
    jumpHostId: z.string().min(1).max(64).optional(),
    wayIn: wayInInputSchema.optional(),
    fileTransfer: fileTransferInputSchema.optional(),
    rdp: endpointSchema.optional(),
    vnc: vncInputSchema.optional(),
    ssh: sshInputSchema.optional(),
  })
  /* One of the two has to say where the machine is: an address, or the way in that finds it. */
  .refine((input) => !input.ssh || Boolean(input.ssh.host) || Boolean(input.wayIn), {
    path: ["ssh", "host"],
    message: t("Enter the SSH host."),
  });

const idSchema = z.string().min(1).max(64);
const sessionIdSchema = z.string().min(1).max(64);

/** The part of a typed SSH endpoint that belongs in the plain file. Secrets go elsewhere. */
function storedSsh(input: z.infer<typeof sshInputSchema>) {
  return {
    host: input.host,
    port: input.port,
    username: input.username,
    auth: input.auth,
    tmux: input.tmux,
    keepLocal: input.keepLocal,
    keyPath: input.auth === "key" ? input.keyPath : undefined,
  };
}

/** The part of a typed VNC endpoint that belongs in the plain file. The password goes elsewhere. */
function storedVnc(input: z.infer<typeof vncInputSchema>) {
  return {
    host: input.host,
    port: input.port,
    username: input.username?.trim() || undefined,
    allowPlaintext: input.allowPlaintext,
  };
}

/**
 * A terminal, however it is being held.
 *
 * Two implementations behind four verbs: one in this process, and one inside a tmux session on
 * this machine that outlives it. The controller does not care which — what differs is only
 * whether the terminal is still there after a crash.
 */
type Terminal = {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  stop(): void;
};

type Entry = {
  stored: StoredRemoteHost;
  rdp: RdpSession;
  /** The other screen, over RFB. A host has one or the other; both are held, at most one is open. */
  vnc: VncSession;
  /**
   * The terminals open on this host, in the order they were opened.
   *
   * A Map rather than one session, because maintenance is not one conversation: a log tailing in
   * one terminal while a package installs in another is the ordinary shape of the work.
   */
  ssh: Map<string, Terminal>;
  /** Never reused, so a closed Session 2 does not come back as another one with its name. */
  sshCounter: number;
  sshTitles: Map<string, string>;
  /** The tmux session behind each kept terminal, so closing a tab can end it. */
  sshNames: Map<string, string>;
  hasRdpPassword: boolean;
  hasVncPassword: boolean;
  hasSshPassword: boolean;
  hasSshPassphrase: boolean;
  /** tmux sessions on this machine left by an earlier run, not yet attached to. */
  recoverable: string[];
  /** Held while this host is reached through another, so one bastion serves every use of it. */
  jump?: JumpConnection;
  detail?: string;
};

const entries = new Map<string, Entry>();

/*
 * The clipboard, kept in step with whichever desktops are open.
 *
 * Electron has no "the clipboard changed" event, so this side looks. Only while a screen is
 * connected, and only at what it already had to hold anyway — the last text seen, so that what
 * arrives *from* a server is not handed straight back to it as a local copy.
 *
 * Text only. A file copied on a customer's desktop is a transfer with rules of its own, and the
 * file pane is where those rules live.
 */
let lastClipboard = "";
let clipboardWatch: NodeJS.Timeout | undefined;
/**
 * How the exchange went, per server, for the panel that shows it.
 *
 * Only what cannot be worked out at the time it is asked for: whether the channel opened, when
 * something was last offered, and whether the far side ever came for it. What is on this
 * machine's clipboard is read fresh, because it changes without telling anybody.
 */
/**
 * How much may be typed in at once.
 *
 * Typing goes wherever the cursor happens to be, and there is no undo on somebody else's desktop.
 * A password, a certificate, a config stanza — all well under this; a log file pasted by accident
 * is not something to discover halfway through.
 */
const MOST_TYPED_CHARACTERS = 2000;

const clipboardState = new Map<
  string,
  { offeredAt?: string; pulledAt?: string; channel?: boolean; fromServer?: { text: string; at: string } }
>();

function clipboardFor(hostId: string) {
  const found = clipboardState.get(hostId) ?? {};
  clipboardState.set(hostId, found);
  return found;
}

/** Offer this machine's clipboard to whichever screen is open, and remember that we did. */
function offerClipboard(entry: Entry, text: string) {
  if (!text) return;
  /* Both, when both are open: the operator is looking at one of them and neither can say which. */
  if (entry.vnc.open) entry.vnc.clipboard(text);
  if (entry.rdp.open) entry.rdp.clipboard(text);
  clipboardFor(entry.stored.id).offeredAt = new Date().toISOString();
}

function watchClipboard() {
  if (clipboardWatch) return;
  clipboardWatch = setInterval(() => {
    const open = [...entries.values()].filter((entry) => entry.rdp.open || entry.vnc.open);
    if (open.length === 0) {
      clearInterval(clipboardWatch);
      clipboardWatch = undefined;
      return;
    }
    const text = clipboard.readText();
    if (text === lastClipboard) return;
    lastClipboard = text;
    for (const entry of open) offerClipboard(entry, text);
  }, 700);
}
let order: string[] = [];
let renderer: WebContents | undefined;
let root = "";
let cipher: SecretCipher | undefined;
/**
 * What was typed, kept.
 *
 * Every byte on its way to a terminal passes through here, which is the only place that sees all
 * of them — the server's own history file is written at exit and loses whatever a second
 * terminal was doing at the time.
 */
let recorder: HistoryRecorder;

function send(channel: string, ...payload: unknown[]) {
  if (renderer && !renderer.isDestroyed()) renderer.send(channel, ...payload);
}

function stateOf(entry: Entry): RemoteHostState {
  const { stored } = entry;
  return {
    id: stored.id,
    name: stored.name,
    jumpHostId: stored.jumpHostId,
    wayIn: stored.wayIn,
    fileTransfer: stored.fileTransfer,
    rdp: stored.rdp && { ...stored.rdp, hasPassword: entry.hasRdpPassword },
    vnc: stored.vnc && { ...stored.vnc, hasPassword: entry.hasVncPassword },
    ssh: stored.ssh && {
      ...stored.ssh,
      hasPassword: entry.hasSshPassword,
      hasPassphrase: entry.hasSshPassphrase,
    },
    rdpOpen: entry.rdp.open,
    vncOpen: entry.vnc.open,
    sshSessions: [...entry.ssh.keys()].map((sessionId) => ({
      id: sessionId,
      title: entry.sshTitles.get(sessionId) ?? t("Session"),
    })),
    recoverable: entry.recoverable,
    detail: entry.detail,
  };
}

function list(): RemoteHostState[] {
  return order.map((id) => stateOf(entries.get(id)!));
}

function changed() {
  send("remote:changed", list());
}

function require(id: string): Entry {
  const entry = entries.get(idSchema.parse(id));
  if (!entry) throw new Error(t("That server is not registered."));
  return entry;
}

/**
 * The screen that is open for this host — the one the operator and the agent both drive.
 *
 * At most one: opening the second is refused where a screen is opened. Nothing when neither is,
 * so the agent is told there is no screen rather than handed a session that would silently
 * swallow every click.
 */
function screenOf(id: string): RdpSession | VncSession | undefined {
  const entry = entries.get(id);
  if (!entry) return undefined;
  if (entry.vnc.open) return entry.vnc;
  return entry.rdp.open ? entry.rdp : undefined;
}

function adopt(stored: StoredRemoteHost, secrets: Map<string, string>): Entry {
  const entry: Entry = {
    stored,
    hasRdpPassword: secrets.has(secretKey(stored.id, "rdp")),
    hasVncPassword: secrets.has(secretKey(stored.id, "vnc")),
    hasSshPassword: secrets.has(secretKey(stored.id, "ssh")),
    hasSshPassphrase: secrets.has(passphraseKey(stored.id)),
    recoverable: [],
    ssh: new Map(),
    sshCounter: 0,
    sshTitles: new Map(),
    sshNames: new Map(),
    /* The other screen. Same event out, so the canvas and the agent never learn which answered. */
    vnc: new VncSession({
      onScreen: (event: RemoteScreenEvent) => {
        send("remote:screen", stored.id, event);
        if (event.kind === "closed") changed();
      },
      onClipboard: (text) => {
        lastClipboard = text;
        clipboard.writeText(text);
        clipboardFor(stored.id).fromServer = { text, at: new Date().toISOString() };
      },
      /* Only VeNCrypt's X.509 sub-types show one. First meeting recorded; a change is refused
         inside the session, the same as the RDP helper does. */
      onCertificate: (fingerprint) => {
        const vnc = entries.get(stored.id)?.stored.vnc;
        if (vnc) void rememberVnc(vnc.host, vnc.port, fingerprint);
      },
    }),
    rdp: new RdpSession({
      onScreen: (event: RemoteScreenEvent) => {
        send("remote:screen", stored.id, event);
        if (event.kind === "closed") changed();
      },
      /*
       * A first meeting is recorded; later ones were already checked by the helper.
       *
       * Not asked about the way an SSH key is. The certificate is judged inside the handshake,
       * and a question there would mean holding a half-open connection to a machine we have not
       * identified while somebody reads a dialog. Recording the first and refusing every change
       * is what can honestly be offered, and it is what stops the second visit being a stranger.
       */
      onCertificate: (fingerprint) => {
        const rdp = entries.get(stored.id)?.stored.rdp;
        if (rdp) void rememberRdp(rdp.host, rdp.port, fingerprint);
      },
      /*
       * Copied over there, available here.
       *
       * Straight onto this machine's clipboard, which is what a copy is for — and remembered as
       * the last thing seen, so the poll below does not immediately offer it back as though the
       * operator had copied it.
       */
      onClipboard: (text) => {
        lastClipboard = text;
        clipboard.writeText(text);
        clipboardFor(stored.id).fromServer = { text, at: new Date().toISOString() };
      },
      onClipboardState: (state) => {
        const found = clipboardFor(stored.id);
        if (state.channel !== undefined) found.channel = state.channel;
        if (state.pulled) found.pulledAt = new Date().toISOString();
      },
    }),
  };
  entries.set(stored.id, entry);
  order.push(stored.id);
  return entry;
}

async function persist() {
  await writeHosts(root, order.map((id) => entries.get(id)!.stored));
}

/** The password for one endpoint, or a refusal that names what is missing. */
async function passwordFor(id: string, protocol: "rdp" | "ssh" | "vnc"): Promise<string> {
  const password = await storedPassword(id, protocol);
  if (!password) throw new Error(t("Enter the password."));
  return password;
}

/**
 * The password if there is one, and no complaint if there is not.
 *
 * For VNC, where "no authentication" is a security type of its own: an appliance's console on a
 * private network commonly has no password at all, and demanding one here would make those
 * servers unreachable while telling the operator to type something the server would refuse.
 * Whether the far side is satisfied is the far side's answer, and it arrives in its own words.
 */
async function storedPassword(id: string, protocol: "rdp" | "ssh" | "vnc"): Promise<string> {
  const secrets = await readSecretMap(root, cipher!);
  return secrets.get(secretKey(id, protocol)) ?? "";
}

/**
 * What to connect to this host's shell with.
 *
 * The key is read here, in the main process, at the moment it is needed. Its path is a
 * preference and lives in the plain file; its contents are a credential and never linger — not in
 * the store, not in the renderer, not between connections.
 */
/**
 * The bastion for a host, if it has one.
 *
 * Held on the entry so every use of that host — terminal, agent, status, files, screen — shares
 * one connection to the bastion rather than opening five. Guarded against a host pointing at
 * itself, which would otherwise recurse until the stack ran out.
 */
function jumpFor(entry: Entry): JumpConnection | undefined {
  const jumpHostId = entry.stored.jumpHostId;
  if (!jumpHostId || jumpHostId === entry.stored.id) return undefined;
  if (!entries.has(jumpHostId)) return undefined;
  entry.jump ??= new JumpConnection(() => sshTargetFor(jumpHostId, true));
  return entry.jump;
}

/**
 * Where the bridge process lives, and how to run it.
 *
 * `ELECTRON_RUN_AS_NODE` turns Electron into plain Node, so a terminal costs a Node process
 * rather than a browser. In development the built file sits beside this one; packaged, the same.
 */
function bridgeCommand(): string[] {
  const bridge = path.join(path.dirname(fileURLToPath(import.meta.url)), "bridge.js");
  return [process.execPath, bridge];
}

/**
 * Everything the bridge needs, as data.
 *
 * Deliberately not the `SshTarget` the rest of the application uses: that one carries the private
 * key's *bytes* and a verifier function, and neither survives being handed to another process.
 * The bridge gets the path and the fingerprint and reads the key itself.
 */
async function bridgePlanFor(id: string) {
  const entry = require(id);
  const ssh = entry.stored.ssh;
  if (!ssh) throw new Error(t("No SSH is set up for this server."));

  /*
   * Reached by the provider's own command: the plan is that command and nothing else.
   *
   * No fingerprint, because nothing here is verifying a host key — the provider's tool did that
   * its own way before handing back a shell.
   */
  if (entry.stored.wayIn) {
    const shell = lineFor(entry.stored.wayIn);
    if (!shell) throw new Error(t("This server's way in is not filled in."));
    return {
      plan: { shell, host: ssh.host, port: ssh.port, username: ssh.username, auth: ssh.auth, fingerprint: "" },
      secret: undefined,
      jumpSecret: undefined,
    };
  }

  const known = await readKnownHosts(root);
  const fingerprint = known[addressKey("ssh", ssh.host, ssh.port)]?.fingerprint;
  if (!fingerprint) throw new Error(t("Check this server's key first."));

  const secrets = await readSecretMap(root, cipher!);
  const secret =
    ssh.auth === "key" ? secrets.get(passphraseKey(id)) : secrets.get(secretKey(id, "ssh"));

  const jumpHostId = entry.stored.jumpHostId;
  const jumpEntry = jumpHostId ? entries.get(jumpHostId) : undefined;
  const jumpSsh = jumpEntry?.stored.ssh;
  const jumpFingerprint = jumpSsh
    ? known[addressKey("ssh", jumpSsh.host, jumpSsh.port)]?.fingerprint
    : undefined;

  return {
    plan: {
      host: ssh.host,
      port: ssh.port,
      username: ssh.username,
      auth: ssh.auth,
      keyPath: ssh.keyPath,
      fingerprint,
      jump:
        jumpSsh && jumpFingerprint
          ? {
              host: jumpSsh.host,
              port: jumpSsh.port,
              username: jumpSsh.username,
              auth: jumpSsh.auth,
              keyPath: jumpSsh.keyPath,
              fingerprint: jumpFingerprint,
            }
          : undefined,
    },
    secret,
    jumpSecret:
      jumpSsh && jumpHostId
        ? jumpSsh.auth === "key"
          ? secrets.get(passphraseKey(jumpHostId))
          : secrets.get(secretKey(jumpHostId, "ssh"))
        : undefined,
  };
}

/**
 * Make sure this server's key has been agreed to, before a detached process meets it.
 *
 * The bridge cannot ask anybody anything — it runs inside tmux with no way back to the window —
 * so it is given a fingerprint and refuses anything else. Somebody has to have said yes once,
 * and the cheapest way to arrange that is a connection here, where the question can be asked.
 */
async function ensureHostKnown(id: string) {
  const entry = require(id);
  const ssh = entry.stored.ssh;
  if (!ssh) throw new Error(t("No SSH is set up for this server."));
  /* No SSH, no host key: the provider's own tool decided who this machine is. */
  if (entry.stored.wayIn) return;
  const known = await readKnownHosts(root);
  if (known[addressKey("ssh", ssh.host, ssh.port)]) return;
  const runner = new CommandRunner();
  try {
    await runner.run(await sshTargetFor(id), "true", { timeoutMs: 30_000 });
  } finally {
    runner.stop();
  }
}

export async function sshTargetFor(id: string, asBastion = false): Promise<SshTarget> {
  const entry = require(id);
  const ssh = entry.stored.ssh;
  if (!ssh) throw new Error(t("No SSH is set up for this server."));

  /*
   * Reached by asking its provider for a shell, when that is how it is reached.
   *
   * Nothing else on this target applies then: there is no port, no account of ours, no key, and no
   * host key to remember, because there is no SSH. Everything that connects takes the command from
   * here and runs one of its own — the terminal, the agent, the status reading — the same way each
   * used to open a connection of its own.
   */
  if (!asBastion && entry.stored.wayIn) {
    const shell = lineFor(entry.stored.wayIn);
    if (!shell) throw new Error(t("This server's way in is not filled in."));
    /*
     * Named by what was asked for, because two of these must never look like one machine.
     *
     * Whatever holds a connection open keeps it against this name — and with no address to use,
     * two instances would otherwise both be "" and share a shell.
     */
    return { host: identityFor(entry.stored.wayIn), port: ssh.port, username: ssh.username, shell };
  }

  const verifyHostKey = sshVerifier(ssh.host, ssh.port);
  /*
   * One hop.
   *
   * A bastion reached through another bastion is a chain, and chains are where a loop hides.
   * Asked for as a bastion, a host is reached directly — which is what a bastion is.
   */
  const jump = asBastion ? undefined : jumpFor(entry);
  /*
   * Whichever way in this host has, the stream is what changes and nothing else.
   *
   * `host`, `port` and `verifyHostKey` stay the machine's own: they are how this application
   * remembers whose key it saw. Keyed on a loopback port instead, every session would look like a
   * server it had never met, and the operator would answer for a fingerprint every time.
   */
  const sock = jump ? await jump.channel(ssh.host, ssh.port) : undefined;

  if (ssh.auth === "key") {
    if (!ssh.keyPath) throw new Error(t("No key file has been chosen."));
    const privateKey = await fs.readFile(ssh.keyPath).catch(() => {
      throw new Error(t("The key file cannot be read: {path}", { path: ssh.keyPath ?? "" }));
    });
    const secrets = await readSecretMap(root, cipher!);
    return {
      host: ssh.host,
      port: ssh.port,
      username: ssh.username,
      privateKey,
      passphrase: secrets.get(passphraseKey(id)),
      verifyHostKey,
      sock,
    };
  }
  return {
    host: ssh.host,
    port: ssh.port,
    username: ssh.username,
    password: await passwordFor(id, "ssh"),
    verifyHostKey,
    sock,
  };
}

export function setRemoteTarget(contents: WebContents) {
  renderer = contents;
  // The same window answers "is this the right server?"; the question has nowhere else to go.
  setHostKeyTarget(contents);
  contents.once("destroyed", () => {
    if (renderer === contents) renderer = undefined;
  });
}

/** Let go of every session on quit. Nothing on the far end is stopped; we stop watching. */
export function disposeRemote() {
  for (const entry of entries.values()) {
    for (const session of entry.ssh.values()) session.stop();
    entry.rdp.stop();
    entry.vnc.stop();
    entry.jump?.stop();
  }
  disposeRemoteAgents();
  disposeRemoteStatus();
  closeRemotePanels();
  disposeRemoteFiles();
  disposeRemoteInventory();
}

export async function registerRemoteController(
  userDataRoot: string,
  secretCipher: SecretCipher,
) {
  root = userDataRoot;
  cipher = secretCipher;
  recorder = new HistoryRecorder(root);

  /*
   * The language, registered before anything is awaited.
   *
   * Every window asks for it synchronously as it loads, and this function is started without
   * being awaited so that the first window can appear while hosts and secrets are read. Register
   * it after those reads and a window that loads quickly asks a channel nobody is listening on:
   * `sendSync` comes back undefined, the window keeps the language the module was declared with,
   * and the operator gets one window in English and another in Japanese.
   */
  registerLocaleController(root, enqueueSettingsWrite, () =>
    retitlePanels((hostId) => entries.get(hostId)?.stored.name),
  );

  const stored = await readHosts(root);
  const secrets = await readSecretMap(root, cipher);
  for (const host of stored) adopt(host, secrets);

  /*
   * The agent, given only what it needs.
   *
   * Not the entry map and not the cipher: it gets a way to ask for one host's SSH target, one
   * host's screen, and one host's secret values. Anything it cannot reach is something the
   * guarantee does not have to say anything about.
   */
  // The status panel needs one thing: how to reach this host's shell. It reads and never writes.
  /*
   * What an earlier run left running.
   *
   * Attaching costs nothing — the connection is already open — so these are offered rather than
   * hidden, and the window picks them up on its own.
   */
  const kept = await listSessions();
  for (const name of kept) {
    const hostId = name.split("-").slice(1, -1).join("-");
    const entry = entries.get(hostId);
    if (entry) entry.recoverable.push(name);
  }

  registerHostKeyController(root);
  registerRemoteStatusController({ sshTarget: sshTargetFor });
  registerRemotePanelsController({
    hostName: (hostId) => entries.get(hostId)?.stored.name,
    /* A panel that is gone stops whatever it had reading the customer's server. */
    onChanged: (hostId, open) => {
      if (!open.includes("status")) stopRemoteStatusWatch(hostId);
      if (!open.includes("inventory")) stopRemoteInventoryFollow(hostId);
    },
  });
  // File transfer is the operator's, not the agent's: it is not one of ADR 0001's tools.
  registerRemoteFilesController({ sshTarget: sshTargetFor });
  registerRemoteInventoryController({ sshTarget: sshTargetFor });
  registerRemoteHistoryController({
    recorder,
    hostName: (hostId) => entries.get(hostId)?.stored.name,
  });

  /* The screen has no record of its own; this is the one the operator makes by hand. */
  registerRemoteRecordingController({
    userDataRoot: root,
    hostName: (hostId) => entries.get(hostId)?.stored.name,
  });

  registerRemoteResourcesController(root, () => readSecretMap(root, secretCipher));
  registerRemotePluginsController(root);

  registerRemoteAgentController({
    userDataRoot: root,
    hostName: (hostId) => entries.get(hostId)?.stored.name,
    snapshot: (hostId) => screenOf(hostId)?.snapshot(),
    /* The same path the operator's own pointer takes — see `remote:rdp-mouse` below. Whichever
       screen is open answers, so a VNC desktop is driven by the agent exactly as an RDP one is. */
    mouse: (hostId, x, y, buttons) => screenOf(hostId)?.mouse(x, y, buttons),
    key: (hostId, code, down) => screenOf(hostId)?.key(code, down),
    unicode: (hostId, code) => screenOf(hostId)?.unicode(code),
    sshTarget: sshTargetFor,
    /* Every model's key at once: the agent controller decides which name belongs to which. */
    apiKeys: () => readSecretMap(root, secretCipher),
    saveApiKey: (name, value) => writeSecret(root, secretCipher, name, value),
    /*
     * What the agent may name but never see.
     *
     * One value today: this host's own password, so a command can be written as `{{password}}`
     * and the real thing put in on the way out. The map is the shape rather than the single
     * value because the next one — a database password, a licence key — belongs here too.
     */
    secrets: async (hostId) => {
      const map = new Map<string, string>();
      const password = (await readSecretMap(root, secretCipher)).get(secretKey(hostId, "ssh"));
      if (password) map.set("password", password);
      return map;
    },
  });

  ipcMain.handle("remote:list", (event) => {
    setRemoteTarget(event.sender);
    return list();
  });

  ipcMain.handle("remote:create", async (event, rawInput: unknown) => {
    setRemoteTarget(event.sender);
    const input: RemoteHostInput = hostInputSchema.parse(rawInput);
    const id = randomUUID();
    const named = input.name.trim() || input.rdp?.host || input.vnc?.host || input.ssh?.host || "";
    const entry = adopt(
      {
        id,
        name: named,
        /* One way in. Both set would be two things to debug when neither works, so the bastion
           gives way to the command — the one that reaches machines nothing else can reach. */
        jumpHostId: input.wayIn ? undefined : input.jumpHostId,
        wayIn: input.wayIn,
        fileTransfer: input.fileTransfer,
        rdp: input.rdp && { host: input.rdp.host, port: input.rdp.port, username: input.rdp.username },
        vnc: input.vnc && storedVnc(input.vnc),
        ssh: input.ssh && storedSsh(input.ssh),
      },
      new Map(),
    );
    await persist();
    if (input.rdp?.password) {
      await writeSecret(root, cipher!, secretKey(id, "rdp"), input.rdp.password);
      entry.hasRdpPassword = true;
    }
    if (input.vnc?.password) {
      await writeSecret(root, cipher!, secretKey(id, "vnc"), input.vnc.password);
      entry.hasVncPassword = true;
    }
    if (input.ssh?.password) {
      await writeSecret(root, cipher!, secretKey(id, "ssh"), input.ssh.password);
      entry.hasSshPassword = true;
    }
    if (input.ssh?.passphrase) {
      await writeSecret(root, cipher!, passphraseKey(id), input.ssh.passphrase);
      entry.hasSshPassphrase = true;
    }
    changed();
    return stateOf(entry);
  });

  ipcMain.handle("remote:update", async (_event, rawId: unknown, rawInput: unknown) => {
    const entry = require(rawId as string);
    const input: RemoteHostInput = hostInputSchema.parse(rawInput);
    const wasJumpedThrough = entry.stored.jumpHostId;
    entry.stored = {
      ...entry.stored,
      name: input.name.trim() || input.rdp?.host || input.vnc?.host || input.ssh?.host || entry.stored.name,
      jumpHostId: input.wayIn ? undefined : input.jumpHostId,
      wayIn: input.wayIn,
      fileTransfer: input.fileTransfer,
      rdp: input.rdp && { host: input.rdp.host, port: input.rdp.port, username: input.rdp.username },
      vnc: input.vnc && storedVnc(input.vnc),
      ssh: input.ssh && storedSsh(input.ssh),
    };
    /*
     * A screen taken out of the settings is a screen that must stop.
     *
     * Left running it would be invisible — the window draws from `stored`, so the pane goes away —
     * while the socket stays open on the customer's machine and `screenOf` keeps handing it to the
     * agent. "I removed it" has to mean it is gone.
     */
    if (!input.rdp) entry.rdp.stop();
    if (!input.vnc) entry.vnc.stop();

    /*
     * What went wrong belonged to the settings that have just been replaced.
     *
     * Left where it was, the operator fixes the password, presses save, and reads the same red
     * line about the password — so the fix looks like it did nothing, and the next thing they
     * change is something that was never wrong. The reading is only true until the settings it
     * describes are gone.
     */
    entry.detail = undefined;

    /*
     * A route that changed is a connection that has to be made again.
     *
     * The bastion is held on the entry and shared by everything using this host, and it was opened
     * against the old one. Only when it actually changed: dropping it otherwise would cut a
     * terminal somebody is typing into, for an edit that had nothing to do with the route.
     */
    if (entry.stored.jumpHostId !== wasJumpedThrough) {
      entry.jump?.stop();
      entry.jump = undefined;
    }
    if (input.rdp?.password) {
      await writeSecret(root, cipher!, secretKey(entry.stored.id, "rdp"), input.rdp.password);
      entry.hasRdpPassword = true;
    }
    if (input.vnc?.password) {
      await writeSecret(root, cipher!, secretKey(entry.stored.id, "vnc"), input.vnc.password);
      entry.hasVncPassword = true;
    }
    if (input.ssh?.password) {
      await writeSecret(root, cipher!, secretKey(entry.stored.id, "ssh"), input.ssh.password);
      entry.hasSshPassword = true;
    }
    if (input.ssh?.passphrase) {
      await writeSecret(root, cipher!, passphraseKey(entry.stored.id), input.ssh.passphrase);
      entry.hasSshPassphrase = true;
    }
    await persist();
    changed();
    return stateOf(entry);
  });

  ipcMain.handle("remote:remove", async (_event, rawId: unknown) => {
    const entry = entries.get(idSchema.parse(rawId));
    if (!entry) return;
    for (const session of entry.ssh.values()) session.stop();
    entry.rdp.stop();
    entry.vnc.stop();
    entry.jump?.stop();
    forgetRemoteAgent(entry.stored.id);
    forgetRemoteStatus(entry.stored.id);
    closeRemotePanels(entry.stored.id);
    forgetRemoteFiles(entry.stored.id);
    forgetRemoteInventory(entry.stored.id);
    entries.delete(entry.stored.id);
    order = order.filter((each) => each !== entry.stored.id);
    await persist();
    await forgetHostSecrets(root, cipher!, entry.stored.id).catch(() => undefined);
    changed();
  });

  // ── SSH ───────────────────────────────────────────────────────────────────

  ipcMain.handle("remote:ssh-open", async (_event, rawId: unknown, rawKeep: unknown) => {
    const entry = require(rawId as string);
    const ssh = entry.stored.ssh;
    if (!ssh) throw new Error(t("No SSH is set up for this server."));
    entry.detail = undefined;

    const keep = rawKeep === undefined ? undefined : z.string().max(120).parse(rawKeep);
    const sessionId = randomUUID();
    const number = keep ? Number(keep.split("-").pop()) || ++entry.sshCounter : ++entry.sshCounter;
    const title = t("Session {n}", { n: number });

    const onData = (chunk: string) => {
      // Read only for the sequences that say a full-screen program took the terminal.
      recorder.observe(entry.stored.id, sessionId, chunk);
      send("remote:ssh-data", entry.stored.id, sessionId, chunk);
    };
    const onClosed = (detail?: string) => {
      send("remote:ssh-closed", entry.stored.id, sessionId, detail);
      /*
       * A closed terminal leaves its tab.
       *
       * What is on it is the last thing the server said, which is usually why it closed. It goes
       * when the operator closes the tab, not when the far end hangs up.
       */
      changed();
    };

    /*
     * Kept on this machine, when the server is set that way and tmux is here.
     *
     * The terminal then lives in a tmux session of its own; this window is only looking at it.
     * Without tmux the same terminal is opened in this process, which behaves identically until
     * the moment Forge stops running.
     */
    const keepLocal = ssh.keepLocal && Boolean(await tmuxVersion());
    if (keepLocal) {
      await ensureHostKnown(entry.stored.id);
      const { plan, secret, jumpSecret } = await bridgePlanFor(entry.stored.id);
      const name = keep ?? `machina-${entry.stored.id}-${number}`;
      const session = new TmuxSession({
        onData: (chunk) => onData(chunk.toString("utf8")),
        onClosed,
      });
      session.start(
        name,
        bridgeCommand(),
        {
          ELECTRON_RUN_AS_NODE: "1",
          MACHINA_SSH: JSON.stringify(plan),
          ...(ssh.tmux ? { MACHINA_SERVER_TMUX: `machina-${number}` } : {}),
          ...(secret ? { MACHINA_PASS: secret } : {}),
          ...(jumpSecret ? { MACHINA_JUMP_PASS: jumpSecret } : {}),
        },
        120,
        30,
      );
      // Whatever is already on the pane, for a terminal being picked up rather than started.
      if (keep) void session.replay().then((text) => text && onData(text));
      entry.ssh.set(sessionId, session);
      entry.recoverable = entry.recoverable.filter((each) => each !== name);
      entry.sshTitles.set(sessionId, title);
      entry.sshNames.set(sessionId, name);
      changed();
      return sessionId;
    }

    const session = new SshSession({ onData, onClosed });
    try {
      /*
       * The server-side tmux session is named after the tab.
       *
       * So `Terminal 1` comes back to the same session tomorrow. One name for every terminal would
       * mean two tabs attached to one session, mirroring each other's keystrokes.
       */
      await session.start(
        await sshTargetFor(entry.stored.id),
        120,
        30,
        ssh.tmux ? `machina-${number}` : undefined,
      );
    } catch (cause) {
      entry.sshCounter -= 1;
      /*
       * A refusal of ours is reported in our words.
       *
       * ssh2 says "handshake failed", which reads like a network fault; what actually happened
       * is that this application decided the server was not the one it had met before, and that
       * sentence is the whole point of the check.
       */
      const refusal = refusalFor("ssh", ssh.host, ssh.port);
      entry.detail = refusal ?? (cause instanceof Error ? cause.message : String(cause));
      changed();
      throw new Error(entry.detail);
    }
    entry.ssh.set(sessionId, session);
    entry.sshTitles.set(sessionId, title);
    changed();
    return sessionId;
  });

  /**
   * Close a tab.
   *
   * For a kept terminal that means ending it for good — the tmux session is killed, not left
   * behind. Detaching is what happens when Forge closes; pressing × is somebody saying they are
   * finished with it, and a pile of sessions nobody remembers starting is its own problem.
   */
  ipcMain.handle("remote:ssh-close", async (_event, rawId: unknown, rawSession: unknown) => {
    const entry = require(rawId as string);
    const sessionId = sessionIdSchema.parse(rawSession);
    entry.ssh.get(sessionId)?.stop();
    const name = entry.sshNames.get(sessionId);
    if (name) await killSession(name);
    entry.ssh.delete(sessionId);
    entry.sshTitles.delete(sessionId);
    entry.sshNames.delete(sessionId);
    recorder.forget(entry.stored.id, sessionId);
    changed();
  });

  ipcMain.handle("remote:local-tmux", () => tmuxVersion());

  /* Window preferences that must not be lost on quit. See `uiState.ts` for why not localStorage. */
  ipcMain.handle("remote:ui-state", () => readUiState(root));
  ipcMain.handle("remote:set-ui-state", (_event, raw: unknown) =>
    writeUiState(root, z.record(z.string().max(64), z.union([z.number(), z.string().max(200)])).parse(raw)),
  );

  ipcMain.handle(
    "remote:ssh-write",
    (_event, rawId: unknown, rawSession: unknown, rawData: unknown) => {
      const entry = require(rawId as string);
      const sessionId = sessionIdSchema.parse(rawSession);
      const data = z.string().max(8192).parse(rawData);
      // Written down on the way past, so `history` losing half of it does not matter.
      /* With the tab's name: the id is gone the moment the session is. */
      recorder.feed(entry.stored.id, sessionId, data, entry.sshTitles.get(sessionId));
      entry.ssh.get(sessionId)?.write(data);
    },
  );

  /*
   * Into whichever terminal this host has open, without the caller knowing which.
   *
   * For the floating inventory window: it can offer "put this into the terminal" without holding the
   * main window's tab state, which it has no way to see. The newest terminal is the one meant —
   * it is the one the operator most recently asked for.
   */
  ipcMain.handle("remote:ssh-type", (_event, rawId: unknown, rawData: unknown) => {
    const entry = require(rawId as string);
    const sessionId = [...entry.ssh.keys()].pop();
    if (!sessionId) throw new Error(t("No session is open for this server."));
    const data = z.string().max(8192).parse(rawData);
    recorder.feed(entry.stored.id, sessionId, data);
    entry.ssh.get(sessionId)?.write(data);
  });

  ipcMain.handle(
    "remote:ssh-resize",
    (_event, rawId: unknown, rawSession: unknown, rawCols: unknown, rawRows: unknown) => {
      require(rawId as string)
        .ssh.get(sessionIdSchema.parse(rawSession))
        ?.resize(
          z.number().int().min(1).max(1000).parse(rawCols),
          z.number().int().min(1).max(1000).parse(rawRows),
        );
    },
  );

  /**
   * Choose a private key.
   *
   * A native dialog rather than a typed path: `~/.ssh` is hidden on macOS, and a path typed from
   * memory fails at connection time with an error about authentication rather than about the file.
   */
  ipcMain.handle("remote:pick-key-file", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window!, {
      title: t("Choose a private key"),
      properties: ["openFile", "showHiddenFiles"],
      buttonLabel: t("Choose"),
    });
    return result.canceled ? undefined : result.filePaths[0];
  });

  // ── RDP ───────────────────────────────────────────────────────────────────

  ipcMain.handle(
    "remote:rdp-open",
    async (_event, rawId: unknown, rawWidth: unknown, rawHeight: unknown) => {
      const entry = require(rawId as string);
      if (!entry.stored.rdp) throw new Error(t("No RDP is set up for this server."));
      /* One screen at a time — see the note on `remote:vnc-open`. */
      if (entry.vnc.open) {
        throw new Error(t("This server is connected on the VNC screen. Disconnect that first."));
      }
      entry.detail = undefined;
      try {
        /*
         * Through the bastion, the helper connects to a port on this machine.
         *
         * It is a separate process opening its own socket, so a channel is no use to it. The
         * address it is told is local; the address the certificate belongs to is the real one,
         * which is why both are passed.
         */
        const jump = jumpFor(entry);

        /* The helper is its own process, so the screen needs a port here whichever way it goes. */
        const forwarded = jump
          ? await jump.listen(entry.stored.rdp.host, entry.stored.rdp.port)
          : undefined;
        entry.rdp.start(
          {
            ...entry.stored.rdp,
            ...(forwarded ? { host: "127.0.0.1", port: forwarded } : {}),
            displayAddress: `${entry.stored.rdp.host}:${entry.stored.rdp.port}`,
            password: await passwordFor(entry.stored.id, "rdp"),
            expectedFingerprint: await rdpExpectation(entry.stored.rdp.host, entry.stored.rdp.port),
          },
          z.number().int().min(640).max(4096).parse(rawWidth),
          z.number().int().min(480).max(2160).parse(rawHeight),
        );
      } catch (cause) {
        entry.detail = cause instanceof Error ? cause.message : String(cause);
        changed();
        throw cause;
      }
      /* Copy and paste follow the desktop: watched while one is open, stopped when none are. */
      lastClipboard = clipboard.readText();
      offerClipboard(entry, lastClipboard);
      watchClipboard();
      changed();
    },
  );

  ipcMain.handle("remote:rdp-close", (_event, rawId: unknown) => {
    require(rawId as string).rdp.stop();
    changed();
  });

  /**
   * The whole desktop again, for a window that has just appeared.
   *
   * RDP sends what changed, so a canvas that starts empty stays empty until something over there
   * moves — and a server sitting at a login prompt never moves. Closing the window and opening it
   * again, or reloading, therefore came back to a picture with holes in it while the connection
   * was still perfectly alive. This side has kept the whole surface all along (it is what
   * `read_screen` answers with); it just had nobody asking for it.
   */
  ipcMain.handle("remote:rdp-repaint", (_event, rawId: unknown) => {
    const entry = require(rawId as string);
    const surface = entry.rdp.snapshot();
    if (!surface) return;
    const id = entry.stored.id;
    send("remote:screen", id, {
      kind: "size",
      width: surface.width,
      height: surface.height,
    } satisfies RemoteScreenEvent);
    send("remote:screen", id, {
      kind: "paint",
      rect: { x: 0, y: 0, width: surface.width, height: surface.height },
      pixels: surface.data.buffer.slice(
        surface.data.byteOffset,
        surface.data.byteOffset + surface.data.byteLength,
      ) as ArrayBuffer,
    } satisfies RemoteScreenEvent);
  });

  /*
   * Input arrives one-way, and a bad one is dropped rather than reported.
   *
   * `ipcMain.on` has nowhere to return a rejection to, so anything that throws here — an unknown
   * host, a value out of range — would become an unhandled error in the main process. There is
   * also nothing useful to say: the event is one pointer position out of hundreds a second, and
   * the next one is already on its way.
   */
  const input = (channel: string, act: (entry: Entry, args: unknown[]) => void) => {
    ipcMain.on(channel, (_event, rawId: unknown, ...args: unknown[]) => {
      try {
        act(require(rawId as string), args);
      } catch {
        /* dropped on purpose — see above */
      }
    });
  };

  const coordinate = z.number();
  input("remote:rdp-mouse", (entry, [x, y, buttons]) =>
    entry.rdp.mouse(
      coordinate.parse(x),
      coordinate.parse(y),
      z.number().int().min(0).max(7).parse(buttons),
    ),
  );

  input("remote:rdp-wheel", (entry, [x, y, notches]) =>
    entry.rdp.wheel(
      coordinate.parse(x),
      coordinate.parse(y),
      z.number().int().min(-10).max(10).parse(notches),
    ),
  );

  input("remote:rdp-key", (entry, [code, down]) =>
    entry.rdp.key(
      z.number().int().min(0).max(255).parse(code),
      z.boolean().parse(down),
    ),
  );

  // ── VNC ───────────────────────────────────────────────────────────────────
  // The RDP handlers' twin. Plain RFB has no server identity to pin — the password is the whole
  // of the trust — but VeNCrypt's X.509 sub-types do present a certificate, and that one is
  // remembered and checked exactly as the RDP helper's is.

  ipcMain.handle("remote:vnc-open", async (_event, rawId: unknown) => {
    const entry = require(rawId as string);
    if (!entry.stored.vnc) throw new Error(t("No screen (VNC) is set up for this server."));
    /*
     * One screen at a time.
     *
     * Both sessions send their pictures under the same host id, so two open screens would draw
     * into one canvas — and `screenOf` below hands the agent whichever it finds first. The
     * operator would be watching one desktop while the agent clicked on the other. Refused here
     * rather than in the window, because the window is not the only way in.
     */
    if (entry.rdp.open) {
      throw new Error(t("This server is connected on the RDP screen. Disconnect that first."));
    }
    entry.detail = undefined;
    try {
      const jump = jumpFor(entry);

      const forwarded = jump
        ? await jump.listen(entry.stored.vnc.host, entry.stored.vnc.port)
        : undefined;
      entry.vnc.start(
        {
          ...entry.stored.vnc,
          ...(forwarded ? { host: "127.0.0.1", port: forwarded } : {}),
          displayAddress: `${entry.stored.vnc.host}:${entry.stored.vnc.port}`,
          /* Empty is allowed: a VNC server may take no password at all. */
          password: await storedPassword(entry.stored.id, "vnc"),
          /* Only VeNCrypt's X.509 sub-types show one; the rest never reach the check. */
          expectedFingerprint: await vncExpectation(
            entry.stored.vnc.host,
            entry.stored.vnc.port,
          ),
        },
      );
    } catch (cause) {
      entry.detail = cause instanceof Error ? cause.message : String(cause);
      changed();
      throw cause;
    }
    lastClipboard = clipboard.readText();
    offerClipboard(entry, lastClipboard);
    watchClipboard();
    changed();
  });

  ipcMain.handle("remote:vnc-close", (_event, rawId: unknown) => {
    require(rawId as string).vnc.stop();
    changed();
  });

  /*
   * Copy and paste, said out loud.
   *
   * Read when the operator opens the panel rather than pushed: the only part that changes on its
   * own is this machine's own clipboard, and reading it costs nothing.
   */
  const clipboardView = (entry: Entry): RemoteClipboard => {
    const state = clipboardFor(entry.stored.id);
    return {
      mine: clipboard.readText(),
      ...(state.offeredAt ? { offeredAt: state.offeredAt } : {}),
      ...(state.pulledAt ? { pulledAt: state.pulledAt } : {}),
      ...(state.channel !== undefined ? { channel: state.channel } : {}),
      ...(state.fromServer ? { fromServer: state.fromServer } : {}),
      ...(entry.rdp.open ? { screen: "rdp" as const } : entry.vnc.open ? { screen: "vnc" as const } : {}),
    };
  };

  ipcMain.handle("remote:clipboard", (_event, rawId: unknown) =>
    clipboardView(require(rawId as string)),
  );

  /* Offered again, whether or not it changed: the poll only sends what is new, and a server that
     missed the first offer has no way of asking for a second. */
  ipcMain.handle("remote:clipboard-send", (_event, rawId: unknown) => {
    const entry = require(rawId as string);
    const text = clipboard.readText();
    lastClipboard = text;
    offerClipboard(entry, text);
    return clipboardView(entry);
  });

  /*
   * Typed in, character by character, for a server whose clipboard channel does not work.
   *
   * The same path the agent's typing takes: a key press where the US layout has one, the
   * character itself where it does not. It goes wherever the cursor is, so it is bounded and the
   * window asks first.
   */
  ipcMain.handle("remote:clipboard-type", async (_event, rawId: unknown) => {
    const entry = require(rawId as string);
    const screen = screenOf(entry.stored.id);
    if (!screen) return clipboardView(entry);
    const text = clipboard.readText().slice(0, MOST_TYPED_CHARACTERS);
    const shift = scancodeOf("ShiftLeft")!;
    const enter = scancodeOf("Enter")!;
    for (const character of text) {
      if (character === "\n" || character === "\r") {
        /* A newline is a key, not a character: no layout has a printable one. */
        screen.key(enter, true);
        screen.key(enter, false);
        continue;
      }
      const found = keyForCharacter(character);
      const code = found ? scancodeOf(found.code) : undefined;
      if (code === undefined) {
        for (let unit = 0; unit < character.length; unit++) screen.unicode(character.charCodeAt(unit));
        continue;
      }
      if (found!.shift) screen.key(shift, true);
      screen.key(code, true);
      screen.key(code, false);
      if (found!.shift) screen.key(shift, false);
    }
    return clipboardView(entry);
  });

  ipcMain.handle("remote:vnc-repaint", (_event, rawId: unknown) => {
    const entry = require(rawId as string);
    const surface = entry.vnc.snapshot();
    if (!surface) return;
    const id = entry.stored.id;
    send("remote:screen", id, {
      kind: "size",
      width: surface.width,
      height: surface.height,
    } satisfies RemoteScreenEvent);
    send("remote:screen", id, {
      kind: "paint",
      rect: { x: 0, y: 0, width: surface.width, height: surface.height },
      pixels: surface.data.buffer.slice(
        surface.data.byteOffset,
        surface.data.byteOffset + surface.data.byteLength,
      ) as ArrayBuffer,
    } satisfies RemoteScreenEvent);
  });

  input("remote:vnc-mouse", (entry, [x, y, buttons]) =>
    entry.vnc.mouse(
      coordinate.parse(x),
      coordinate.parse(y),
      z.number().int().min(0).max(7).parse(buttons),
    ),
  );

  input("remote:vnc-wheel", (entry, [x, y, notches]) =>
    entry.vnc.wheel(
      coordinate.parse(x),
      coordinate.parse(y),
      z.number().int().min(-10).max(10).parse(notches),
    ),
  );

  input("remote:vnc-key", (entry, [code, down]) =>
    entry.vnc.key(
      z.number().int().min(0).max(255).parse(code),
      z.boolean().parse(down),
    ),
  );
}
