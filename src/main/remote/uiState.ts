import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

/**
 * Small things about the window that should survive it closing.
 *
 * How wide the conversation was dragged to be, and whatever joins it later. `localStorage` was
 * the obvious place and it loses them: Chromium writes it to disk on its own schedule, so a
 * width set a second before quitting is a width that was never saved — measured, not guessed.
 * A file the main process writes when asked has no such gap.
 */

const schema = z.record(z.string().max(64), z.union([z.number(), z.string().max(200)]));

export type UiState = z.infer<typeof schema>;

function file(userDataRoot: string) {
  return path.join(userDataRoot, "remote-ui.json");
}

export async function readUiState(userDataRoot: string): Promise<UiState> {
  try {
    const parsed = schema.safeParse(JSON.parse(await fs.readFile(file(userDataRoot), "utf8")));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/** Merged rather than replaced: two parts of the window keep their own keys. */
export async function writeUiState(userDataRoot: string, patch: UiState): Promise<UiState> {
  const next = { ...(await readUiState(userDataRoot)), ...schema.parse(patch) };
  await fs.writeFile(file(userDataRoot), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
