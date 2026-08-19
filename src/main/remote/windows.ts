import { t } from "../../shared/i18n";
import type { HostStatus } from "../../shared/remoteStatus";
import { INVENTORY_NOTES } from "../../shared/remoteInventory";
import type { Inventory } from "../../shared/remoteInventory";

/**
 * Reading a Windows server.
 *
 * RDP exists in this application because customers run Windows, so a status panel that only
 * understands `/proc` is a hole in the middle of the product. What is here reads a Windows
 * machine over the same SSH connection — Windows has shipped OpenSSH Server since 2018 — and
 * nothing is installed there either.
 *
 * **PowerShell is asked for JSON, not for text.** Every table Windows prints is localised,
 * column-aligned and version-dependent; `ConvertTo-Json` is none of those things. It also moves
 * almost all of the risk into one place: the parsing below is ordinary and testable, and the only
 * thing that has to be right on a machine nobody here has is the script itself.
 *
 * The script travels as `-EncodedCommand`, which is base64 of UTF-16LE. OpenSSH on Windows hands
 * the command to `cmd.exe`, and quoting a multi-line PowerShell script through `cmd` is a game
 * nobody wins.
 */

/**
 * How a command is sent to Windows.
 *
 * Not a shell handed to anybody: these two scripts are constants in this repository, the same as
 * the Linux ones, and take no input at all.
 */
export function powershell(script: string) {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return `powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`;
}

/** What the machine is and what it is doing. `LoadPercentage` is already a rate, unlike `/proc`. */
export const WINDOWS_STATUS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$os = Get-CimInstance Win32_OperatingSystem
$cpu = @(Get-CimInstance Win32_Processor)
$disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3')
[pscustomobject]@{
  hostname = $env:COMPUTERNAME
  os = $os.Caption
  kernel = $os.Version
  architecture = $env:PROCESSOR_ARCHITECTURE
  cpuModel = $cpu[0].Name
  cpuCores = ($cpu | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum
  cpuBusy = ($cpu | Measure-Object -Property LoadPercentage -Average).Average
  memoryTotalKb = $os.TotalVisibleMemorySize
  memoryFreeKb = $os.FreePhysicalMemory
  uptimeSeconds = [int]((Get-Date) - $os.LastBootUpTime).TotalSeconds
  disks = @($disks | ForEach-Object { @{ mount = $_.DeviceID; total = $_.Size; free = $_.FreeSpace } })
} | ConvertTo-Json -Depth 4 -Compress
`;

/** What it runs and what it lets in. */
export const WINDOWS_INVENTORY_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$listeners = @(Get-NetTCPConnection -State Listen | ForEach-Object {
  $name = (Get-Process -Id $_.OwningProcess).ProcessName
  @{ protocol = 'tcp'; address = $_.LocalAddress; port = $_.LocalPort; process = $name }
})
$udp = @(Get-NetUDPEndpoint | ForEach-Object {
  $name = (Get-Process -Id $_.OwningProcess).ProcessName
  @{ protocol = 'udp'; address = $_.LocalAddress; port = $_.LocalPort; process = $name }
})
$services = @(Get-Service | ForEach-Object {
  @{ name = $_.Name; status = "$($_.Status)"; start = "$($_.StartType)"; display = $_.DisplayName }
})
$tasks = @(Get-ScheduledTask | Where-Object { $_.State -ne 'Disabled' } | ForEach-Object {
  @{ name = $_.TaskName; path = $_.TaskPath; state = "$($_.State)" }
})
$profiles = @(Get-NetFirewallProfile | ForEach-Object {
  @{ name = $_.Name; enabled = [bool]$_.Enabled; inbound = "$($_.DefaultInboundAction)" }
})
$reboot = Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired'
[pscustomobject]@{
  ports = $listeners + $udp
  services = $services
  tasks = $tasks
  firewall = $profiles
  rebootRequired = [bool]$reboot
} | ConvertTo-Json -Depth 5 -Compress
`;

/** The shape the scripts above produce. Anything missing is a machine that answered differently. */
type WindowsStatusJson = {
  hostname?: string;
  os?: string;
  kernel?: string;
  architecture?: string;
  cpuModel?: string;
  cpuCores?: number;
  cpuBusy?: number;
  memoryTotalKb?: number;
  memoryFreeKb?: number;
  uptimeSeconds?: number;
  disks?: Array<{ mount?: string; total?: number; free?: number }>;
};

/**
 * The one JSON object in the output.
 *
 * PowerShell writes warnings and progress to the same stream in some configurations, so the
 * object is found rather than assumed to be the whole of it.
 */
function jsonIn(output: string): unknown {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(output.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

export function parseWindowsStatus(output: string): Omit<HostStatus, "at"> | undefined {
  const parsed = jsonIn(output) as WindowsStatusJson | undefined;
  if (!parsed || (!parsed.hostname && !parsed.os)) return undefined;

  const total = (parsed.memoryTotalKb ?? 0) * 1024;
  const free = (parsed.memoryFreeKb ?? 0) * 1024;

  return {
    hostname: parsed.hostname,
    os: parsed.os,
    kernel: parsed.kernel,
    architecture: parsed.architecture,
    cpuModel: parsed.cpuModel?.trim(),
    cpuCores: parsed.cpuCores,
    /*
     * Already a percentage.
     *
     * Windows keeps a rate where Linux keeps a lifetime counter, so unlike `/proc/stat` this
     * needs no second reading — and the first one after connecting shows a real number rather
     * than a dash.
     */
    cpuBusy: typeof parsed.cpuBusy === "number" ? parsed.cpuBusy : undefined,
    memory: total > 0 ? { total, used: total - free } : undefined,
    filesystems: (parsed.disks ?? [])
      .filter((disk) => disk.mount && (disk.total ?? 0) > 0)
      .map((disk) => ({
        device: disk.mount!,
        mount: disk.mount!,
        total: disk.total!,
        used: disk.total! - (disk.free ?? 0),
      })),
    load: undefined,
    uptimeSeconds: parsed.uptimeSeconds,
  };
}

type WindowsInventoryJson = {
  ports?: Array<{ protocol?: string; address?: string; port?: number; process?: string }>;
  services?: Array<{ name?: string; status?: string; start?: string; display?: string }>;
  tasks?: Array<{ name?: string; path?: string; state?: string }>;
  firewall?: Array<{ name?: string; enabled?: boolean; inbound?: string }>;
  rebootRequired?: boolean;
};

/** Windows binds the whole machine to `0.0.0.0` or `::`; only the loopback is private. */
function exposedOnWindows(address: string) {
  return !(address === "127.0.0.1" || address === "::1");
}

export function parseWindowsInventory(output: string): Inventory | undefined {
  const parsed = jsonIn(output) as WindowsInventoryJson | undefined;
  if (!parsed || (!parsed.ports && !parsed.services)) return undefined;

  const missing: string[] = [];
  const ports = (parsed.ports ?? [])
    .filter((port) => typeof port.port === "number" && port.address)
    .map((port) => ({
      protocol: port.protocol ?? "tcp",
      address: port.address!,
      port: port.port!,
      process: port.process || undefined,
      exposed: exposedOnWindows(port.address!),
    }))
    .sort((a, b) => Number(b.exposed) - Number(a.exposed) || a.port - b.port);

  const services = (parsed.services ?? [])
    .filter((service) => service.name)
    .map((service) => ({
      name: service.name!,
      // Windows has no `loaded`; what it has is whether the thing starts on its own.
      load: service.start ?? "",
      active: service.status === "Running" ? "active" : "inactive",
      sub: service.status ?? "",
      description: service.display,
    }))
    .sort((a, b) => Number(b.active === "active") - Number(a.active === "active") ||
      a.name.localeCompare(b.name));

  const firewall = parsed.firewall ?? [];
  if (firewall.length === 0) missing.push(INVENTORY_NOTES.noFirewall);
  /*
   * "Active" means every profile is on.
   *
   * Windows has three — Domain, Private, Public — and a machine with two on and one off is a
   * machine somebody turned one off on. Reporting that as "on" would hide the exception, which
   * is the only interesting part.
   */
  const allOn = firewall.length > 0 && firewall.every((profile) => profile.enabled);

  return {
    at: new Date().toISOString(),
    ports,
    services,
    cron: (parsed.tasks ?? [])
      .filter((task) => task.name)
      .map((task) => ({
        owner: t("Task Scheduler"),
        schedule: task.state ?? "",
        command: `${task.path ?? ""}${task.name}`,
      })),
    // Docker on Windows is asked for by the Linux command's `docker` line only; not read here.
    containers: [],
    images: [],
    firewall: {
      kind: t("Windows Defender Firewall"),
      active: allOn,
      rules: firewall.map(
        (profile) =>
          t("{profile}: {state} (inbound defaults to {inbound})", {
            profile: profile.name ?? "",
            state: profile.enabled ? t("on") : t("off"),
            inbound: profile.inbound ?? "",
          }),
      ),
    },
    /*
     * How many updates are waiting is not asked.
     *
     * It needs the Windows Update agent, which is a COM object, minutes of work on the far end,
     * and a different answer depending on whether WSUS is in the way. Whether the machine is
     * waiting for a restart is one registry key and is the half that changes what somebody does
     * next.
     */
    updates: parsed.rebootRequired ? { count: 0, rebootRequired: true } : undefined,
    missing,
  };
}
