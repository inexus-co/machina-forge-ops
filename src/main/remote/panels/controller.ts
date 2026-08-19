import { BrowserWindow, ipcMain } from "electron";
import { t } from "../../../shared/i18n";
import { z } from "zod";
import type { PanelKind } from "../../../shared/remotePanels";
import { Listeners } from "../listeners";
import {
  closeAllPanels,
  closePanel,
  fitPanel,
  onPanelsChanged,
  openPanel,
  openPanels,
} from "./window";

/**
 * Opening and closing the floating panels.
 *
 * The buttons that open them are in the main window and have to show which are open — including
 * after the operator closes one from its own title bar, which this side is the only one that
 * hears about. Hence the event as well as the three calls.
 */

export type PanelsControllerDeps = {
  /** For the window's title. A window called "State" and nothing else is no use with four open. */
  hostName(hostId: string): string | undefined;
  /**
   * What is open now, after one was opened or closed.
   *
   * Whoever is polling or tailing for a panel needs this: a window that closes takes its
   * renderer with it before any cleanup could run, so the main process is the only side that
   * knows the reader is gone.
   */
  onChanged(hostId: string, open: PanelKind[]): void;
};

const idSchema = z.string().min(1).max(64);
const kindSchema = z.enum(["status", "inventory", "karte", "files", "runs", "settings", "fleet"]);
const listeners = new Listeners();

let deps: PanelsControllerDeps;

export function registerRemotePanelsController(controllerDeps: PanelsControllerDeps) {
  deps = controllerDeps;
  onPanelsChanged((hostId) => {
    const open = openPanels(hostId);
    listeners.send("remote-panels:changed", hostId, open);
    deps.onChanged(hostId, open);
  });

  ipcMain.handle("remote-panels:open", (event, rawKind: unknown, rawId: unknown, rawFocus: unknown) => {
    listeners.add(event.sender);
    const hostId = idSchema.parse(rawId);
    const focus = rawFocus === undefined ? undefined : z.string().min(1).max(120).parse(rawFocus);
    const kind: PanelKind = kindSchema.parse(rawKind);
    openPanel(kind, hostId, deps.hostName(hostId) ?? t("Servers"), focus);
    return openPanels(hostId);
  });

  ipcMain.handle("remote-panels:close", (event, rawKind: unknown, rawId: unknown) => {
    listeners.add(event.sender);
    const hostId = idSchema.parse(rawId);
    closePanel(kindSchema.parse(rawKind), hostId);
    return openPanels(hostId);
  });

  /* Only from a panel window, and only about itself: nothing here can resize the main window. */
  ipcMain.handle("remote-panels:fit", (event, rawHeight: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const height = z.number().min(0).max(4000).parse(rawHeight);
    if (window && window !== BrowserWindow.getAllWindows()[0]) fitPanel(window, height);
  });

  ipcMain.handle("remote-panels:list", (event, rawId: unknown) => {
    listeners.add(event.sender);
    return openPanels(idSchema.parse(rawId));
  });
}

/** A host that was removed, and quitting. Nothing may go on floating over a server that is gone. */
export function closeRemotePanels(hostId?: string) {
  closeAllPanels(hostId);
}
