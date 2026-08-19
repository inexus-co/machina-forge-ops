/**
 * What is running on a server, and what it lets in.
 *
 * The same premise as the status panel: the kernel and the ordinary tools already know all of
 * this, and nothing is installed on the far end to ask them. Cockpit answers many of the same
 * questions and answers some of them better — it is a privileged daemon on the machine, with
 * dbus. What it cannot do is answer them about a machine nobody installed it on, which is every
 * machine on the first day.
 *
 * Read-only, deliberately. Changing any of this is the agent's path, where a command goes through
 * an allowlist and a person — see `docs/decisions/0001-shell-under-a-written-guarantee.md`.
 * A button here that stopped a service would be a write with none of that behind it.
 */

/** Something listening for connections. */
export type ListeningPort = {
  protocol: string;
  /** `0.0.0.0:443`, `[::]:22`, `127.0.0.1:5432` — as the kernel reports it. */
  address: string;
  port: number;
  /** The program, when the account was allowed to see it. */
  process?: string;
  /**
   * Whether anything outside this machine could reach it.
   *
   * The single most useful fact in the list: a database bound to `127.0.0.1` and one bound to
   * `0.0.0.0` look almost identical in `ss` output and are entirely different situations.
   */
  exposed: boolean;
};

export type ServiceUnit = {
  name: string;
  /** `loaded`, `not-found`, `masked`. */
  load: string;
  /** `active`, `failed`, `inactive`. */
  active: string;
  sub: string;
  description?: string;
};

export type CronJob = {
  /** Whose it is: a user name, or the file under `/etc/cron.d`. */
  owner: string;
  schedule: string;
  command: string;
};

export type Container = {
  id: string;
  image: string;
  name: string;
  status: string;
  ports?: string;
};

export type ContainerImage = {
  repository: string;
  tag: string;
  size: string;
};

/** What the firewall is, and what it says. Free text, because every firewall says it its own way. */
export type Firewall = {
  /** `ufw`, `firewalld`, `nftables`, `iptables`, or nothing found. */
  kind: string;
  active: boolean;
  rules: string[];
};

export type Updates = {
  /** How many packages have a newer version. */
  count: number;
  /** How many of those the distribution marks as security. */
  security?: number;
  /** Whether the machine is waiting for a restart to finish an update. */
  rebootRequired: boolean;
};

export type Inventory = {
  at: string;
  ports: ListeningPort[];
  services: ServiceUnit[];
  cron: CronJob[];
  containers: Container[];
  images: ContainerImage[];
  firewall: Firewall;
  updates?: Updates;
  /**
   * What could not be read, as sentences from `INVENTORY_NOTES`.
   *
   * Sentences rather than codes because that is how every other message in this application is
   * keyed — and the window puts each through `t()` when it draws them, so switching the language
   * changes what is already on screen rather than waiting for the next read.
   */
  missing: string[];
};

/** One log source that can be followed. */
export type LogSource = {
  id: string;
  label: string;
  /** `journal` reads systemd's; `file` tails a path. */
  kind: "journal" | "file";
  path?: string;
  /**
   * One unit's journal, rather than the whole machine's.
   *
   * The way to read a web server's log without knowing where its file is — and the only way that
   * is the same sentence on Debian and on RHEL, where the path is neither the same directory nor
   * the same spelling.
   */
  unit?: string;
};

export type MachinaRemoteInventoryApi = {
  read(hostId: string): Promise<Inventory>;
  /** Every program this server has on its PATH, for building a category from what is there. */
  commands(hostId: string): Promise<string[]>;
  /** One line about a program, from the server's own manuals. Cached; empty answers stay empty. */
  describeCommand(hostId: string, program: string): Promise<string | undefined>;
  /** The log sources this server has, found rather than guessed. */
  logSources(hostId: string): Promise<LogSource[]>;
  /** Start following one. Lines arrive on `onLogLines`; only one follow per host. */
  followLog(hostId: string, source: LogSource, filter?: string): Promise<void>;
  stopLog(hostId: string): Promise<void>;
  onLogLines(listener: (hostId: string, lines: string[]) => void): () => void;
  onLogClosed(listener: (hostId: string, detail?: string) => void): () => void;
};

/**
 * The reasons a reading can come back short.
 *
 * Named here so both sides agree: the main process pushes these exact sentences and the window
 * translates them. `i18n.test.ts` walks this list, so one added without a translation fails.
 */
/**
 * The one log source that is a sentence rather than a name.
 *
 * Everything else in the list is a unit name or a path — data, and the same in every language.
 * This one is words, so it is named here and translated where it is drawn.
 */
export const LOG_SOURCE_LABELS = {
  whole: "Everything (journal)",
} as const;

export const INVENTORY_NOTES = {
  /* First in the list on purpose: it says the other sentences are about a fragment. */
  cut: "The reading stopped part way. What is shown here may not be all of it.",
  noPorts: "The open ports could not be read.",
  noSystemd: "No systemd services — this machine may not use systemd.",
  noFirewall: "The firewall settings could not be read.",
} as const;
