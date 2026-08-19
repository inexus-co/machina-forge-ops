/**
 * The screen, recorded because somebody pressed record.
 *
 * Of the three things this application can be asked "what did you do on that server", two answer
 * themselves — a typed command is written down as it is entered, and an agent's command is written
 * down with its output. The screen answered nothing: RDP is pixels, and pixels leave no trace. So
 * a recording, started and stopped by hand, is the third record.
 *
 * It never leaves this machine on its own. Nothing sends a recording to a model, and nothing
 * uploads it; it is a file on the operator's disk until they choose to hand it over.
 */

/** One stretch of video. Recordings are cut into these so that no single file grows unusable. */
export type RecordingSegment = {
  /** `001.webm`. The order is the name. */
  name: string;
  bytes: number;
  /** How long this piece runs, as the window measured it. */
  ms: number;
};

export type RecordingSummary = {
  /** The start time, with the punctuation a filename cannot hold replaced: `2026-08-14T01-20-33-000Z`. */
  id: string;
  hostId: string;
  /** The server's name when the recording was made. Names change; a record should not. */
  hostName: string;
  startedAt: string;
  /** Absent while it is still running, or if the application died holding it. */
  endedAt?: string;
  width: number;
  height: number;
  fps: number;
  segments: RecordingSegment[];
  totalBytes: number;
  /**
   * Why it ended, when that is worth saying: "stopped because the connection dropped" and the like.
   *
   * A recording that stopped on its own is a recording somebody will wonder about.
   */
  note?: string;
};

export type MachinaRemoteRecordingApi = {
  /** Open a recording and its first segment. Returns the id the other calls use. */
  start(
    hostId: string,
    shape: { width: number; height: number; fps: number },
  ): Promise<string>;
  /** Append encoded video. The window sends these as they come out of the encoder. */
  chunk(id: string, data: ArrayBuffer): Promise<void>;
  /** Close the current segment and open the next. Returns the new segment's name. */
  next(id: string): Promise<string>;
  /** Close it and write the summary. Returns what was recorded, or nothing if the id is unknown. */
  stop(id: string, note?: string): Promise<RecordingSummary | undefined>;
  /** Everything recorded for this server, newest first. */
  list(hostId: string): Promise<RecordingSummary[]>;
  remove(hostId: string, id: string): Promise<void>;
  /** Copy it somewhere the operator chooses. Returns where it went, or nothing if cancelled. */
  save(hostId: string, id: string): Promise<string | undefined>;
};
