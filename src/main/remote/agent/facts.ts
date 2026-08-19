import type { HostStatus } from "../../../shared/remoteStatus";
import { t } from "../../../shared/i18n";
import type { Inventory } from "../../../shared/remoteInventory";
import { INVENTORY_COMMAND, INVENTORY_MAX_OUTPUT, parseInventory } from "../inventory/parse";
import { STATUS_COMMAND, STATUS_MAX_OUTPUT, parseStatus } from "../status/parse";
import {
  WINDOWS_INVENTORY_SCRIPT,
  WINDOWS_STATUS_SCRIPT,
  parseWindowsInventory,
  parseWindowsStatus,
  powershell,
} from "../windows";

/**
 * What the agent is told about the server it is working on — collected non-intrusively.
 *
 * The same fixed, read-only probes the status and inventory panels already run (`STATUS_COMMAND`,
 * `INVENTORY_COMMAND`), reused here so the agent starts a run *knowing what the machine is*
 * instead of rediscovering it every time. Nothing is installed on the far end; nothing is
 * changed. This module is pure over a `probe` closure — no electron, no SSH client — so it is
 * unit-testable and so importing it never drags the panel controllers' electron dependencies
 * into the agent session's module graph.
 */

/**
 * One read-only command to the server. Serial — `CommandRunner.connect` has no concurrency guard.
 *
 * The cap is passed in because these two commands are the long ones: the runner's default drops
 * the tail of a big machine's answer, and a dropped tail reads as "no firewall" rather than as a
 * missing answer. `truncated` comes back so the parser can say so.
 */
export type FactsProbe = (
  command: string,
  timeoutMs: number,
  maxOutputBytes?: number,
) => Promise<{ output: string; truncated?: boolean }>;

/** A snapshot the agent can be handed. Either half may be missing; a partial answer still helps. */
export type ServerFacts = {
  at: string;
  status?: Omit<HostStatus, "at" | "cpuBusy">;
  inventory?: Inventory;
};

const STATUS_TIMEOUT_MS = 10_000;
const INVENTORY_TIMEOUT_MS = 20_000;

/**
 * Read the server's state and configuration, once.
 *
 * Linux first (one round trip each, in series). If neither Linux parser recognises the output
 * — a Windows box answers cmd/PowerShell, not `/proc` — fall back to the PowerShell scripts.
 * `at` is stamped by the caller pattern elsewhere; here we take it from the probe boundary via
 * a passed-in clock would break purity, so the caller stamps `at` — but for convenience we set
 * it from the moment collection finished. Throws a Japanese sentence only when nothing at all
 * could be read; one half succeeding is success.
 */
export async function collectFacts(probe: FactsProbe): Promise<ServerFacts> {
  let status: ServerFacts["status"];
  let inventory: Inventory | undefined;

  // Linux: status, then inventory. Serial, because one runner and one connection.
  try {
    const out = await probe(STATUS_COMMAND, STATUS_TIMEOUT_MS, STATUS_MAX_OUTPUT);
    status = parseStatus(out.output)?.status;
  } catch {
    // A timeout still may have produced partial output; parseStatus already tolerates that when
    // the throw carried none, we simply have no status.
  }
  try {
    const out = await probe(INVENTORY_COMMAND, INVENTORY_TIMEOUT_MS, INVENTORY_MAX_OUTPUT);
    inventory = parseInventory(out.output, { truncated: out.truncated });
  } catch {
    // As above — inventory stays undefined.
  }

  // Windows: only if Linux recognised nothing. PowerShell parsers return the same shared shapes.
  if (!status && !inventory) {
    try {
      const out = await probe(powershell(WINDOWS_STATUS_SCRIPT), STATUS_TIMEOUT_MS);
      status = parseWindowsStatus(out.output);
    } catch {
      // stays undefined
    }
    try {
      const out = await probe(powershell(WINDOWS_INVENTORY_SCRIPT), INVENTORY_TIMEOUT_MS);
      inventory = parseWindowsInventory(out.output);
    } catch {
      // stays undefined
    }
  }

  if (!status && !inventory) {
    throw new Error(t("This server's state could not be read."));
  }
  return { at: new Date().toISOString(), status, inventory };
}

// ── formatting ────────────────────────────────────────────────────────────────

const gib = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

/** Human days of uptime, or hours when it is less than a day (a freshly-rebooted box matters). */
function uptime(seconds?: number): string | undefined {
  if (seconds === undefined) return undefined;
  const days = Math.floor(seconds / 86_400);
  if (days >= 1) return t("{days}d", { days });
  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) return t("{hours}h", { hours });
  return t("{minutes}m", { minutes: Math.floor(seconds / 60) });
}

/** Bounded, de-noised: only the fields an operator would read aloud, each capped. */
function statusLines(status: NonNullable<ServerFacts["status"]>): string[] {
  const lines: string[] = [];
  if (status.os) {
    const kernel = [status.kernel, status.architecture].filter(Boolean).join(" / ");
    lines.push(t("OS: {os}", { os: `${status.os}${kernel ? ` (${kernel})` : ""}` }));
  }
  const up = uptime(status.uptimeSeconds);
  if (up) lines.push(t("Up: {uptime}", { uptime: up }));
  if (status.cpuCores || status.load) {
    const load = status.load
      ? t("Load {load}", { load: status.load.map((n) => n.toFixed(2)).join(" / ") })
      : "";
    const cores = status.cpuCores ? t("{cores} cores", { cores: status.cpuCores }) : "";
    lines.push(t("CPU: {detail}", { detail: [cores, load].filter(Boolean).join("  ") }));
  }
  if (status.memory) {
    const swap =
      status.memory.swapTotal
        ? t(" (swap {used} / {total})", {
            used: gib(status.memory.swapUsed ?? 0),
            total: gib(status.memory.swapTotal),
          })
        : "";
    lines.push(
      t("Memory: {used} of {total} used{swap}", {
        used: gib(status.memory.used),
        total: gib(status.memory.total),
        swap,
      }),
    );
  }
  if (status.filesystems.length) {
    const parts = status.filesystems.map((fs) => {
      const pct = Math.round((fs.used / fs.total) * 100);
      return `${fs.mount} ${pct}%${pct >= 80 ? t(" (over 80%)") : ""}`;
    });
    lines.push(t("Disks: {disks}", { disks: parts.join(", ") }));
  }
  return lines;
}

/** Same, for what the machine is running and what it lets in. */
function inventoryLines(inv: Inventory): string[] {
  const lines: string[] = [];

  const failed = inv.services.filter((s) => s.active === "failed");
  const active = inv.services.filter((s) => s.active === "active").length;
  if (inv.services.length) {
    const names = failed.slice(0, 5).map((s) => s.name).join(", ");
    const failPart = failed.length
      ? t("{count} failed ({names}{more}), ", {
          count: failed.length,
          names,
          more: failed.length > 5 ? t(" and more") : "",
        })
      : "";
    lines.push(
      t("Services: {failed}{active} of {total} running", {
        failed: failPart,
        active,
        total: inv.services.length,
      }),
    );
  }

  const running = inv.containers.filter((c) => /^up/i.test(c.status));
  if (inv.containers.length) {
    const names = running.slice(0, 5).map((c) => `${c.name}: ${c.image}`).join(", ");
    const stopped = inv.containers.length - running.length;
    lines.push(
      t("Containers: {running} running{names}{stopped}", {
        running: running.length,
        names: names ? ` (${names}${running.length > 5 ? t(" and more") : ""})` : "",
        stopped: stopped > 0 ? t(", {count} stopped", { count: stopped }) : "",
      }),
    );
  }

  const exposed = inv.ports.filter((p) => p.exposed);
  if (exposed.length) {
    // IPv4 and IPv6 on the same port/process read as one to an operator; fold the duplicates.
    const seen = new Set<string>();
    const shown: string[] = [];
    for (const p of exposed) {
      const label = `${p.port}/${p.protocol}${p.process ? ` ${p.process}` : ""}`;
      if (seen.has(label)) continue;
      seen.add(label);
      shown.push(label);
      if (shown.length >= 10) break;
    }
    lines.push(
      t("Ports reachable from outside: {ports}{more}", {
        ports: shown.join(", "),
        more: seen.size > shown.length ? t(" and more") : "",
      }),
    );
  }

  // "none, off" says nothing; only report a firewall that was actually found.
  if (inv.firewall.kind && inv.firewall.kind !== "none") {
    lines.push(
      t("firewall: {kind} {state}", {
        kind: inv.firewall.kind,
        state: inv.firewall.active ? t("on") : t("off"),
      }),
    );
  }

  if (inv.updates) {
    const sec = inv.updates.security
      ? t(" ({count} security)", { count: inv.updates.security })
      : "";
    const reboot = inv.updates.rebootRequired ? t("  restart needed") : "";
    lines.push(t("Updates: {count}{security}{reboot}", { count: inv.updates.count, security: sec, reboot }));
  }

  if (inv.missing.length) {
    lines.push(t("Could not be read: {notes}", { notes: inv.missing.map((line) => t(line)).join(" ") }));
  }
  return lines;
}

/** The compact summary injected into the system prompt. Deterministic; ~15-30 lines. */
export function summarizeFacts(facts: ServerFacts): string {
  const lines = [
    ...(facts.status ? statusLines(facts.status) : []),
    ...(facts.inventory ? inventoryLines(facts.inventory) : []),
  ];
  return lines.join("\n");
}

/** The full detail returned by `read_server_facts` and shown in the logbook panel. */
export function renderFactsDetail(facts: ServerFacts): string {
  const blocks: string[] = [];

  if (facts.status) {
    const s = facts.status;
    const lines = statusLines(s);
    // Full filesystem list (summary caps mounts; here show all as parse already capped to 6).
    blocks.push([t("[State]"), ...lines].join("\n"));
  }

  if (facts.inventory) {
    const inv = facts.inventory;
    const parts: string[] = [t("[Inventory]")];

    const failed = inv.services.filter((s) => s.active === "failed");
    if (failed.length) {
      parts.push(t("Services in failure: {names}", { names: failed.map((s) => s.name).join(", ") }));
    }
    parts.push(...inventoryLines(inv));

    if (inv.ports.length) {
      parts.push("");
      parts.push(t("Every listening port:"));
      for (const p of inv.ports.slice(0, 40)) {
        parts.push(
          `  ${p.address}/${p.protocol}${p.process ? ` ${p.process}` : ""}` +
            `${p.exposed ? t(" (reachable from outside)") : t(" (this machine only)")}`,
        );
      }
    }

    if (inv.cron.length) {
      parts.push("");
      parts.push(t("Scheduled jobs:"));
      for (const job of inv.cron.slice(0, 20)) {
        parts.push(`  [${job.owner}] ${job.schedule} ${job.command}`);
      }
    }

    if (inv.images.length) {
      parts.push("");
      parts.push(t("Images:"));
      for (const img of inv.images.slice(0, 20)) {
        parts.push(`  ${img.repository}:${img.tag} (${img.size})`);
      }
    }

    if (inv.firewall.rules.length) {
      parts.push("");
      parts.push(`firewall (${inv.firewall.kind}):`);
      for (const rule of inv.firewall.rules.slice(0, 40)) parts.push(`  ${rule}`);
    }

    blocks.push(parts.join("\n"));
  }

  return blocks.join("\n\n") || t("Nothing could be read.");
}
