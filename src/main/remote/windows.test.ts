import { describe, expect, it } from "vitest";
import { setLocale } from "../../shared/i18n";
import {
  WINDOWS_INVENTORY_SCRIPT,
  WINDOWS_STATUS_SCRIPT,
  parseWindowsInventory,
  parseWindowsStatus,
  powershell,
} from "./windows";

/**
 * What can and cannot be checked here.
 *
 * **Not captures.** There is no Windows machine on this developer's desk — running one under
 * emulation on Apple silicon has no KVM and is about ten times slower than real, which turns a
 * Windows install into an afternoon. The JSON below is the shape the scripts in `windows.ts`
 * produce, because those scripts name every field they emit; it is not output somebody recorded
 * from a server.
 *
 * So these tests hold the parsing to account and they hold the encoding to account. What they
 * cannot say is whether the PowerShell runs on a real Windows Server, which needs a real Windows
 * Server. That is stated in the commit and in the panel rather than left for somebody to discover.
 */

/* The firewall lines are written for the operator, so the language is pinned. */
setLocale("en");

const STATUS_JSON = JSON.stringify({
  hostname: "WIN-APP01",
  os: "Microsoft Windows Server 2022 Standard",
  kernel: "10.0.20348",
  architecture: "AMD64",
  cpuModel: "Intel(R) Xeon(R) Gold 6248R CPU @ 3.00GHz ",
  cpuCores: 8,
  cpuBusy: 17,
  memoryTotalKb: 16_777_216,
  memoryFreeKb: 4_194_304,
  uptimeSeconds: 907_200,
  disks: [
    { mount: "C:", total: 137_438_953_472, free: 41_231_686_041 },
    { mount: "D:", total: 549_755_813_888, free: 549_000_000_000 },
  ],
});

describe("a Windows machine's state", () => {
  const status = parseWindowsStatus(STATUS_JSON)!;

  it("it reads what the machine is", () => {
    expect(status).toMatchObject({
      hostname: "WIN-APP01",
      os: "Microsoft Windows Server 2022 Standard",
      architecture: "AMD64",
      cpuCores: 8,
      uptimeSeconds: 907_200,
    });
    // WMI pads the processor name; a trailing space is not part of it.
    expect(status.cpuModel).toBe("Intel(R) Xeon(R) Gold 6248R CPU @ 3.00GHz");
  });

  it("the CPU has a number from the very first reading", () => {
    /*
     * Windows keeps a rate where Linux keeps a lifetime counter, so unlike `/proc/stat` there is
     * no first reading that has nothing to compare against.
     */
    expect(status.cpuBusy).toBe(17);
  });

  it("memory is turned into what is used", () => {
    expect(status.memory).toEqual({ total: 16_777_216 * 1024, used: 12_582_912 * 1024 });
  });

  it("one line per drive", () => {
    expect(status.filesystems).toHaveLength(2);
    expect(status.filesystems[0]).toMatchObject({
      mount: "C:",
      total: 137_438_953_472,
      used: 137_438_953_472 - 41_231_686_041,
    });
  });

  it("Linux output is never read as Windows output", () => {
    expect(parseWindowsStatus("MemTotal: 8039208 kB")).toBeUndefined();
    expect(parseWindowsStatus("")).toBeUndefined();
  });

  it("the JSON is found even when PowerShell writes a warning before it", () => {
    // Some hosts write progress or warnings to the same stream before the object.
    expect(parseWindowsStatus(`WARNING: something\n${STATUS_JSON}\n`)?.hostname).toBe("WIN-APP01");
  });
});

const INVENTORY_JSON = JSON.stringify({
  ports: [
    { protocol: "tcp", address: "0.0.0.0", port: 3389, process: "svchost" },
    { protocol: "tcp", address: "127.0.0.1", port: 1433, process: "sqlservr" },
    { protocol: "tcp", address: "::", port: 22, process: "sshd" },
    { protocol: "udp", address: "0.0.0.0", port: 123, process: "svchost" },
  ],
  services: [
    { name: "Spooler", status: "Stopped", start: "Automatic", display: "Print Spooler" },
    { name: "W3SVC", status: "Running", start: "Automatic", display: "World Wide Web Publishing Service" },
  ],
  tasks: [{ name: "Backup", path: "\\machina\\", state: "Ready" }],
  firewall: [
    { name: "Domain", enabled: true, inbound: "Block" },
    { name: "Private", enabled: true, inbound: "Block" },
    { name: "Public", enabled: false, inbound: "Block" },
  ],
  rebootRequired: true,
});

describe("a Windows machine's inventory", () => {
  const inventory = parseWindowsInventory(INVENTORY_JSON)!;

  it("the ports reachable from outside come first", () => {
    expect(inventory.ports.map((each) => each.port)).toEqual([22, 123, 3389, 1433]);
    expect(inventory.ports.find((each) => each.port === 1433)?.exposed).toBe(false);
    expect(inventory.ports.find((each) => each.port === 3389)?.process).toBe("svchost");
  });

  it("the running services come first", () => {
    expect(inventory.services[0]).toMatchObject({ name: "W3SVC", active: "active" });
    expect(inventory.services[1]).toMatchObject({ name: "Spooler", active: "inactive" });
  });

  it("scheduled tasks are listed as the machine's recurring jobs", () => {
    expect(inventory.cron[0]).toMatchObject({
      owner: "Task Scheduler",
      command: "\\machina\\Backup",
    });
  });

  it("with even one profile off, the firewall is not called on", () => {
    /*
     * Windows has three profiles. Two on and one off is a machine somebody turned one off on,
     * and calling that "on" hides the only interesting part.
     */
    expect(inventory.firewall.active).toBe(false);
    expect(inventory.firewall.rules).toHaveLength(3);
    expect(inventory.firewall.rules[2]).toContain("Public: off");
  });

  it("it says a restart is waiting", () => {
    expect(inventory.updates).toMatchObject({ rebootRequired: true });
  });
});

describe("how a script reaches PowerShell", () => {
  /*
   * The one mechanical part that can be checked without Windows: `-EncodedCommand` is base64 of
   * UTF-16LE with no BOM, and it exists so a multi-line script never has to survive `cmd.exe`
   * quoting — which is the game nobody wins.
   */
  it("it decodes back from base64 UTF-16LE", () => {
    const command = powershell("Write-Output 'こんにちは'");
    const encoded = command.split(" ").pop()!;
    expect(Buffer.from(encoded, "base64").toString("utf16le")).toBe("Write-Output 'こんにちは'");
    expect(command.startsWith("powershell -NoProfile -NonInteractive -EncodedCommand ")).toBe(true);
  });

  it("no quoting ever leaves this", () => {
    // Nothing in the encoded form can be broken by a shell, because none of it is shell syntax.
    for (const script of [WINDOWS_STATUS_SCRIPT, WINDOWS_INVENTORY_SCRIPT]) {
      expect(powershell(script)).toMatch(/^powershell -NoProfile -NonInteractive -EncodedCommand [A-Za-z0-9+/=]+$/);
    }
  });
});
