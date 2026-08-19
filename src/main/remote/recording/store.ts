import { createWriteStream, type WriteStream } from "node:fs";
import { t } from "../../../shared/i18n";
import fs from "node:fs/promises";
import path from "node:path";
import type { RecordingSummary } from "../../../shared/remoteRecording";

/**
 * Recordings on disk, and the one being written.
 *
 * Kept apart from the agent's run records. A recording starts because somebody pressed a button,
 * not because a run began — there is often no run at all — and `remote-runs/` is read by looking
 * for `.json` files with a 20MB ceiling on what may sit beside them (`MOST_KEPT_BYTES`). Video
 * belongs to neither of those rules, so it has a root of its own.
 *
 *   <userData>/remote-recordings/<hostId>/<id>.json      the summary, which the list reads
 *   <userData>/remote-recordings/<hostId>/<id>/001.webm  the pieces
 *
 * The summary is written when the recording opens, not only when it closes: an application that
 * dies mid-recording leaves playable segments and a summary that says what they were.
 */

/**
 * How much one recording may take of the operator's disk.
 *
 * At 10fps and 1.5Mbps a recording is roughly 11MB a minute, so this is about three hours. It is
 * not a limit anybody should meet — it is there because a forgotten recording should stop rather
 * than fill a laptop. `MOST_KEPT_BYTES` (20MB, in `agent/session.ts`) is a different rule for a
 * different thing: files the agent produced, which travel with a run record.
 */
export const MOST_RECORDING_BYTES = 2_000_000_000;

/** `2026-08-14T01-20-33-000Z` — the start time, with what a filename cannot hold replaced. */
export function recordingId(now: Date) {
  return now.toISOString().replace(/[:.]/g, "-");
}

type Open = {
  summary: RecordingSummary;
  directory: string;
  file: WriteStream;
  /** When the current segment started, so its length is known when it closes. */
  segmentStartedAt: number;
  bytes: number;
};

const open = new Map<string, Open>();

const hostDirectory = (root: string, hostId: string) =>
  path.join(root, "remote-recordings", hostId);

const summaryPath = (root: string, hostId: string, id: string) =>
  path.join(hostDirectory(root, hostId), `${id}.json`);

/** `001.webm`, `002.webm` — the order is the name, so a directory listing is the timeline. */
const segmentName = (index: number) => `${String(index + 1).padStart(3, "0")}.webm`;

async function writeSummary(root: string, summary: RecordingSummary) {
  await fs.writeFile(
    summaryPath(root, summary.hostId, summary.id),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
}

/** A stream closed and waited for: the next segment must not start before this one is on disk. */
function finish(file: WriteStream) {
  return new Promise<void>((resolve) => file.end(() => resolve()));
}

export async function startRecording(
  root: string,
  hostId: string,
  hostName: string,
  shape: { width: number; height: number; fps: number },
): Promise<string> {
  const now = new Date();
  const id = recordingId(now);
  const directory = path.join(hostDirectory(root, hostId), id);
  await fs.mkdir(directory, { recursive: true });

  const summary: RecordingSummary = {
    id,
    hostId,
    hostName,
    startedAt: now.toISOString(),
    width: shape.width,
    height: shape.height,
    fps: shape.fps,
    segments: [],
    totalBytes: 0,
  };
  await writeSummary(root, summary);

  open.set(id, {
    summary,
    directory,
    file: createWriteStream(path.join(directory, segmentName(0))),
    segmentStartedAt: Date.now(),
    bytes: 0,
  });
  return id;
}

/**
 * Encoded video, appended.
 *
 * Backpressure is honoured because this is the one place in the application that writes
 * continuously: the encoder hands over a chunk every couple of seconds whether or not the disk
 * has kept up, and ignoring `write`'s answer is how memory grows without anybody noticing.
 */
export async function appendChunk(root: string, id: string, data: Buffer): Promise<void> {
  const current = open.get(id);
  if (!current) throw new Error(t("That recording is no longer open."));

  if (current.summary.totalBytes + data.byteLength > MOST_RECORDING_BYTES) {
    await stopRecording(root, id, t("Stopped: it grew too large."));
    throw new Error(t("The recording grew too large and was stopped."));
  }

  if (!current.file.write(data)) {
    await new Promise<void>((resolve) => current.file.once("drain", () => resolve()));
  }
  current.bytes += data.byteLength;
  current.summary.totalBytes += data.byteLength;
}

/** Close this piece, open the next. Each piece is a whole file that plays on its own. */
export async function nextSegment(root: string, id: string): Promise<string> {
  const current = open.get(id);
  if (!current) throw new Error(t("That recording is no longer open."));

  await finish(current.file);
  current.summary.segments.push({
    name: segmentName(current.summary.segments.length),
    bytes: current.bytes,
    ms: Date.now() - current.segmentStartedAt,
  });
  await writeSummary(root, current.summary);

  const name = segmentName(current.summary.segments.length);
  current.file = createWriteStream(path.join(current.directory, name));
  current.segmentStartedAt = Date.now();
  current.bytes = 0;
  return name;
}

export async function stopRecording(
  root: string,
  id: string,
  note?: string,
): Promise<RecordingSummary | undefined> {
  const current = open.get(id);
  if (!current) return undefined;
  open.delete(id);

  await finish(current.file);
  current.summary.segments.push({
    name: segmentName(current.summary.segments.length),
    bytes: current.bytes,
    ms: Date.now() - current.segmentStartedAt,
  });
  current.summary.endedAt = new Date().toISOString();
  if (note) current.summary.note = note;
  await writeSummary(root, current.summary);
  return current.summary;
}

/** Everything recorded for this server, newest first. Same shape as the run list: read the JSON. */
export async function listRecordings(
  root: string,
  hostId: string,
): Promise<RecordingSummary[]> {
  const directory = hostDirectory(root, hostId);
  let names: string[];
  try {
    names = await fs.readdir(directory);
  } catch {
    return [];
  }
  const found: RecordingSummary[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      found.push(JSON.parse(await fs.readFile(path.join(directory, name), "utf8")));
    } catch {
      /* A summary that cannot be read is one recording missing from a list, not a broken window. */
    }
  }
  return found.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function removeRecording(root: string, hostId: string, id: string) {
  await fs.rm(path.join(hostDirectory(root, hostId), id), { recursive: true, force: true });
  await fs.rm(summaryPath(root, hostId, id), { force: true });
}

/**
 * Where a recording's file is, refusing anything that points outside its own directory.
 *
 * The same guard the kept files use (`agent/controller.ts`): the id and the segment name arrive
 * from a window, and a name is not a path.
 */
export function recordingFile(root: string, hostId: string, id: string, segment: string) {
  const directory = path.join(hostDirectory(root, hostId), id);
  const target = path.resolve(directory, segment);
  if (!target.startsWith(path.resolve(directory) + path.sep)) {
    throw new Error(t("That name points outside the recording."));
  }
  return target;
}

export const recordingDirectory = hostDirectory;
