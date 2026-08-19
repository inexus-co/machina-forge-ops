import type { HostStatus, CpuSample, Filesystem } from "../../../shared/remoteStatus";

/**
 * Reading what a Linux server already knows about itself.
 *
 * Nothing is installed on the far end to make this work. The kernel keeps all of it in `/proc`
 * and `df` has been on every Unix for forty years — the only thing missing is somebody asking.
 *
 * One command, one round trip, sections separated by markers. Parsing is here and pure, because
 * `/proc` formats are the kind of thing that differ between distributions in ways worth having
 * tests about.
 */

/**
 * The fixed command. Not built from anything, not influenced by anything.
 *
 * It is the operator's own tool reading their own server, so it does not go through the agent's
 * allowlist — but it is a constant in this repository, which is a stronger guarantee than a list:
 * there is no input to it at all.
 */
export const STATUS_COMMAND = [
  'echo "#os"',
  "uname -srm",
  "hostname",
  "cat /etc/os-release 2>/dev/null || true",
  'echo "#cpu"',
  "cat /proc/cpuinfo",
  /*
   * `lscpu` as well, because `/proc/cpuinfo` has no `model name` on ARM.
   *
   * The field is x86's. On aarch64 the file lists implementer and part numbers instead, so a
   * panel that only reads `/proc/cpuinfo` shows a dash on exactly the machines that are becoming
   * common. `lscpu` normalises it, and is absent rarely enough to fall back from rather than
   * depend on.
   */
  "lscpu 2>/dev/null || true",
  'echo "#stat"',
  "cat /proc/stat",
  'echo "#mem"',
  "cat /proc/meminfo",
  'echo "#load"',
  "cat /proc/loadavg",
  "cat /proc/uptime",
  'echo "#df"',
  "df -kP",
].join("; ");

/**
 * How much of this answer to keep, in bytes.
 *
 * `/proc/cpuinfo` prints a paragraph per core — a 96-core machine is past 100KB on that section
 * alone, and the runner's default cap would drop everything after it (the disks are read last).
 * Unlike the inventory, `HostStatus` has nowhere to say "this was cut", so the answer here is to
 * leave enough room that it is not.
 */
export const STATUS_MAX_OUTPUT = 400_000;

/** Split the output into its labelled sections. Anything unexpected leaves a section empty. */
function sections(output: string): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  let current = "";
  for (const line of output.split("\n")) {
    if (line.startsWith("#")) {
      current = line.slice(1).trim();
      found[current] = [];
      continue;
    }
    if (current) found[current].push(line);
  }
  return found;
}

/**
 * The busy fraction between two readings of `/proc/stat`.
 *
 * A single reading says how much time the machine has spent in each state *since it booted*,
 * which on a server that has been up for a year is a number that never visibly moves. The rate
 * is the difference between two readings over the time between them, which is why the first
 * sample shows nothing and every one after it shows the interval that just passed.
 */
export function cpuBusy(previous: CpuSample, next: CpuSample): number | undefined {
  const total = next.total - previous.total;
  const idle = next.idle - previous.idle;
  // A counter that went backwards means the machine rebooted, or the samples came out of order.
  if (total <= 0 || idle < 0) return undefined;
  return Math.min(100, Math.max(0, ((total - idle) / total) * 100));
}

function parseCpuSample(lines: string[]): CpuSample | undefined {
  const line = lines.find((each) => /^cpu\s/.test(each));
  if (!line) return undefined;
  // user nice system idle iowait irq softirq steal guest guest_nice
  const values = line.trim().split(/\s+/).slice(1).map(Number);
  if (values.length < 4 || values.some(Number.isNaN)) return undefined;
  const total = values.reduce((sum, value) => sum + value, 0);
  // Idle *and* iowait: a disk-bound machine is waiting, not working.
  const idle = values[3] + (values[4] ?? 0);
  return { total, idle };
}

function parseMeminfo(lines: string[]) {
  const read = (key: string) => {
    const line = lines.find((each) => each.startsWith(`${key}:`));
    if (!line) return undefined;
    const value = Number(line.split(/\s+/)[1]);
    return Number.isNaN(value) ? undefined : value * 1024;
  };
  const total = read("MemTotal");
  /*
   * `MemAvailable`, not `MemFree`.
   *
   * Free memory on a healthy Linux box is nearly zero, because the kernel uses everything spare
   * for cache and gives it back on demand. Reporting that as "memory used" is the single most
   * common way a status panel frightens somebody about a machine that is fine.
   */
  const available = read("MemAvailable") ?? read("MemFree");
  const swapTotal = read("SwapTotal");
  const swapFree = read("SwapFree");
  if (total === undefined || available === undefined) return undefined;
  return {
    total,
    used: total - available,
    swapTotal,
    swapUsed: swapTotal !== undefined && swapFree !== undefined ? swapTotal - swapFree : undefined,
  };
}

function parseFilesystems(lines: string[]): Filesystem[] {
  const found: Filesystem[] = [];
  for (const line of lines.slice(1)) {
    // Filesystem 1024-blocks Used Available Capacity Mounted-on
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const [device, blocks, used] = parts;
    const mount = parts.slice(5).join(" ");
    const total = Number(blocks) * 1024;
    const usedBytes = Number(used) * 1024;
    if (Number.isNaN(total) || Number.isNaN(usedBytes) || total === 0) continue;
    /*
     * Only storage somebody could fill.
     *
     * `df` lists every pseudo-filesystem the kernel mounts, and on a container that is most of
     * the list: `/dev/shm` at 0% beside `/proc/scsi` tells nobody anything and pushes the one
     * filesystem that matters off the bottom.
     *
     * Filtered by **where it is mounted**, not by what the device is called. Excluding `overlay`
     * by name looked reasonable and dropped `/` on every container — which is the one line the
     * panel exists to show.
     */
    if (/^\/(proc|sys|dev|run)(\/|$)/.test(mount)) continue;
    if (/^(devtmpfs|udev|none)$/.test(device)) continue;
    // Docker binds these three as single files from the host's disk. Same device, same numbers,
    // three more rows saying what `/` already said.
    if (/^\/etc\/(hosts|hostname|resolv\.conf)$/.test(mount)) continue;
    found.push({ device, mount, total, used: usedBytes });
  }
  // Biggest first: the one about to fill up is usually the big one, and there may be many.
  return found.sort((a, b) => b.total - a.total).slice(0, 6);
}

function parseOs(lines: string[]) {
  const [unameLine, hostname, ...rest] = lines;
  const pretty = rest
    .find((each) => each.startsWith("PRETTY_NAME="))
    ?.split("=")[1]
    ?.replace(/^"|"$/g, "");
  const [kernelName, kernelRelease, architecture] = (unameLine ?? "").trim().split(/\s+/);
  return {
    hostname: hostname?.trim() || undefined,
    os: pretty || kernelName || undefined,
    kernel: kernelRelease || undefined,
    architecture: architecture || undefined,
  };
}

function parseCpuInfo(lines: string[]) {
  const field = (pattern: RegExp) =>
    lines
      .find((each) => pattern.test(each))
      ?.split(":")
      .slice(1)
      .join(":")
      .trim();

  /*
   * In priority order, and only if it says something.
   *
   * `Model:` is deliberately not in this list. On ARM it is the part revision — `lscpu` prints
   * `Model: 0` — and reading it as the processor's name put "0 × 18" on screen. Virtualised ARM
   * often has no name at all (`Model name: -`), and the vendor is the last thing left that means
   * anything to a person.
   */
  const named = (value?: string) =>
    value && value !== "-" && !/^[0-9]+$/.test(value) ? value : undefined;
  const model =
    named(field(/^model name\s*:/i)) ??
    named(field(/^Hardware\s*:/)) ??
    named(field(/^Vendor ID\s*:/));
  const cores =
    lines.filter((each) => /^processor\s*:/.test(each)).length ||
    Number(field(/^CPU\(s\)\s*:/)) ||
    undefined;
  return {
    cpuModel: model || undefined,
    cpuCores: cores && !Number.isNaN(cores) ? cores : undefined,
  };
}

/**
 * Everything the command said, as numbers.
 *
 * `sample` is handed back so the caller can keep it and compute a rate against the next one.
 * Returns undefined only when the output is not from a Linux machine at all — a partial answer
 * is still worth showing, because "we could not read the disks" beats a blank panel.
 */
export function parseStatus(
  output: string,
): { status: Omit<HostStatus, "at" | "cpuBusy">; sample?: CpuSample } | undefined {
  const found = sections(output);
  if (Object.keys(found).length === 0) return undefined;

  const memory = parseMeminfo(found.mem ?? []);
  const loadLine = (found.load ?? [])[0]?.trim().split(/\s+/) ?? [];
  const uptimeLine = (found.load ?? [])[1]?.trim().split(/\s+/) ?? [];
  const load = loadLine.slice(0, 3).map(Number).filter((value) => !Number.isNaN(value));
  const uptime = Number(uptimeLine[0]);

  return {
    sample: parseCpuSample(found.stat ?? []),
    status: {
      ...parseOs(found.os ?? []),
      ...parseCpuInfo(found.cpu ?? []),
      memory,
      filesystems: parseFilesystems(found.df ?? []),
      load: load.length === 3 ? (load as [number, number, number]) : undefined,
      uptimeSeconds: Number.isNaN(uptime) ? undefined : uptime,
    },
  };
}
