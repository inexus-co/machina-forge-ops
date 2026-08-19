/**
 * Which language everything is in, held where every window can ask before it draws.
 *
 * Read synchronously at startup rather than through the settings store's queue: `createWindow`
 * happens in the same tick as `whenReady`, and a promise would let the first frame out in the
 * previous language. The file is a few kilobytes and this happens once.
 *
 * Writing goes back through the ordinary settings write, so the language lands in the same file as
 * every other preference and cannot disagree with it.
 */

import { BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import { isLocale, setLocale, t, type Locale } from "../../shared/i18n";
import { readSettings, settingsPath, writeSettings } from "./agent/store";

/** The stored language, or English — including when the file is absent or unreadable. */
export function loadLocale(userDataRoot: string): Locale {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(settingsPath(userDataRoot), "utf8"));
    const value = (raw as { locale?: unknown } | null)?.locale;
    return isLocale(value) ? value : "en";
  } catch {
    return "en";
  }
}

export function registerLocaleController(
  userDataRoot: string,
  enqueue: (work: () => Promise<void>) => Promise<void>,
  /** How a floating panel's own title is rebuilt, now that the language moved. */
  retitle: () => void,
): void {
  /*
   * `sendSync` is used exactly here.
   *
   * The preload runs before the page and has nothing to await into; this is the one value the
   * window cannot start without. Everything else on this bridge is a promise.
   */
  ipcMain.on("i18n:sync", (event) => {
    event.returnValue = loadLocale(userDataRoot);
  });

  /*
   * The same value, asked for properly.
   *
   * `i18n:sync` is synchronous and runs in the preload, before the page exists — which makes it
   * the one thing a window cannot recover from if it goes wrong. This is the recovery: the window
   * asks again once it is drawing, from the module that actually renders, and puts the language
   * back if anything (a lost race at startup, a module reloaded by the dev server) left it
   * behind.
   */
  ipcMain.handle("i18n:current", () => loadLocale(userDataRoot));

  ipcMain.handle("i18n:set", async (_event, raw: unknown) => {
    if (!isLocale(raw)) throw new Error(t("That is not a language this can use."));
    setLocale(raw);
    await enqueue(async () => {
      const current = await readSettings(userDataRoot);
      await writeSettings(userDataRoot, { ...current, locale: raw });
    });
    /* Every window, including the floating panels — they are drawing the same application. */
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send("i18n:changed", raw);
    }
    /* The frame around them is the main process's, and it does not re-render. */
    retitle();
  });
}
