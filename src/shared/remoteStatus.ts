/**
 * What a server is, and what it is doing.
 *
 * Read over the SSH connection that already exists, from `/proc` and `df`. **Nothing is installed
 * on the far end** — the kernel already keeps all of it, and sshd is already running. A machine
 * that is already doing its job can be asked about itself, so nothing here has to be guessed at
 * from a picture of a screen.
 *
 * What *would* need something resident is continuous collection — a graph over a week, an alert
 * at three in the morning, a number from a machine nobody is connected to. That is monitoring,
 * and it belongs to a monitoring system. This is what the machine looks like while somebody is
 * working on it.
 */

/** One reading of the kernel's CPU time counters. Meaningless alone; a rate needs two. */
export type CpuSample = { total: number; idle: number };

export type Filesystem = {
  device: string;
  mount: string;
  total: number;
  used: number;
};

export type HostStatus = {
  at: string;
  hostname?: string;
  os?: string;
  kernel?: string;
  architecture?: string;
  cpuModel?: string;
  cpuCores?: number;
  /** Percent busy over the interval since the previous reading. Absent on the first one. */
  cpuBusy?: number;
  memory?: {
    total: number;
    /** Total minus `MemAvailable`: cache is not "used" in any sense an operator cares about. */
    used: number;
    swapTotal?: number;
    swapUsed?: number;
  };
  filesystems: Filesystem[];
  load?: [number, number, number];
  uptimeSeconds?: number;
};

/** Why there is no reading, when there is none. */
export type HostStatusError = { at: string; detail: string };

export type MachinaRemoteStatusApi = {
  /** Begin reading this host every few seconds. Safe to call again; it does not stack. */
  watch(hostId: string): Promise<void>;
  stop(hostId: string): Promise<void>;
  /** Read once, now, without changing whether a watch is running. */
  refresh(hostId: string): Promise<void>;
  /**
   * Move this host's status into a small window the system keeps above everything.
   *
   * A real window rather than Document Picture-in-Picture: that API freezes this Electron's
   * renderer outright — see `main/remote/status/window.ts`.
   */
  popOut(hostId: string, title: string): Promise<void>;
  popIn(hostId: string): Promise<void>;
  onStatus(
    listener: (hostId: string, status: HostStatus | undefined, error?: HostStatusError) => void,
  ): () => void;
};

/**
 * How often to look.
 *
 * Every three seconds is fast enough that a spike is visible while somebody watches for it, and
 * slow enough that the reading itself is not part of the load being measured — one `cat` of a
 * few `/proc` files costs the far end nothing worth counting.
 */
export const STATUS_INTERVAL_MS = 3000;
