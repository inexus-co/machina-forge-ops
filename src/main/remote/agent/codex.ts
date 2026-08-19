import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

/**
 * Whether OpenAI's own command-line client is on this machine.
 *
 * All that is left of a larger file. The subscription used to be reached by spawning `codex` and
 * reading its answer; Pi reaches the same account itself over OAuth, so nothing here is on the
 * path of a run any more. The check survives because the settings screen still offers the CLI as
 * a thing the operator may have, and saying "it is not installed" is more use than a failure
 * later.
 */

const run = promisify(execFile);

export async function codexStatus(): Promise<{ version?: string; signedIn: boolean }> {
  let version: string | undefined;
  try {
    const { stdout } = await run("codex", ["--version"], { timeout: 5000 });
    version = stdout.trim().split("\n")[0];
  } catch {
    return { signedIn: false };
  }
  try {
    await fs.access(path.join(os.homedir(), ".codex", "auth.json"));
    return { version, signedIn: true };
  } catch {
    return { version, signedIn: false };
  }
}
