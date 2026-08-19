import { spawn } from "node:child_process";
import { t } from "../../../../shared/i18n";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Sandbox, SandboxResult } from "./index";

/**
 * A container as the wall — on any operating system, including the ones with no wall of their own.
 *
 * This is the backend an operator can name explicitly (ADR 0002). On Windows without WSL2 it is
 * the only one; on macOS it is a choice, for somebody who would rather have one story everywhere
 * than two.
 *
 * The three properties, as flags:
 *
 * - **writes land only in the work directory** — the root filesystem is `--read-only` and the
 *   only bind mount is the run's directory. `/tmp` is a `tmpfs`, which is inside the container
 *   and vanishes with it; nothing there reaches the operator's disk
 * - **the operator's home is not readable** — it is not mounted. There is nothing to read
 * - **no network** — `--network none`. Not a firewall rule: the container has no interface but
 *   loopback
 *
 * Plus what a container makes easy and a Seatbelt policy does not: memory, CPU and process
 * ceilings, so a runaway script cannot take the operator's machine down with it.
 */

/**
 * Pinned by digest, and public for now.
 *
 * A tag moves; a digest does not, and "the wall is a container built from something that changed
 * under us" is not a sentence anybody wants in an incident. Public because our own image is worth
 * building only when we need to guarantee its contents — see ADR 0002.
 */
const IMAGE =
  "python:3.12-slim@sha256:229a2c5bfa27522db7815ea81f9bed70af17ccb9de9fc7ad142b1877b5830d36";

const MAX_OUTPUT = 100_000;

/** Ceilings. A container that eats the machine is a maintenance tool that broke the maintainer. */
const MEMORY = "1g";
const CPUS = "1";
const PIDS = "256";

/** One `docker` invocation, with its own timeout and no shell of ours in between. */
function docker(
  args: string[],
  options: { timeoutMs?: number; input?: string } = {},
): Promise<{ code: number | null; output: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
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
          child.kill("SIGKILL");
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
 * One container per work directory, kept warm for the length of the run.
 *
 * `docker run` costs 300–800 ms every time; `docker exec` into a container that is already up
 * costs tens of milliseconds. An agent that runs twenty small commands should not spend fifteen
 * seconds on container startup.
 */
const warm = new Map<string, string>();

async function containerFor(workdir: string): Promise<string> {
  const existing = warm.get(workdir);
  if (existing) {
    const alive = await docker(["inspect", "-f", "{{.State.Running}}", existing]);
    if (alive.output.trim() === "true") return existing;
    warm.delete(workdir);
  }

  await fs.mkdir(workdir, { recursive: true });
  const started = await docker([
    "run", "--detach", "--rm",
    "--network", "none",
    "--read-only",
    "--tmpfs", "/tmp:rw,size=64m,exec",
    /*
     * As the operator, not as root.
     *
     * The work directory is bind-mounted from the host; a process running as root inside would
     * write files the operator then cannot delete. Matching the uid keeps the files theirs.
     */
    "--user", `${os.userInfo().uid}:${os.userInfo().gid}`,
    "--volume", `${workdir}:/work`,
    "--workdir", "/work",
    "--env", "HOME=/work",
    "--memory", MEMORY,
    "--cpus", CPUS,
    "--pids-limit", PIDS,
    IMAGE,
    "sleep", "infinity",
  ], { timeoutMs: 60_000 });

  const id = started.output.trim().split("\n").pop() ?? "";
  if (started.code !== 0 || !id) {
    throw new Error(t("The container could not be started: {reason}", { reason: started.output }));
  }
  warm.set(workdir, id);
  return id;
}

export const dockerSandbox: Sandbox = {
  name: "docker",

  async available() {
    const running = await docker(["version", "--format", "{{.Server.Version}}"], {
      timeoutMs: 10_000,
    });
    if (running.code !== 0) return false;
    /*
     * The image has to be here already.
     *
     * Pulling on demand would mean a maintenance tool reaching out to a registry from a
     * customer's site, at the moment somebody is trying to fix something — see ADR 0002. If it
     * is missing, the tool is simply not offered.
     */
    const image = await docker(["image", "inspect", IMAGE], { timeoutMs: 10_000 });
    return image.code === 0;
  },

  async run(workdir: string, command: string, options = {}): Promise<SandboxResult> {
    const timeoutMs = options.timeoutMs ?? 120_000;
    let id: string;
    try {
      id = await containerFor(path.resolve(workdir));
    } catch (cause) {
      return { ok: false, output: cause instanceof Error ? cause.message : String(cause) };
    }

    const result = await docker(
      ["exec", "--workdir", "/work", id, "/bin/bash", "-c", command],
      { timeoutMs },
    );

    if (result.timedOut) {
      /*
       * Killing our `docker exec` leaves the process inside still running, so the container goes
       * with it. The next command gets a fresh one — losing `/tmp`, which is the point of it
       * being a tmpfs, and keeping `/work`, which is a bind mount on the host.
       */
      const dead = warm.get(path.resolve(workdir));
      if (dead) {
        warm.delete(path.resolve(workdir));
        await docker(["kill", dead], { timeoutMs: 10_000 });
      }
      return { ok: false, output: result.output, timedOut: true };
    }

    return {
      ok: result.code === 0,
      ...(result.code === null ? {} : { code: result.code }),
      output: result.output,
    };
  },

  async release(workdir: string) {
    const id = warm.get(path.resolve(workdir));
    if (!id) return;
    warm.delete(path.resolve(workdir));
    await docker(["kill", id], { timeoutMs: 10_000 });
  },
};
