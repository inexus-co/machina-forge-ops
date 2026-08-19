import { describe, expect, it } from "vitest";
import { setLocale } from "../../../../shared/i18n";
import { catalogCounts, findCommand, searchCatalog } from "./index";
import { TIER1 } from "./tier1";
import { TIER2 } from "./tier2";

/*
 * The catalog is data, and wrong data here is a wrong default on a customer's machine. These
 * tests state the properties a reviewer would otherwise have to re-check by eye on every edit.
 */

describe("tier 1 holds together", () => {
  it("no name appears twice, whatever its case", () => {
    const seen = new Set<string>();
    for (const entry of TIER1) {
      const key = entry.name.toLowerCase();
      expect(seen.has(key), `${entry.name} is defined twice`).toBe(false);
      seen.add(key);
    }
  });

  it("every entry has a description", () => {
    for (const entry of TIER1) {
      expect(entry.summary.trim().length, entry.name).toBeGreaterThan(0);
    }
  });

  it("a verbs entry carries a list of verbs, and nothing else does", () => {
    for (const entry of TIER1) {
      if (entry.class === "verbs") {
        expect(Object.keys(entry.verbs ?? {}).length, entry.name).toBeGreaterThan(0);
      } else {
        expect(entry.verbs, entry.name).toBeUndefined();
      }
    }
  });

  it("a shell, or a way of running something over the network, is classified shell", () => {
    const shells = [
      "bash", "sh", "zsh", "dash", "ksh", "fish",
      "cmd", "powershell", "pwsh",
      "ssh", "eval", "su", "nc", "socat",
      "Start-Process", "Invoke-Expression", "Invoke-Command",
    ];
    for (const name of shells) {
      const entry = findCommand(name);
      expect(entry, `${name} is not in the catalog`).toBeDefined();
      expect(entry?.class, name).toBe("shell");
    }
  });

  it("anything that takes a script as an argument is code, and refused on the server", () => {
    const codeTools = ["awk", "gawk", "mawk", "sed", "perl", "python", "python3", "ruby", "node", "env", "xargs"];
    for (const name of codeTools) {
      const entry = findCommand(name);
      expect(entry, `${name} is not in the catalog`).toBeDefined();
      expect(entry?.class, name).toBe("code");
    }
  });

  it("find reads, and what is dangerous about it stops on a flag (in policy.ts)", () => {
    // find itself reads. -exec and -delete hit the floor, in policy.test.ts.
    expect(findCommand("find")?.class).toBe("read");
  });

  it("no destructive command is classified as a read", () => {
    const destructive = [
      "rm", "dd", "mkfs", "fdisk", "shred", "shutdown", "reboot", "kill", "pkill",
      "chown", "chmod", "mount", "umount", "passwd", "iptables",
      "del", "format", "diskpart", "taskkill",
      "Remove-Item", "Stop-Service", "Stop-Computer", "Restart-Computer", "Format-Volume",
    ];
    for (const name of destructive) {
      const entry = findCommand(name);
      expect(entry, `${name} is not in the catalog`).toBeDefined();
      expect(entry?.class, name).toBe("write");
    }
  });

  it("a floor verb (systemctl stop and the like) is not classified as a read", () => {
    const floors: Array<[string, string[]]> = [
      ["systemctl", ["stop", "disable", "mask"]],
      ["sc", ["stop", "delete"]],
      ["net", ["stop"]],
    ];
    for (const [name, verbs] of floors) {
      const entry = findCommand(name);
      expect(entry?.class, name).toBe("verbs");
      for (const verb of verbs) {
        expect(entry?.verbs?.[verb], `${name} ${verb}`).not.toBe("read");
      }
    }
  });

  it("the reads that the old BUILT_IN_SETS made quiet can all be found", () => {
    // Spot checks that the carry-over kept its meaning.
    expect(findCommand("journalctl")?.class).toBe("read");
    expect(findCommand("systemctl")?.verbs?.["status"]).toBe("read");
    expect(findCommand("docker")?.verbs?.["logs"]).toBe("read");
    expect(findCommand("rpm")?.verbs?.["-qa"]).toBe("read");
    expect(findCommand("curl")?.verbs?.["-I"]).toBe("read");
  });
});

describe("the index", () => {
  it("it is found whatever the case", () => {
    expect(findCommand("GET-SERVICE")?.name).toBe("Get-Service");
    expect(findCommand("SystemCtl")?.name).toBe("systemctl");
  });

  it("a name that is not in it comes back undefined", () => {
    expect(findCommand("no-such-command-xyz")).toBeUndefined();
  });

  it("the count matches both tiers joined, with tier 1 winning a duplicate", () => {
    const merged = new Map<string, { os: string }>();
    for (const entry of TIER2) merged.set(entry.name.toLowerCase(), entry);
    for (const entry of TIER1) merged.set(entry.name.toLowerCase(), entry);
    const counts = catalogCounts();
    expect(counts.total).toBe(merged.size);
    expect(counts.linux).toBe([...merged.values()].filter((entry) => entry.os !== "windows").length);
    expect(counts.windows).toBe([...merged.values()].filter((entry) => entry.os !== "linux").length);
    expect(counts.tier1).toBe(TIER1.length);
  });

  it("where tier 2 has been generated, it is there in the tens of thousands", () => {
    /* The whole point of the appeal: not 200, tens of thousands. Guards against the pipeline
       quietly regressing to a container's installed-only view. */
    if (TIER2.length === 0) return; // pipeline not run in this checkout
    expect(TIER2.length).toBeGreaterThan(10_000);
    /* Everything harvested stops for a person: nothing in tier 2 may claim `read`. */
    expect(TIER2.every((entry) => entry.tier === 2 && entry.class !== "read")).toBe(true);
  });
});

describe("searching", () => {
  it("a name that starts with it comes first", () => {
    const results = searchCatalog("sys");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name.toLowerCase().startsWith("sys")).toBe(true);
  });

  it("the description is searchable too", () => {
    // "log" matches thousands and falls past the limit. Search for a word only a description has.
    expect(searchCatalog("systemd's log").some((entry) => entry.name === "journalctl")).toBe(true);
  });

  it("searched in the language on screen, not the one it is written in", () => {
    // The catalog is written in English. Somebody reading a Japanese screen types Japanese.
    setLocale("ja");
    expect(searchCatalog("ログ").some((entry) => entry.name === "journalctl")).toBe(true);
    setLocale("en");
  });

  it("it can be narrowed by OS", () => {
    for (const entry of searchCatalog("get-", "windows")) {
      expect(entry.os === "windows" || entry.os === "both").toBe(true);
    }
    expect(searchCatalog("", "linux").every((entry) => entry.os !== "windows")).toBe(true);
  });
});
