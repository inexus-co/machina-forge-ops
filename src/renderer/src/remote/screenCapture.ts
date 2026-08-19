import { t } from "../../../shared/i18n";
/**
 * The screen, recorded from the canvas it is already drawn on.
 *
 * Nothing is added to the pipeline: the frames arrive from the helper, `RemoteScreen` paints them,
 * and this copies that canvas into one of its own that the encoder watches. Chromium brings VP9,
 * so a recording costs no dependency and no second connection to the customer's server.
 *
 * Two things about the source canvas decide this design.
 *
 * It keeps being painted while it is out of sight — the paint path has no visibility check — so a
 * recording survives switching panes, switching servers, and the window going behind another
 * application. And its bitmap is *reallocated* whenever the desktop changes size, which would
 * change a live track's resolution and break the file. Hence the copy: the intermediate canvas is
 * fixed at the size recording started with, and a desktop that changes size is fitted into it.
 */

/** How often the intermediate canvas is redrawn, and the rate the encoder is told. */
const FPS = 10;

/** Roughly 11MB a minute at this resolution. Enough to read a terminal in the recording. */
const BITRATE = 1_500_000;

/**
 * How long one piece runs.
 *
 * WebM cannot be cut afterwards — a file without its header is not playable — so the pieces are
 * made by stopping the encoder and starting another. The seam costs a few hundred milliseconds,
 * which is the price of every piece being a file that plays on its own.
 */
const SEGMENT_MS = 15 * 60 * 1000;

/** `setInterval` in preference to `requestAnimationFrame`: rAF is throttled in a background window. */
export type ScreenCapture = {
  id: string;
  /** Seconds since it started, for the line in the header. */
  elapsed(): number;
  stop(note?: string): Promise<void>;
};

export async function startScreenCapture(options: {
  hostId: string;
  source: HTMLCanvasElement;
  /** Told when the recording ends by itself — the size limit, an error, a closed session. */
  onEnded?: (note?: string) => void;
  /** Overridable so a probe can prove the splitting without waiting a quarter of an hour. */
  segmentMs?: number;
}): Promise<ScreenCapture> {
  const { hostId, source } = options;
  const width = source.width || 1280;
  const height = source.height || 800;

  const id = await window.machina.remoteRecording.start(hostId, { width, height, fps: FPS });

  const board = document.createElement("canvas");
  board.width = width;
  board.height = height;
  const ink = board.getContext("2d", { alpha: false });
  if (!ink) throw new Error(t("This screen cannot be recorded."));
  ink.fillStyle = "#0b1118";
  ink.fillRect(0, 0, width, height);

  /*
   * The copy, once per frame.
   *
   * `drawImage` with both rectangles named handles the case this exists for: the desktop resized
   * mid-recording, so the source is no longer the shape of the file. It is fitted, letterboxed,
   * and the recording carries on.
   */
  const copy = () => {
    if (source.width === 0 || source.height === 0) return;
    const scale = Math.min(width / source.width, height / source.height);
    const w = Math.max(1, Math.round(source.width * scale));
    const h = Math.max(1, Math.round(source.height * scale));
    if (w !== width || h !== height) {
      ink.fillStyle = "#0b1118";
      ink.fillRect(0, 0, width, height);
    }
    ink.drawImage(source, 0, 0, source.width, source.height, (width - w) / 2, (height - h) / 2, w, h);
  };
  copy();
  const painting = window.setInterval(copy, Math.round(1000 / FPS));

  const stream = board.captureStream(FPS);
  const startedAt = Date.now();
  let stopped = false;
  let recorder: MediaRecorder | undefined;
  let sending: Promise<void> = Promise.resolve();

  const send = (data: Blob) => {
    /* One after another: chunks must reach the file in the order the encoder made them. */
    sending = sending
      .then(async () => {
        if (data.size === 0) return;
        await window.machina.remoteRecording.chunk(id, await data.arrayBuffer());
      })
      .catch((cause: unknown) => {
        /* The main process has already stopped the recording when it refuses a chunk. */
        if (!stopped) {
          stopped = true;
          window.clearInterval(painting);
          window.clearInterval(cutting);
          options.onEnded?.(cause instanceof Error ? cause.message : String(cause));
        }
      });
  };

  const begin = () => {
    const next = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9",
      videoBitsPerSecond: BITRATE,
    });
    next.ondataavailable = (event) => send(event.data);
    /* Two seconds: small enough that a crash loses little, large enough not to be a chatty IPC. */
    next.start(2000);
    recorder = next;
  };

  /** A piece ends and the next begins, with the file swapped underneath in between. */
  const cut = async () => {
    if (stopped || !recorder) return;
    const ending = recorder;
    await new Promise<void>((resolve) => {
      ending.onstop = () => resolve();
      ending.stop();
    });
    await sending;
    await window.machina.remoteRecording.next(id);
    if (!stopped) begin();
  };

  begin();
  const cutting = window.setInterval(() => void cut(), options.segmentMs ?? SEGMENT_MS);

  return {
    id,
    elapsed: () => Math.floor((Date.now() - startedAt) / 1000),
    async stop(note?: string) {
      if (stopped) return;
      stopped = true;
      window.clearInterval(painting);
      window.clearInterval(cutting);
      const ending = recorder;
      if (ending && ending.state !== "inactive") {
        await new Promise<void>((resolve) => {
          ending.onstop = () => resolve();
          ending.stop();
        });
      }
      await sending;
      for (const track of stream.getTracks()) track.stop();
      await window.machina.remoteRecording.stop(id, note);
    },
  };
}
