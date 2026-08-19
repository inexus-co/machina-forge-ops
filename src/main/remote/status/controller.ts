import { ipcMain, type WebContents } from "electron";
import { t } from "../../../shared/i18n";
import { z } from "zod";
import type { CpuSample, HostStatus } from "../../../shared/remoteStatus";
import { STATUS_INTERVAL_MS } from "../../../shared/remoteStatus";
import { CommandRunner } from "../commandRunner";
import { Listeners } from "../listeners";
import type { SshTarget } from "../sshSession";
import { WINDOWS_STATUS_SCRIPT, parseWindowsStatus, powershell } from "../windows";
import { STATUS_COMMAND, STATUS_MAX_OUTPUT, cpuBusy, parseStatus } from "./parse";
import { closeAllPanels, closePanel, openPanel, panelOpen } from "../panels/window";

/**
 * Watching what a server is doing, while somebody is looking at it.
 *
 * One reading every few seconds over a connection of its own — not the operator's terminal, whose
 * scrollback is theirs, and not the agent's, whose commands are one at a time. Polling stops when
 * the panel closes: this is a maintenance tool, not a monitoring system, and a client that keeps
 * asking a customer's server for numbers nobody is reading is one that should not have been left
 * running overnight.
 */

export type StatusControllerDeps = {
  sshTarget(hostId: string): Promise<SshTarget>;
};

type Watch = {
  runner: CommandRunner;
  timer?: NodeJS.Timeout;
  /** The previous CPU counters, so the next reading is a rate rather than a lifetime total. */
  sample?: CpuSample;
  /** Set while a reading is in flight, so a slow server does not queue readings behind itself. */
  busy: boolean;
  /**
   * Which family of commands this server answers.
   *
   * Learned once, from whichever reading worked, and then kept: asking a Linux box a PowerShell
   * question every three seconds would double the traffic to say nothing.
   */
  kind?: "linux" | "windows";
};

const watches = new Map<string, Watch>();
/**
 * Everyone listening.
 *
 * More than one window can be watching the same server — the main window's strip and the
 * floating one — so a reading goes to all of them rather than to whichever asked most recently.
 */
const listeners = new Listeners();
let deps: StatusControllerDeps;

const idSchema = z.string().min(1).max(64);

function listen(contents: WebContents) {
  listeners.add(contents);
}

function send(hostId: string, status?: HostStatus, error?: { at: string; detail: string }) {
  listeners.send("remote-status:status", hostId, status, error);
}

async function read(hostId: string, watch: Watch) {
  if (watch.busy) return;
  watch.busy = true;
  try {
    const target = await deps.sshTarget(hostId);

    if (watch.kind !== "windows") {
      const result = await watch.runner.run(target, STATUS_COMMAND, {
        timeoutMs: 15_000,
        maxOutputBytes: STATUS_MAX_OUTPUT,
      });
      const parsed = parseStatus(result.output);
      if (parsed) {
        watch.kind = "linux";
        const busy =
          watch.sample && parsed.sample ? cpuBusy(watch.sample, parsed.sample) : undefined;
        if (parsed.sample) watch.sample = parsed.sample;
        send(hostId, { at: new Date().toISOString(), cpuBusy: busy, ...parsed.status });
        return;
      }
    }

    /*
     * Not a Linux machine, so ask the other way.
     *
     * Two round trips on a Windows server's first reading and one on every reading after, because
     * which family it belongs to is remembered. Asking both every time would double the traffic
     * to a customer's machine to learn something that does not change.
     */
    const windows = await watch.runner.run(target, powershell(WINDOWS_STATUS_SCRIPT), {
      timeoutMs: 30_000,
    });
    const parsedWindows = parseWindowsStatus(windows.output);
    if (!parsedWindows) {
      send(hostId, undefined, {
        at: new Date().toISOString(),
        detail: t("This server's state cannot be read — it appears to be neither Linux nor Windows."),
      });
      return;
    }
    watch.kind = "windows";
    send(hostId, { at: new Date().toISOString(), ...parsedWindows });
  } catch (cause) {
    send(hostId, undefined, {
      at: new Date().toISOString(),
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  } finally {
    watch.busy = false;
  }
}

function stopWatch(hostId: string) {
  const watch = watches.get(hostId);
  if (!watch) return;
  if (watch.timer) clearInterval(watch.timer);
  watch.runner.stop();
  watches.delete(hostId);
}

/** Let go of every connection on quit, and when a host is removed. */
export function disposeRemoteStatus() {
  closeAllPanels();
  for (const hostId of [...watches.keys()]) stopWatch(hostId);
}

export function forgetRemoteStatus(hostId: string) {
  closeAllPanels(hostId);
  stopWatch(hostId);
}

/**
 * The floating panel closed, so nothing is watching.
 *
 * Same reason as the log tail: a closed window's renderer never runs its cleanup, and the poll
 * would go on asking a customer's server for numbers every few seconds with no screen to put
 * them on. Refused while the panel is somehow still open.
 */
export function stopRemoteStatusWatch(hostId: string) {
  if (panelOpen("status", hostId)) return;
  stopWatch(hostId);
}

export function registerRemoteStatusController(controllerDeps: StatusControllerDeps) {
  deps = controllerDeps;

  ipcMain.handle("remote-status:watch", (event, rawId: unknown) => {
    listen(event.sender);
    const hostId = idSchema.parse(rawId);
    // Calling again is how the panel says "still open"; it must not start a second timer.
    if (watches.get(hostId)?.timer) return;

    const watch: Watch = watches.get(hostId) ?? { runner: new CommandRunner(), busy: false };
    watches.set(hostId, watch);
    void read(hostId, watch);
    watch.timer = setInterval(() => void read(hostId, watch), STATUS_INTERVAL_MS);
  });

  /*
   * Stopping is refused while a floating window is watching.
   *
   * The main window's strip unmounts whenever the operator navigates, and its cleanup would
   * otherwise take the floating window's readings with it — the one window whose whole purpose
   * is to keep reading while attention is elsewhere.
   */
  ipcMain.handle("remote-status:stop", (_event, rawId: unknown) => {
    const hostId = idSchema.parse(rawId);
    if (panelOpen("status", hostId)) return;
    stopWatch(hostId);
  });

  ipcMain.handle(
    "remote-status:pop-out",
    (event, rawId: unknown, rawTitle: unknown) => {
      listen(event.sender);
      openPanel("status", idSchema.parse(rawId), z.string().max(120).parse(rawTitle));
    },
  );

  ipcMain.handle("remote-status:pop-in", (_event, rawId: unknown) => {
    closePanel("status", idSchema.parse(rawId));
  });

  ipcMain.handle("remote-status:refresh", async (event, rawId: unknown) => {
    listen(event.sender);
    const hostId = idSchema.parse(rawId);
    const watch = watches.get(hostId) ?? { runner: new CommandRunner(), busy: false };
    watches.set(hostId, watch);
    await read(hostId, watch);
  });
}
