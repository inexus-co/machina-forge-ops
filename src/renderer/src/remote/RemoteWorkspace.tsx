import { useCallback, useEffect, useRef, useState } from "react";
import { formatTime, LOCALES, t, type Translate } from "../../../shared/i18n";
import { changeLocale, useLocale, useT } from "../i18n";
import type {
  HostKeyQuestion,
  RemoteClipboard,
  RemoteHostState,
  RemoteScreenEvent,
} from "../../../shared/remote";
import { DEFAULT_RDP_PORT, DEFAULT_SSH_PORT } from "../../../shared/remote";
import { identityFor } from "../../../shared/wayIn";
import type { RemoteAgentRunState } from "../../../shared/remoteAgent";
import { LOCAL_AGENT_HOST } from "../../../shared/remoteAgent";
import type { Transfer } from "../../../shared/remoteFiles";
import type { PanelKind } from "../../../shared/remotePanels";
import { FLEET_HOST, SETTINGS_HOST } from "../../../shared/remotePanels";
import { HostForm } from "./HostForm";
import { RemoteAgentChat } from "./RemoteAgentChat";
import { RemoteScreen } from "./RemoteScreen";
import { CaretIcon, MenuButton } from "./SelectMenu";
import { Terminal } from "./Terminal";
import { startScreenCapture, type ScreenCapture } from "./screenCapture";
import { SwapLabel } from "./SwapLabel";
import { describeError, Toast } from "./Toast";

/** The three that open windows of their own, in the order they are worth consulting. */
/*
 * A function, not a constant: words read at import time would be the language the window opened
 * in, and would keep saying it after the operator switched.
 */
const panelList = (t: Translate): Array<{ kind: PanelKind; label: string; note: string }> => [
  { kind: "status", label: t("State"), note: t("CPU, memory, disk") },
  { kind: "inventory", label: t("Inventory"), note: t("Ports, services, cron, Docker, logs") },
  { kind: "karte", label: t("Logbook"), note: t("Notes, handovers, the facts the agent gets") },
  { kind: "files", label: t("Files"), note: t("To and from the server") },
  { kind: "runs", label: t("Records"), note: t("The commands run on this server, and what came back") },
];

/**
 * Remote maintenance.
 *
 * One customer's server is one row: its desktop over RDP and its shell over SSH, side by side,
 * in the window the operator is already in. The point of the mode is that these stopped being
 * three applications.
 *
 * Every host's pane stays mounted and is hidden with CSS, the same as the setting mode's target
 * panes: a terminal holds the scrollback of what was just typed and a canvas holds the last
 * frame, and unmounting throws both away every time somebody looks at another machine.
 */

type Pane = "screen" | "terminal" | "both" | "none";

export function RemoteWorkspace() {
  const t = useT();
  const locale = useLocale();
  const [hosts, setHosts] = useState<RemoteHostState[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [editing, setEditing] = useState<string | "new">();
  /*
   * Three things that can be on or off, not one choice among three.
   *
   * It was a segmented control — screen / session / both — with the agent as a separate toggle
   * beside it, which put three peers on two different footings and needed a word ("both") for
   * something that is just two of them being on. Each is its own switch now, remembered across
   * launches, and the last one on cannot be turned off: a window with nothing in it is not a
   * state anybody asked for.
   */
  const [screenOn, setScreenOn] = useState(
    () => window.localStorage.getItem("machina.remote.screen-open") !== "0",
  );
  const [sessionOn, setSessionOn] = useState(
    () => window.localStorage.getItem("machina.remote.session-open") !== "0",
  );
  /**
   * Which half is filling the workspace, if either.
   *
   * Separate from `pane`: that is a lasting preference for how the two are arranged, this is
   * "let me look at one of them properly for a moment". Escape puts it back.
   */
  const [full, setFull] = useState<"screen" | "terminal">();

  /*
   * Full screen means the window, not the work area.
   *
   * Asking for one half to fill the pane while the sidebar, this application's title row and the
   * desktop behind it all stayed put was not what anybody means by it while looking at a
   * customer's machine. The main process owns the window, so it is asked; and it says when the
   * state changes by any other route (the green button, ⌃⌘F, Escape), so the two cannot disagree.
   */
  useEffect(() => window.machina.remote.onFullScreen((on) => {
    if (!on) setFull(undefined);
  }), []);
  /** The sidebar folds away, as in the setting mode: the screen is the point and it wants width. */
  const [navOpen, setNavOpen] = useState(true);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  /**
   * Which screens have been asked for and have not painted yet.
   *
   * Opening one is not instant and none of the wait is ours: the helper's loop is running 25ms
   * after it starts, and everything after that is the far end authenticating and building a
   * session. Against the test container that is sixteen seconds, because it starts a whole
   * desktop per login inside an emulated architecture. Sixteen seconds of black with nothing
   * said is indistinguishable from broken.
   */
  const [connecting, setConnecting] = useState<string[]>([]);
  /**
   * The agent's column, and every host's run.
   *
   * Every host's state arrives whether or not its conversation is on screen, the same as the
   * setting mode: one subscription above, because a server waiting for an approval has to be able
   * to say so from a pane nobody is looking at.
   */
  const [agentOpen, setAgentOpen] = useState(
    () => window.localStorage.getItem("machina.remote.agent-open") !== "0",
  );
  /* What the split shows, for the stylesheet: both halves, one of them, or neither. */
  const pane: Pane = screenOn && sessionOn ? "both" : screenOn ? "screen" : sessionOn ? "terminal" : "none";
  /* B: the last one on stays on. Whichever it is, its own button is the one that cannot be off. */
  const only = [screenOn, sessionOn, agentOpen].filter(Boolean).length === 1;
  const [runStates, setRunStates] = useState<Record<string, RemoteAgentRunState>>({});
  /**
   * Whether the work area is wide enough for the status to stand beside it.
   *
   * Worked out rather than asked of CSS. What matters is the width of the work area, and that
   * depends on three things this component already knows — the window, whether the sidebar is
   * folded, and whether the agent's column is open. A media query sees only the first, and a
   * container query cannot change the layout of the element it is measuring.
   */
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  /** Bumped when the settings page saves, so every conversation re-reads what is now in force. */
  const [settingsSaved, setSettingsSaved] = useState(0);
  /**
   * How wide the conversation is, dragged by its edge and remembered.
   *
   * A fixed 400px was a guess about a window whose width the operator chooses. What is being
   * read on the left — a 16:9 desktop, or a terminal whose lines are a fixed width — decides how
   * much is worth giving away, and only the person looking at it knows that.
   *
   * The starting width is not a guess: it is what the bottom of the composer needs to show all of
   * itself — the two chips, the profile and model line, and the button that sends. At 400 the row
   * was 63px wider than its column, so the first thing an operator saw was a send button cut in
   * half. Dragged narrower than this the labels cut with an ellipsis, which is a choice the
   * operator has made; at the width it opens with, nothing is cut.
   */
  const [agentWidth, setAgentWidth] = useState(480);
  /** The application's own settings, on a screen of their own. */
  /** Past conversations with the selected server, and the one being read, if any. */
  /** Which terminal each host is showing. Per host, because each has its own set of them. */
  const [activeTab, setActiveTab] = useState<Record<string, string>>({});
  /**
   * Which floating panels each host has open.
   *
   * The windows belong to the main process, so this is a copy of what it says — including when
   * the operator closes one from its own title bar, which only that side hears about.
   */
  const [panels, setPanels] = useState<Record<string, PanelKind[]>>({});
  /*
   * Which terminals are attached to which server's conversation.
   *
   * Held here rather than in the chat because it is added from the terminal — the button is where
   * the thing being handed over is. The chat shows what is attached and can take it off again.
   */
  const [attachedPanes, setAttachedPanes] = useState<Record<string, string[]>>({});
  /*
   * Which servers are being recorded, and by what.
   *
   * Held here rather than in the screen pane because the recording outlives the pane's attention:
   * it keeps running while the operator looks at another server, and it has to be stopped when
   * the session closes, which is a thing this component learns.
   */
  const recorders = useRef<Map<string, ScreenCapture>>(new Map());
  const canvases = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const [recording, setRecording] = useState<Record<string, number>>({});
  /** Kept for the files button's mark: a transfer runs whether or not its window is open. */
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  /** A server whose key nobody has seen before, waiting to be looked at. */
  const [hostKey, setHostKey] = useState<HostKeyQuestion>();

  /** Writers handed up by each pane, so output does not re-render the tree. */
  const writers = useRef(new Map<string, (chunk: string) => void>());
  const clears = useRef(new Map<string, () => void>());
  const painters = useRef(new Map<string, (event: RemoteScreenEvent) => void>());

  useEffect(() => {
    let offChanged: (() => void) | undefined;
    let offData: (() => void) | undefined;
    let offClosed: (() => void) | undefined;
    let offScreen: (() => void) | undefined;
    let offAgent: (() => void) | undefined;
    let offFiles: (() => void) | undefined;
    let offKey: (() => void) | undefined;
    let offChanged2: (() => void) | undefined;
    try {
      offKey = window.machina.remote.onHostKeyQuestion(setHostKey);
      offChanged2 = window.machina.remote.onHostKeyChanged((change) =>
        setError(
          t(
            "The key at {where} is not the one recorded. Unless you rebuilt it, do not connect. Recorded {expected} / now {found}",
            {
              where: `${change.host}:${change.port}`,
              expected: change.expected,
              found: change.found,
            },
          ),
        ),
      );
      offFiles = window.machina.remoteFiles.onTransfer((transfer) =>
        setTransfers((current) => [
          ...current.filter((each) => each.id !== transfer.id),
          transfer,
        ].slice(-8)),
      );
      offAgent = window.machina.remoteAgent.onState((id, state) =>
        setRunStates((current) => ({ ...current, [id]: state })),
      );
      offChanged = window.machina.remote.onChanged(setHosts);
      offData = window.machina.remote.onSshData((_id, sessionId, chunk) =>
        writers.current.get(sessionId)?.(chunk),
      );
      offClosed = window.machina.remote.onSshClosed((_id, sessionId, detail) => {
        writers.current
          .get(sessionId)
          ?.(`\r\n\x1b[33m— ${t("Disconnected")}${detail ? `：${detail}` : ""}\x1b[0m\r\n`);
      });
      offScreen = window.machina.remote.onScreen((id, event) => {
        painters.current.get(id)?.(event);
        // The first thing to arrive ends the wait, whether it is a picture or a failure.
        setConnecting((current) => current.filter((each) => each !== id));
        if (event.kind === "closed" && event.detail) setError(event.detail);
      });
    } catch (cause) {
      setError(describeError(cause));
    }
    void (async () => {
      try {
        setHosts(await window.machina.remote.list());
      } catch (cause) {
        setError(describeError(cause));
      }
    })();
    return () => {
      offChanged?.();
      offData?.();
      offClosed?.();
      offScreen?.();
      offAgent?.();
      offFiles?.();
      offKey?.();
      offChanged2?.();
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem("machina.remote.agent-open", agentOpen ? "1" : "0");
  }, [agentOpen]);

  useEffect(() => {
    window.localStorage.setItem("machina.remote.screen-open", screenOn ? "1" : "0");
    window.localStorage.setItem("machina.remote.session-open", sessionOn ? "1" : "0");
  }, [screenOn, sessionOn]);

  /* Read once from the main process, which is the only side that can promise it was written. */
  useEffect(() => {
    void window.machina.remote
      .uiState()
      .then((state) => {
        const stored = Number(state["agentWidth"]);
        if (Number.isFinite(stored) && stored > 0) setAgentWidth(stored);
      })
      .catch(() => undefined);
  }, []);

  /* Written when the drag ends, not on every pixel of it. */
  const rememberAgentWidth = (width: number) => {
    void window.machina.remote.setUiState({ agentWidth: width }).catch(() => undefined);
  };



  /*
   * What the main process says is open, and what it says has changed.
   *
   * Both are needed: `list` for the buttons to be right when a server is selected, and the
   * subscription for when a window is closed from its own title bar — the button that opened it
   * would otherwise stay lit over a window that no longer exists.
   */
  useEffect(
    () =>
      window.machina.remotePanels.onChange((hostId, open) =>
        setPanels((current) => ({ ...current, [hostId]: open })),
      ),
    [],
  );

  useEffect(() => {
    if (!selectedId) return;
    void window.machina.remotePanels
      .list(selectedId)
      .then((open) => setPanels((current) => ({ ...current, [selectedId]: open })))
      .catch(() => undefined);
  }, [selectedId]);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /*
   * Terminals an earlier run left on this machine.
   *
   * Attaching costs nothing — the connection is already open — so they are restored rather than
   * offered. Once per host: `recoverable` empties as each is taken.
   */
  const recovered = useRef(new Set<string>());
  useEffect(() => {
    for (const host of hosts) {
      for (const name of host.recoverable) {
        if (recovered.current.has(name)) continue;
        recovered.current.add(name);
        void window.machina.remote
          .sshOpen(host.id, name)
          .then((opened) => setActiveTab((current) => ({ ...current, [host.id]: opened })))
          .catch(() => undefined);
      }
    }
  }, [hosts]);

  /*
   * Pick up a run that was already going.
   *
   * State is pushed as it changes, so a host whose conversation has not moved since this window
   * was opened would otherwise show an empty transcript over a run in progress.
   */
  useEffect(() => {
    for (const host of hosts) {
      if (runStates[host.id]) continue;
      void window.machina.remoteAgent
        .getState(host.id)
        .then((state) => {
          if (state) setRunStates((current) => ({ ...current, [host.id]: state }));
        })
        .catch(() => undefined);
    }
    // Only when the list changes: a state arriving is what fills the map, not a reason to re-ask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hosts]);

  /**
   * Whether the form on screen was opened by this component rather than by the operator.
   *
   * Only used to close it again: a form that opened itself has to get out of the way the moment
   * a server exists, or it sits over the panes and the screen behind it is unreachable.
   */
  const autoOpened = useRef(false);

  // Follow the list: the first host on launch, a neighbour when the selected one is removed.
  useEffect(() => {
    if (hosts.length === 0) {
      /*
       * An empty list is not a reason to open a form.
       *
       * A first launch used to land on twelve empty fields asking for a customer's address and
       * password, before anything had said what this is or let the model be set up. The empty
       * state says both things and offers both doors.
       */
      setSelectedId(undefined);
      return;
    }
    setSelectedId((current) =>
      current && hosts.some((each) => each.id === current) ? current : hosts[0].id,
    );
    if (autoOpened.current) {
      autoOpened.current = false;
      setEditing(undefined);
    }
  }, [hosts]);

  /** Into full screen with one half, or back out of it. Both halves' buttons come here. */
  const enterFull = (which: "screen" | "terminal") => {
    const next = full === which ? undefined : which;
    setFull(next);
    void window.machina.remote.setFullScreen(Boolean(next)).catch(() => undefined);
  };

  useEffect(() => {
    if (!full) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setFull(undefined);
      void window.machina.remote.setFullScreen(false).catch(() => undefined);
    };
    // Capture: the screen forwards keys to the far end, and this one is ours.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [full]);

  /**
   * The terminal on screen for a host.
   *
   * Falls back to the first one rather than to nothing: a tab that was closed, or a session
   * opened from somewhere else, must not leave the half blank with tabs above it.
   */
  const tabOf = (host: RemoteHostState) => {
    const chosen = activeTab[host.id];
    return chosen && host.sshSessions.some((each) => each.id === chosen)
      ? chosen
      : host.sshSessions[0]?.id;
  };

  /** The model, the allowlists and the known keys — one window, belonging to no server. */
  const openAgentSettings = () => {
    void window.machina.remotePanels
      .open("settings", SETTINGS_HOST)
      .catch((cause) => setError(describeError(cause)));
  };

  /** One goal across many servers — its own window, belonging to no single host. */
  const openFleet = () => {
    void window.machina.remotePanels
      .open("fleet", FLEET_HOST)
      .catch((cause) => setError(describeError(cause)));
  };

  /**
   * What was asked for, and what fits.
   *
   * Kept apart on purpose. The window is narrow for a moment while it opens, and clamping the
   * stored width against *that* width — then writing the result back — is how a conversation
   * dragged to 848px came back as 616 every time. The preference is remembered as asked; what is
   * rendered is that preference cut down to whatever the window can currently give it.
   */
  const shownAgentWidth = clampAgentWidth(agentWidth, windowWidth);

  /*
   * Recording: started by hand, stopped by hand or by the session going away.
   *
   * The elapsed second is kept in state so the header can count; the recorder itself is a ref,
   * because it must not be recreated by a render and must survive looking at another server.
   */
  const stopRecording = useCallback(async (hostId: string, note?: string) => {
    const recorder = recorders.current.get(hostId);
    if (!recorder) return;
    recorders.current.delete(hostId);
    setRecording((current) => {
      const next = { ...current };
      delete next[hostId];
      return next;
    });
    try {
      await recorder.stop(note);
    } catch (cause) {
      setError(describeError(cause));
    }
  }, []);

  const beginRecording = useCallback(
    async (hostId: string) => {
      const source = canvases.current.get(hostId);
      if (!source) {
        setError(t("This screen is not up yet. Connect first, then record."));
        return;
      }
      try {
        const recorder = await startScreenCapture({
          hostId,
          source,
          onEnded: (note) => {
            void stopRecording(hostId, note);
            if (note) setError(note);
          },
        });
        recorders.current.set(hostId, recorder);
        setRecording((current) => ({ ...current, [hostId]: 0 }));
      } catch (cause) {
        setError(describeError(cause));
      }
    },
    [stopRecording],
  );

  /* One tick for every recording, so the header counts without each pane holding a timer. */
  useEffect(() => {
    if (Object.keys(recording).length === 0) return;
    const timer = window.setInterval(() => {
      setRecording((current) => {
        const next: Record<string, number> = {};
        for (const hostId of Object.keys(current)) {
          next[hostId] = recorders.current.get(hostId)?.elapsed() ?? current[hostId];
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  /*
   * A recording of a screen that is no longer connected is over.
   *
   * Stopped here rather than in the screen pane: what ends it is the session, and the session's
   * state arrives on this component. What was recorded up to that moment is kept.
   */
  useEffect(() => {
    for (const hostId of Object.keys(recording)) {
      const host = hosts.find((each) => each.id === hostId);
      if (host && !host.rdpOpen && !host.vncOpen)
        void stopRecording(hostId, t("Stopped, because the connection went away."));
    }
  }, [hosts, recording, stopRecording]);

  /** Open one of the floating panels, or close it if this button already opened it. */
  const togglePanel = (kind: PanelKind) => {
    if (!selectedId) return;
    const open = (panels[selectedId] ?? []).includes(kind);
    const api = window.machina.remotePanels;
    void (open ? api.close(kind, selectedId) : api.open(kind, selectedId))
      .then((next) => setPanels((current) => ({ ...current, [selectedId]: next })))
      .catch((cause) => setError(describeError(cause)));
  };

  const selected = hosts.find((each) => each.id === selectedId);
  const liveRun = selectedId ? runStates[selectedId] : undefined;

  const act = useCallback(async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await task();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div
      className={[
        "app remote-app",
        navOpen && !full ? "" : "nav-collapsed",
        /* Nothing of this application's own is worth a row of a customer's desktop. */
        full ? "showing-full" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {error && <Toast message={error} onDismiss={() => setError(undefined)} />}

      {/* Over the window, not instead of it: the panes underneath stay mounted, so opening
          settings costs neither the screen nor the terminal. */}

      {/*
        A server nobody has met.

        Over everything, because nothing else can proceed until it is answered — the connection
        is waiting on this. The fingerprint is shown in the form `ssh-keygen -l` prints so it can
        be compared with what the server's owner said, character for character.
      */}
      {hostKey && (
        <div className="field-dialog-scrim" role="presentation">
          <div
            aria-label={t("Checking the server's key")}
            aria-modal
            className="field-dialog host-key-dialog"
            role="dialog"
          >
            <header className="field-dialog-head">
              <span>{t("Connecting to {where} for the first time", { where: `${hostKey.host}:${hostKey.port}` })}</span>
            </header>

            <div className="field-dialog-body">
              <p className="login-step">
                {t("This server's key is not known yet. Now is the only moment you can tell whether the other end really is this server.")}
              </p>
              <code className="host-key-print">{hostKey.fingerprint}</code>
              <small className="host-key-algorithm">{hostKey.algorithm}</small>
            </div>

            <footer className="field-dialog-foot">
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  void window.machina.remote.answerHostKey(hostKey.id, false);
                  setHostKey(undefined);
                }}
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  void window.machina.remote.answerHostKey(hostKey.id, true);
                  setHostKey(undefined);
                }}
              >
                {t("Trust it and connect")}
              </button>
            </footer>
          </div>
        </div>
      )}



      <aside>
        <div className="sidebar-bar">
          <button
            aria-label={t("Close the menu")}
            className="icon-button"
            type="button"
            onClick={() => setNavOpen(false)}
          >
            <PanelIcon />
          </button>
        </div>

        <nav aria-label={t("Servers")} className="target-list">
          <p>{t("Servers")}</p>
          {hosts.map((host) => (
            <button
              className={host.id === selectedId ? "active" : undefined}
              key={host.id}
              title={`${host.name}\n${describeEndpoints(host)}`}
              type="button"
              onClick={() => {
                setSelectedId(host.id);
                setEditing(undefined);
              }}
            >
              {/* Fixed slot: opening a session must not move the row under the pointer. */}
              <span
                aria-hidden
                className={
                  host.rdpOpen || host.vncOpen || host.sshSessions.length > 0
                    ? "target-mark on"
                    : "target-mark"
                }
              >
                {host.rdpOpen || host.vncOpen || host.sshSessions.length > 0 ? "●" : "○"}
              </span>
              <span className="target-name">{host.name}</span>
              <small>{sessionLabel(host)}</small>
            </button>
          ))}
          <button
            className={editing === "new" ? "add active" : "add"}
            type="button"
            onClick={() => setEditing("new")}
          >
            <span>
              <span aria-hidden className="add-mark">
                +
              </span>
              {t("Add a server")}
            </span>
          </button>
        </nav>

      </aside>

      <div className="content">
        <div className="titlebar">
          {/* The way back. The toggle that folded the sidebar went with it. */}
          {!navOpen && (
            <button
              aria-label={t("Open the menu")}
              className="icon-button"
              type="button"
              onClick={() => setNavOpen(true)}
            >
              <PanelIcon />
            </button>
          )}
          <span className="titlebar-title">{selected?.name ?? t("Remote maintenance")}</span>
          <div className="titlebar-right">
            {/*
              Three levels, and they used to be seven identical chips.

              What is *in* the window is one choice among three, so it is one control with three
              parts. The agent is a column beside that work, so it is a toggle. The status, the
              inventory and the files are not the work at all — they are consulted, in windows of
              their own that float above whatever you are doing — so they are marked as opening a
              window and lit while theirs is open. This server's own settings are a fourth thing
              again, and stand alone at the end.
            */}
            <div aria-label={t("Show")} className="titlebar-panes" role="group">
              <button
                aria-pressed={screenOn}
                className={`panel-toggle ${screenOn ? "active" : ""}`}
                disabled={screenOn && only}
                title={t("Show or hide the screen")}
                type="button"
                onClick={() => setScreenOn(!screenOn)}
              >
                <ScreenIcon />
                <span>{t("Screen")}</span>
              </button>
              <button
                aria-pressed={sessionOn}
                className={`panel-toggle ${sessionOn ? "active" : ""}`}
                disabled={sessionOn && only}
                title={t("Show or hide the session")}
                type="button"
                onClick={() => setSessionOn(!sessionOn)}
              >
                <SessionIcon />
                <span>{t("Session")}</span>
              </button>
              <button
                aria-pressed={agentOpen}
                className={`panel-toggle ${agentOpen ? "active" : ""}`}
                disabled={agentOpen && only}
                title={t("Show or hide the agent's column")}
                type="button"
                onClick={() => setAgentOpen(!agentOpen)}
              >
                <ColumnIcon />
                <span>Agent</span>
                {selectedId && runStates[selectedId]?.pending && <small>1</small>}
              </button>
            </div>

            <span className="titlebar-gap" />

            {panelList(t).map((panel) => {
              const open = (selectedId ? (panels[selectedId] ?? []) : []).includes(panel.kind);
              return (
                <button
                  aria-pressed={open}
                  className={`window-open ${open ? "active" : ""}`}
                  disabled={!selectedId}
                  key={panel.kind}
                  title={t("{note} (opens in its own window)", { note: panel.note })}
                  type="button"
                  onClick={() => togglePanel(panel.kind)}
                >
                  <span>{panel.label}</span>
                  {panel.kind === "files" &&
                    transfers.some((each) => each.state === "running") && <small>…</small>}
                  <PopOutIcon />
                </button>
              );
            })}

            <span className="titlebar-gap" />

            {/*
              * Two settings, and only one of them belongs to a server.
              *
              * The model, the allowlists and the skills are the application's, and until now the
              * only way in was the gear inside a conversation — so a fresh installation with no
              * server yet could not be configured at all. It sits here, never disabled, beside
              * the one that does belong to the server in front of you.
              */}
            {/*
              * The language, one press from the work.
              *
              * It was only inside the settings window at first, at the bottom of a rail behind an
              * icon labelled "Agent settings" — two levels down, in the one place an operator who
              * cannot read the current language will not think to look. A display preference
              * belongs in the row you can see, beside the other things about this window.
              */}
            <MenuButton
              align="right"
              kind="icon"
              label={<GlobeIcon />}
              title={LOCALES.map((entry) => entry.name).join(" / ")}
            >
              {(close) => (
                <>
                  {LOCALES.map((entry) => (
                    <button
                      aria-checked={entry.id === locale}
                      key={entry.id}
                      role="menuitemradio"
                      type="button"
                      onClick={() => {
                        void changeLocale(entry.id).catch((cause) => setError(describeError(cause)));
                        close();
                      }}
                    >
                      {/* Fixed width, so the tick moving does not move the names. */}
                      <span className="menu-check">{entry.id === locale ? "✓" : ""}</span>
                      <span className="menu-label">{entry.name}</span>
                    </button>
                  ))}
                </>
              )}
            </MenuButton>

            <button
              aria-label={t("Agent settings")}
              className="icon-button"
              title={t("Agent settings (model, commands, skills)")}
              type="button"
              onClick={openAgentSettings}
            >
              <AgentGearIcon />
            </button>

            <button
              aria-label={t("Run across servers")}
              className="icon-button"
              disabled={hosts.length === 0}
              title={t("Run across servers (the same goal on several)")}
              type="button"
              onClick={openFleet}
            >
              <FleetIcon />
            </button>

            <button
              aria-label={t("This server's settings")}
              className={`icon-button ${editing ? "active" : ""}`}
              disabled={hosts.length === 0}
              title={t("This server's settings")}
              type="button"
              onClick={() => setEditing((current) => (current ? undefined : selectedId ?? "new"))}
            >
              <ServerGearIcon />
            </button>
          </div>
        </div>

        <section className="workspace remote">
          {/*
            Every host mounted, all but one hidden. The terminal holds the scrollback and the
            canvas holds the last frame; unmounting would drop both on every switch.
          */}
          {hosts.map((host) => {
            /* The form is a dialog now, so the work stays where it was — behind it. */
            const shown = host.id === selectedId;
            /*
             * The screen(s) this host offers — RDP, VNC, or both.
             *
             * When a host has both, the connect control is a menu: the operator picks which to
             * open. Whichever is open is the one the pane draws and the input drives, and the
             * events come out keyed only by host id, so the canvas never learns which answered.
             */
            const remote = window.machina.remote;
            const makeScreen = (
              kind: "rdp" | "vnc",
              label: string,
              shost: string,
              sport: number,
            ) => ({
              kind,
              label,
              host: shost,
              port: sport,
              connected: kind === "rdp" ? host.rdpOpen : host.vncOpen,
              connect: () =>
                kind === "rdp" ? remote.rdpOpen(host.id, 1280, 800) : remote.vncOpen(host.id),
              close: () => (kind === "rdp" ? remote.rdpClose(host.id) : remote.vncClose(host.id)),
              repaint: () =>
                void (kind === "rdp"
                  ? remote.rdpRepaint(host.id)
                  : remote.vncRepaint(host.id)
                ).catch(() => undefined),
              mouse: (x: number, y: number, b: number) =>
                kind === "rdp"
                  ? remote.rdpMouse(host.id, x, y, b)
                  : remote.vncMouse(host.id, x, y, b),
              wheel: (x: number, y: number, n: number) =>
                kind === "rdp"
                  ? remote.rdpWheel(host.id, x, y, n)
                  : remote.vncWheel(host.id, x, y, n),
              key: (c: number, d: boolean) =>
                kind === "rdp" ? remote.rdpKey(host.id, c, d) : remote.vncKey(host.id, c, d),
            });
            const screens: ReturnType<typeof makeScreen>[] = [];
            if (host.rdp) screens.push(makeScreen("rdp", "RDP", host.rdp.host, host.rdp.port));
            if (host.vnc) screens.push(makeScreen("vnc", "VNC", host.vnc.host, host.vnc.port));
            const openScreen = screens.find((s) => s.connected);
            const primary = openScreen ?? screens[0];
            const connectTo = (s: ReturnType<typeof makeScreen>) =>
              void act(async () => {
                setConnecting((c) => [...c, host.id]);
                try {
                  return await s.connect();
                } catch (cause) {
                  setConnecting((c) => c.filter((each) => each !== host.id));
                  throw cause;
                }
              });
            const disconnectScreen = () =>
              void act(async () => {
                setConnecting((c) => c.filter((each) => each !== host.id));
                if (openScreen) return await openScreen.close();
              });
            return (
              <div
                className={shown ? "remote-pane" : "remote-pane screen-hidden"}
                key={host.id}
              >
                {/* The agent's column goes away while a half is filling the workspace: that is
                    what "let me look at this properly" asked for. */}
                <div
                  className={
                    agentOpen && !full ? "remote-body with-agent" : "remote-body"
                  }
                  /* The conversation is as wide as the operator dragged it to be. */
                  style={
                    agentOpen && !full
                      ? { gridTemplateColumns: `minmax(0, 1fr) 12px ${shownAgentWidth}px` }
                      : undefined
                  }
                >
                {/*
                  The work, and only the work.

                  The status, the inventory and the file list used to be here, covering the panes
                  or standing beside them; each of those arrangements took something from the
                  screen this window exists to show. They are windows now — see
                  `main/remote/panels/window.ts` — so what is left is the picture, the shell and
                  the agent, which is what the operator came for.
                */}
                <div className="remote-work">
                <div className={`remote-split pane-${pane} ${full ? `full-${full}` : ""}`}>
                  {primary && (
                    /* Named, not counted: see the note beside the rules in the stylesheet. */
                    <div className="remote-half screen">
                      <div className="remote-half-bar">
                        <span>
                          {openScreen
                            ? `${openScreen.host}:${openScreen.port}`
                            : screens.length > 1
                              ? screens.map((s) => s.label).join(" / ")
                              : `${primary.host}:${primary.port}`}
                        </span>
                        <span className="remote-half-actions">
                          <button
                            className="quiet"
                            type="button"
                            onClick={() => enterFull("screen")}
                          >
                            {full === "screen" ? t("Leave full screen") : t("Full screen")}
                          </button>
                          {/*
                            Recording, where the screen is.

                            Only while there is a connection: a recording of "not connected"
                            is a file of nothing. The elapsed time sits in the button so the fact
                            that it is still running cannot be missed.
                          */}
                          {openScreen && (
                            <button
                              aria-pressed={recording[host.id] !== undefined}
                              className="quiet screen-capture-button"
                              type="button"
                              onClick={() =>
                                void (recording[host.id] !== undefined
                                  ? stopRecording(host.id)
                                  : beginRecording(host.id))
                              }
                            >
                              <SwapLabel
                                active={recording[host.id] !== undefined}
                                off={
                                  <span className="with-icon">
                                    <RecordDot />
                                    {t("Record")}
                                  </span>
                                }
                                on={
                                  <span className="with-icon">
                                    <RecordDot live />
                                    {t("Recording {clock}", { clock: clockOf(recording[host.id] ?? 0) })}
                                  </span>
                                }
                              />
                            </button>
                          )}
                          {/* Copy and paste, where the screen is. Only while one is open: there
                              is nothing to offer a server that is not there. */}
                          {openScreen && <ClipboardButton hostId={host.id} />}
                          {/* What the button does to the server, not to this panel: opening and
                              closing a "screen" said nothing about a connection being made and
                              dropped. When a host has both RDP and VNC, connect is a menu — the
                              operator picks which screen to open. */}
                          {openScreen ? (
                            <button
                              className="quiet"
                              disabled={busy}
                              type="button"
                              onClick={() => disconnectScreen()}
                            >
                              {t("Disconnect")}
                            </button>
                          ) : screens.length > 1 ? (
                            <MenuButton
                              label={
                                <span className="with-icon">
                                  {t("Connect")}
                                  <CaretIcon />
                                </span>
                              }
                              title={t("Which screen to connect with")}
                            >
                              {(close) => (
                                <>
                                  {screens.map((s) => (
                                    <button
                                      key={s.kind}
                                      /* One connection at a time: the main process refuses the
                                         second screen, and a menu that invites it is a menu that
                                         hands out error messages. */
                                      disabled={busy || connecting.includes(host.id)}
                                      type="button"
                                      onClick={() => {
                                        connectTo(s);
                                        close();
                                      }}
                                    >
                                      {t("Connect with {label}", { label: s.label })}
                                      <span className="menu-note">{`${s.host}:${s.port}`}</span>
                                    </button>
                                  ))}
                                </>
                              )}
                            </MenuButton>
                          ) : (
                            <button
                              className="quiet"
                              disabled={busy}
                              type="button"
                              onClick={() => connectTo(screens[0])}
                            >
                              {t("Connect")}
                            </button>
                          )}
                        </span>
                      </div>
                      <div
                        className={
                          recording[host.id] !== undefined
                            ? "remote-screen-fit screen-capture-live"
                            : "remote-screen-fit"
                        }
                      >
                        {/*
                          * Disconnected says so, in the place the desktop was.
                          *
                          * Pressing disconnect left the last frame on screen, so the only way to
                          * know whether this window was still attached to a customer's machine
                          * was to read the button. A picture of a desktop is a claim that the
                          * desktop is there.
                          */}
                        {!openScreen && !connecting.includes(host.id) && (
                          <div className="remote-waiting">
                            <strong>{t("Not connected")}</strong>
                            <small>{t("Press Connect and the screen appears here.")}</small>
                          </div>
                        )}
                        {connecting.includes(host.id) && (
                          <div className="remote-waiting">
                            <span className="spinner" />
                            <strong>{t("Connecting…")}</strong>
                            {/* Said because the wait is the server's, not ours, and a person
                                waiting deserves to know which. */}
                            <small>
                              {t("Signing in and building the screen takes the far end a few seconds, sometimes longer.")}
                            </small>
                          </div>
                        )}
                        <RemoteScreen
                          hostId={host.id}
                          repaint={() => openScreen?.repaint()}
                          onKey={(code, down) => openScreen?.key(code, down)}
                          onMouse={(x, y, buttons) => openScreen?.mouse(x, y, buttons)}
                          onWheel={(x, y, notches) => openScreen?.wheel(x, y, notches)}
                          register={(paint) => painters.current.set(host.id, paint)}
                          /* Kept so a recording can read the same bitmap the operator is watching. */
                          registerCanvas={(node) => {
                            if (node) canvases.current.set(host.id, node);
                            else canvases.current.delete(host.id);
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {host.ssh && (
                    <div className="remote-half terminal">
                      <div className="remote-half-bar">
                        <span>{addressOf(host)}</span>
                        <span className="remote-half-actions">
                          <button
                            className="quiet"
                            type="button"
                            onClick={() => enterFull("terminal")}
                          >
                            {full === "terminal" ? t("Leave full screen") : t("Full screen")}
                          </button>
                          {/*
                            Hand the terminal being looked at to the conversation beside it.

                            Here rather than on the tab: a tab is a name and a close button, and a
                            third control on it made the row unreadable. Here it is next to "open a
                            session", which is the other thing this header does to terminals.
                          */}
                          {host.sshSessions.length > 0 && (
                            <button
                              aria-pressed={(attachedPanes[host.id] ?? []).includes(tabOf(host) ?? "")}
                              className="quiet"
                              title={t("Hands the agent the session you are looking at (this is what gets sent)")}
                              type="button"
                              onClick={() => {
                                const session = tabOf(host);
                                if (!session) return;
                                setAttachedPanes((current) => {
                                  const now = current[host.id] ?? [];
                                  return {
                                    ...current,
                                    [host.id]: now.includes(session)
                                      ? now.filter((each) => each !== session)
                                      : [...now, session],
                                  };
                                });
                              }}
                            >
                              {(attachedPanes[host.id] ?? []).includes(tabOf(host) ?? "")
                                ? t("Handed to the chat")
                                : t("Hand to the chat")}
                            </button>
                          )}
                          <button
                            className="quiet"
                            disabled={busy}
                            type="button"
                            onClick={() =>
                              void act(async () => {
                                const opened = await window.machina.remote.sshOpen(host.id);
                                setActiveTab((current) => ({ ...current, [host.id]: opened }));
                              })
                            }
                          >
                            {t("+ Open a session")}
                          </button>
                        </span>
                      </div>

                      {/*
                        The tabs.

                        Above the terminal rather than beside it, because a terminal is as wide as
                        it can be and a column of tabs would take that width from every one of
                        them. Closed sessions keep their tab until somebody closes it: what is on
                        screen is the last thing the server said, which is usually why it ended.
                      */}
                      {host.sshSessions.length > 0 && (
                        <div className="terminal-tabs" role="tablist">
                          {host.sshSessions.map((session) => (
                            <span
                              className={
                                session.id === tabOf(host) ? "terminal-tab active" : "terminal-tab"
                              }
                              key={session.id}
                            >
                              <button
                                aria-selected={session.id === tabOf(host)}
                                role="tab"
                                type="button"
                                onClick={() =>
                                  setActiveTab((current) => ({
                                    ...current,
                                    [host.id]: session.id,
                                  }))
                                }
                              >
                                {session.title}
                              </button>
                              <button
                                aria-label={t("Close {title}", { title: session.title })}
                                className="terminal-tab-close"
                                type="button"
                                onClick={() =>
                                  void act(() =>
                                    window.machina.remote.sshClose(host.id, session.id),
                                  )
                                }
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      {host.sshSessions.length === 0 && (
                        <div className="terminal-empty">
                          <p>{t("No session is open.")}</p>
                        </div>
                      )}

                      {/* All mounted, all but one hidden: a terminal holds its scrollback, and
                          switching tabs must not throw away what was just read. */}
                      {host.sshSessions.map((session) => (
                        <div
                          className={
                            session.id === tabOf(host) ? "terminal-slot" : "terminal-slot screen-hidden"
                          }
                          key={session.id}
                        >
                          <Terminal
                            hostId={`${host.id}:${session.id}`}
                            onData={(data) =>
                              void window.machina.remote
                                .sshWrite(host.id, session.id, data)
                                .catch(() => undefined)
                            }
                            onResize={(cols, rows) =>
                              void window.machina.remote
                                .sshResize(host.id, session.id, cols, rows)
                                .catch(() => undefined)
                            }
                            register={(write, clear) => {
                              writers.current.set(session.id, write);
                              clears.current.set(session.id, clear);
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/*
                    The session pane, for a server that has no session to show.

                    Choosing "session" on a server with no SSH left the pane blank — the half
                    is only drawn when `host.ssh` exists, so the operator got a white rectangle
                    and no idea whether it was broken or empty.
                  */}
                  {!host.ssh && (host.rdp || host.vnc) && pane !== "screen" && (
                    <div className="remote-half terminal">
                      <div className="terminal-empty">
                        <p>
                          {t("No SSH is set up for this server.")}
                          <br />
                          {t("A session for typing commands becomes available once SSH is filled in.")}
                        </p>
                        <p className="terminal-empty-note">
                          {t("The screen is already set up and usable now. An agent that looks at the screen and works it will run too.")}
                        </p>
                        <button type="button" onClick={() => setEditing(host.id)}>
                          {t("Open the connection settings")}
                        </button>
                      </div>
                    </div>
                  )}

                  {!host.rdp && !host.vnc && !host.ssh && (
                    <div className="chat-notice">
                      <div>
                        <strong>{t("Nothing to connect to has been set.")}</strong>
                        <span>{t("Fill in a screen (RDP or VNC) or SSH under the connection settings.")}</span>
                      </div>
                    </div>
                  )}
                </div>

                </div>

                {agentOpen && !full && (
                  <div
                    aria-label={t("Width of the chat")}
                    aria-orientation="vertical"
                    aria-valuenow={shownAgentWidth}
                    className="agent-resizer"
                    role="separator"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      /* Reachable without a pointer: the arrow keys move it 16px at a time. */
                      const step =
                        event.key === "ArrowLeft" ? 16 : event.key === "ArrowRight" ? -16 : 0;
                      if (!step) return;
                      event.preventDefault();
                      const next = clampAgentWidth(shownAgentWidth + step, window.innerWidth);
                      setAgentWidth(next);
                      rememberAgentWidth(next);
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      const handle = event.currentTarget;
                      handle.setPointerCapture(event.pointerId);
                      const startX = event.clientX;
                      const startWidth = shownAgentWidth;
                      let last = startWidth;
                      const move = (moved: PointerEvent) => {
                        last = clampAgentWidth(startWidth + (startX - moved.clientX), window.innerWidth);
                        setAgentWidth(last);
                      };
                      const done = () => {
                        rememberAgentWidth(last);
                        /* A pointer drag leaves nothing behind: the handle keeps keyboard focus
                           otherwise, and its focus mark is a full-height bar that reads exactly
                           like a scroll bar somebody forgot to remove. */
                        handle.blur();
                        handle.removeEventListener("pointermove", move);
                        handle.removeEventListener("pointerup", done);
                        handle.removeEventListener("pointercancel", done);
                      };
                      handle.addEventListener("pointermove", move);
                      handle.addEventListener("pointerup", done);
                      handle.addEventListener("pointercancel", done);
                    }}
                  />
                )}

                {agentOpen && !full && (
                  <aside className="remote-agent">
                    {/* One component. What it shows — this conversation, the list of past ones,
                        or one of those being read — is its own business, the way a chat panel in
                        an editor keeps its own history rather than putting it in the file tree. */}
                    <RemoteAgentChat
                      hasScreen={Boolean(host.rdp || host.vnc)}
                      hasSsh={Boolean(host.ssh)}
                      hostId={host.id}
                      /* The open terminals, and which of them this message carries. */
                      attached={attachedPanes[host.id] ?? []}
                      onAttached={(next) =>
                        setAttachedPanes((current) => ({ ...current, [host.id]: next }))
                      }
                      terminals={host.sshSessions}
                      onError={setError}
                      onOpenHostSettings={() => setEditing(host.id)}
                      onOpenSettings={openAgentSettings}
                      reloadKey={settingsSaved}
                      state={runStates[host.id]}
                    />
                  </aside>
                )}

                </div>
              </div>
            );
          })}

          {/*
            One settings page, two scopes, said in the headings.

            The server being edited, and then the agent — which belongs to all of them. They are
            together because this is the page somebody opens when they are looking for a setting,
            and a model configured from inside one server's conversation was both hard to find
            and easy to mistake for that server's.
          */}
          {/*
            * A server's settings as a dialog, over the work rather than instead of it.
            *
            * It used to replace the whole content area: pressing "add a server" took the screen
            * and the terminal away, and a form asking for an address gave no hint of what it was
            * in front of. The same shell every other dialog here uses — scrim, header, ✕.
            */}
          {editing && (
            <div
              className="field-dialog-scrim"
              role="presentation"
              onClick={() => setEditing(undefined)}
            >
              <div
                aria-label={editing === "new" ? t("Add a server") : t("This server's settings")}
                aria-modal
                className="field-dialog host-dialog"
                role="dialog"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="field-dialog-head">
                  <span>
                    {editing === "new"
                      ? t("Add a server")
                      : (hosts.find((each) => each.id === editing)?.name ?? t("Server settings"))}
                  </span>
                  <button
                    aria-label={t("Close")}
                    className="field-dialog-close"
                    type="button"
                    onClick={() => setEditing(undefined)}
                  >
                    ✕
                  </button>
                </header>
                <div className="field-dialog-body">
              <HostForm
                busy={busy}
                host={editing === "new" ? undefined : hosts.find((h) => h.id === editing)}
                hosts={hosts}
                onAddHost={() => setEditing("new")}
                onCancel={() => setEditing(undefined)}
                onRemove={(id) =>
                  void act(async () => {
                    await window.machina.remote.remove(id);
                    setEditing(undefined);
                  })
                }
                onSave={(input) =>
                  void act(async () => {
                    if (editing === "new") {
                      const created = await window.machina.remote.create(input);
                      setSelectedId(created.id);
                    } else {
                      await window.machina.remote.update(editing, input);
                    }
                    setEditing(undefined);
                  })
                }
              />
                </div>
              </div>
            </div>
          )}

          {/*
            * Nothing here yet, said in the middle of the space that is empty.
            *
            * This was a chat notice — a full-width row with the words at the left edge and the
            * button at the right, and a screen's worth of nothing between them. An empty state
            * is one thing to read and one thing to press, in the place the eye already is.
            */}
          {/*
            * No servers yet, and still something to talk to.
            *
            * The agent's own half — the wall on this machine, the skills, what it can work out —
            * needs no customer's server, so the first screen is a conversation rather than a
            * form asking for somebody's address and password. The left side says what is
            * missing; the right side is the same panel it will be once a server exists.
            */}
          {hosts.length === 0 && !editing && (
            /* The conversation is offered here, not forced: the Agent button in the title row
               closes this one the way it closes every other, and the notice takes the width. */
            <div
              className={agentOpen ? "remote-body with-agent" : "remote-body"}
              style={
                agentOpen
                  ? { gridTemplateColumns: `minmax(0, 1fr) 12px ${shownAgentWidth}px` }
                  : undefined
              }
            >
              <div className="workspace-blank">
                <strong>{t("No servers yet.")}</strong>
                <span>
                  {t(
                    "Register the address of a screen (RDP or VNC) or of SSH, and the screen and the session appear — and the agent can work that server.",
                  )}
                </span>
                <button type="button" onClick={() => setEditing("new")}>
                  {t("Add a server")}
                </button>
                <button className="quiet" type="button" onClick={openAgentSettings}>
                  {t("Set up the agent first")}
                </button>
              </div>
              {agentOpen && (
                <>
                  <span className="agent-resizer" />
                  <div className="remote-agent">
                    <RemoteAgentChat
                      hasScreen={false}
                      hasSsh={false}
                      hostId={LOCAL_AGENT_HOST}
                      onError={(message) => setError(message)}
                      onOpenSettings={openAgentSettings}
                      reloadKey={settingsSaved}
                      state={runStates[LOCAL_AGENT_HOST]}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** Two arrows going opposite ways: this is a switch, not a way out. */
/**
 * Two sliders, for the settings that belong to the application rather than to a server.
 *
 * Not a gear: a gear at sixteen pixels is a circle with bumps, and the one drawn here first read
 * as a sun. Sliders say "things that are set" at any size.
 */
/** A column beside the work — what the Agent button does, rather than a robot. */
/**
 * Copy and paste, made visible.
 *
 * The mechanism is invisible and fails differently on every server: the channel may not open, the
 * far side may never come for the bytes, or it may refuse them. All the operator sees is a paste
 * that does nothing, which reads as this application being broken. So: what is on this machine's
 * clipboard, whether it reached the server, what came back — and two ways out when it did not.
 *
 * Read when it is opened rather than watched: the clipboard changes without telling anybody, and
 * a poll behind a closed menu is work nobody asked for.
 */
function ClipboardButton({ hostId }: { hostId: string }) {
  const t = useT();
  const [state, setState] = useState<RemoteClipboard>();
  const [busy, setBusy] = useState(false);
  /* Typing goes wherever the cursor is, on somebody else's desktop. It is asked about first. */
  const [confirming, setConfirming] = useState(false);

  const read = () =>
    void window.machina.remote
      .clipboard(hostId)
      .then(setState)
      .catch(() => undefined);

  const act = (what: "send" | "type") => {
    setBusy(true);
    void (what === "send"
      ? window.machina.remote.sendClipboard(hostId)
      : window.machina.remote.typeClipboard(hostId)
    )
      .then(setState)
      .catch(() => undefined)
      .finally(() => {
        setBusy(false);
        setConfirming(false);
      });
  };

  const mine = state?.mine ?? "";
  const shown = mine.length > 90 ? `${mine.slice(0, 90)}…` : mine;

  return (
    <MenuButton
      /* Hung from the right edge: this button sits near the end of the bar, and a panel anchored
         left ran off the side of the window with the actions on the far side of it. */
      align="right"
      label={
        <span className="with-icon">
          <ClipboardIcon />
          {t("Clipboard")}
        </span>
      }
      title={t("What copy and paste has to work with on this server")}
      onOpen={read}
    >
      {() => (
        <div className="clipboard-state">
          <p className="menu-heading">{t("On this machine")}</p>
          {mine ? (
            <p className="clipboard-text">{shown}</p>
          ) : (
            <p className="menu-empty">{t("Nothing is copied.")}</p>
          )}

          <p className="menu-heading">{t("To this server")}</p>
          <p className="clipboard-line">
            {state?.channel === false
              ? t("The clipboard channel is not open.")
              : state?.pulledAt
                ? t("Offered, and the server took it at {when}.", { when: clock(state.pulledAt) })
                : state?.offeredAt
                  ? t("Offered at {when}. The server has not come for it — paste over there to pull it.", { when: clock(state.offeredAt) })
                  : t("Nothing has been offered yet.")}
          </p>

          {state?.fromServer && (
            <>
              <p className="menu-heading">{t("From this server")}</p>
              <p className="clipboard-text">{state.fromServer.text.slice(0, 90)}</p>
            </>
          )}

          <div className="clipboard-actions">
            <button disabled={busy || !mine} type="button" onClick={() => act("send")}>
              {t("Offer it again")}
            </button>
            {confirming ? (
              <button className="danger" disabled={busy} type="button" onClick={() => act("type")}>
                {t("Type it in — it goes where the cursor is")}
              </button>
            ) : (
              <button
                className="secondary"
                disabled={busy || !mine}
                type="button"
                onClick={() => setConfirming(true)}
              >
                {t("Type it in")}
              </button>
            )}
          </div>
          {mine.length > 2000 && (
            <p className="menu-empty">{t("Typing stops at 2000 characters.")}</p>
          )}
        </div>
      )}
    </MenuButton>
  );
}

/** A clipboard: what copy and paste has to work with. */
function ClipboardIcon() {
  return (
    <svg aria-hidden fill="none" height="14" viewBox="0 0 16 16" width="14">
      <rect height="10" rx="1.6" stroke="currentColor" strokeWidth="1.3" width="9" x="3.5" y="4" />
      <path d="M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/** Just the time: the day is not the question when something happened in this session. */
function clock(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : formatTime(at);
}

/** A display: the screen half. */
function ScreenIcon() {
  return (
    <svg aria-hidden fill="none" height="16" viewBox="0 0 16 16" width="16">
      <rect height="9" rx="1.6" stroke="currentColor" strokeWidth="1.3" width="12" x="2" y="3" />
      <path d="M6 14h4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/** A prompt: the shell half. */
function SessionIcon() {
  return (
    <svg aria-hidden fill="none" height="16" viewBox="0 0 16 16" width="16">
      <rect height="11" rx="1.6" stroke="currentColor" strokeWidth="1.3" width="12" x="2" y="2.5" />
      <path d="M5 6.5 7 8.5 5 10.5M8.5 10.5h2.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function ColumnIcon() {
  return (
    <svg aria-hidden fill="none" height="16" viewBox="0 0 16 16" width="16">
      <rect height="11" rx="2" stroke="currentColor" strokeWidth="1.3" width="12" x="2" y="2.5" />
      <path d="M10 2.5v11" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/** A pane leaving for a window of its own. On the three buttons that do exactly that. */
function PopOutIcon() {
  return (
    <svg aria-hidden className="pop-out" fill="none" height="11" viewBox="0 0 11 11" width="11">
      <path
        d="M4 1.6h5.4V7M9.4 1.6 5 6M7.2 6.6v2.8H1.6V3.8h2.8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

/** This one server's settings — a gear on a machine, not the application's gear. */
function ServerGearIcon() {
  return (
    <svg aria-hidden fill="none" height="16" viewBox="0 0 16 16" width="16">
      <rect height="4" rx="1.2" stroke="currentColor" strokeWidth="1.3" width="11" x="2.5" y="2" />
      <path d="M5 4h.01M5 11.5h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
      <circle cx="10" cy="11.5" r="1.7" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M10 8.4v.7m0 4.8v.7m2.7-3.1h-.7m-4 0h-.7m4.6-1.9-.5.5m-2.8 2.8-.5.5m3.8 0-.5-.5m-2.8-2.8-.5-.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.1"
      />
      <path d="M2.5 9.5h3.2M2.5 13.2h3.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" />
    </svg>
  );
}


/** A globe: the one mark for "language" that needs no words — which is the point of this button. */
function GlobeIcon() {
  return (
    <svg
      aria-hidden
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      width="16"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

/**
 * The application's own settings: a gear, without the server the other one is drawn on.
 *
 * The same gear the conversation's header uses (`SettingsIcon` in `RemoteAgentChat`), because it
 * is the same button — it opens the same window. It was drawn here as eight short strokes around
 * a dot, which at 16px reads as a sun; sitting beside the brightness toggle, that is what people
 * took it for. One action, one picture.
 */
function AgentGearIcon() {
  return (
    <svg
      aria-hidden
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="16"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Stacked rows: many servers moving together. */
function FleetIcon() {
  return (
    <svg aria-hidden fill="none" height="16" viewBox="0 0 16 16" width="16">
      <rect height="3" rx="1" stroke="currentColor" strokeWidth="1.3" width="12" x="2" y="2.5" />
      <rect height="3" rx="1" stroke="currentColor" strokeWidth="1.3" width="12" x="2" y="6.5" />
      <rect height="3" rx="1" stroke="currentColor" strokeWidth="1.3" width="12" x="2" y="10.5" />
    </svg>
  );
}

/** A panel with its left column marked — the same fold control the setting mode uses. */
function PanelIcon() {
  return (
    <svg aria-hidden fill="none" height="16" viewBox="0 0 16 16" width="16">
      <rect
        height="11"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.3"
        width="13"
        x="1.5"
        y="2.5"
      />
      <path d="M6 2.5v11" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}


function sessionLabel(host: RemoteHostState) {
  // A count rather than the word, once there can be more than one: "Session 3" is the fact.
  const terminals = host.sshSessions.length;
  const shell = terminals > 1 ? t("Session {n}", { n: terminals }) : terminals === 1 ? t("Session") : "";
  const screen = host.rdpOpen || host.vncOpen;
  if (screen && shell) return t("Screen + {shell}", { shell });
  if (screen) return t("Screen");
  if (shell) return shell;
  return t("Not connected");
}

/**
 * How to say where this server's shell is.
 *
 * An address where there is one. Where the machine is reached by asking its provider for a shell
 * there is no address and no account of ours, and what identifies it is what was asked for — the
 * instance id — which is what the operator recognises it by anyway.
 */
function addressOf(host: RemoteHostState) {
  if (host.wayIn) return identityFor(host.wayIn);
  return `${host.ssh?.username}@${host.ssh?.host}:${host.ssh?.port}`;
}

function describeEndpoints(host: RemoteHostState) {
  const parts = [];
  if (host.rdp) parts.push(`RDP ${host.rdp.host}:${host.rdp.port}`);
  if (host.vnc) parts.push(`VNC ${host.vnc.host}:${host.vnc.port}`);
  if (host.ssh) parts.push(`SSH ${addressOf(host)}`);
  return parts.join("\n") || t("Nowhere to connect");
}

/**
 * What the conversation's width may be.
 *
 * Wide enough for a command and its output to be readable, never so wide that the screen it is
 * about has nowhere to be — the work keeps 420px whatever the window does.
 *
 * The floor is 360px because that is what the composer's bottom row needs: ＋, the approval mode,
 * the model, how hard it thinks, and the send button come to 300px plus the gaps between them,
 * and at 320px the send button ended up outside the panel, where its `overflow: hidden` cut it
 * off. A width you cannot send from is not a width to offer.
 */
function clampAgentWidth(width: number, windowWidth: number) {
  const most = Math.max(360, windowWidth - 420 - 244);
  return Math.round(Math.min(Math.max(width, 360), most));
}


export { DEFAULT_RDP_PORT, DEFAULT_SSH_PORT };

/** `12:34` — minutes and seconds, which is the scale a maintenance recording is read at. */
function clockOf(seconds: number) {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${two(Math.floor(seconds / 60))}:${two(seconds % 60)}`;
}

/** The mark on the record button: hollow before, filled and red while it is running. */
function RecordDot({ live }: { live?: boolean }) {
  return (
    <svg aria-hidden fill="none" height="10" viewBox="0 0 10 10" width="10">
      <circle
        cx="5"
        cy="5"
        fill={live ? "#c0392b" : "none"}
        r="3.6"
        stroke={live ? "#c0392b" : "currentColor"}
        strokeWidth="1.6"
      />
    </svg>
  );
}
