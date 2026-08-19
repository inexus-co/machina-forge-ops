import type {
  Container,
  ContainerImage,
  CronJob,
  Firewall,
  Inventory,
  ListeningPort,
  ServiceUnit,
  Updates,
} from "../../../shared/remoteInventory";
import { INVENTORY_NOTES } from "../../../shared/remoteInventory";

/**
 * Reading what a server is running, from the tools it already has.
 *
 * One command, one round trip, sections separated by markers — the same shape as the status
 * panel, for the same reason: a maintenance tool asking eight questions is eight round trips over
 * a VPN, and the whole point of asking is that the answer arrives while somebody is still
 * wondering.
 *
 * Every section can be absent. A server without Docker, without systemd, without a firewall, or
 * with an account that may not see other people's processes is not an error — it is a server, and
 * what could not be read is said rather than left blank.
 */

/**
 * The fixed command. A constant in this repository, with no input at all.
 *
 * Read-only throughout: `ss`, `systemctl list-units`, `crontab -l`, `docker ps`, and the
 * firewall's own list. Nothing here changes anything, which is why it does not go through the
 * agent's allowlist — the allowlist exists to gate what an agent invents, and this was written
 * once and reviewed.
 */
export const INVENTORY_COMMAND = [
  'echo "#ports"',
  // `-p` needs privilege to name other people's processes; without it the rest still arrives.
  "ss -tulpnH 2>/dev/null || ss -tulnH 2>/dev/null || netstat -tulpn 2>/dev/null || true",
  'echo "#services"',
  "systemctl list-units --type=service --all --no-legend --no-pager --plain 2>/dev/null || true",
  'echo "#cron"',
  "crontab -l 2>/dev/null || true",
  'echo "#crond"',
  "grep -rhv '^[[:space:]]*#' /etc/cron.d/ /etc/crontab 2>/dev/null || true",
  'echo "#timers"',
  "systemctl list-timers --all --no-legend --no-pager 2>/dev/null || true",
  'echo "#containers"',
  'docker ps -a --format "{{.ID}}\\t{{.Image}}\\t{{.Names}}\\t{{.Status}}\\t{{.Ports}}" 2>/dev/null || podman ps -a --format "{{.ID}}\\t{{.Image}}\\t{{.Names}}\\t{{.Status}}\\t{{.Ports}}" 2>/dev/null || true',
  'echo "#images"',
  'docker images --format "{{.Repository}}\\t{{.Tag}}\\t{{.Size}}" 2>/dev/null || podman images --format "{{.Repository}}\\t{{.Tag}}\\t{{.Size}}" 2>/dev/null || true',
  'echo "#firewall"',
  "ufw status verbose 2>/dev/null || firewall-cmd --list-all 2>/dev/null || nft list ruleset 2>/dev/null || iptables -S 2>/dev/null || true",
  'echo "#updates"',
  "apt list --upgradable 2>/dev/null || dnf -q check-update 2>/dev/null || yum -q check-update 2>/dev/null || true",
  'echo "#reboot"',
  "test -f /var/run/reboot-required && echo yes || true",
  "needs-restarting -r >/dev/null 2>&1 || test -f /var/run/reboot-required && echo yes || true",
  /*
   * The last thing said, so that its absence means the rest was cut off.
   *
   * The runner's own cap is not enough: a command that times out returns what it managed to print,
   * with nothing flagged. This marker costs six bytes and catches both.
   */
  'echo "#end"',
].join("; ");

/**
 * How much of this answer to keep, in bytes.
 *
 * The runner's default is 100KB (`commandRunner.ts`), and this one command can pass it on an
 * ordinary machine: 300 systemd units are ~33KB, `iptables -S` on a Docker host runs past 20KB,
 * and 300 pending updates are ~24KB. Passing it used to mean the tail was dropped in silence and
 * read as "no firewall" — hence the marker above and this number.
 */
export const INVENTORY_MAX_OUTPUT = 400_000;

function sections(output: string): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  let current = "";
  for (const line of output.split("\n")) {
    if (line.startsWith("#") && /^#[a-z]+$/.test(line.trim())) {
      current = line.trim().slice(1);
      found[current] = [];
      continue;
    }
    if (current) found[current].push(line);
  }
  return found;
}

/**
 * Whether an address can be reached from anywhere but the machine itself.
 *
 * The most useful fact about a listening port, and the one hardest to see in raw output:
 * `127.0.0.1:5432` and `0.0.0.0:5432` differ by four characters and by whether the internet can
 * talk to your database.
 */
function isExposed(address: string) {
  const bare = address.replace(/^\[|\]$/g, "");
  if (bare === "127.0.0.1" || bare === "::1" || bare.startsWith("127.")) return false;
  return true;
}

function parsePorts(lines: string[]): ListeningPort[] {
  const found: ListeningPort[] = [];
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    // ss -H: Netid State Recv-Q Send-Q Local:Port Peer:Port [users:(("name",pid=..))]
    const [netid, state] = parts;
    if (!/^(tcp|udp)$/.test(netid)) continue;
    if (netid === "tcp" && !/LISTEN/i.test(state)) continue;

    const local = parts[4];
    const cut = local.lastIndexOf(":");
    if (cut < 0) continue;
    const address = local.slice(0, cut);
    const port = Number(local.slice(cut + 1));
    if (Number.isNaN(port)) continue;

    const users = /users:\(\("([^"]+)"/.exec(line);
    found.push({
      protocol: netid,
      address,
      port,
      process: users?.[1],
      exposed: isExposed(address),
    });
  }
  // Exposed first, then by port: the row somebody is looking for is the one facing outwards.
  return found.sort(
    (a, b) => Number(b.exposed) - Number(a.exposed) || a.port - b.port,
  );
}

function parseServices(lines: string[]): ServiceUnit[] {
  const found: ServiceUnit[] = [];
  for (const line of lines) {
    // A failed unit is prefixed with a bullet, which is not part of its name.
    const parts = line.replace(/^[●*x✗]\s*/, "").trim().split(/\s+/);
    if (parts.length < 4 || !parts[0].endsWith(".service")) continue;
    found.push({
      name: parts[0],
      load: parts[1],
      active: parts[2],
      sub: parts[3],
      description: parts.slice(4).join(" ") || undefined,
    });
  }
  /*
   * Failed first, then running, then the rest.
   *
   * A list of two hundred units in alphabetical order buries the one that is broken, which is
   * the only reason anybody opened it.
   */
  const rank = (unit: ServiceUnit) =>
    unit.active === "failed" ? 0 : unit.active === "active" ? 1 : 2;
  return found.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** A crontab line: five schedule fields, then the command. Comments and settings are not jobs. */
function parseCrontab(lines: string[], owner: string): CronJob[] {
  const found: CronJob[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || /^[A-Z_]+=/.test(line)) continue;

    if (line.startsWith("@")) {
      const [schedule, ...rest] = line.split(/\s+/);
      if (rest.length > 0) found.push({ owner, schedule, command: rest.join(" ") });
      continue;
    }
    const parts = line.split(/\s+/);
    if (parts.length < 6) continue;
    const schedule = parts.slice(0, 5).join(" ");
    let rest = parts.slice(5);
    /*
     * `/etc/cron.d` puts the user between the schedule and the command.
     *
     * A personal crontab does not, and reading one as the other turns the first word of the
     * command into a user name — so the list shows `root` running nothing.
     */
    if (owner !== "user" && rest.length > 1 && /^[a-z_][a-z0-9_-]*$/.test(rest[0])) {
      rest = rest.slice(1);
    }
    if (rest.length > 0) found.push({ owner, schedule, command: rest.join(" ") });
  }
  return found;
}

/**
 * systemd's timers, which are cron jobs by another name.
 *
 * Listed together with the crontabs because the question is "what runs on its own here", and an
 * answer that covered only one of the two mechanisms would be worse than no answer — it would be
 * a list that looked complete.
 */
function parseTimers(lines: string[]): CronJob[] {
  const found: CronJob[] = [];
  for (const line of lines) {
    const unit = /(\S+\.timer)/.exec(line);
    if (!unit) continue;
    /*
     * Everything before the unit's name is when it next runs.
     *
     * The columns are separated by single spaces in some versions and runs of them in others, so
     * splitting on whitespace is not reliable; the timer's name is, and the schedule is what
     * comes before it. The trailing `- -` is the last-run columns when it has never run.
     */
    const schedule = line
      .slice(0, line.indexOf(unit[1]))
      .replace(/[-\s]+$/, "")
      .trim();
    found.push({ owner: "systemd", schedule: schedule || "timer", command: unit[1] });
  }
  return found;
}

function parseContainers(lines: string[]): Container[] {
  return lines
    .map((line) => line.split("\t"))
    .filter((parts) => parts.length >= 4)
    .map(([id, image, name, status, ports]) => ({
      id,
      image,
      name,
      status,
      ports: ports || undefined,
    }));
}

function parseImages(lines: string[]): ContainerImage[] {
  return lines
    .map((line) => line.split("\t"))
    .filter((parts) => parts.length >= 3 && parts[0])
    .map(([repository, tag, size]) => ({ repository, tag, size }));
}

/**
 * The firewall, whichever one this is.
 *
 * Four tools with four output formats and no common ground beyond "some lines". Recognised by
 * what the output looks like rather than by asking which is installed, because the command
 * already fell through to whichever answered.
 */
function parseFirewall(lines: string[]): Firewall {
  const text = lines.join("\n");
  const rules = lines.map((line) => line.trimEnd()).filter(Boolean);

  if (/^Status:\s*(active|inactive)/m.test(text)) {
    return { kind: "ufw", active: /^Status:\s*active/m.test(text), rules };
  }
  if (/target:|^\s*services:/m.test(text)) {
    return { kind: "firewalld", active: true, rules };
  }
  if (/^table\s+(inet|ip|ip6)\s/m.test(text)) {
    return { kind: "nftables", active: true, rules };
  }
  if (/^-P\s+(INPUT|FORWARD|OUTPUT)/m.test(text)) {
    /*
     * A default-accept policy with no rules is a firewall that is present and doing nothing,
     * which reads very differently from one that is off.
     */
    const onlyPolicies = rules.every((line) => line.startsWith("-P"));
    const allAccept = /-P INPUT ACCEPT/.test(text);
    return { kind: "iptables", active: !(onlyPolicies && allAccept), rules };
  }
  return { kind: rules.length > 0 ? "unknown" : "none", active: false, rules };
}

function parseUpdates(lines: string[], reboot: string[]): Updates | undefined {
  const rows = lines.filter(
    (line) => line.trim() && !/^(Listing|Last metadata|Obsoleting)/.test(line),
  );
  const rebootRequired = reboot.some((line) => line.trim() === "yes");
  if (rows.length === 0) {
    return rebootRequired ? { count: 0, rebootRequired } : undefined;
  }
  const security = rows.filter((line) => /security/i.test(line)).length;
  return { count: rows.length, security: security || undefined, rebootRequired };
}

/**
 * Whether the whole answer arrived.
 *
 * A reading that stopped half way looks exactly like a server without a firewall: the section
 * marker never came, the list is empty, and every conclusion drawn from that is confidently wrong.
 * Two independent signals, because neither catches the other's case — the runner's cap
 * (`truncated`) does not fire on a timeout, and a timeout's partial output has no `#end`.
 */
function complete(found: Record<string, string[]>, truncated?: boolean): boolean {
  return !truncated && "end" in found;
}

export function parseInventory(
  output: string,
  options: { truncated?: boolean } = {},
): Inventory | undefined {
  const found = sections(output);
  if (Object.keys(found).length === 0) return undefined;

  const missing: string[] = [];
  /*
   * Said first, and said before anything else is judged.
   *
   * What follows reads a cut-off answer as a complete one — "no firewall", "no services" — so the
   * operator has to be told that the sentences below are about a fragment.
   */
  const whole = complete(found, options.truncated);
  if (!whole) missing.push(INVENTORY_NOTES.cut);

  const ports = parsePorts(found.ports ?? []);
  if (ports.length === 0 && whole) missing.push(INVENTORY_NOTES.noPorts);
  const services = parseServices(found.services ?? []);
  if (services.length === 0 && whole) missing.push(INVENTORY_NOTES.noSystemd);
  const containers = parseContainers(found.containers ?? []);
  const images = parseImages(found.images ?? []);
  const firewall = parseFirewall(found.firewall ?? []);
  if (firewall.kind === "none" && whole) missing.push(INVENTORY_NOTES.noFirewall);

  return {
    at: new Date().toISOString(),
    ports,
    services,
    cron: [
      ...parseCrontab(found.cron ?? [], "user"),
      ...parseCrontab(found.crond ?? [], "system"),
      ...parseTimers(found.timers ?? []),
    ],
    containers,
    images,
    firewall,
    updates: parseUpdates(found.updates ?? [], found.reboot ?? []),
    missing,
  };
}
