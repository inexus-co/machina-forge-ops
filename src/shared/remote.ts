/**
 * Remote maintenance: a customer's server, reached over RDP and SSH.
 *
 * The machine on the other end is already running and its shell is the point, so the trust
 * boundary is drawn around what may be sent to it rather than around what it has installed.
 *
 * One host is one machine, with up to two ways in. Either may be absent: a Linux box with no
 * desktop has only SSH, an appliance with only a console has only RDP.
 */

export type RemoteHostInput = {
  name: string;
  /**
   * Another registered server to reach this one through.
   *
   * A customer's machines are usually not on a route from here — there is one host that accepts
   * connections from outside and everything else is reached from it. The bastion is a server in
   * this same list rather than a second credential form, so its password, its key and its host
   * key verification are the ones already there.
   */
  jumpHostId?: string;
  rdp?: {
    host: string;
    port: number;
    username: string;
    /** Empty means "keep the stored one" — the value never travels back to the renderer. */
    password: string;
  };
  /**
   * A VNC desktop. The other screen, for servers that speak RFB rather than RDP.
   *
   * The user name is usually not wanted: standard VNC authentication has no such thing. The
   * dialects do — VeNCrypt on TigerVNC, macOS's own screen sharing, UltraVNC's Windows logins —
   * and those are the servers that ask for it. Empty password means "keep the stored one", as RDP.
   */
  vnc?: {
    host: string;
    port: number;
    username?: string;
    password: string;
    /**
     * Allow the password to cross the wire in the clear.
     *
     * VeNCrypt's `Plain` sends it as text. Some servers offer nothing else, and inside an SSH
     * tunnel or a VPN that is a reasonable thing to accept — but it is the operator's to accept,
     * so nothing sends a password that way unless this was ticked.
     */
    allowPlaintext?: boolean;
  };
  ssh?: {
    host: string;
    port: number;
    username: string;
    /**
     * How to prove who we are.
     *
     * A key is the normal thing on a server anybody has set up properly, and the reason it is a
     * choice rather than "a key if there is one" is that the two fail differently: a wrong
     * password says so, a missing key file says nothing until the connection is refused.
     */
    auth: SshAuth;
    /** Empty means "keep the stored one". Used when `auth` is `password`. */
    password: string;
    /**
     * Where the private key is, when `auth` is `key`.
     *
     * A path, not the key itself. Copying somebody's private key into this application's store
     * would make a second copy of the most sensitive file they own, in a place they did not
     * choose and will not think to clean up. The file stays where `ssh` already keeps it.
     */
    keyPath?: string;
    /** Empty means "keep the stored one". Only needed for an encrypted key. */
    passphrase?: string;
    /**
     * Open terminals inside tmux.
     *
     * What it buys is the thing SSH cannot give: the work outlives the connection. A VPN that
     * drops, a laptop that sleeps, Forge being closed — the session on the server is still there,
     * and the next terminal attaches to it rather than starting again in a different directory
     * with the job half done.
     *
     * Off by default and per server, because wrapping somebody's shell in tmux without asking
     * changes their keys, their status bar and their scrollback, and on a machine that already
     * starts tmux by itself it would be a second layer.
     */
    tmux?: boolean;
    /**
     * Keep terminals on this machine, so a crash of Forge is not a loss of the work.
     *
     * The terminal runs inside a tmux session on the operator's own computer. Forge attaches to
     * it; if Forge goes away, the session and everything running in it are still there, and the
     * next launch attaches again.
     *
     * Different from `tmux` above, which is tmux on the *server*: that one survives the network
     * going away, this one survives the application going away. Neither covers the other.
     */
    keepLocal?: boolean;
  };
};

export type SshAuth = "password" | "key";

/**
 * A server whose key we have not seen before, asking to be trusted.
 *
 * Shown once per address. The fingerprint is in the form `ssh-keygen -l` prints, so it can be
 * compared with whatever the server's owner says it should be without transcribing anything.
 */
export type HostKeyQuestion = {
  id: string;
  protocol: "ssh" | "rdp";
  host: string;
  port: number;
  fingerprint: string;
  algorithm: string;
};

/** A key that changed. Two explanations, and only one of them is harmless. */
export type HostKeyChange = {
  protocol: "ssh" | "rdp";
  host: string;
  port: number;
  expected: string;
  found: string;
};

/** One remembered server, as the settings page lists them. */
export type KnownHostEntry = {
  /** `ssh://10.0.0.5:22` — the address, which is what a key belongs to. */
  key: string;
  algorithm: string;
  fingerprint: string;
  addedAt: string;
};

/** One open terminal. */
export type SshSessionState = {
  id: string;
  /** What its tab says. Numbered per host, in the order they were opened. */
  title: string;
};

export type RemoteHostState = {
  id: string;
  name: string;
  jumpHostId?: string;
  rdp?: { host: string; port: number; username: string; hasPassword: boolean };
  vnc?: { host: string; port: number; username?: string; hasPassword: boolean; allowPlaintext?: boolean };
  ssh?: {
    host: string;
    port: number;
    username: string;
    auth: SshAuth;
    hasPassword: boolean;
    keyPath?: string;
    hasPassphrase: boolean;
    tmux?: boolean;
    keepLocal?: boolean;
  };
  rdpOpen: boolean;
  /** Whether the VNC screen is currently connected. The same idea as `rdpOpen`. */
  vncOpen: boolean;
  /**
   * The terminals open on this server, in the order they were opened.
   *
   * More than one, because maintenance is not one conversation: a log tailing in one while a
   * package installs in another is the ordinary shape of the work, and doing it with a single
   * terminal means stopping the tail to type.
   */
  sshSessions: SshSessionState[];
  /**
   * Terminals kept on this machine from a previous run, waiting to be attached to.
   *
   * Present only for a host set to keep them. Attaching costs nothing — the connection is
   * already open — so the window restores them rather than asking.
   */
  recoverable: string[];
  /** Why the last attempt failed, when it did. */
  detail?: string;
};

/** One host's saved form. Passwords live in the encrypted store, keyed by the same id. */
export type StoredRemoteHost = {
  id: string;
  name: string;
  jumpHostId?: string;
  rdp?: { host: string; port: number; username: string };
  vnc?: { host: string; port: number; username?: string; allowPlaintext?: boolean };
  ssh?: {
    host: string;
    port: number;
    username: string;
    auth: SshAuth;
    keyPath?: string;
    tmux?: boolean;
    keepLocal?: boolean;
  };
};

export const DEFAULT_RDP_PORT = 3389;
export const DEFAULT_SSH_PORT = 22;
export const DEFAULT_VNC_PORT = 5900;

/**
 * A rectangle of the remote screen that changed, as the helper reports it.
 *
 * RDP is an update protocol and the helper passes that through rather than flattening it: a
 * blinking cursor costs a cursor, not a screen. The pixels are BGRX32, one word each, which is
 * what a canvas wants.
 */
export type RemoteScreenRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RemoteScreenEvent =
  /** The surface was created or resized. Everything previously drawn is void. */
  | { kind: "size"; width: number; height: number }
  /** One changed rectangle. `pixels` is BGRX32, `width * height * 4` bytes. */
  | { kind: "paint"; rect: RemoteScreenRect; pixels: ArrayBuffer }
  /** The session ended, for the reason given. */
  | { kind: "closed"; detail?: string };

/**
 * What this application has to copy and paste with, for one server.
 *
 * Copy and paste across a remote desktop fails silently and differently on every server: the
 * channel may not open, the far side may never ask for the bytes, or it may refuse them. None of
 * that is visible, so an operator can only conclude that the application is broken. This is that
 * mechanism, said out loud — and beside it, two ways out: offer it again, or type it in.
 */
export type RemoteClipboard = {
  /** What is on this machine's clipboard, as the application reads it. */
  mine: string;
  /** When it was last offered to this server, if it has been. */
  offeredAt?: string;
  /** When the far side asked for the bytes. RDP says so; VNC has no such step. */
  pulledAt?: string;
  /** Whether the clipboard channel is open at all. Undefined where the screen says nothing. */
  channel?: boolean;
  /** The last thing copied on the far side, which is now on this machine's clipboard too. */
  fromServer?: { text: string; at: string };
  /** Which screen is answering: what the two actions below will reach. */
  screen?: "rdp" | "vnc";
};

export type MachinaRemoteApi = {
  list(): Promise<RemoteHostState[]>;
  create(input: RemoteHostInput): Promise<RemoteHostState>;
  update(id: string, input: RemoteHostInput): Promise<RemoteHostState>;
  remove(id: string): Promise<void>;
  /** The whole list, whenever any of it changes. */
  onChanged(listener: (hosts: RemoteHostState[]) => void): () => void;
  /** Ask for a private key file. Returns its path, or nothing if the operator cancelled. */
  pickKeyFile(): Promise<string | undefined>;
  /** Put the window itself full screen, or take it back. */
  setFullScreen(on: boolean): Promise<void>;
  /** Told whenever the window enters or leaves full screen, however that happened. */
  onFullScreen(listener: (on: boolean) => void): () => void;

  /*
   * Which server is on the other end.
   *
   * A key that has never been seen is asked about once; a key that changed stops the connection
   * and is never quietly accepted.
   */
  onHostKeyQuestion(listener: (question: HostKeyQuestion) => void): () => void;
  onHostKeyChanged(listener: (change: HostKeyChange) => void): () => void;
  answerHostKey(id: string, trusted: boolean): Promise<void>;
  listKnownHosts(): Promise<KnownHostEntry[]>;
  /** Forget a server's key. How an operator says "it really was rebuilt". */
  forgetHostKey(key: string): Promise<void>;

  /**
   * Open another terminal, or attach to one kept from before.
   *
   * `keep` names a tmux session on this machine that a previous run left behind.
   */
  sshOpen(id: string, keep?: string): Promise<string>;
  /** Whether this machine has tmux, and which version. Nothing is kept without it. */
  localTmux(): Promise<string | undefined>;
  sshClose(id: string, sessionId: string): Promise<void>;
  /** What the operator typed. Sent as-is; the far end decides what it means. */
  sshWrite(id: string, sessionId: string, data: string): Promise<void>;
  /** Into whichever terminal is open for this host — for windows that hold no tab state. */
  sshType(id: string, data: string): Promise<void>;
  /** Window preferences that outlive the window — see `main/remote/uiState.ts`. */
  uiState(): Promise<Record<string, number | string>>;
  setUiState(patch: Record<string, number | string>): Promise<Record<string, number | string>>;
  sshResize(id: string, sessionId: string, cols: number, rows: number): Promise<void>;
  onSshData(listener: (id: string, sessionId: string, chunk: string) => void): () => void;
  onSshClosed(
    listener: (id: string, sessionId: string, detail?: string) => void,
  ): () => void;

  /** Open the screen. Paints arrive on `onScreen`. */
  rdpOpen(id: string, width: number, height: number): Promise<void>;
  rdpClose(id: string): Promise<void>;
  /**
   * Send the whole picture again.
   *
   * RDP transmits what changed; a canvas that has just been created knows nothing, and a desktop
   * that is not moving never tells it. Asked for whenever a screen appears.
   */
  rdpRepaint(id: string): Promise<void>;
  /*
   * Input is one-way and returns nothing.
   *
   * There is no answer worth waiting for — the far end reports what happened by repainting — and
   * a request/response round trip per pointer move made the pointer lag behind the hand against
   * a server on this very machine. These are notifications, and are sent as such.
   */
  /** `buttons` is a bit mask: 1 left, 2 right, 4 middle. */
  rdpMouse(id: string, x: number, y: number, buttons: number): void;
  /** One notch of the wheel is 1. Positive scrolls away from the operator. */
  rdpWheel(id: string, x: number, y: number, notches: number): void;
  rdpKey(id: string, scancode: number, down: boolean): void;

  /**
   * The VNC screen — the same surface as the RDP one, over RFB.
   *
   * A host has one screen or the other; the paints arrive on the same `onScreen`, so the canvas
   * does not know which answered. The input channels mirror the RDP ones exactly.
   */
  /** No size: a VNC server has a desktop already, and tells the client how big it is. */
  vncOpen(id: string): Promise<void>;
  vncClose(id: string): Promise<void>;
  vncRepaint(id: string): Promise<void>;
  vncMouse(id: string, x: number, y: number, buttons: number): void;
  vncWheel(id: string, x: number, y: number, notches: number): void;
  vncKey(id: string, scancode: number, down: boolean): void;

  onScreen(listener: (id: string, event: RemoteScreenEvent) => void): () => void;

  /** What copy and paste has to work with on this server, read when the operator looks. */
  clipboard(id: string): Promise<RemoteClipboard>;
  /** Offer this machine's clipboard to the server again, whether or not it changed. */
  sendClipboard(id: string): Promise<RemoteClipboard>;
  /**
   * Type this machine's clipboard into the session, character by character.
   *
   * The way out for a server whose clipboard channel does not work: what cannot be pasted can
   * still be typed. Bounded, because this goes wherever the cursor is.
   */
  typeClipboard(id: string): Promise<RemoteClipboard>;
};
