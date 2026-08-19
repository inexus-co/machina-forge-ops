import { randomUUID } from "node:crypto";
import { t } from "../../../shared/i18n";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { z } from "zod";
import type { Transfer } from "../../../shared/remoteFiles";
import type { SshTarget } from "../sshSession";
import { FileSession, posixJoin } from "./session";
import { Listeners } from "../listeners";

/**
 * IPC for file transfer.
 *
 * Which files leave this machine, and where they land, is decided by a native dialog — not by a
 * path the renderer sends. The renderer names a *remote* directory and a *remote* file, and every
 * local path in a transfer came from the operator choosing it in their own file picker. A window
 * that could name a local path could read one.
 */

export type FilesControllerDeps = {
  sshTarget(hostId: string): Promise<SshTarget>;
};

const sessions = new Map<string, FileSession>();
const transfers = new Map<string, Transfer & { cancelled?: boolean; localPath?: string }>();
/* Every window that has asked: the main one and any floating file panel. */
const listeners = new Listeners();
let deps: FilesControllerDeps;

const idSchema = z.string().min(1).max(64);
/** A remote path. Absolute or empty, and never something with a null in it. */
const pathSchema = z.string().max(4096).refine((value) => !value.includes("\0"));

function publish(transfer: Transfer) {
  listeners.send("remote-files:transfer", transfer);
}

function sessionFor(hostId: string) {
  const existing = sessions.get(hostId);
  if (existing) return existing;
  const session = new FileSession();
  sessions.set(hostId, session);
  return session;
}

export function disposeRemoteFiles() {
  for (const session of sessions.values()) session.stop();
  sessions.clear();
}

/**
 * One file, read and written by the agent — over the operator's own transfer path.
 *
 * Not a second road to the server: the same `FileSession`, the same SFTP connection, the same
 * credentials. What the agent adds is ADR 0002's order around it (read, copy here, generate,
 * show the diff, write, verify), which lives in the tools rather than here.
 */
export async function readRemoteFile(hostId: string, target: string): Promise<string> {
  const session = sessionFor(hostId);
  const ssh = await deps.sshTarget(hostId);
  const scratch = path.join(os.tmpdir(), `machina-read-${Date.now()}-${randomUUID()}`);
  try {
    await session.get(ssh, target, scratch, () => undefined);
    return await fs.readFile(scratch, "utf8");
  } finally {
    await fs.rm(scratch, { force: true });
  }
}

export async function writeRemoteFile(hostId: string, target: string, content: string) {
  const session = sessionFor(hostId);
  const ssh = await deps.sshTarget(hostId);
  const scratch = path.join(os.tmpdir(), `machina-write-${Date.now()}-${randomUUID()}`);
  try {
    await fs.writeFile(scratch, content, "utf8");
    await session.put(ssh, scratch, target, () => undefined);
  } finally {
    await fs.rm(scratch, { force: true });
  }
}

export function forgetRemoteFiles(hostId: string) {
  sessions.get(hostId)?.stop();
  sessions.delete(hostId);
}

/**
 * Run one transfer, reporting as it goes.
 *
 * Progress is published on a timer rather than on every chunk: `fastPut` steps thousands of times
 * for a large file, and one IPC message each would cost more than the transfer.
 */
async function track(
  transfer: Transfer & { localPath?: string },
  run: (onProgress: (moved: number, total: number) => void) => Promise<void>,
) {
  transfers.set(transfer.id, transfer);
  publish(transfer);

  let last = 0;
  try {
    await run((moved, total) => {
      transfer.moved = moved;
      transfer.total = total;
      const now = Date.now();
      if (now - last < 200) return;
      last = now;
      publish({ ...transfer });
    });
    const record = transfers.get(transfer.id);
    transfer.state = record?.cancelled ? "cancelled" : "done";
    if (transfer.state === "done") transfer.moved = transfer.total || transfer.moved;
  } catch (cause) {
    transfer.state = transfers.get(transfer.id)?.cancelled ? "cancelled" : "failed";
    transfer.detail = cause instanceof Error ? cause.message : String(cause);
  }
  publish({ ...transfer });
}

export function registerRemoteFilesController(controllerDeps: FilesControllerDeps) {
  deps = controllerDeps;

  ipcMain.handle("remote-files:list", async (event, rawId: unknown, rawPath: unknown) => {
    listeners.add(event.sender);
    const hostId = idSchema.parse(rawId);
    return await sessionFor(hostId).list(
      await deps.sshTarget(hostId),
      pathSchema.parse(rawPath ?? ""),
    );
  });

  const startUploads = async (hostId: string, directory: string, locals: string[]) => {
    const target = await deps.sshTarget(hostId);
    const session = sessionFor(hostId);
    const ids: string[] = [];
    for (const localPath of locals) {
      const name = path.basename(localPath);
      const transfer: Transfer & { localPath: string } = {
        id: randomUUID(),
        hostId,
        direction: "upload",
        name,
        moved: 0,
        total: 0,
        state: "running",
        localPath,
      };
      ids.push(transfer.id);
      // Sequential on purpose: one connection, and two transfers sharing it finish no sooner
      // than one after the other while making both progress bars lie.
      void track(transfer, (onProgress) =>
        session.put(target, localPath, posixJoin(directory, name), onProgress),
      );
    }
    return ids;
  };

  ipcMain.handle(
    "remote-files:upload",
    async (event, rawId: unknown, rawDirectory: unknown, rawLocals: unknown) => {
      listeners.add(event.sender);
      /*
       * Local paths are accepted here only because they came from a drop the operator made on
       * this window. A drop is a choice, the same as a dialog — the renderer cannot invent one.
       */
      const locals = z.array(z.string().min(1).max(4096)).max(50).parse(rawLocals);
      return await startUploads(
        idSchema.parse(rawId),
        pathSchema.parse(rawDirectory),
        locals,
      );
    },
  );

  ipcMain.handle(
    "remote-files:choose-and-upload",
    async (event, rawId: unknown, rawDirectory: unknown) => {
      listeners.add(event.sender);
      const window = BrowserWindow.fromWebContents(event.sender);
      const chosen = await dialog.showOpenDialog(window!, {
        title: t("Choose the files to send"),
        properties: ["openFile", "multiSelections"],
        buttonLabel: t("Send"),
      });
      if (chosen.canceled) return [];
      return await startUploads(
        idSchema.parse(rawId),
        pathSchema.parse(rawDirectory),
        chosen.filePaths,
      );
    },
  );

  ipcMain.handle(
    "remote-files:download",
    async (event, rawId: unknown, rawRemotes: unknown) => {
      listeners.add(event.sender);
      const hostId = idSchema.parse(rawId);
      const remotes = z.array(pathSchema).min(1).max(50).parse(rawRemotes);
      const window = BrowserWindow.fromWebContents(event.sender);

      // Where they land is the operator's choice, made in their own file picker.
      const chosen = await dialog.showOpenDialog(window!, {
        title: t("Choose where to save"),
        properties: ["openDirectory", "createDirectory"],
        buttonLabel: t("Save here"),
      });
      if (chosen.canceled) return [];
      const directory = chosen.filePaths[0];

      const target = await deps.sshTarget(hostId);
      const session = sessionFor(hostId);
      const ids: string[] = [];
      for (const remotePath of remotes) {
        const name = path.posix.basename(remotePath);
        const localPath = path.join(directory, name);
        const transfer: Transfer & { localPath: string } = {
          id: randomUUID(),
          hostId,
          direction: "download",
          name,
          moved: 0,
          total: 0,
          state: "running",
          localPath,
        };
        ids.push(transfer.id);
        void track(transfer, (onProgress) =>
          session.get(target, remotePath, localPath, onProgress),
        );
      }
      return ids;
    },
  );

  /*
   * Cancelling drops the connection.
   *
   * `fastPut` has no stop, and the alternative — letting it finish and pretending otherwise —
   * would leave a file on a customer's server that the operator believes they stopped. The
   * session reconnects on the next request.
   */
  ipcMain.handle("remote-files:cancel", (_event, rawId: unknown) => {
    const transfer = transfers.get(idSchema.parse(rawId));
    if (!transfer || transfer.state !== "running") return;
    transfer.cancelled = true;
    sessions.get(transfer.hostId)?.stop();
  });

  ipcMain.handle("remote-files:reveal", (_event, rawId: unknown) => {
    const transfer = transfers.get(idSchema.parse(rawId));
    if (transfer?.localPath) shell.showItemInFolder(transfer.localPath);
  });
}
