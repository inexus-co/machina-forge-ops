import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chooseSandbox } from "./index";

/**
 * Who said the tool may run without a wall, and on which machine.
 *
 * ADR 0002 allows exactly one exception to "no wall, no tool", and hedges it with four conditions.
 * Two of them live here:
 *
 * - **off by default, and only by hand on that machine.** This is why it is its own file rather
 *   than a field in the settings: settings are a thing people export, copy between machines and
 *   will one day sync. A consent that travels is a consent nobody gave. The machine's name is
 *   written into the file and checked when it is read, so a copied `userData` directory arrives
 *   with the wall back on
 * - **it stays visible.** The file records when it was accepted, and the window reads it every
 *   time the settings are opened rather than remembering that somebody once clicked
 *
 * The other two — every command stops for a person, and the record says `sandboxed: false` —
 * are in `piTools.ts` and in the record itself.
 */

export type NoWallConsent = {
  accepted: boolean;
  /** When, so the screen can say how long this machine has been running without a wall. */
  at?: string;
  /** Which machine. A consent for one machine is not a consent for the next. */
  machine?: string;
};

function consentPath(userDataRoot: string) {
  return path.join(userDataRoot, "agent", "no-wall.json");
}

export async function readConsent(userDataRoot: string): Promise<NoWallConsent> {
  try {
    const raw = JSON.parse(await fs.readFile(consentPath(userDataRoot), "utf8")) as NoWallConsent;
    /* Same machine, or it does not count. */
    if (raw.accepted !== true || raw.machine !== os.hostname()) return { accepted: false };
    return { accepted: true, ...(raw.at ? { at: raw.at } : {}), machine: raw.machine };
  } catch {
    return { accepted: false };
  }
}

export async function writeConsent(userDataRoot: string, accepted: boolean): Promise<NoWallConsent> {
  const file = consentPath(userDataRoot);
  await fs.mkdir(path.dirname(file), { recursive: true });
  if (!accepted) {
    await fs.rm(file, { force: true });
    return { accepted: false };
  }
  const consent: NoWallConsent = {
    accepted: true,
    at: new Date().toISOString(),
    machine: os.hostname(),
  };
  await fs.writeFile(file, `${JSON.stringify(consent, null, 2)}\n`, "utf8");
  return consent;
}

/** What this machine can do about walls, for the screen and for the start of a run. */
export type WallState = {
  /** The wall that would be built, if any. */
  wall?: string;
  /** Whether any wall at all can be built here. `false` is what opens the exception. */
  canBuild: boolean;
  consent: NoWallConsent;
};

export async function wallState(userDataRoot: string, preferred?: string): Promise<WallState> {
  const chosen = await chooseSandbox(preferred);
  return {
    ...(chosen ? { wall: chosen.name } : {}),
    canBuild: Boolean(chosen),
    consent: await readConsent(userDataRoot),
  };
}
