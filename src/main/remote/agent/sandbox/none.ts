import { spawn } from "node:child_process";
import { t } from "../../../../shared/i18n";
import fs from "node:fs/promises";
import path from "node:path";
import type { Sandbox, SandboxResult } from "./index";

/**
 * No wall at all — the exception in ADR 0002, and the only place in this product where the
 * agent's shell runs with the operator's own permissions.
 *
 * It exists for one machine: Windows with neither WSL2 nor Docker, where there is no mechanism to
 * build a wall out of. It is **not** a setting that relaxes the others. `chooseSandbox()` never
 * returns it; it is reached only when no backend is available *and* the person at that machine has
 * accepted, by hand, on that machine (see `consent.ts`).
 *
 * What is lost is not partially lost:
 *
 * - the command runs as the operator, so it can write anywhere they can write
 * - the operator's home is readable, `~/.ssh` included
 * - the network is there, so `run_local` could reach the customer's server without passing the
 *   allowlist — the one road this product promises is the only one
 *
 * Nothing here can restore any of that. What surrounds it instead is the three things the ADR
 * requires and `piTools`/`session` enforce: every command stops for a person even in `auto`, the
 * record carries `sandboxed: false` so the runs can be counted afterwards, and the window keeps
 * saying so rather than hiding the consent once it has been given.
 */

const MAX_OUTPUT = 100_000;

/** The shell this machine actually has. The exception's home is Windows; assume nothing else. */
function shellFor(command: string): { file: string; args: string[] } {
  if (process.platform === "win32") {
    return {
      file: process.env["ComSpec"] ?? "powershell.exe",
      args: process.env["ComSpec"] ? ["/d", "/s", "/c", command] : ["-NoProfile", "-Command", command],
    };
  }
  return { file: "/bin/bash", args: ["-c", command] };
}

export const noWall: Sandbox = {
  name: "none",

  /* Never chosen automatically. The caller decides, having read the consent. */
  async available() {
    return false;
  },

  async run(given: string, command: string, options = {}): Promise<SandboxResult> {
    const timeoutMs = options.timeoutMs ?? 120_000;
    await fs.mkdir(given, { recursive: true });
    const workdir = path.resolve(given);
    const shell = shellFor(command);

    return await new Promise<SandboxResult>((resolve) => {
      const child = spawn(shell.file, shell.args, {
        cwd: workdir,
        /*
         * Its own process group, so a timeout takes the whole tree.
         *
         * The one thing that still works without a wall: what was started can still be stopped.
         */
        detached: process.platform !== "win32",
        env: { ...process.env, HOME: process.env["HOME"] ?? workdir },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      let truncated = false;
      let timedOut = false;
      const take = (chunk: Buffer) => {
        if (output.length < MAX_OUTPUT) output += chunk.toString();
        else truncated = true;
      };
      child.stdout?.on("data", take);
      child.stderr?.on("data", take);

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }, timeoutMs);

      child.on("error", (cause: Error) => {
        clearTimeout(timer);
        resolve({ ok: false, output: cause.message });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          ok: code === 0 && !timedOut,
          ...(timedOut || code === null ? {} : { code }),
          output: `${output.trim()}${truncated ? `\n${t("…(cut: too long)")}` : ""}`,
          timedOut,
        });
      });
    });
  },
};
