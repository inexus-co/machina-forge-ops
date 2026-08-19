import { spawn } from "node:child_process";
import { t } from "../../../../shared/i18n";
import fs from "node:fs/promises";
import path from "node:path";
import type { Sandbox, SandboxResult } from "./index";

/**
 * macOS's own wall: `sandbox-exec` with a policy written per run.
 *
 * The profile below was arrived at by attempting each forbidden thing and watching it fail, and
 * two lines in it are load-bearing in ways that are not obvious:
 *
 * - **`(literal "/")`** — without read access to the root directory itself, `execve` fails before
 *   any interpreter starts, and every command dies with SIGABRT and no message.
 * - **`/Applications/Xcode.app`** — Apple's `/usr/bin` tools are shims that resolve through
 *   `xcrun` into the developer directory. Without it `python3` and `git` die inside the shim
 *   rather than in anything the operator would recognise.
 */

/** As much output as one command may keep. The model is shown a head/tail slice of even this. */
const MAX_OUTPUT = 100_000;

function profileFor(workdir: string): string {
  /* The path is ours — userData plus a run id — so this is tidiness, not a defence. */
  const safe = workdir.replace(/["\\]/g, "");
  return `(version 1)
(deny default)
(allow process-exec)
(allow process-fork)
(allow signal)
(allow sysctl-read)
(allow file-read-metadata)
(allow file-read*
  (literal "/")
  (subpath "/usr") (subpath "/bin") (subpath "/sbin")
  (subpath "/System") (subpath "/Library")
  (subpath "/private/etc") (subpath "/private/var/select") (subpath "/private/var/db")
  (subpath "/opt") (subpath "/dev")
  (subpath "/Applications/Xcode.app")
  (subpath "${safe}"))
(allow file-write* (subpath "${safe}") (literal "/dev/null"))
(deny network*)
`;
}

export const seatbelt: Sandbox = {
  name: "seatbelt",

  async available() {
    if (process.platform !== "darwin") return false;
    try {
      await fs.access("/usr/bin/sandbox-exec");
      return true;
    } catch {
      return false;
    }
  },

  async run(given: string, command: string, options = {}): Promise<SandboxResult> {
    const timeoutMs = options.timeoutMs ?? 120_000;
    await fs.mkdir(path.join(given, "tmp"), { recursive: true });
    /*
     * The real path, because Seatbelt matches on it.
     *
     * `/var` is a symlink to `/private/var` on macOS, so a policy naming `/var/folders/…` permits
     * nothing at all: the process cannot even `getcwd`, and the first write fails with "Operation
     * not permitted" while the profile looks correct. Home directories can be symlinks too.
     */
    const workdir = await fs.realpath(given);

    return await new Promise<SandboxResult>((resolve) => {
      const child = spawn(
        "/usr/bin/sandbox-exec",
        ["-p", profileFor(workdir), "/bin/bash", "-c", command],
        {
          cwd: workdir,
          /* Its own process group, so a timeout takes the whole tree rather than only bash. */
          detached: true,
          env: {
            PATH: "/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin",
            /*
             * `HOME` points into the work directory.
             *
             * Tools read dotfiles from `$HOME` as they start. The real home is not readable, and
             * pointing them at a readable-but-empty one is quieter than letting each of them fail
             * in its own way.
             */
            HOME: workdir,
            TMPDIR: path.join(workdir, "tmp"),
            LANG: "ja_JP.UTF-8",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

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
          if (child.pid) process.kill(-child.pid, "SIGKILL");
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
