import fs from "node:fs/promises";
import { t } from "../../../shared/i18n";
import path from "node:path";
import { BrowserWindow, dialog, ipcMain } from "electron";
import { z } from "zod";
import type { RecordingSummary } from "../../../shared/remoteRecording";
import {
  appendChunk,
  listRecordings,
  nextSegment,
  recordingFile,
  removeRecording,
  startRecording,
  stopRecording,
} from "./store";

/**
 * IPC for the screen recording.
 *
 * The encoding happens in the window — the picture is already on a canvas there, and Chromium
 * brings the encoder — so this side is the part a sandboxed renderer cannot do: writing to disk.
 * Chunks arrive as they come out of the encoder rather than as one blob at the end, so a long
 * recording never sits in memory.
 */

export type RecordingControllerDeps = {
  userDataRoot: string;
  hostName(hostId: string): string | undefined;
};

const idSchema = z.string().min(1).max(64);
/** A recording id is a filename: the start time with its punctuation replaced. */
const recordingIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

let deps: RecordingControllerDeps;

export function registerRemoteRecordingController(controllerDeps: RecordingControllerDeps) {
  deps = controllerDeps;

  ipcMain.handle(
    "remote-recording:start",
    async (_event, rawId: unknown, rawShape: unknown): Promise<string> => {
      const hostId = idSchema.parse(rawId);
      const shape = z
        .object({
          width: z.number().int().min(16).max(8192),
          height: z.number().int().min(16).max(8192),
          fps: z.number().int().min(1).max(60),
        })
        .parse(rawShape);
      return await startRecording(
        deps.userDataRoot,
        hostId,
        deps.hostName(hostId) ?? t("Servers"),
        shape,
      );
    },
  );

  ipcMain.handle("remote-recording:chunk", async (_event, rawId: unknown, rawData: unknown) => {
    const id = recordingIdSchema.parse(rawId);
    if (!(rawData instanceof ArrayBuffer) && !ArrayBuffer.isView(rawData)) {
      throw new Error(t("The recording cannot be read."));
    }
    const data = Buffer.from(rawData instanceof ArrayBuffer ? rawData : rawData.buffer);
    await appendChunk(deps.userDataRoot, id, data);
  });

  ipcMain.handle("remote-recording:next", async (_event, rawId: unknown) =>
    nextSegment(deps.userDataRoot, recordingIdSchema.parse(rawId)),
  );

  ipcMain.handle(
    "remote-recording:stop",
    async (_event, rawId: unknown, rawNote: unknown): Promise<RecordingSummary | undefined> =>
      stopRecording(
        deps.userDataRoot,
        recordingIdSchema.parse(rawId),
        rawNote === undefined ? undefined : z.string().max(200).parse(rawNote),
      ),
  );

  ipcMain.handle("remote-recording:list", async (_event, rawId: unknown) =>
    listRecordings(deps.userDataRoot, idSchema.parse(rawId)),
  );

  ipcMain.handle("remote-recording:remove", async (_event, rawHost: unknown, rawId: unknown) =>
    removeRecording(deps.userDataRoot, idSchema.parse(rawHost), recordingIdSchema.parse(rawId)),
  );

  /*
   * A copy, where the operator says.
   *
   * The same shape as the history's export (`history/export.ts`): the chooser is attached to the
   * window that asked, because the record window floats above everything and an unparented dialog
   * opens behind it. One segment is one file; several are written into a directory of their own.
   */
  ipcMain.handle(
    "remote-recording:save",
    async (event, rawHost: unknown, rawId: unknown): Promise<string | undefined> => {
      const hostId = idSchema.parse(rawHost);
      const id = recordingIdSchema.parse(rawId);
      const all = await listRecordings(deps.userDataRoot, hostId);
      const summary = all.find((each) => each.id === id);
      if (!summary) throw new Error(t("There is no such recording."));

      const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const stamp = summary.startedAt.slice(0, 16).replace(/[:T]/g, "-");
      const single = summary.segments.length <= 1;
      const options = {
        title: t("Write out the recording"),
        defaultPath: t("screen-recording_{host}_{stamp}", { host: summary.hostName, stamp }) +
        (single ? ".webm" : ""),
        ...(single ? { filters: [{ name: t("WebM (video)"), extensions: ["webm"] }] } : {}),
        ...(single ? {} : { properties: ["createDirectory" as const] }),
      };
      const chosen =
        parent && !parent.isDestroyed()
          ? await dialog.showSaveDialog(parent, options)
          : await dialog.showSaveDialog(options);
      if (chosen.canceled || !chosen.filePath) return undefined;

      if (single) {
        const from = recordingFile(deps.userDataRoot, hostId, id, summary.segments[0].name);
        const to = path.extname(chosen.filePath) ? chosen.filePath : `${chosen.filePath}.webm`;
        await fs.copyFile(from, to);
        return to;
      }

      /* Several pieces: a directory with the pieces in it, named in the order they were recorded. */
      await fs.mkdir(chosen.filePath, { recursive: true });
      for (const segment of summary.segments) {
        await fs.copyFile(
          recordingFile(deps.userDataRoot, hostId, id, segment.name),
          path.join(chosen.filePath, segment.name),
        );
      }
      return chosen.filePath;
    },
  );
}

/** For the protocol handler that plays a recording back inside the window. */
export function recordingPath(root: string, hostId: string, id: string, segment: string) {
  return recordingFile(root, idSchema.parse(hostId), recordingIdSchema.parse(id), segment);
}
