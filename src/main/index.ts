import { app, BrowserWindow, ipcMain, protocol, safeStorage, session } from "electron";
import fs, { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setLocale, t } from "../shared/i18n";
import { loadLocale } from "./remote/localeController";
import { recordingPath } from "./remote/recording/controller";
import type { SecretCipher } from "./secretStore";
import {
  disposeRemote,
  registerRemoteController,
  setRemoteTarget,
} from "./remote/controller";

/**
 * Machina Forge Ops — one window for maintaining somebody else's server.
 *
 * The screen over RDP, the terminal over SSH, and an agent that can work both, in one place.
 * The machine on the other end is already running and its shell is the entire point, so safety
 * here is not the absence of a shell: it is an allowlist, an approval and a record.
 */

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

/**
 * The window's icon, wherever it happens to be.
 *
 * From a checkout it is beside the source; inside a packaged application `out/main/../../` lands
 * in the wrong place entirely and the file simply is not there. Both are looked for, and when
 * neither answers the icon is left alone — Electron's default is a worse icon, not a broken
 * window, and a missing decoration must not stop the application from opening.
 */
function findAppIcon(): string | undefined {
  const candidates = [
    path.join(currentDirectory, "../../assets/icon.png"),
    path.join(process.resourcesPath ?? "", "assets/icon.png"),
  ];
  return candidates.find((each) => fs.existsSync(each));
}

const appIconPath = findAppIcon();

/**
 * Electron's Keychain-backed encryption, for the customers' credentials.
 *
 * `isEncryptionAvailable()` is asked at each call rather than cached: on Linux it depends on a
 * key store that can appear or disappear while the app runs.
 */
function electronCipher(): SecretCipher {
  return {
    get available() {
      return safeStorage.isEncryptionAvailable();
    },
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (data) => safeStorage.decryptString(data),
  };
}

/*
 * The window itself going full screen, rather than one pane filling the work area.
 *
 * Full screen used to mean "the other half is hidden", which is not what anybody means by it when
 * they are looking at a customer's desktop: the window, the sidebar and this application's own
 * chrome were all still there taking a third of the display. The renderer asks for the real
 * thing, and is told when it happens by any other route — the green button, ⌃⌘F, Escape — so the
 * two never disagree about which state they are in.
 */
function registerFullScreen() {
  ipcMain.handle("remote:set-fullscreen", (event, on: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.setFullScreen(on === true);
  });
}

function createWindow() {
  const window = new BrowserWindow({
    ...(appIconPath ? { icon: appIconPath } : {}),
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: t("Machina Forge Ops"),
    // The window chrome is part of the app: the collapse control and the title sit in the same
    // row as the traffic lights, the way a desktop tool is laid out rather than a web page.
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 15 },
    webPreferences: {
      preload: path.join(currentDirectory, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The window that receives every server's state, screen and terminal.
  setRemoteTarget(window.webContents);

  /* However it was entered or left — the button, the green light, ⌃⌘F, Escape — the window says
     so, and the renderer follows rather than keeping its own opinion. */
  const tellRenderer = () =>
    window.webContents.send("remote:fullscreen", window.isFullScreen());
  window.on("enter-full-screen", tellRenderer);
  window.on("leave-full-screen", tellRenderer);

  window.once("ready-to-show", () => {
    window.maximize();
    window.show();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(path.join(currentDirectory, "../renderer/index.html"));
  }
}

/** Nothing here needs a camera, a microphone or a location. Every request is refused. */
function restrictPermissions() {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

/*
 * A recording, playable inside the window it belongs to.
 *
 * `file://` is closed to the renderer and handing over a whole video as an ArrayBuffer would put
 * a hundred megabytes through the bridge and into memory. A scheme of our own streams it from
 * disk with range requests, which is what a `<video>` element wants anyway.
 *
 * `machina-recording://host/<hostId>/<recordingId>/<segment>.webm`
 */
protocol.registerSchemesAsPrivileged([
  { scheme: "machina-recording", privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
]);

function serveRecordings(userData: string) {
  protocol.handle("machina-recording", async (request) => {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 3) return new Response("not found", { status: 404 });
    const [hostId, id, segment] = parts;

    let target: string;
    try {
      target = recordingPath(userData, decodeURIComponent(hostId), id, segment);
    } catch {
      /* The guard in `recordingFile` throws for a name that points outside its own directory. */
      return new Response("not found", { status: 404 });
    }

    let size: number;
    try {
      size = (await fs.promises.stat(target)).size;
    } catch {
      return new Response("not found", { status: 404 });
    }

    /*
     * Ranges, or the player cannot seek.
     *
     * A recorded WebM has no index of its own, so the element finds its way by asking for byte
     * ranges. Answering every request with the whole file leaves `video.seekable` empty — the
     * picture plays, the scrub bar moves, and clicking it does nothing, which is exactly how it
     * behaved. `Accept-Ranges` and a 206 are the whole fix.
     */
    const body = (start?: number, end?: number) =>
      Readable.toWeb(
        createReadStream(target, start === undefined ? {} : { start, end }),
      ) as ReadableStream;

    const asked = request.headers.get("Range");
    const range = asked ? /bytes=(\d*)-(\d*)/.exec(asked) : null;
    if (!range) {
      return new Response(body(), {
        status: 200,
        headers: {
          "content-type": "video/webm",
          "content-length": String(size),
          "accept-ranges": "bytes",
        },
      });
    }

    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (Number.isNaN(start) || start > end || start >= size) {
      return new Response("range not satisfiable", {
        status: 416,
        headers: { "content-range": `bytes */${size}` },
      });
    }
    return new Response(body(start, end), {
      status: 206,
      headers: {
        "content-type": "video/webm",
        "content-length": String(end - start + 1),
        "content-range": `bytes ${start}-${end}/${size}`,
        "accept-ranges": "bytes",
      },
    });
  });
}

app.whenReady().then(() => {
  const userData = app.getPath("userData");
  serveRecordings(userData);
  if (process.platform === "darwin" && app.dock && appIconPath) {
    app.dock.setIcon(appIconPath);
  }
  restrictPermissions();
  /* The language before the first frame: a window that paints Japanese and replaces it a frame
     later reads as a fault, and every window asks for this synchronously as it loads. */
  setLocale(loadLocale(userData));
  registerFullScreen();
  void registerRemoteController(userData, electronCipher());
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  /*
   * Let go of the sessions.
   *
   * An RDP screen and an SSH shell die with the window that was watching them — they are held
   * here, not in a service. A long job on a customer's server belongs in `tmux` or a unit, and
   * that is worth saying in the UI rather than pretending otherwise.
   */
  disposeRemote();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
