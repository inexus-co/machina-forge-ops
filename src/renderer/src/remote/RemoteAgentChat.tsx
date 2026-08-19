import { useEffect, useRef, useState } from "react";
import { catalogText, formatDate, formatTime, t, type Translate } from "../../../shared/i18n";
import { useT } from "../i18n";
import { readPane } from "./panes";
import { describeError } from "./Toast";
import type { RemoteThinking } from "../../../shared/remoteAgent";
import type {
  RemoteAgentEvent,
  RemoteAgentProposal,
  RemoteAgentRunState,
  RemoteAgentSettings,
  RemoteAgentStepEvent,
  RemoteApprovalMode,
  RemoteModel,
  RemoteRunSummary,
  RemoteWallState,
  RememberChoice,
} from "../../../shared/remoteAgent";
import { LOCAL_AGENT_HOST } from "../../../shared/remoteAgent";
import type { AgentResource } from "../../../shared/remoteResources";
import type { PluginView } from "../../../shared/remotePlugins";
import { MenuButton, SelectMenu } from "./SelectMenu";
import { SwapLabel } from "./SwapLabel";

/**
 * Working with the agent on a customer's server.
 *
 * The third thing in the window, beside the desktop and the terminal, and the reason the mode
 * exists: the point was never three applications in one frame, it was being able to ask.
 *
 * What it can do is narrower than it looks. Commands come back through an allowlist before they
 * are sent, `sudo` and anything destructive stop for a person whatever the mode says, and the
 * agent can look at the RDP screen but cannot touch it. All of that is
 * `docs/decisions/0001-shell-under-a-written-guarantee.md`, and the header says which powers this
 * run has before it starts rather than after something has happened.
 */

/*
 * A function, not a constant: words read at import time would be the language the window opened
 * in, and would keep saying it after the operator switched.
 */
const finishLabels = (
  t: Translate,
): Record<NonNullable<RemoteAgentRunState["finished"]>, string> => ({
  done: t("Finished"),
  stopped: t("Stopped by you"),
  limit: t("Stopped: too many commands (if it is not finished, ask again)"),
  timeout: t("Stopped at the time limit"),
  error: t("Stopped on an error"),
  question: t("Waiting for your answer"),
});

const approvalModes = (
  t: Translate,
): Array<{ value: RemoteApprovalMode; label: string; note: string }> => [
  { value: "step", label: t("Step by step"), note: t("Approve one command at a time") },
  { value: "auto", label: t("Auto"), note: t("sudo and destructive ones are always approved") },
  { value: "plan", label: t("Plan only"), note: t("Runs nothing, writes only the steps") },
];

/** Remembered per host: two servers in one job are often at different stages. */
/* Several, remembered as one line: two servers in one job are often at different stages. */
/* Which model this server is usually asked about. Remembered per server: a customer whose
   output may not leave the building is a different choice from one whose may. */
const modelKey = (hostId: string) => `machina.remote-agent.model.${hostId}`;
/* Which named way of working this server is usually maintained with. */
const profileKey = (hostId: string) => `machina.remote-agent.profile.${hostId}`;

export function RemoteAgentChat({
  hostId,
  hasScreen,
  hasSsh,
  onError,
  onNewChat,
  onOpenHostSettings,
  onOpenSettings,
  attached,
  onAttached,
  reloadKey,
  state,
  terminals,
}: {
  hostId: string;
  /** Whether this server has a screen (RDP or VNC) — the agent can operate it even without SSH. */
  hasScreen: boolean;
  hasSsh: boolean;
  state?: RemoteAgentRunState;
  onError: (message?: string) => void;
  /** Open the settings page, where the model and the allowlists are. */
  onOpenSettings: () => void;
  /** The server's own settings — where SSH and RDP are entered. */
  onOpenHostSettings?: () => void;
  /** Told before the transcript is cleared, so a past run being read is closed with it. */
  onNewChat?: () => void;
  /** Bumped when the settings page saved, so what is shown here is what was just written. */
  reloadKey: number;
  /**
   * The terminals open for this server.
   *
   * Not so the agent can use them — it has its own connection, and that separation is the whole
   * guarantee. So the operator can hand one *screen* over as text, chosen and visible.
   */
  terminals?: ReadonlyArray<{ id: string; title: string }>;
  /** Which terminals this message carries. Attached from the terminal's own tab. */
  attached?: string[];
  onAttached?: (next: string[]) => void;
}) {
  const t = useT();
  /*
   * The conversation that belongs to no server.
   *
   * Same panel, fewer powers: nothing here can reach a customer's machine, so the things that
   * would need one are neither demanded before starting nor offered during. Told apart by the
   * host it is for, rather than by a flag somebody could pass inconsistently.
   */
  const local = hostId === LOCAL_AGENT_HOST;
  const [settings, setSettings] = useState<RemoteAgentSettings>();
  const [chosenModel, setChosenModel] = useState(
    () => window.localStorage.getItem(modelKey(hostId)) ?? "",
  );
  const [chosenProfile, setChosenProfile] = useState(
    () => window.localStorage.getItem(profileKey(hostId)) ?? "",
  );
  const [mode, setMode] = useState<RemoteApprovalMode>("step");
  /*
   * How hard to think, chosen per run and remembered per server.
   *
   * Beside the model because it is the same question — the same model thinking not at all and
   * thinking as hard as it can is a different amount of money and a different amount of patience.
   */
  const [thinking, setThinking] = useState<RemoteThinking>(
    () => (window.localStorage.getItem(thinkingKey(hostId)) as RemoteThinking) || "medium",
  );
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  /** Failures of things this panel asked for, woven into the same transcript. */
  const [localErrors, setLocalErrors] = useState<
    Array<{ id: string; at: string; message: string }>
  >([]);
  /** What was typed, shown at once. Stands aside once the run records it itself. */
  const [said, setSaid] = useState<Array<{ id: string; at: string; text: string }>>([]);
  /** Cleared once the message is sent. Owned by the workspace, because the button is over there. */
  const carriedPanes = attached ?? [];
  const setAttached = (next: string[] | ((current: string[]) => string[])) =>
    onAttached?.(typeof next === "function" ? next(carriedPanes) : next);
  /**
   * Past conversations with this server, and which one is being read.
   *
   * Here rather than in the window's sidebar. The sidebar lists servers — that is what it is —
   * and a conversation's own history belongs to the conversation, which is how every chat panel
   * in an editor is arranged. Read from the records on disk, so it survives the window closing.
   */
  const [runs, setRuns] = useState<RemoteRunSummary[]>([]);
  /**
   * The installed skills, for the composer's ＋ menu.
   *
   * A skill that declares a `goal:` is a command: picking it puts that line in the box, where it
   * is read and edited before it is sent — better than a command that expands invisibly. This
   * window has no `/name` editor, so the ＋ menu is the command list. Skills a plugin installed
   * are in here too; on disk they are the same files.
   */
  const [skills, setSkills] = useState<AgentResource[]>([]);
  /*
   * The plugins, for the one-line suggestion above an empty conversation.
   *
   * Not for the menu — what a plugin installs is skills, and the menu lists those. This is only
   * `suggested`, from this server's last facts: whether to offer, once, to install one. Re-read
   * after a run, because a run refreshes the facts the suggestion is drawn from.
   */
  const [plugins, setPlugins] = useState<PluginView[]>([]);
  /** A plugin being installed from the suggestion line, so its button can say so. */
  const [installingPlugin, setInstallingPlugin] = useState<string>();
  /*
   * The record is not in this column.
   *
   * Opening one used to replace the conversation with it — so the thing you wanted to talk about
   * took away the place you would have talked about it. It has its own window now, beside the
   * state and the inventory, and this only ever asks for it to be opened.
   */
  const showRuns = (runId?: string) =>
    void window.machina.remotePanels.open("runs", hostId, runId).catch(() => undefined);
  /** A frame being looked at properly, over the conversation. */
  const [grown, setGrown] = useState<string>();
  /** What this machine can build a wall out of, and whether it is running without one. */
  const [wall, setWall] = useState<RemoteWallState>();

  const load = () =>
    void (async () => {
      try {
        const next = await window.machina.remoteAgent.settings();
        setSettings(next);
        // A model that was renamed keeps its id; one that was deleted falls back to the default.
        setChosenModel((current) =>
          next.models.some((model) => model.id === current)
            ? current
            : (next.defaultModelId ?? next.models[0]?.id ?? ""),
        );
        setChosenProfile((current) =>
          next.profiles.some((profile) => profile.id === current)
            ? current
            : (next.defaultProfileId ?? ""),
        );
      } catch (cause) {
        onError(describeError(cause));
      }
    })();

  /*
   * Whether this machine is running with no wall at all.
   *
   * Read here as well as on the settings screen because ADR 0002 asks for it to stay visible:
   * the conversation is where the operator actually is, and a consent that is only remembered on
   * a page nobody opens is a consent that has disappeared.
   */
  const readWall = () =>
    void window.machina.remoteAgent
      .wall()
      .then(setWall)
      .catch(() => undefined);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(readWall, [reloadKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => window.machina.remoteAgent.onSettingsSaved(readWall), []);

  // Re-read after the settings save: the composer says which model and allowlist are in force,
  // and it must not go on naming one that was just renamed or deleted. The save may have
  // happened in the settings window, which is why this listens rather than only being told.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [reloadKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => window.machina.remoteAgent.onSettingsSaved(load), []);

  useEffect(() => {
    if (chosenModel) window.localStorage.setItem(modelKey(hostId), chosenModel);
  }, [chosenModel, hostId]);

  useEffect(() => {
    window.localStorage.setItem(profileKey(hostId), chosenProfile);
  }, [chosenProfile, hostId]);

  /*
   * Choosing a named agent sets what it names.
   *
   * Shown rather than applied silently: the composer's line has to say what this run will
   * actually do, and a mode saying "step by step" while the agent says otherwise would be a lie.
   */
  useEffect(() => {
    const profile = settings?.profiles.find((each) => each.id === chosenProfile);
    if (!profile) return;
    setMode(profile.approvalMode);
    if (profile.modelId) setChosenModel(profile.modelId);
    /* The categories come from the agent itself at start; nothing to copy into the composer. */
  }, [chosenProfile, settings]);

  const loadSkills = () =>
    void window.machina.remoteResources
      .list("skill")
      .then(setSkills)
      .catch(() => undefined);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadSkills, [reloadKey]);

  const loadPlugins = () =>
    void window.machina.remotePlugins
      .list(hostId)
      .then(setPlugins)
      .catch(() => undefined);

  /* Re-read after a run too: a run refreshes the facts the suggestion is drawn from. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadPlugins, [hostId, reloadKey, state?.finished]);
  /* And when a plugin is installed or removed in another window, so the ＋ menu follows at once. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => window.machina.remotePlugins.onChanged(loadPlugins), [hostId]);
  /* Installing a plugin writes skills, so the command list follows the same announcement. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => window.machina.remotePlugins.onChanged(loadSkills), []);

  /* Re-read when a run stops, which is when a new record appears, and when the list is opened. */
  useEffect(() => {
    let cancelled = false;
    void window.machina.remoteAgent
      .listRuns(hostId)
      .then((list) => {
        if (!cancelled) setRuns(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hostId, state?.running, state?.finished]);

  // Cleared with the run: a new conversation empties the transcript, and these are part of it.
  useEffect(() => {
    if ((state?.events.length ?? 0) === 0 && !state?.running) {
      setSaid([]);
      setLocalErrors([]);
    }
  }, [state?.events.length, state?.running]);

  const running = state?.running ?? false;
  /*
   * A conversation exists — running or finished but continuable.
   *
   * The model and how hard it thinks are settled when a conversation starts: Pi is given them
   * when its session is made, and changing them would mean making another one, which is to say
   * losing the history. So they are fixed while there is a conversation, and the way to change
   * them is the new-conversation button. Better than a chip that quietly means nothing.
   */
  const started = Boolean(state?.resumable) || (state?.running ?? false);
  /** Nothing being said: no transcript, nothing in flight. When the last few are worth showing. */
  const idle = (state?.events.length ?? 0) === 0 && !state?.running && said.length === 0;
  /* The one plugin to suggest: fits this server's facts and is not in yet. Local has no server. */
  const suggestion = local ? undefined : plugins.find((plugin) => plugin.suggested && !plugin.installed);
  /*
   * A fresh installation has no sub-agents and no skills — and the ＋ menu was then an empty box
   * hanging under the button, which reads as something broken rather than as something not set up
   * yet. It says what would be in it, and opens the place that fills it.
   */
  const commands = skills.filter((skill) => skill.goal?.trim());
  const nothingToAdd = (settings?.profiles ?? []).length === 0 && commands.length === 0;
  const pending = state?.pending;
  const waitingAnswer = state?.finished === "question" && state.resumable;
  const events = state?.events ?? [];
  const model = settings?.models.find((each) => each.id === chosenModel);
  const profile = settings?.profiles.find((each) => each.id === chosenProfile);
  /* Takes the whole list, because whether an id can be shortened depends on the others. */
  const shortModelName = shortModelNames((settings?.models ?? []).map(modelIdOf));
  /*
   * What this run may do, in one line: the catalog's default, the installation's exceptions, and
   * what was remembered on this server. The same whichever sub-agent is picked — permissions are
   * the installation's. No list of names: the gate explains itself per command.
   */
  const exceptions = Object.keys(settings?.rules ?? {}).length;
  const hostMemory = Object.keys(
    (settings?.hostRules ?? []).find((each) => each.hostId === hostId)?.rules ?? {},
  ).length;
  const powers = {
    text: [
      (settings?.autoReads ?? true) ? t("Reads run on their own") : t("Reads are asked about too"),
      exceptions ? t("{count} exception|{count} exceptions", { count: exceptions }) : "",
      hostMemory ? t("{count} remembered here", { count: hostMemory }) : "",
      settings?.allowSudo ? t("sudo allowed") : "",
    ]
      .filter(Boolean)
      .join("・"),
    detail: t("Commands that change the server, and any first-time command, stop before running"),
  };

  const recorded = new Set(
    events.flatMap((event) => (event.kind === "human" ? [event.text] : [])),
  );
  /* A proposal is only drawn while it is waiting; afterwards the step says what happened. */
  const drawn = (event: RemoteAgentEvent) =>
    event.kind !== "proposal" || event.proposal.toolCallId === pending?.toolCallId;

  const items = [
    ...events.filter(drawn),
    ...said
      .filter((item) => !recorded.has(item.text))
      .map((item) => ({ kind: "human" as const, at: item.at, text: item.text })),
    ...localErrors.map((item) => ({
      kind: "error" as const,
      at: item.at,
      text: item.message,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const blockers: Array<{ text: string; action?: { label: string; run: () => void } }> = [];
  /*
   * What this run needs depends on how it works.
   *
   * A screen agent exists for servers whose SSH is closed — demanding SSH from it made the send
   * button unpressable for the one case it was built for. It needs the picture instead, and the
   * picture is the screen being open.
   */
  /*
   * How this conversation reaches the server, decided by what the server has.
   *
   * A server with RDP and no SSH is operated through its screen, and that needs no setting up
   * at all. Demanding that somebody first go and define an agent
   * with `control: "screen"` was this screen asking to be configured before it would do the only
   * thing it could do.
   */
  const control = profile?.control ?? (!hasSsh && hasScreen ? "screen" : "shell");

  if (local) {
    /* Nothing to demand: this conversation was never going to touch a server. */
  } else if (control === "screen") {
    if (!hasScreen) blockers.push({ text: t("No screen (RDP or VNC) is set up for this server.") });
  } else if (!hasSsh && !hasScreen) {
    blockers.push({
      text: t("Nothing to connect to is set."),
      action: { label: t("Open the connection settings"), run: () => onOpenHostSettings?.() },
    });
  }

  /*
   * Only an endpoint needs configuring here.
   *
   * With the subscription there is nothing to fill in — `codex` is either on this machine and
   * signed in or it is not, and the main process says which in a sentence naming the command to
   * run. Demanding a key that this path does not use was what made the send button unpressable.
   */
  if (settings && settings.models.length === 0) {
    blockers.push({
      text: t("Not one model is registered."),
      action: { label: t("Model settings"), run: onOpenSettings },
    });
  } else if (
    model &&
    model.provider === "endpoint" &&
    (!model.baseUrl || !model.modelId || !model.hasApiKey)
  ) {
    blockers.push({
      text: t("\"{name}\" is not fully set up.", { name: model.name }),
      action: { label: t("Model settings"), run: onOpenSettings },
    });
  }
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    onError(undefined);
    try {
      await task();
    } catch (cause) {
      const message = describeError(cause);
      setLocalErrors((current) => [
        ...current.slice(-19),
        { id: `local-${Date.now()}-${current.length}`, at: new Date().toISOString(), message },
      ]);
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const text = draft.trim();
    /*
     * Read at the moment of sending, not when the chip was pressed.
     *
     * What somebody means by "look at this" is what is on the screen when they say it — and
     * between attaching and typing a sentence, a command may have finished.
     */
    const carried = carriedPanes.flatMap((id) => {
      const found = (terminals ?? []).find((each) => each.id === id);
      const pane = readPane(`${hostId}:${id}`);
      return found && pane ? [{ title: found.title, text: pane }] : [];
    });
    const withAttachments = <T,>(value: T) => {
      setAttached([]);
      return value;
    };
    const echo = () => {
      if (!text) return;
      setSaid((current) => [
        ...current.slice(-49),
        { id: `said-${Date.now()}-${current.length}`, at: new Date().toISOString(), text },
      ]);
    };

    if (running) {
      if (!text) return;
      setDraft("");
      echo();
      void run(() => window.machina.remoteAgent.say(hostId, text, carried));
      withAttachments(undefined);
      return;
    }
    if (waitingAnswer) {
      if (!text) return;
      setDraft("");
      echo();
      void run(() => window.machina.remoteAgent.answer(hostId, text));
      withAttachments(undefined);
      return;
    }
    /*
     * A finished conversation is continued, not replaced.
     *
     * Typing after a run ended used to start a new one — a new record, a new Pi session, and the
     * history gone — which is the opposite of what somebody typing a follow-up means. Debugging
     * further, or asking for what was missing, is the ordinary next thing. Starting over is what
     * the new-conversation button is for.
     */
    if (state?.resumable) {
      if (!text) return;
      setDraft("");
      echo();
      void run(() => window.machina.remoteAgent.say(hostId, text, carried));
      withAttachments(undefined);
      return;
    }
    if (blockers.length > 0 || !text) return;
    setDraft("");
    echo();
    void run(() =>
      window.machina.remoteAgent.start(hostId, {
        goal: text,
        approvalMode: mode,
        modelId: chosenModel || undefined,
        profileId: chosenProfile || undefined,
        attachments: carried,
        thinking,
        control,
      }),
    );
    withAttachments(undefined);
  };

  const stopping = running && draft.trim().length === 0;
  const canSubmit =
    !busy &&
    (running || waitingAnswer
      ? draft.trim().length > 0
      : blockers.length === 0 && draft.trim().length > 0);

  const newChat = () => {
    onNewChat?.();
    void run(() => window.machina.remoteAgent.reset(hostId));
  };

  /* A starter goes into the box, where it is read and edited before it is sent — the same as a
     prompt template. One click loads it; the send is the operator's. */
  const dropInComposer = (text: string) =>
    setDraft((current) => (current ? `${current}\n${text}` : text));

  /* Install the suggested plugin; its starters then appear in the ＋ menu. */
  const installPlugin = (id: string) => {
    setInstallingPlugin(id);
    void window.machina.remotePlugins
      .install(id)
      .then(setPlugins)
      .catch((cause) => onError(describeError(cause)))
      .finally(() => setInstallingPlugin(undefined));
  };

  return (
    <div className="chat remote-chat">
      {/*
        The panel's own header.

        Everything a conversation needs is in the conversation: the ones before, the settings
        behind them, and starting again. It was spread across the window's sidebar and a menu in
        the composer, which put chat rows in the list of servers and hid "begin again" in the
        settings menu. Icons, because there are three and the column is 416px wide.
      */}
      <div className="chat-head">
        <span className="chat-head-title">{t("Chat")}</span>
        <button
          aria-label={t("Runs")}
          className="chat-head-button"
          title={t("What was run on this server (opens in its own window)")}
          type="button"
          onClick={() => showRuns()}
        >
          <HistoryIcon />
        </button>
        <button
          aria-label={t("Model and allowlist settings")}
          className="chat-head-button"
          title={t("Model and allowlist settings")}
          type="button"
          onClick={onOpenSettings}
        >
          <SettingsIcon />
        </button>
        <button
          aria-label={t("New chat")}
          className="chat-head-button"
          disabled={busy || running}
          title={t("New chat")}
          type="button"
          onClick={newChat}
        >
          <ComposeIcon />
        </button>
      </div>

      {/*
        * The wall is off, and it says so for as long as it is off.
        *
        * ADR 0002's fourth condition: a consent that stops being visible once it has been given
        * is a consent nobody can act on. It sits under the header rather than in the composer
        * because it is true of the machine, not of the message being written.
        */}
      {wall && !wall.canBuild && wall.consent.accepted && (
        <p className="chat-no-wall">
          {t("This machine has no way to isolate. A command the agent runs here runs with your own privileges, as it is. Every line needs approval.")}
        </p>
      )}

      <>
      {/*
        The last few, at the top of an empty conversation.

        Not behind the button: when there is nothing being said, the thing most likely wanted is
        one of the last few — and a list you have to go and find is a list nobody opens. It goes
        away the moment there is a conversation on screen, because then the conversation is what
        the column is for.
      */}
      {/*
        One quiet offer, only when the conversation is empty.

        The server's facts say what it is; if a plugin fits and is not in yet, this is where saying so
        costs nothing. Not during a run — a line that appears mid-conversation moves everything
        under it (rule 2). One plugin, dismissed by installing it or just by starting to work.
      */}
      {idle && suggestion && (
        <div className="chat-plugin-suggest">
          <span>
            {t("\"{name}\" looks like a fit for this server. Install it and the usual investigations are one click away.", { name: t(suggestion.name) })}
          </span>
          <button
            disabled={installingPlugin === suggestion.id}
            type="button"
            onClick={() => installPlugin(suggestion.id)}
          >
            <SwapLabel active={installingPlugin === suggestion.id} off={t("Install")} on={t("Installing…")} />
          </button>
        </div>
      )}
      {idle && runs.length > 0 && (
        <div className="chat-recent">
          {runs.slice(0, 3).map((item) => (
            <button key={item.id} title={item.goal} type="button" onClick={() => showRuns(item.id)}>
              <span className="chat-history-goal">{item.goal ?? t("(no goal)")}</span>
              <small>{runAge(item.startedAt)}</small>
            </button>
          ))}
          {runs.length > 3 && (
            <button className="chat-recent-all" type="button" onClick={() => showRuns()}>
              {t("Show all ({count})", { count: runs.length })}
            </button>
          )}
        </div>
      )}
      <Transcript
        busy={busy}
        onGrow={setGrown}
        /* Nothing when the last few are on screen: they are the invitation. Only a column with
           no history at all needs telling what it is for. */
        empty={
          runs.length > 0
            ? ""
            : local
              ? t("You do not need a server yet. Talking through how to look into something, drafting a skill, adding things up here — all of that works.")
              : t("Write in the box below what you want looked into on this server. Pasting the text of a monitoring alert is fine too.")
        }
        hostId={hostId}
        items={items}
        pendingToolCallId={pending?.toolCallId}
        runId={state?.runId}
        onApprove={(toolCallId, remember) =>
          void run(async () => {
            const settled = await window.machina.remoteAgent.approve(hostId, toolCallId, remember);
            if (!settled) onError(t("This one had already been decided."));
          })
        }
        onReject={(toolCallId, remember) =>
          void run(async () => {
            const note = draft.trim() || undefined;
            setDraft("");
            await window.machina.remoteAgent.reject(hostId, toolCallId, note, remember);
          })
        }
        working={running && !pending}
        workingLabel={
          state?.steps
            ? t("Command {n}, thinking…", { n: state.steps })
            : t("Thinking…")
        }
      />
      </>

      {grown && (
        <div className="frame-scrim" role="presentation" onClick={() => setGrown(undefined)}>
          <img alt={t("Screen")} src={grown} />
        </div>
      )}

      <div className="chat-composer">
        {state?.finished && !running && (
          <p className="chat-finished">
            {finishLabels(t)[state.finished]}
            {/*
              In this window, not in Finder.

              This used to reveal the run's JSON file. Asking somebody who maintains servers to
              read a file to find out what was run on a customer's machine is not an answer — the
              same list is drawn by the record window, command by command, with the output.
            */}
            {/*
              The document, asked for from here.

              A run ends with one line in the conversation, and a line is not something anybody
              can act on afterwards. This asks the same conversation — the model still has
              everything it read — to write it down properly. It is a button rather than
              something that happens on its own because most runs do not need one, and because
              the operator is the one who knows whether this run was worth a document.
            */}
            {state.resumable && (
              <button
                className="quiet"
                disabled={busy}
                type="button"
                onClick={() =>
                  void run(() => window.machina.remoteAgent.say(hostId, REPORT_REQUEST))
                }
              >
                {t("Write the report")}
              </button>
            )}
            {state.runId && (
              <button className="quiet" type="button" onClick={() => showRuns(state.runId)}>
                {t("Show the commands it ran")}
              </button>
            )}
          </p>
        )}

        {blockers.length > 0 && !running && (
          <div className="chat-notice">
            <div>
              <strong>{blockers[0].text}</strong>
              {blockers.length > 1 && (
                <span>{blockers.slice(1).map((item) => item.text).join(" / ")}</span>
              )}
            </div>
            {blockers
              .map((item) => item.action)
              .filter((action): action is NonNullable<typeof action> => Boolean(action))
              .map((action) => (
                <button key={action.label} type="button" onClick={action.run}>
                  {action.label}
                </button>
              ))}
          </div>
        )}

        {/*
          Only what is attached.

          Both states as chips said nothing: pressing one changed a background from white to a
          slightly greener white, and「＋」became「×」, which is a puzzle rather than a state.
          What is attached is a thing that is *there*; what is not attached is not on the screen
          at all. Adding is a line in the ＋ menu, where every other "add something to this
          message" already lives.
        */}
        {carriedPanes.length > 0 && (
          <div className="chat-attach">
            {carriedPanes.map((id) => {
              const terminal = (terminals ?? []).find((each) => each.id === id);
              if (!terminal) return null;
              return (
                <span className="chat-chip" key={id}>
                  <TerminalChipIcon />
                  <span>{t("{title}'s screen", { title: terminal.title })}</span>
                  <button
                    aria-label={t("Take {title}'s screen away", { title: terminal.title })}
                    type="button"
                    onClick={() => setAttached((current) => current.filter((each) => each !== id))}
                  >
                    ×
                  </button>
                </span>
              );
            })}
            <small>{t("The screen as it will be sent")}</small>
          </div>
        )}

        <div className={draft ? "chat-input filled" : "chat-input"}>
          <textarea
            placeholder={
              running
                ? t("Send an instruction (e.g. leave that service alone)")
                : waitingAnswer
                  ? t("Answer the agent's question")
                  : local
                    ? t("Write what you want done (e.g. put together the steps for surveying an Ubuntu box)")
                    : t("Write what to look into (e.g. find out why the disk is filling up)")
            }
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter is a newline. The IME's own Enter must not send.
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
                return;
              }
              event.preventDefault();
              submit();
            }}
          />

          <div className="chat-tools">
            <MenuButton label={<PlusMark />} title={t("What to add to this conversation")}>
              {(close) => (
                <>
                  {nothingToAdd && (
                    <>
                      <p className="menu-empty">
                        {t("Nothing to put in here yet. A plugin brings investigations you can start with one press, and a sub-agent or a prompt appears here once you make one.")}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          void window.machina.remotePanels
                            .open("settings", hostId, "plugins")
                            .catch(() => undefined);
                          close();
                        }}
                      >
                        <span className="menu-check" />
                        {t("Look at the plugins")}
                      </button>
                    </>
                  )}

                  {(settings?.profiles ?? []).length > 0 && (
                    <>
                      <p className="menu-heading">{t("Agent")}</p>
                      <button
                        aria-checked={chosenProfile === ""}
                        disabled={running}
                        role="menuitemradio"
                        type="button"
                        onClick={() => {
                          setChosenProfile("");
                          close();
                        }}
                      >
                        <span className="menu-check">{chosenProfile === "" ? "✓" : ""}</span>
                        {t("None (choose below instead)")}
                      </button>
                      {(settings?.profiles ?? []).map((each) => (
                        <button
                          aria-checked={each.id === chosenProfile}
                          disabled={running}
                          key={each.id}
                          role="menuitemradio"
                          type="button"
                          onClick={() => {
                            setChosenProfile(each.id);
                            close();
                          }}
                        >
                          <span className="menu-check">{each.id === chosenProfile ? "✓" : ""}</span>
                          {each.name}
                        </button>
                      ))}
                    </>
                  )}

                  {/*
                    The commands: every installed skill that says what asking for it looks like.
                    One list, whether the skill was written here or came in with a plugin — on
                    disk they are the same files, and two headings for one thing is what made
                    "plugin" and "skill" impossible to tell apart.
                  */}
                  {commands.length > 0 && (
                    <>
                      <p className="menu-heading">{t("Skills")}</p>
                      {commands.map((skill) => (
                        <button
                          key={skill.name}
                          title={skill.description}
                          type="button"
                          onClick={() => {
                            dropInComposer(t(skill.goal ?? ""));
                            close();
                          }}
                        >
                          <span className="menu-check" />
                          {skill.name}
                          {skill.description && (
                            <span className="menu-note">{t(skill.description)}</span>
                          )}
                        </button>
                      ))}
                    </>
                  )}

                </>
              )}
            </MenuButton>

            <SelectMenu
              options={approvalModes(t)}
              value={mode}
              onChange={(picked) => {
                setMode(picked);
                if (running) {
                  void run(() => window.machina.remoteAgent.setApprovalMode(hostId, picked));
                }
              }}
            />

            {/*
              What the agent is, on the left with the mode.

              What it *may run* used to sit here too, squeezed to two letters between the mode and the
              model. It is a list, and a list belongs in the ＋ menu where the categories are
              ticked — not as three cut-off characters in a strip.
            */}
            {profile && (
              <span className="chat-profile" title={profile.name}>
                {profile.name}
              </span>
            )}

            <span className="chat-tools-gap" />

            {(settings?.models ?? []).length > 0 && (
              <span className="chat-model-pick">
                <SelectMenu
                  compact
                  disabled={started}
                  disabledTitle={t("Start a new conversation to change the model.")}
                  /*
                    The model, by the name the model has.
                    
                    It said「Codex CLI」— the nickname this application invents when the operator
                    leaves the name blank — beside「openai-codex」, an internal id. Neither says
                    which model is about to read a customer's server. What answers is
                    `gpt-5.6-luna`, so that is what the chip says; the nickname and the service
                    are the line underneath.
                  */
                  options={(settings?.models ?? []).map((each) => ({
                    value: each.id,
                    label: modelIdOf(each),
                    short: shortModelName(modelIdOf(each)),
                    note: each.name.trim() && each.name.trim() !== modelIdOf(each)
                      ? each.name.trim()
                      : each.provider === "codex"
                        ? (each.piProvider ?? "openai-codex")
                        : undefined,
                  }))}
                  value={chosenModel || (settings?.defaultModelId ?? "")}
                  onChange={(picked) => setChosenModel(picked)}
                />
              </span>
            )}

            {/* How hard it thinks, in the operator's words rather than Pi's. */}
            <span className="chat-think-pick">
              <SelectMenu
                compact
                disabled={started}
                disabledTitle={t("Start a new conversation to change this.")}
                options={thinkingChoices(t).map((each) => ({ value: each.value, label: each.label, note: each.note }))}
                value={thinking}
                onChange={(picked) => {
                  setThinking(picked);
                  window.localStorage.setItem(thinkingKey(hostId), picked);
                }}
              />
            </span>

            {stopping ? (
              <button
                aria-label={t("Stop")}
                className="chat-send stop"
                disabled={busy}
                type="button"
                onClick={() => void run(() => window.machina.remoteAgent.stop(hostId))}
              >
                <StopMark />
              </button>
            ) : (
              <button
                aria-label={running || waitingAnswer ? t("Send") : t("Start")}
                className="chat-send"
                disabled={!canSubmit}
                type="button"
                onClick={submit}
              >
                <SendArrow />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The same weight as the arrow: a drawn cross, not the `+` on the keyboard. */
function PlusMark() {
  return (
    <svg aria-hidden fill="none" height="15" viewBox="0 0 16 16" width="15">
      <path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

/*
 * The arrow, drawn rather than typed.
 *
 * It was the character「↑」, which is a hairline at this size in every UI font — next to a filled
 * circle it looked like a scratch. A stroked path holds its weight at 30px.
 */
function SendArrow() {
  return (
    <svg aria-hidden fill="none" height="16" viewBox="0 0 16 16" width="16">
      <path
        d="M8 13V3.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
      <path
        d="M3.5 8 8 3.4 12.5 8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

/** The same weight, for the button that stops a run. */
function StopMark() {
  return (
    <svg aria-hidden height="12" viewBox="0 0 12 12" width="12">
      <rect fill="currentColor" height="9" rx="1.6" width="9" x="1.5" y="1.5" />
    </svg>
  );
}

/** The chip's mark: a screen, so it reads as "the terminal" rather than "a file". */
function TerminalChipIcon() {
  return (
    <svg aria-hidden fill="none" height="13" viewBox="0 0 16 16" width="13">
      <rect height="11" rx="2" stroke="currentColor" strokeWidth="1.3" width="13" x="1.5" y="2.5" />
      <path d="M4.5 6.5 6.5 8l-2 1.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" />
      <path d="M8.5 10h3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" />
    </svg>
  );
}

/**
 * Programs whose danger can hide in an argument even when the first word looks harmless. When one
 * of these stops for a person, the model is asked for a second opinion (`riskHint`).
 */
const EXEC_CAPABLE = new Set([
  "tar", "git", "openssl", "make", "rsync", "curl", "wget", "docker", "kubectl", "systemctl",
]);

/**
 * The one card that stops a run: the command, the judgement material, and — when the gate allows
 * it — the choice to have the answer remembered for this agent on this server.
 *
 * Everything is rendered from the first frame, so the card never changes size under the
 * operator's pointer. The two action buttons never change label; consistency with the memory
 * choice is kept by disabling, not hiding: choose "never again" and it cannot be run, choose
 * "automatic from now on" and it cannot be refused — the four reachable outcomes are exactly the
 * four that make sense.
 */
export function ProposalCard({
  busy,
  hostId,
  onApprove,
  onGrow,
  onReject,
  proposal,
}: {
  busy: boolean;
  hostId: string;
  onApprove: (toolCallId: string, remember?: RememberChoice) => void;
  onGrow: (frame: string) => void;
  onReject: (toolCallId: string, remember?: RememberChoice) => void;
  proposal: RemoteAgentProposal;
}) {
  const t = useT();
  const gate = proposal.gate;
  /* The narrow answer is the default: nothing is remembered unless the operator moves. */
  const [keep, setKeep] = useState<"once" | "auto" | "deny">("once");
  const [verbOnly, setVerbOnly] = useState(true);
  /* Judgement material that arrives after the card: undefined = still asking, null = no answer.
     Both slots are laid out from the first frame, so an arrival changes text, never geometry. */
  const [fetched, setFetched] = useState<string | null | undefined>(undefined);
  const [history, setHistory] = useState<{ count: number; lastAt?: string } | null>(null);
  /* A model's second opinion on the command — advisory, never a gate. Shown only when it warns. */
  const [risk, setRisk] = useState<{ risky: boolean; note: string } | null>(null);
  useEffect(() => {
    let alive = true;
    if (!gate || hostId === LOCAL_AGENT_HOST) return undefined;
    void window.machina.remoteAgent
      .commandHistory(hostId, gate.program)
      .then((seen) => alive && setHistory(seen))
      .catch(() => undefined);
    /* Only for a command the catalog has nothing on: the server's own manuals get one chance. */
    if (!gate.summary) {
      void window.machina.remoteInventory
        .describeCommand(hostId, gate.program)
        .then((line) => alive && setFetched(line ?? null))
        .catch(() => alive && setFetched(null));
    }
    /*
     * The risk hint, for commands where a person is the check and the danger could hide in an
     * argument: unknown to the catalog, tier-2, or a known execution-capable tool. Not for the
     * hard floor (sudo/destructive) — that is already unmissable — and not for pointer proposals.
     */
    const worthChecking =
      proposal.tool !== "read_screen" &&
      (gate.stop === "unknown" || gate.stop === "catalog" || EXEC_CAPABLE.has(gate.program));
    if (worthChecking) {
      void window.machina.remoteAgent
        .riskHint(proposal.summary)
        .then((hint) => alive && hint && setRisk(hint))
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [hostId, gate, proposal.toolCallId, proposal.summary, proposal.tool]);
  const remember: RememberChoice | undefined =
    !gate?.canRemember || keep === "once"
      ? undefined
      : keep === "deny"
        ? { action: "deny" }
        : { action: "auto", verbOnly: Boolean(verbOnly && gate.verb) };
  const choices = [
    { value: "once" as const, label: t("Just this once") },
    { value: "auto" as const, label: t("Automatic from now on") },
    { value: "deny" as const, label: t("Refused from now on") },
  ];
  return (
    <div className="chat-card waiting">
      {proposal.by && <span className="chat-by">{t("Asked for by {by}", { by: proposal.by })}</span>}
      <code className="remote-command">{proposal.summary}</code>
      {proposal.reason && <p>{proposal.reason}</p>}
      {/* For a pointer, this is the proposal: the words alone cannot be judged. */}
      {proposal.frame && (
        <MarkedFrame
          alt={t("The screen the agent is looking at")}
          at={proposal.point}
          onGrow={onGrow}
          src={proposal.frame}
        />
      )}
      {/* What this command is, and how often this server has seen it. The catalog's line rode in
          with the proposal; the rest arrives later into slots that already have their height. */}
      {gate && (
        <p className="chat-gate-summary">
          {gate.summary
            ? catalogText(gate.summary)
            : fetched === undefined
              ? t("Looking up what it does…")
              : (fetched ?? "—")}
        </p>
      )}
      {gate && (
        <p className="chat-gate-summary">
          {history === null
            ? t("Looking up its history on this server…")
            : history.count === 0
              ? t("A first for this server")
              : t("Run {count} time here before|Run {count} times here before", { count: history.count }) +
                (history.lastAt
                  ? t("(last on {when})", { when: formatDate(history.lastAt) })
                  : "")}
        </p>
      )}
      {/* Why this one stopped even in automatic mode. Without it the operator learns that
          the mode is a lie rather than that the guarantee is doing its job. */}
      {proposal.approvalReason && (
        <p className="chat-approval-reason">{proposal.approvalReason}</p>
      )}
      {/* A model read the command and warns. Advisory — it does not change what the buttons do.
          Shown only when it flagged something; "machine's eye, can misread" is said in place. */}
      {risk?.risky && (
        <p className="chat-risk-hint">
          {t("⚠ {note} (a machine read this; it can be wrong)", { note: risk.note })}
        </p>
      )}
      {/* For a file, this is the proposal: "this rewrites nginx.conf" cannot be judged. */}
      {proposal.diff && <DiffView diff={proposal.diff} proposed={proposal.proposed} />}
      {gate && !gate.canRemember && (
        <p className="chat-remember-fixed">
          {t("Commands of this kind are always asked about — it cannot be made automatic")}
        </p>
      )}
      {gate?.canRemember && (
        <div className="chat-remember">
          <span className="chat-remember-title">{t("Remember this decision")}</span>
          <div className="chat-remember-choices">
            {choices.map((choice) => (
              <button
                className={keep === choice.value ? "tag on" : "tag"}
                key={choice.value}
                type="button"
                onClick={() => setKeep(choice.value)}
              >
                {choice.label}
              </button>
            ))}
          </div>
          {/* Always rendered — disabled without a first argument — so the card's height holds
              whichever choice is lit. */}
          <label className="settings-check chat-remember-verb">
            <input
              checked={Boolean(verbOnly && gate.verb)}
              disabled={!gate.verb || keep !== "auto"}
              type="checkbox"
              onChange={(event) => setVerbOnly(event.target.checked)}
            />
            {gate.verb
              ? t("Make only \"{program} {verb}\" automatic", { program: gate.program, verb: gate.verb })
              : t("This particular form cannot be singled out")}
          </label>
          {gate.stop === "mode" && (
            <small>{t("While every command is approved, a remembered decision still stops each time. It takes effect in automatic mode")}</small>
          )}
        </div>
      )}
      <div className="setting-actions">
        <button
          disabled={busy || keep === "deny"}
          type="button"
          onClick={() => onApprove(proposal.toolCallId, keep === "auto" ? remember : undefined)}
        >
          {t("Run it")}
        </button>
        <button
          className="secondary"
          disabled={busy || keep === "auto"}
          type="button"
          onClick={() => onReject(proposal.toolCallId, keep === "deny" ? remember : undefined)}
        >
          {t("Refuse it")}
        </button>
        <span className="chat-hint">{t("You can write why in the box below")}</span>
      </div>
    </div>
  );
}

const FOLLOW_THRESHOLD_PX = 120;

function Transcript({
  busy,
  onGrow,
  empty,
  hostId,
  items,
  onApprove,
  onReject,
  pendingToolCallId,
  runId,
  working,
  workingLabel,
}: {
  busy: boolean;
  empty: string;
  /** Which server this conversation is about, for opening what a run kept. */
  hostId: string;
  items: RemoteAgentEvent[];
  onApprove: (toolCallId: string, remember?: RememberChoice) => void;
  /** Show one frame at full size. The transcript's copies are thumbnails. */
  onGrow: (frame: string) => void;
  onReject: (toolCallId: string, remember?: RememberChoice) => void;
  pendingToolCallId?: string;
  /** The run being watched. Absent before one starts; a kept file always has one. */
  runId?: string;
  working: boolean;
  workingLabel: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const ownScrollTop = useRef(-1);

  useEffect(() => {
    const element = scroller.current;
    if (!element || !following.current) return;
    element.scrollTop = element.scrollHeight;
    ownScrollTop.current = element.scrollTop;
  }, [items.length, working]);

  return (
    <div
      className="chat-scroll"
      ref={scroller}
      onScroll={() => {
        const element = scroller.current;
        if (!element || element.scrollTop === ownScrollTop.current) return;
        const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
        following.current = distance <= FOLLOW_THRESHOLD_PX;
      }}
    >
      <div className={items.length === 0 && empty ? "chat-content blank" : "chat-content"}>
        {/* A column with nothing in it says so in its middle, with a mark — text in the top-left
            corner of an empty panel reads as something that failed to load. */}
        {items.length === 0 && empty && (
          <div className="chat-blank">
            <BlankIcon />
            <p>{empty}</p>
          </div>
        )}
        {groupByAgent(items).map((group, index) =>
          group.by ? (
            <DelegatedRun
              busy={busy}
              by={group.by}
              hostId={hostId}
              key={`${group.items[0]?.at}-${index}`}
              items={group.items}
              onApprove={onApprove}
              onGrow={onGrow}
              onReject={onReject}
              pendingToolCallId={pendingToolCallId}
              runId={runId}
            />
          ) : (
            group.items.map((event, inner) => (
              <Message
                busy={busy}
                event={event}
                hostId={hostId}
                key={`${event.at}-${index}-${inner}`}
                onApprove={onApprove}
                onGrow={onGrow}
                onReject={onReject}
                pendingToolCallId={pendingToolCallId}
                runId={runId}
              />
            ))
          ),
        )}
        {working && (
          <p className="chat-working">
            <span className="spinner" />
            {workingLabel}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Consecutive lines from one delegated agent, together.
 *
 * A child's work arrives as its own steps in the middle of the parent's conversation. Left flat,
 * a five-command investigation buries what the operator was reading. Grouped, it is one block
 * with a name on it — and the last line stays visible while it is folded, so a run in progress
 * still shows what it is doing.
 */
type Group = { by?: string; items: RemoteAgentEvent[] };

/**
 * One block per delegation, placed where it started.
 *
 * Not by adjacency: two agents working at once interleave line by line, and grouping neighbours
 * would cut both of them into single lines. Each delegation carries its own key, so its lines
 * gather into the block that opened when it began, wherever they arrive.
 */
export function groupByAgent(items: RemoteAgentEvent[]): Group[] {
  const groups: Group[] = [];
  const byRun = new Map<string, Group>();
  for (const event of items) {
    const key = event.kind === "step" ? event.byRun : undefined;
    if (!key || event.kind !== "step") {
      groups.push({ items: [event] });
      continue;
    }
    const existing = byRun.get(key);
    if (existing) {
      existing.items.push(event);
      continue;
    }
    const group: Group = { by: event.by ?? "", items: [event] };
    byRun.set(key, group);
    groups.push(group);
  }
  return groups;
}

/** Folded once there is more than this much of it. Below it, folding hides nothing worth hiding. */
const FOLD_OVER = 2;

function DelegatedRun({
  busy,
  by,
  hostId,
  items,
  onApprove,
  onGrow,
  onReject,
  pendingToolCallId,
  runId,
}: {
  busy: boolean;
  by: string;
  hostId: string;
  items: RemoteAgentEvent[];
  onApprove: (toolCallId: string, remember?: RememberChoice) => void;
  onGrow: (frame: string) => void;
  onReject: (toolCallId: string, remember?: RememberChoice) => void;
  pendingToolCallId?: string;
  runId?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const folded = items.length > FOLD_OVER && !open;
  /* Folded still shows the last line: that is the one that says where it has got to. */
  const shown = folded ? items.slice(-1) : items;

  return (
    <div className="chat-delegated">
      <div className="chat-delegated-head">
        <span className="chat-by">{by}</span>
        <small>{t("{count} item|{count} items", { count: items.length })}</small>
        {items.length > FOLD_OVER && (
          <button className="quiet" type="button" onClick={() => setOpen(!open)}>
            {open ? t("Collapse") : t("Show the {count} before this", { count: items.length - 1 })}
          </button>
        )}
      </div>
      {shown.map((event, index) => (
        <Message
          busy={busy}
          event={event}
          hostId={hostId}
          key={`${event.at}-${index}`}
          onApprove={onApprove}
          onGrow={onGrow}
          onReject={onReject}
          pendingToolCallId={pendingToolCallId}
          runId={runId}
        />
      ))}
    </div>
  );
}

/**
 * What would change, and what the file would become.
 *
 * The diff is the thing being approved, so it is open; the whole file is behind a fold, because
 * a hundred unchanged lines above the fold is how somebody stops reading the ten that matter.
 */
/**
 * The frame, with a mark over it — never in it.
 *
 * The image element carries the screen exactly as it arrived; the mark is a sibling positioned
 * on top. So the evidence stays answerable ("is this the machine as it was?" — yes, always) and
 * the operator can still see what was under the pointer, which a box drawn into the pixels would
 * cover. Same numbers, same drawing, in the chat and in the record view.
 */
function MarkedFrame({
  alt,
  at,
  onGrow,
  src,
}: {
  alt: string;
  at?: { x: number; y: number; kind: "click" | "scroll" | "keys" };
  onGrow: (frame: string) => void;
  src: string;
}) {
  const [size, setSize] = useState<{ width: number; height: number }>();
  /* Percentages, because the thumbnail and the full-size view are different sizes. */
  const left = at && size ? `${(at.x / size.width) * 100}%` : undefined;
  const top = at && size ? `${(at.y / size.height) * 100}%` : undefined;

  return (
    <button className="chat-frame-button" type="button" onClick={() => onGrow(src)}>
      <img
        alt={alt}
        className="chat-frame"
        src={src}
        onLoad={(event) =>
          setSize({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          })
        }
      />
      {at && left && top && (
        <span aria-hidden className={`frame-mark ${at.kind}`} style={{ left, top }} />
      )}
    </button>
  );
}

function DiffView({ diff, proposed }: { diff: string; proposed?: string }) {
  const [whole, setWhole] = useState(false);
  return (
    <div className="chat-diff">
      <pre className="diff">
        {diff.split("\n").map((line, index) => (
          <span
            className={
              line.startsWith("+")
                ? "added"
                : line.startsWith("-")
                  ? "removed"
                  : line.startsWith("@@")
                    ? "skipped"
                    : undefined
            }
            key={index}
          >
            {line}
            {"\n"}
          </span>
        ))}
      </pre>
      {proposed && (
        <>
          <button className="quiet" type="button" onClick={() => setWhole(!whole)}>
            {whole ? t("Close the full text") : t("Show everything it will write")}
          </button>
          {whole && <pre className="remote-output">{proposed}</pre>}
        </>
      )}
    </div>
  );
}

function Message({
  busy,
  event,
  hostId,
  onApprove,
  onGrow,
  onReject,
  pendingToolCallId,
  runId,
}: {
  busy: boolean;
  event: RemoteAgentEvent;
  /** Which server and which run, for the card that offers to open a kept file. */
  hostId: string;
  onApprove: (toolCallId: string, remember?: RememberChoice) => void;
  onGrow: (frame: string) => void;
  onReject: (toolCallId: string, remember?: RememberChoice) => void;
  pendingToolCallId?: string;
  runId?: string;
}) {
  const t = useT();
  switch (event.kind) {
    case "human":
      return (
        <div className="chat-bubble human">
          <p>{event.text}</p>
          <time>{clock(event.at)}</time>
        </div>
      );

    case "proposal": {
      if (event.proposal.toolCallId !== pendingToolCallId) return null;
      return (
        <ProposalCard
          busy={busy}
          hostId={hostId}
          onApprove={onApprove}
          onGrow={onGrow}
          onReject={onReject}
          proposal={event.proposal}
        />
      );
    }

    case "step":
      return <StepMessage hostId={hostId} onGrow={onGrow} runId={runId} step={event} />;

    case "question":
      return (
        <div className="chat-card question">
          <strong>{t("Question")}</strong>
          <p>{event.text}</p>
          <time>{clock(event.at)}</time>
        </div>
      );

    case "error":
      return (
        <p className="chat-line error">
          {event.text}
          <time>{clock(event.at)}</time>
        </p>
      );

    case "done":
      return (
        <p className="chat-line done">
          {event.text}
          <time>{clock(event.at)}</time>
        </p>
      );

    case "thought":
    case "status":
      return (
        <p className="chat-line">
          {event.text}
          <time>{clock(event.at)}</time>
        </p>
      );
  }
}

/**
 * A file the run kept, and the two things a person does with one.
 *
 * The path is never shown as a path: the main process knows where the run's folder is, and the
 * window asks for it by name. Reveal shows it in the file manager; save copies it out, because
 * the record's copy stays where it is — that is what makes it a record.
 */
/**
 * What the button asks for, in the model's language rather than the operator's.
 *
 * It lands in the conversation as a line from the operator, which is the honest place for it:
 * this is a message somebody sent, and it should be visible as one — and editable, re-sendable,
 * or replaceable by their own wording.
 */
const REPORT_REQUEST =
  "Write the report of this work with write_report: what I asked, what you established and what " +
  "showed it, what you could not read and why, and what you would do next. Only what this work " +
  "was about — do not survey the rest of the machine, and do not list the commands.";

export function KeptFile({
  file,
  hostId,
  runId,
}: {
  file: NonNullable<RemoteAgentStepEvent["file"]>;
  hostId: string;
  runId?: string;
}) {
  const t = useT();
  const [saved, setSaved] = useState<string>();
  const size =
    file.bytes >= 1_000_000
      ? `${(file.bytes / 1_000_000).toFixed(1)}MB`
      : file.bytes >= 1000
        ? `${Math.round(file.bytes / 1000)}KB`
        : t("{bytes} bytes", { bytes: file.bytes });

  return (
    <div className="chat-kept">
      <div className="chat-kept-what">
        <code title={file.name}>{file.name}</code>
        {/* Eight characters is enough to tell two versions of a file apart by eye; the whole
            hash is in the record, and in this element's title for anyone comparing. */}
        <small title={`sha256 ${file.sha256}`}>
          {size}・sha256 {file.sha256.slice(0, 8)}
        </small>
      </div>
      {runId && (
        <div className="chat-kept-actions">
          <button
            className="quiet"
            type="button"
            onClick={() => void window.machina.remoteAgent.revealKept(hostId, runId, file.savedAs)}
          >
            {t("Open")}
          </button>
          <button
            className="quiet"
            type="button"
            onClick={() =>
              void window.machina.remoteAgent
                .saveKept(hostId, runId, file.savedAs)
                .then((where) => setSaved(where))
                .catch(() => undefined)
            }
          >
            {t("Saving…")}
          </button>
        </div>
      )}
      {saved && (
        <small className="chat-kept-saved">{t("Saved to {where}", { where: saved })}</small>
      )}
    </div>
  );
}

/** One command, with what it said. */
function StepMessage({
  hostId,
  onGrow,
  runId,
  step,
}: {
  hostId: string;
  /** Show one frame at full size. */
  onGrow: (frame: string) => void;
  /** Which run's folder the kept file is in. */
  runId?: string;
  step: RemoteAgentStepEvent;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const output = step.output ?? "";
  const lines = output ? output.split("\n") : [];
  // Long output folds. The first few lines are usually the answer, and the rest is why.
  const preview = lines.slice(0, 6).join("\n");
  const foldable = lines.length > 6;

  return (
    <div className={`chat-step ${step.ok ? "" : "failed"}`}>
      <div className="chat-step-head">
        <span>{String(step.index).padStart(2, "0")}</span>
        <code className="remote-command">{step.summary}</code>
        <small>{decisionLabel(step)}</small>
        <time>{clock(step.at)}</time>
      </div>
      {step.reason && <p className="chat-step-reason">{step.reason}</p>}
      {step.detail && <p className="chat-step-reason">{step.detail}</p>}
      {output && (
        <>
          <pre className="remote-output">{open ? output : preview}</pre>
          {foldable && (
            <button className="quiet" type="button" onClick={() => setOpen(!open)}>
              {open ? t("Collapse") : t("Show the remaining {count} lines", { count: lines.length - 6 })}
            </button>
          )}
        </>
      )}
      {(step.frameBefore || step.frameAfter) && (
        <div className="chat-frames">
          {/* Small here, full size when pressed: 140px is enough to see that something changed
              and not enough to see what. */}
          {step.frameBefore && (
            <figure>
              {/* The mark goes on the "before" frame: that is the one showing what was aimed at. */}
              <MarkedFrame alt={t("Before")} at={step.point} onGrow={onGrow} src={step.frameBefore} />
              <figcaption>{t("Before")}</figcaption>
            </figure>
          )}
          {step.frameAfter && (
            <figure>
              <MarkedFrame alt={t("After")} onGrow={onGrow} src={step.frameAfter} />
              <figcaption>{t("After")}</figcaption>
            </figure>
          )}
        </div>
      )}
      {step.file && <KeptFile file={step.file} hostId={hostId} runId={runId} />}
      {step.usedSecret && (
        <p className="chat-step-reason">{t("A setting was passed in, so the output was not kept.")}</p>
      )}
    </div>
  );
}

function clock(at: string) {
  return formatTime(at);
}

function decisionLabel(step: RemoteAgentStepEvent) {
  if (step.decision === "rejected") return t("Rejected");
  if (!step.ok) return step.code === undefined ? t("Failed") : t("exit {code}", { code: step.code });
  return step.decision === "auto" ? t("Automatic") : t("Approved");
}


/**
 * How hard to think, and what that costs.
 *
 * Pi's scale has six rungs; four of them are what somebody actually chooses between. The note is
 * the trade, because that is the whole question — a wrong answer quickly is not cheaper.
 */
const thinkingKey = (hostId: string) => `machina.remote.thinking.${hostId}`;

/*
 * A function, not a constant: words read at import time would be the language the window opened
 * in, and would keep saying it after the operator switched.
 */
const thinkingChoices = (t: Translate): Array<{ value: RemoteThinking; label: string; note: string }> => [
  { value: "minimal", label: t("Do not think"), note: t("fast, cheap") },
  { value: "low", label: t("Think a little"), note: "" },
  { value: "medium", label: t("Normal"), note: t("default") },
  { value: "high", label: t("Think well"), note: t("slow, dear") },
  { value: "max", label: t("Think it right through"), note: t("slowest of all") },
];

/** The model each service answers with when nobody names one. Mirrors the settings page. */
const SERVICE_DEFAULT_MODELS: Record<string, string> = {
  "openai-codex": "gpt-5.5",
  anthropic: "claude-opus-4-8",
  google: "gemini-3.1-pro-preview",
  xai: "grok-4.5",
  openai: "gpt-5.5",
  "github-copilot": "gpt-5.4",
  openrouter: "moonshotai/kimi-k2.6",
};

/** What actually answers: the model id, not the nickname beside it. */
function modelIdOf(model: {
  provider: string;
  codexModel?: string;
  modelId: string;
  piProvider?: string;
}) {
  if (model.provider === "codex") {
    return (
      model.codexModel?.trim() ||
      SERVICE_DEFAULT_MODELS[model.piProvider ?? "openai-codex"] ||
      t("The default model")
    );
  }
  return model.modelId.trim() || t("No model set");
}

/**
 * The same id, at the size of a chip in the composer.
 *
 * `unsloth/Qwen3.8-27B-GGUF:UD-IQ2_XXS` in the 87px the composer's bottom row can spare comes out
 * as `unsloth/Q…`, which names neither the model nor the service. Two parts of an id like that
 * one are addressing rather than identity — who publishes it, before the `/`, and how it was
 * quantised, after the `:` — and dropping them leaves `Qwen3.8-27B-GGUF`, which is the answer to
 * "what is about to read this server". The whole id stays in the menu and in the tooltip.
 */
function shortenModelId(id: string) {
  const withoutDistributor = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  return withoutDistributor.split(":")[0].trim() || id;
}

/**
 * Shortened only where it stays unambiguous.
 *
 * Two quantisations of one model — `…:UD-IQ2_XXS` and `…:Q8_0` — are two different things to run,
 * and one word for both would be a chip that lies about which is answering. When shortening would
 * collide, everything that collides keeps its full id and is cut with an ellipsis instead.
 */
function shortModelNames(ids: string[]) {
  const uses = new Map<string, number>();
  for (const id of new Set(ids)) {
    const short = shortenModelId(id);
    uses.set(short, (uses.get(short) ?? 0) + 1);
  }
  return (id: string) => {
    const short = shortenModelId(id);
    return uses.get(short) === 1 ? short : id;
  };
}

/** Where a chosen model actually sends the output, for the line that names it. */
function describeModelTitle(model: RemoteModel) {
  return model.provider === "codex"
    ? `${model.piProvider ?? "openai-codex"}（${model.codexModel?.trim() || t("The default model")}）`
    : `${model.modelId} @ ${model.baseUrl}`;
}

/**
 * How long ago, in the fewest characters that answer it.
 *
 * "a week" rather than a date: the question a list of past conversations answers is "how recent
 * is this one", and a date makes the reader do the subtraction.
 */
function runAge(at: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60_000));
  if (minutes < 1) return t("just now");
  if (minutes < 60) return t("{minutes} min ago", { minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("{hours} h ago", { hours });
  const days = Math.round(hours / 24);
  if (days < 7) return t("{days} days ago", { days });
  const weeks = Math.round(days / 7);
  if (weeks < 5) return t("{weeks} weeks ago", { weeks });
  return t("{months} months ago", { months: Math.round(days / 30) });
}

/*
 * The three in the header, drawn on the same 24-unit grid with the same stroke.
 *
 * Hand-placed paths on a 15-unit grid is how the gear came out looking like a sun and the teeth
 * came out uneven: at 15px a half-unit error is a tenth of the icon. Drawn large and scaled down,
 * they line up with each other and with the rest of the interface.
 */

/** A clock with an arrow going back: what was said before. */
function HistoryIcon() {
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
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7.5V12l3.5 2" />
    </svg>
  );
}

function SettingsIcon() {
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

/** A pencil over a page: writing a new one, which is what starting again is. */
function ComposeIcon() {
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
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.4 2.6a2 2 0 0 1 3 3L12 15l-4 1 1-4z" />
    </svg>
  );
}

/** The blank column's mark. A shell prompt: what this conversation ends up doing. */
function BlankIcon() {
  return (
    <svg
      aria-hidden
      fill="none"
      height="26"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
      width="26"
    >
      <rect height="16" rx="2.5" width="20" x="2" y="4" />
      <path d="m7 9.5 3 2.5-3 2.5M12.5 15h4.5" />
    </svg>
  );
}
