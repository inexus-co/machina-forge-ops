import { BrowserWindow, ipcMain } from "electron";
import { t } from "../../../shared/i18n";
import { z } from "zod";
import type { TypedCommand } from "../../../shared/remoteHistory";
import { exportHistory, type ExportFormat, type ExportRow } from "./export";
import type { HistoryRecorder } from "./recorder";

/**
 * Reading back what was typed here.
 *
 * Nothing is asked of the server. The record was written as the commands were entered, on this
 * machine, so answering is opening a file — no connection, no waiting, and an answer even for a
 * server that is switched off.
 */

export type HistoryControllerDeps = {
  recorder: HistoryRecorder;
  /** For the exported file's name and heading. */
  hostName(hostId: string): string | undefined;
};

let deps: HistoryControllerDeps;

export function registerRemoteHistoryController(controllerDeps: HistoryControllerDeps) {
  deps = controllerDeps;

  ipcMain.handle("remote-history:read", async (_event, rawId: unknown): Promise<TypedCommand[]> => {
    return await deps.recorder.read(z.string().min(1).max(64).parse(rawId));
  });

  /*
   * Writing out what is on the screen.
   *
   * The rows come from the window rather than being read again here: what somebody means by
   * "download this" is the list they are looking at, filtered and searched as they left it.
   */
  ipcMain.handle(
    "remote-history:export",
    async (event, rawId: unknown, rawFormat: unknown, rawRows: unknown) => {
      const hostId = z.string().min(1).max(64).parse(rawId);
      const format = z.enum(["csv", "markdown", "json", "pdf"]).parse(rawFormat) as ExportFormat;
      const rows = z
        .array(
          z.object({
            at: z.string().max(40),
            command: z.string().max(4000),
            by: z.enum(["agent", "hand"]),
            where: z.string().max(60).optional(),
            note: z.string().max(400).optional(),
            output: z.string().max(200_000).optional(),
          }),
        )
        .max(5000)
        .parse(rawRows) as ExportRow[];
      return await exportHistory(
        rows,
        format,
        deps.hostName(hostId) ?? t("Servers"),
        BrowserWindow.fromWebContents(event.sender) ?? undefined,
      );
    },
  );
}
