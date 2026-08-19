import { spawn } from "node:child_process";
import { t } from "../../../../shared/i18n";
import fs from "node:fs/promises";
import path from "node:path";
import type { Sandbox, SandboxResult } from "./index";

/**
 * Linux's own wall: bubblewrap, the same mechanism Flatpak runs applications in.
 *
 * A process, not a virtual machine — it starts in milliseconds, like Seatbelt on macOS, and unlike
 * a container it needs nothing installed but `bwrap` itself. The three properties of ADR 0002 are
 * not rules applied to a filesystem; they are the filesystem the command is given:
 *
 * - **writes land only in the work directory** — the only writable things are `/work` (the run's
 *   directory, bound in) and a `tmpfs` at `/tmp` that dies with the process. Everything else is
 *   mounted read-only, so there is nothing else to write to
 * - **the operator's home is not readable** — it is not mounted. Not denied: absent
 * - **no network** — `--unshare-net` gives the process a network namespace of its own with no
 *   interface configured, not even loopback. There is nothing to send through
 *
 * `--unshare-all` also takes pid, ipc, uts and cgroup namespaces, so the command cannot see or
 * signal the operator's other processes. `--die-with-parent` means Forge exiting takes it with it,
 * and `--new-session` denies it the terminal-injection trick of pushing characters into the parent
 * shell's input.
 *
 * Ceilings (memory, CPU, tasks) come from systemd when the machine has a user manager running, and
 * are absent when it does not — see `LIMITS` below. This backend is also the one the Windows path
 * of ADR 0002 is meant to reach through WSL2; that wrapper is not written yet, and writing it
 * without a Windows machine to measure it on would be claiming a wall nobody has tested.
 */

/** As much output as one command may keep. The model is shown a head/tail slice of even this. */
const MAX_OUTPUT = 100_000;

/**
 * What the command may see, all of it read-only.
 *
 * Named rather than "everything except the home directory": a list of what is permitted can be
 * read and argued with, and a machine that keeps something unusual somewhere unusual fails
 * loudly here rather than quietly permitting it. `/etc` is in the list because without
 * `/etc/passwd`, `/etc/ssl` and the locale files, ordinary tools fail in ways that look like
 * bugs rather than like a wall.
 */
const READABLE = ["/usr", "/bin", "/sbin", "/lib", "/lib32", "/lib64", "/etc", "/opt"];

/** Ceilings, when systemd is there to enforce them. A runaway script must not take the machine. */
const LIMITS = ["-p", "MemoryMax=1G", "-p", "CPUQuota=100%", "-p", "TasksMax=256"];

function bwrapArgs(mounts: string[], workdir: string, command: string) {
  return [
    "--unshare-all",
    "--die-with-parent",
    "--new-session",
    ...mounts,
    "--proc", "/proc",
    "--dev", "/dev",
    "--tmpfs", "/tmp",
    "--bind", workdir, "/work",
    "--chdir", "/work",
    "--clearenv",
    "--setenv", "PATH", "/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin",
    /*
     * `HOME` points into the work directory.
     *
     * Tools read dotfiles from `$HOME` as they start. The real home is not there at all, and
     * pointing them at a writable-but-empty one is quieter than letting each of them fail in its
     * own way.
     */
    "--setenv", "HOME", "/work",
    "--setenv", "TMPDIR", "/tmp",
    "--setenv", "LANG", "ja_JP.UTF-8",
    "--",
    "/bin/bash",
    "-c",
    command,
  ];
}

/** The read-only mounts, minus whatever this distribution does not have. */
async function mountsFor(): Promise<string[]> {
  const args: string[] = [];
  for (const each of READABLE) {
    try {
      await fs.lstat(each);
      args.push("--ro-bind", each, each);
    } catch {
      /* A machine without /lib32 is not a broken machine. */
    }
  }
  return args;
}

/** Run something and collect what it said, with a timeout that takes the whole process group. */
function collect(
  file: string,
  args: string[],
  options: { timeoutMs?: number; cwd?: string } = {},
): Promise<{ code: number | null; output: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      ...(options.cwd ? { cwd: options.cwd } : {}),
      detached: true,
      env: { PATH: "/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin" },
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

    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          try {
            if (child.pid) process.kill(-child.pid, "SIGKILL");
          } catch {
            child.kill("SIGKILL");
          }
        }, options.timeoutMs)
      : undefined;

    child.on("error", (cause: Error) => {
      if (timer) clearTimeout(timer);
      resolve({ code: null, output: cause.message, timedOut: false });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        code,
        output: `${output.trim()}${truncated ? `\n${t("…(cut: too long)")}` : ""}`,
        timedOut,
      });
    });
  });
}

/**
 * Whether this machine can build the wall, asked once by building a small one.
 *
 * `bwrap` being installed is not the question — plenty of distributions ship it and then forbid
 * unprivileged user namespaces, which is exactly the thing it needs. So the check is a real
 * sandbox that runs `true`, and the answer is remembered because the tool list is rebuilt per run.
 */
let usable: boolean | undefined;
let scoped: boolean | undefined;

async function canSandbox() {
  if (usable !== undefined) return usable;
  if (process.platform !== "linux") {
    usable = false;
    return usable;
  }
  const mounts = await mountsFor();
  const probe = await collect("bwrap", bwrapArgs(mounts, "/tmp", "exit 0"), { timeoutMs: 15_000 });
  usable = probe.code === 0;
  return usable;
}

/** Whether systemd will hold the ceilings for us. WSL2 without systemd, for one, will not. */
async function canLimit() {
  if (scoped !== undefined) return scoped;
  const probe = await collect(
    "systemd-run",
    ["--user", "--scope", "--quiet", ...LIMITS, "--", "/bin/true"],
    { timeoutMs: 15_000 },
  );
  scoped = probe.code === 0;
  return scoped;
}

export const linuxSandbox: Sandbox = {
  name: "linux",

  async available() {
    return await canSandbox();
  },

  async run(given: string, command: string, options = {}): Promise<SandboxResult> {
    const timeoutMs = options.timeoutMs ?? 120_000;
    await fs.mkdir(given, { recursive: true });
    /* The real path: a work directory reached through a symlink is bound at the wrong place. */
    const workdir = await fs.realpath(given);
    const mounts = await mountsFor();
    const args = bwrapArgs(mounts, workdir, command);

    /*
     * The ceilings, if systemd is running for this user.
     *
     * Without them the wall still holds — the three properties are namespaces and mounts, not
     * cgroups — and what is lost is the guarantee that a runaway loop cannot take the operator's
     * machine down with it. The timeout is what remains, and it is enforced here either way.
     */
    const limited = await canLimit();
    const result = limited
      ? await collect(
          "systemd-run",
          ["--user", "--scope", "--quiet", ...LIMITS, "--", "bwrap", ...args],
          { timeoutMs, cwd: workdir },
        )
      : await collect("bwrap", args, { timeoutMs, cwd: workdir });

    return {
      ok: result.code === 0 && !result.timedOut,
      ...(result.timedOut || result.code === null ? {} : { code: result.code }),
      output: result.output,
      timedOut: result.timedOut,
    };
  },
};
