import { describe, expect, it } from "vitest";
import { setLocale } from "../../../shared/i18n";
import type { ServerFacts } from "./facts";
import { collectFacts, renderFactsDetail, summarizeFacts } from "./facts";
import { STATUS_COMMAND } from "../status/parse";
import { INVENTORY_COMMAND } from "../inventory/parse";

/*
 * facts.ts is pure over a probe closure. The parsers themselves are covered by
 * status/parse.test.ts and inventory/parse.test.ts; here we test the collection control flow
 * (serial, fallback, partial, total failure) and the deterministic summary/detail rendering.
 */

const LINUX_STATUS = [
  "#os",
  "Linux 5.15.0-105-generic x86_64",
  "web01",
  'PRETTY_NAME="Ubuntu 22.04.4 LTS"',
  "#cpu",
  "processor\t: 0",
  "processor\t: 1",
  "processor\t: 2",
  "processor\t: 3",
  "model name\t: Intel Xeon",
  "#stat",
  "cpu 100 0 50 800 10 0 0 0 0 0",
  "#mem",
  "MemTotal:       8000000 kB",
  "MemAvailable:   3000000 kB",
  "SwapTotal:      2000000 kB",
  "SwapFree:       2000000 kB",
  "#load",
  "0.42 0.38 0.35 1/200 1234",
  "3628800.00 3000000.00",
  "#df",
  "Filesystem 1024-blocks Used Available Capacity Mounted-on",
  "/dev/sda1 58000000 47000000 11000000 82% /",
  "/dev/sda2 100000000 34000000 66000000 34% /var",
].join("\n");

const LINUX_INVENTORY = [
  "#ports",
  "tcp LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:((\"sshd\",pid=1,fd=3))",
  "tcp LISTEN 0 128 0.0.0.0:80 0.0.0.0:* users:((\"nginx\",pid=2,fd=6))",
  "tcp LISTEN 0 128 127.0.0.1:5432 0.0.0.0:* users:((\"postgres\",pid=3,fd=5))",
  "#services",
  "nginx.service loaded active running Nginx",
  "postgresql.service loaded active running PostgreSQL",
  "broken.service loaded failed failed Broken Thing",
  "#containers",
  "abc\tnginx:1.25\tweb\tUp 3 days\t0.0.0.0:80->80/tcp",
  "def\tpostgres:16\tdb\tUp 3 days\t",
  "ghi\tredis:7\tcache\tExited (0) 2 days ago\t",
  "#firewall",
  "Status: active",
  "#updates",
  "Listing...",
  "nginx/jammy 1.25 amd64 [upgradable from: 1.24]",
  "#reboot",
  "yes",
].join("\n");

async function linuxProbe(command: string): Promise<{ output: string }> {
  if (command === STATUS_COMMAND) return { output: LINUX_STATUS };
  if (command === INVENTORY_COMMAND) return { output: LINUX_INVENTORY };
  return { output: "" };
}

describe("collectFacts", () => {
  it("a Linux machine's state and inventory are read once each, one after the other", async () => {
    const seen: string[] = [];
    const facts = await collectFacts(async (command) => {
      seen.push(command === STATUS_COMMAND ? "status" : command === INVENTORY_COMMAND ? "inv" : "?");
      return linuxProbe(command);
    });
    expect(seen).toEqual(["status", "inv"]); // the state first, and one at a time
    expect(facts.status?.os).toContain("Ubuntu");
    expect(facts.inventory?.services.length).toBe(3);
    expect(facts.at).toBeTruthy();
  });

  it("reading only the state still comes back as a partial success", async () => {
    const facts = await collectFacts(async (command) =>
      command === STATUS_COMMAND ? { output: LINUX_STATUS } : { output: "" },
    );
    expect(facts.status).toBeDefined();
    expect(facts.inventory).toBeUndefined();
  });

  it("a probe that throws is a success as long as the other half was read", async () => {
    const facts = await collectFacts(async (command) => {
      if (command === STATUS_COMMAND) return { output: LINUX_STATUS };
      throw new Error("timeout");
    });
    expect(facts.status).toBeDefined();
    expect(facts.inventory).toBeUndefined();
  });

  it("when nothing reads on Linux, it falls back to the Windows scripts", async () => {
    const calls: string[] = [];
    // powershell() base64-encodes, so the contents cannot be seen. Branch on the order instead:
    // 1st = STATUS (linux), 2nd = INVENTORY (linux), 3rd = windows status, 4th = windows inventory
    const facts = await collectFacts(async (command) => {
      calls.push(command);
      if (command === STATUS_COMMAND || command === INVENTORY_COMMAND) return { output: "not linux" };
      // From here on they are powershell commands. The third is status, the fourth inventory.
      const isStatusProbe = calls.filter((c) => c.startsWith("powershell")).length === 1;
      return {
        output: isStatusProbe
          ? JSON.stringify({ hostname: "WIN01", os: "Windows Server 2022", memoryTotalKb: 0 })
          : JSON.stringify({ ports: [{ protocol: "tcp", address: "0.0.0.0", port: 3389 }], services: [] }),
      };
    });
    expect(facts.status?.os).toContain("Windows");
    expect(calls.length).toBe(4);
    expect(calls[2].startsWith("powershell")).toBe(true);
  });

  it("when nothing can be read at all, it throws with one sentence", async () => {
    await expect(collectFacts(async () => ({ output: "garbage" }))).rejects.toThrow(
      "This server's state could not be read.",
    );
  });
});

const FACTS: ServerFacts = {
  at: "2026-08-16T00:00:00Z",
  status: {
    os: "Ubuntu 22.04.4 LTS",
    kernel: "5.15.0-105",
    architecture: "x86_64",
    cpuCores: 4,
    memory: {
      total: 8 * 1024 ** 3,
      used: 5 * 1024 ** 3,
      swapTotal: 2 * 1024 ** 3,
      swapUsed: 0,
    },
    filesystems: [
      { device: "/dev/sda1", mount: "/", total: 60 * 1024 ** 3, used: 49.2 * 1024 ** 3 },
      { device: "/dev/sda2", mount: "/var", total: 100 * 1024 ** 3, used: 34 * 1024 ** 3 },
    ],
    load: [0.42, 0.38, 0.35],
    uptimeSeconds: 3_628_800,
  },
  inventory: {
    at: "2026-08-16T00:00:00Z",
    ports: [
      { protocol: "tcp", address: "0.0.0.0:22", port: 22, process: "sshd", exposed: true },
      { protocol: "tcp", address: "[::]:22", port: 22, process: "sshd", exposed: true },
      { protocol: "tcp", address: "127.0.0.1:5432", port: 5432, process: "postgres", exposed: false },
    ],
    services: [
      { name: "nginx.service", load: "loaded", active: "active", sub: "running" },
      { name: "broken.service", load: "loaded", active: "failed", sub: "failed" },
    ],
    cron: [{ owner: "root", schedule: "0 3 * * *", command: "/usr/bin/backup" }],
    containers: [
      { id: "a", image: "nginx:1.25", name: "web", status: "Up 3 days" },
      { id: "b", image: "redis:7", name: "cache", status: "Exited (0) 2 days ago" },
    ],
    images: [{ repository: "nginx", tag: "1.25", size: "180MB" }],
    firewall: { kind: "ufw", active: true, rules: ["22/tcp ALLOW Anywhere"] },
    updates: { count: 34, security: 5, rebootRequired: true },
    missing: [],
  },
};

setLocale("en");

describe("summarizeFacts", () => {
  const summary = summarizeFacts(FACTS);

  it("it carries the OS, the uptime, the CPU and the memory", () => {
    expect(summary).toContain("OS: Ubuntu 22.04.4 LTS (5.15.0-105 / x86_64)");
    expect(summary).toContain("Up: 42d");
    expect(summary).toContain("CPU: 4 cores");
    expect(summary).toContain("Memory: 5.0 GB of 8.0 GB used (swap 0.0 GB / 2.0 GB)");
  });

  it("a disk over 80% is marked", () => {
    expect(summary).toMatch(/\/ 82% \(over 80%\)/);
    expect(summary).not.toMatch(/\/var 34% \(/);
  });

  it("it carries the failed service, the counts, the stopped container, the open ports, the firewall and the updates", () => {
    expect(summary).toContain("1 failed (broken.service)");
    expect(summary).toContain("1 of 2 running");
    expect(summary).toContain("1 stopped");
    expect(summary).toContain("Ports reachable from outside: 22/tcp sshd"); // not 127.0.0.1
    expect(summary).not.toContain("5432");
    // 22 does not appear twice for IPv4 and IPv6
    expect(summary.match(/22\/tcp sshd/g)?.length).toBe(1);
    expect(summary).toContain("firewall: ufw on");
    expect(summary).toContain("Updates: 34 (5 security)  restart needed");
  });

  it("the number of lines stays small enough to sit in a prompt", () => {
    expect(summary.split("\n").length).toBeLessThanOrEqual(30);
  });
});

describe("renderFactsDetail", () => {
  const detail = renderFactsDetail(FACTS);

  it("every port, said to be reachable or not, with the jobs, the images and the firewall rules", () => {
    expect(detail).toContain("127.0.0.1:5432/tcp postgres (this machine only)");
    expect(detail).toContain("0.0.0.0:22/tcp sshd (reachable from outside)");
    // the address already carries the port — it must not be added twice
    expect(detail).not.toContain("0.0.0.0:22:22");
    expect(detail).toContain("/usr/bin/backup");
    expect(detail).toContain("nginx:1.25 (180MB)");
    expect(detail).toContain("22/tcp ALLOW Anywhere");
  });

  it("with no facts at all, it says nothing could be read", () => {
    expect(renderFactsDetail({ at: "x" })).toContain("Nothing could be read");
  });
});
