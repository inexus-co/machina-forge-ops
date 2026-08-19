import { BrowserWindow, dialog, ipcMain } from "electron";
import { z } from "zod";
import { t } from "../../../shared/i18n";
import { Listeners } from "../listeners";
import { addPlugin, forgetPlugin, installPlugin, listPlugins, readPluginFolder, removePlugin } from "./plugins";
import { readDossier } from "./serverContext";

/**
 * IPC for the ready-made plugins.
 *
 * Installing writes skills through the same path the settings screen uses, so there is little to
 * guard here: an id has to be a short string, and a host id (for the suggestion) has to be one
 * this machine could have a dossier for. The suggestion reads that host's last facts summary and
 * asks nothing of the model.
 *
 * A change is announced to every window that has asked for the list, because installing in the
 * settings window is meant to light up the chat window's ＋ menu without either being reopened.
 */

const idSchema = z.string().min(1).max(64);
const hostSchema = z.string().min(1).max(200);
/* What may be written down as a plugin. The window sends back what this file just handed it, and
   this is the check that says so — a renderer is not a trusted source of file contents. */
const pluginSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  summary: z.string().max(400).default(""),
  stack: z.array(z.string().min(1).max(60)).max(40).default([]),
  skills: z
    .array(
      z.object({
        name: z.string().min(1).max(64),
        description: z.string().max(400).default(""),
        goal: z.string().max(2000).optional(),
        body: z.string().min(1).max(200_000),
      }),
    )
    .min(1)
    .max(40),
});

export function registerRemotePluginsController(userDataRoot: string) {
  const listeners = new Listeners();

  ipcMain.handle("remote-plugins:list", async (event, rawHostId: unknown) => {
    listeners.add(event.sender);
    if (rawHostId === undefined) return listPlugins(userDataRoot);
    const hostId = hostSchema.parse(rawHostId);
    /* No facts, no suggestion — a bad id or a server-less conversation simply suggests nothing. */
    const summary = await readDossier(userDataRoot, hostId)
      .then((dossier) => dossier.lastFacts?.summary)
      .catch(() => undefined);
    return listPlugins(userDataRoot, summary);
  });

  ipcMain.handle("remote-plugins:install", async (_event, rawId: unknown) => {
    const next = await installPlugin(userDataRoot, idSchema.parse(rawId));
    listeners.send("remote-plugins:changed");
    return next;
  });

  ipcMain.handle("remote-plugins:remove", async (_event, rawId: unknown) => {
    const next = await removePlugin(userDataRoot, idSchema.parse(rawId));
    listeners.send("remote-plugins:changed");
    return next;
  });

  /*
   * A plugin from a folder on this machine.
   *
   * The operator picks the folder, so nothing is fetched and nothing decides on its own what to
   * read. What comes back is what was found — the skills, their one-liners, which of them are
   * commands — for the window to show before anything is written. Cancelling returns nothing.
   */
  ipcMain.handle("remote-plugins:read-folder", async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: t("Choose the folder that holds plugin.json"),
      properties: ["openDirectory" as const],
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    const folder = result.canceled ? undefined : result.filePaths[0];
    if (!folder) return undefined;
    return await readPluginFolder(folder);
  });

  /* Write it down, having been shown. The skills are not installed until install is pressed. */
  ipcMain.handle("remote-plugins:add", async (_event, raw: unknown) => {
    const plugin = await addPlugin(userDataRoot, pluginSchema.parse(raw));
    listeners.send("remote-plugins:changed");
    return plugin;
  });

  ipcMain.handle("remote-plugins:forget", async (_event, rawId: unknown) => {
    const next = await forgetPlugin(userDataRoot, idSchema.parse(rawId));
    listeners.send("remote-plugins:changed");
    return next;
  });
}
