import path from "node:path";
import { t } from "../../../shared/i18n";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { BrowserWindow, app, screen } from "electron";
import type { PanelKind } from "../../../shared/remotePanels";

/**
 * The three side views, each in a window of its own that stays above everything.
 *
 * The state of a machine, what is installed on it, and its files are not the work — the screen,
 * the shell and the agent are. They are things you go and look at *while* the work continues, and
 * for a while they were pages inside the window: opening one covered the screen you were watching,
 * and closing it was the only way back. Their own windows say what they are and cost the work
 * nothing.
 *
 * Real windows rather than Document Picture-in-Picture. That API is the obvious fit and it
 * **freezes this Electron's renderer**: after `requestWindow()` the page stops answering
 * altogether — measured, not guessed. A small always-on-top `BrowserWindow` is the ordinary way
 * to do this in a desktop application, it survives everything the main window does, and the
 * operating system keeps it in front while the operator works in a different application, which
 * is the entire point.
 *
 * Each loads the same renderer bundle with `#panel=<kind>:<hostId>`, so there is one build and
 * one set of styles rather than four little applications that drift from each other.
 */

/*
 * Japanese, translated where the window is made.
 *
 * Not `t()` here: this table is read once when the file loads, and a word read then is the language
 * the application started in — see `i18n.test.ts`.
 */
/** What a window is called, in the language now in force. */
function titleFor(kind: PanelKind, hostName: string | undefined, dialog: boolean): string {
  return dialog
    ? t(LABELS[kind])
    : t("{label} — {host}", { label: t(LABELS[kind]), host: hostName ?? "" });
}

/**
 * Re-title every open panel, after the language changed.
 *
 * The title is given to a window when it is made, and an operator who switches language with three
 * panels open would otherwise be looking at three windows still named in the old one.
 */
export function retitlePanels(hostName: (hostId: string) => string | undefined): void {
  for (const [id, window] of windows) {
    if (window.isDestroyed()) continue;
    const [kind, hostId] = [id.slice(0, id.indexOf(":")) as PanelKind, id.slice(id.indexOf(":") + 1)];
    window.setTitle(titleFor(kind, hostName(hostId), isDialog(kind)));
  }
}

/* The same sentences the window itself uses, so a title and its screen never disagree. */
const LABELS: Record<PanelKind, string> = {
  status: "State",
  inventory: "Inventory",
  karte: "Server logbook",
  files: "Files",
  runs: "Runs",
  settings: "Settings",
  fleet: "Run across servers",
};

/**
 * How big each opens the *first* time.
 *
 * Only the first time: what the operator resizes it to is remembered below, because a window
 * that has to be dragged bigger every morning is a window with the wrong default forever. These
 * are the sizes at which nothing important is cut off — the inventory's row of tabs ends with a
 * reload button, and a window narrower than that row hides it.
 *
 * The status is the exception: its content has a definite height rather than filling what it is
 * given, so its height is fitted to what arrived (`fitPanel`) and only its width is remembered.
 */
const SIZES: Record<PanelKind, { width: number; height: number; minWidth: number }> = {
  status: { width: 470, height: 420, minWidth: 360 },
  inventory: { width: 1180, height: 780, minWidth: 460 },
  /* Notes, handovers, the facts that reach the agent, this server's memory — one column. */
  karte: { width: 760, height: 800, minWidth: 460 },
  files: { width: 1060, height: 760, minWidth: 520 },
  /* A list of runs beside one run's commands and their output: two columns, both worth reading. */
  runs: { width: 1040, height: 780, minWidth: 520 },
  /* A settings window is read left to right: categories, then the fields. */
  settings: { width: 980, height: 720, minWidth: 620 },
  /* A list of servers, a goal box, then a row per server with its progress and any approval. */
  fleet: { width: 900, height: 800, minWidth: 520 },
};

/** Where each kind was left. One file, written when a window is moved or resized. */
type Bounds = { width: number; height: number; x?: number; y?: number };

const remembered = new Map<PanelKind, Bounds>();
let loaded = false;

function boundsFile() {
  return `${app.getPath("userData")}/remote-panel-windows.json`;
}

function loadBounds() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = JSON.parse(fs.readFileSync(boundsFile(), "utf8")) as Record<string, Bounds>;
    for (const [kind, value] of Object.entries(raw)) {
      if (typeof value?.width === "number" && typeof value?.height === "number") {
        remembered.set(kind as PanelKind, value);
      }
    }
  } catch {
    // No file yet, or one written by a version that wrote something else. The defaults stand.
  }
}

function saveBounds(kind: PanelKind, window: BrowserWindow) {
  if (window.isDestroyed() || window.isMinimized()) return;
  const { width, height, x, y } = window.getBounds();
  remembered.set(kind, { width, height, x, y });
  const all = Object.fromEntries(remembered);
  try {
    fs.writeFileSync(boundsFile(), `${JSON.stringify(all, null, 2)}\n`, "utf8");
  } catch {
    // A window position is not worth failing over.
  }
}

/** A remembered position on a monitor that is no longer there is worse than none. */
function onScreen(bounds: Bounds) {
  if (bounds.x === undefined || bounds.y === undefined) return false;
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return (
      bounds.x! >= area.x - 8 &&
      bounds.y! >= area.y - 8 &&
      bounds.x! < area.x + area.width - 40 &&
      bounds.y! < area.y + area.height - 40
    );
  });
}

const windows = new Map<string, BrowserWindow>();
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
let changed: ((hostId: string) => void) | undefined;

const key = (kind: PanelKind, hostId: string) => `${kind}:${hostId}`;

/** The settings open as a dialog: centred, its own chrome, and named without a server. */
const isDialog = (kind: PanelKind) => kind === "settings";

/** Told whenever a host's set of open panels changes, including when the operator closes one. */
export function onPanelsChanged(listener: (hostId: string) => void) {
  changed = listener;
}

export function openPanel(kind: PanelKind, hostId: string, hostName: string, focus?: string) {
  const existing = windows.get(key(kind, hostId));
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    /* Already up: it cannot be told through its address, so it is told through a message. */
    if (focus) existing.webContents.send("remote-panels:focus", focus);
    return;
  }

  loadBounds();
  const size = SIZES[kind];
  const saved = remembered.get(kind);
  const place = saved && onScreen(saved) ? { x: saved.x, y: saved.y } : {};
  /*
   * The settings are a dialog, not a floating tool.
   *
   * The other three exist to be watched while the operator works somewhere else entirely, which
   * is what "above everything" is for. Settings are the opposite: they belong to this
   * application, they are finished with and closed, and a preferences window that floated over
   * a customer's video call would be a bug. So: a child of the main window, centred on it, and
   * above nothing else.
   */
  const dialog = isDialog(kind);
  const parent = dialog ? BrowserWindow.getAllWindows()[0] : undefined;
  /*
   * A dialog is sized against the window it belongs to, not against a guess.
   *
   * VS Code's is about four fifths of its window and centred on it; a fixed 980×720 is a
   * postage stamp on a large display and does not fit on a small one. Bounded so it stays a
   * dialog rather than becoming a second application window.
   */
  const room = parent && !parent.isDestroyed() ? parent.getContentBounds() : undefined;
  const dialogSize = room
    ? {
        width: Math.round(Math.max(880, Math.min(1320, room.width * 0.82))),
        height: Math.round(Math.max(620, Math.min(900, room.height * 0.84))),
      }
    : undefined;
  const window = new BrowserWindow({
    ...(dialog ? {} : place),
    ...(parent && !parent.isDestroyed() ? { parent } : {}),
    center: dialog,
    /* Its own chrome: the title sits on the left and the close on the right, as a dialog's do.
       The platform's frame would put the buttons on the other side on macOS. */
    frame: !dialog,
    ...(dialogSize ?? {}),
    width: dialogSize?.width ?? saved?.width ?? size.width,
    /* The status fits itself to its content, so a remembered height would be undone anyway. */
    height: dialogSize?.height ?? (kind === "status" ? size.height : (saved?.height ?? size.height)),
    minWidth: size.minWidth,
    minHeight: 220,
    show: false,
    title: titleFor(kind, hostName, dialog),
    alwaysOnTop: !dialog,
    // Above full-screen applications too: the machine being watched is usually being watched
    // *while* something else is full screen.
    fullscreenable: false,
    webPreferences: {
      preload: path.join(currentDirectory, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (!dialog) {
    window.setAlwaysOnTop(true, "floating");
    /*
     * `skipTransformProcessType`, or the application leaves the Dock.
     *
     * To let a window sit over a full-screen application, Electron switches the process to an
     * accessory type — and an accessory application has no Dock icon and no place in ⌘-Tab. So
     * opening the runs panel made the application vanish from the Dock while it was open. The window
     * still floats; the application stays an application.
     */
    window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
  }

  windows.set(key(kind, hostId), window);
  /*
   * Keep the title this window was given.
   *
   * One bundle serves every window, so its `<title>` is the application's name — and Electron
   * hands that to the window as soon as the page loads, which is why every panel used to be
   * called after the application instead of after what it is.
   */
  window.on("page-title-updated", (event) => event.preventDefault());
  window.once("ready-to-show", () => window.show());

  /* Remembered as it settles, not on close: a window that is never closed is still one the
     operator arranged. Debounced, because a drag is a hundred events. */
  let pending: NodeJS.Timeout | undefined;
  const remember = () => {
    if (dialog) return;
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => saveBounds(kind, window), 400);
  };
  window.on("resize", remember);
  window.on("move", remember);
  window.on("closed", () => {
    if (pending) clearTimeout(pending);
    if (windows.get(key(kind, hostId)) === window) windows.delete(key(kind, hostId));
    changed?.(hostId);
  });

  const hash = `#panel=${kind}:${encodeURIComponent(hostId)}${focus ? `:${encodeURIComponent(focus)}` : ""}`;
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}${hash}`);
  } else {
    void window.loadFile(path.join(currentDirectory, "../renderer/index.html"), {
      hash: hash.slice(1),
    });
  }
  changed?.(hostId);
}

/**
 * Shrink or grow a panel to the height of what is in it.
 *
 * Only the status asks: its content is a column of a known height, so a window taller than that
 * is empty space and a window shorter is a scroll bar over three gauges. The lists in the other
 * two fill whatever they are given, and resizing those under the operator would be rude.
 *
 * Clamped, and never wider: the operator's own resize is not undone, only the height that was
 * guessed before the numbers arrived.
 */
export function fitPanel(window: BrowserWindow, contentHeight: number) {
  const [width, height] = window.getContentSize();
  const wanted = Math.max(200, Math.min(900, Math.round(contentHeight)));
  if (Math.abs(wanted - height) <= 8) return;
  window.setContentSize(width, wanted);
}

export function closePanel(kind: PanelKind, hostId: string) {
  const window = windows.get(key(kind, hostId));
  if (window && !window.isDestroyed()) window.close();
  windows.delete(key(kind, hostId));
}

/** Which panels this host has open, for the buttons that opened them. */
export function openPanels(hostId: string): PanelKind[] {
  return (["status", "inventory", "files", "runs", "settings"] as PanelKind[]).filter((kind) => {
    const window = windows.get(key(kind, hostId));
    return Boolean(window && !window.isDestroyed());
  });
}

export function panelOpen(kind: PanelKind, hostId: string) {
  return openPanels(hostId).includes(kind);
}

/** Every panel of every host — on quit, and when a host is removed. */
export function closeAllPanels(hostId?: string) {
  for (const name of [...windows.keys()]) {
    const [kind, id] = [name.slice(0, name.indexOf(":")), name.slice(name.indexOf(":") + 1)];
    if (hostId && id !== hostId) continue;
    closePanel(kind as PanelKind, id);
  }
}
