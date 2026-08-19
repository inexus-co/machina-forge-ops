import type { CatalogEntry } from "./catalog";

/**
 * The agent on the remote maintenance path.
 *
 * It runs commands on a server that was already running sshd, and the guarantee it makes is about
 * what may leave this process.
 *
 * Four tools. A shell is not one of them: the agent asks for a command, and a command has to get
 * past the allowlist, the metacharacter rule and — for anything destructive or elevated — a
 * person, before it leaves this process.
 */

/**
 * The conversation that belongs to no server.
 *
 * An agent with a wall on this machine can read skills, work things out, write a file and keep
 * it — none of which needs a customer's server. Before this, the only way to talk to it was to
 * register a server first, which put a form asking for somebody's address and password in front
 * of a person who only wanted to ask a question.
 */
export const LOCAL_AGENT_HOST = "__local__";

export type RemoteAgentToolName =
  | "run_command"
  | "run_local"
  | "read_file"
  | "write_file"
  | "save_local"
  | "write_note"
  | "read_screen"
  | "read_server_facts"
  | "fetch_log"
  | "ask_human"
  | "done"
  | "delegate";

/**
 * A server's dossier — its logbook. What the operator wrote about it, and what past runs left
 * behind. Kept per host on this machine; the facts of the moment are collected fresh, not stored
 * here.
 */
export type ServerHandover = { at: string; runId: string; goal?: string; text: string };
/**
 * What an investigation established, kept for the next one.
 *
 * A titled note: "WordPress on ise-rika", "Apache and its vhosts". The agent writes them as it
 * finds things out, and they are put in front of the next run — so a conversation about this
 * server does not start at `httpd -S` every time. Titled rather than one growing document,
 * because a second look at the same subject should replace what it corrects and leave the rest.
 *
 * Not the commands: those are in the record. What belongs here is what turned out to be true.
 */
export type ServerNote = { at: string; title: string; text: string; runId?: string };
export type ServerDossier = {
  notes: string;
  /** What the agent has established, newest first. The operator can correct or delete any of it. */
  agentNotes?: ServerNote[];
  handovers: ServerHandover[];
  /**
   * The last facts summary this machine collected for the server.
   *
   * Kept — unlike the full facts, which are fresh each run — only so a cheap read can say which
   * plugins fit the server (see `remotePlugins`), without collecting facts again just to suggest one.
   */
  lastFacts?: { at: string; summary: string };
};

/** The facts preview the logbook panel shows — rendered, ready to display. */
export type ServerFactsView = { at: string; summary: string; detail: string };

/**
 * What an agent is allowed to run.
 *
 * Named and chosen before a run starts, so "read the logs" and "restart the database" are
 * different powers rather than the same shell used carefully. There is no default list and no
 * wildcard: a set that does not name `systemctl` cannot reach it.
 */
/**
 * Which arguments of a program may run without stopping for a person.
 *
 * `"all"` — the program only reads, whatever it is given (`ls`, `df`, `dpkg-query`).
 * A list — only those first arguments (`docker: ps logs inspect`).
 * Absent — the program always stops for a person, however it is called.
 *
 * The absent case is the important one: a program nobody has thought about asks, rather than
 * running. Forgetting is then a conversation, not a change on a customer's machine.
 */
export type QuietArguments = "all" | string[];

export type RemoteCommandSet = {
  id: string;
  name: string;
  /** Bare program names — `journalctl`, never `/usr/bin/journalctl`. */
  allow: string[];
  /** Elevation is off unless somebody turned it on, and always needs a person even then. */
  allowSudo: boolean;
  /**
   * What this list lets through unattended, by program.
   *
   * Only consulted in automatic mode — every command stops step by step, and none runs in plan mode.
   * This is the operator's judgement, written where they can see it, rather than a table of
   * dangerous verbs kept in the source: that table could only ever list the dangers somebody
   * had already thought of, and anything missing from it ran silently.
   */
  quiet?: Record<string, QuietArguments>;
};

/**
 * How much the agent may do on its own.
 *
 * Three words, and what matters is what `auto` does *not* cover: destructive commands and `sudo`
 * stop for a person in every mode.
 */
export type RemoteApprovalMode = "step" | "auto" | "plan";

/**
 * What one program may do under one agent: run unattended, stop for a person, or be refused
 * without a person being interrupted.
 *
 * These are the operator's *exceptions* — the shipped catalog already answers for every command
 * it knows, so a rule exists only where somebody decided differently. Zero rules is the normal,
 * healthy state of a profile.
 */
export type RemoteRuleAction = "auto" | "ask" | "deny";

/** Where a rule came from, shown beside it so a decision can be traced to its moment. */
export type RemoteRuleOrigin = {
  /** `run` = remembered from an approval card. `hand` = the settings screen. `migrated` = carried over from the old category settings. */
  by: "run" | "hand" | "migrated";
  runId?: string;
  hostId?: string;
  at: string;
};

export type RemoteCommandRule = {
  action: RemoteRuleAction;
  /** For `action: "ask"`: first arguments that may nevertheless run unattended (`systemctl status`). */
  autoVerbs?: string[];
  origin?: RemoteRuleOrigin;
};

/** Keyed by program name — the first word, `Get-Service` included. Matching is case-insensitive. */
export type RemoteRuleSet = Record<string, RemoteCommandRule>;

/**
 * What this installation remembered on one server.
 *
 * Kept apart from the global rules on purpose: these are written mid-run by the approval card,
 * and the settings screen saves the rest — two writers on one field would race, so each field
 * has exactly one writer. Host rules win over the global rules, program by program.
 */
export type RemoteHostRules = { hostId: string; rules: RemoteRuleSet };

/**
 * Everything `judgeCommand` reads: the merged view of one agent's power on one server.
 *
 * Built once per run by the controller (profile rules ← host rules) and mutated live when the
 * operator remembers a decision mid-run, so the next step already obeys it.
 */
export type RulePolicy = {
  /** The agent's name, for refusal sentences the model reads. */
  name: string;
  allowSudo: boolean;
  /** Whether catalog `read` commands run unattended. The one dial; on unless turned off. */
  autoReads: boolean;
  rules: RemoteRuleSet;
};

/**
 * The judgement material a stopped command carries to the approval card, and whether the card
 * may offer to remember the operator's answer.
 */
export type ProposalGate = {
  /** The first word — what a remembered decision would be about. */
  program: string;
  /** The first argument, when there is one, for the narrower "this verb only" choice. */
  verb?: string;
  /**
   * Why it stopped. `floor` = sudo, destructive, or a device — never rememberable. `unknown` = not in the
   * catalog. `catalog` = the catalog said confirm. `rule`/`verb` = this agent's own exception.
   * `mode` = only because the run confirms every step.
   */
  stop: "floor" | "unknown" | "catalog" | "rule" | "verb" | "mode";
  canRemember: boolean;
  /** The catalog's one-line description, when it has one. */
  summary?: string;
};

/** What the operator asked to be remembered, riding on the approve/reject answer. */
export type RememberChoice =
  | { action: "auto"; verbOnly?: boolean }
  | { action: "deny" };

export type RemoteAgentProposal = {
  toolCallId: string;
  /**
   * What the agent was looking at when it asked, as a data URL.
   *
   * For a pointer there is no other way to judge: "click at (412, 380)" is not a sentence
   * anybody can approve. The picture is the proposal.
   */
  frame?: string;
  tool: RemoteAgentToolName;
  /** One line for the approval button — the command as it would be sent. */
  summary: string;
  reason?: string;
  /** Why this one stops for a person even in `auto`. */
  approvalReason?: string;
  /** The delegated agent asking, when it is not the one the operator started. */
  by?: string;
  /** Where the pointer would go, for a proposal a person cannot judge from its words. */
  point?: { x: number; y: number; kind: "click" | "scroll" | "keys" };
  /**
   * The change itself, for a proposal that changes a file.
   *
   * A path and a sentence cannot be judged — "this rewrites nginx.conf" tells the operator
   * nothing about what would be different. ADR 0002 puts the diff and the whole new file in
   * front of a person before anything is written.
   */
  diff?: string;
  /** The complete file as it would be written, under the diff. */
  proposed?: string;
  /** Judgement material and the remember options, for a stopped command. */
  gate?: ProposalGate;
};

/** One command that ran, with what it said. */
export type RemoteAgentStepEvent = {
  kind: "step";
  at: string;
  index: number;
  tool: RemoteAgentToolName;
  summary: string;
  reason?: string;
  decision: "auto" | "approved" | "rejected";
  ok: boolean;
  /** Exit status, when there was one. */
  code?: number;
  /**
   * Which wall a local command ran behind — `seatbelt`, `linux`, `docker`.
   *
   * Absent for anything that ran on the customer's server. Present so the record answers "was
   * this walled, and by what" without the reader having to know what the machine could build
   * that day. ADR 0002 requires the fact to travel in the record rather than in a consent
   * dialog nobody can find afterwards.
   */
  sandbox?: string;
  /**
   * `false` when this command ran with no wall at all — never `true`.
   *
   * The exception in ADR 0002: a machine with no mechanism to build a wall out of, whose operator
   * accepted that by hand. Written into the record so those runs can be found and counted later;
   * absent is the normal case, and `sandbox` names the wall that held.
   */
  sandboxed?: false;
  /**
   * A file this step kept on this machine, beside the record.
   *
   * The work directory dies with the run; this is what was carried out of it — a report, a
   * generated configuration, or the copy of a customer's file taken before it was changed. The
   * window offers to open it, so the path is relative to the run's own folder and never absolute:
   * the main process is the one that knows where that is.
   */
  file?: { name: string; savedAs: string; bytes: number; sha256: string };
  /** What it printed, trimmed for the screen. Absent when the command used a stored secret. */
  output?: string;
  detail?: string;
  usedSecret?: boolean;
  /** What changed, for a step that wrote a file. Kept so the record can be read months later. */
  diff?: string;
  /** The screen before and after, for a step that worked the screen rather than the shell. */
  frameBefore?: string;
  frameAfter?: string;
  /**
   * Where on the screen it happened, in the frame's own pixels.
   *
   * Recorded rather than drawn into the picture. A frame with a box burned into it is no longer
   * the screen as it was — "is this what the machine looked like" stops having a simple answer —
   * and the box covers the very thing under the pointer. The chat and the record view draw the
   * same mark from these numbers, so the evidence stays untouched. See ADR 0002.
   */
  point?: { x: number; y: number; kind: "click" | "scroll" | "keys" };
  /**
   * Which agent did this, when it was not the one the operator is talking to.
   *
   * A delegated run's commands land in the same conversation and the same record as its parent's
   * — one server, one guarantee, one list of what was done to it. This says whose idea each line
   * was.
   */
  by?: string;
  /**
   * Which delegation, not just which agent.
   *
   * Two agents working at the same time interleave, so their lines cannot be grouped by being
   * next to each other; and the same agent asked twice is two pieces of work, not one. This is
   * unique per delegation, and it is what the transcript groups by.
   */
  byRun?: string;
};

export type RemoteAgentEvent =
  | { kind: "status"; at: string; text: string }
  | { kind: "thought"; at: string; text: string }
  | { kind: "proposal"; at: string; proposal: RemoteAgentProposal }
  | { kind: "human"; at: string; text: string }
  | { kind: "question"; at: string; text: string }
  | { kind: "done"; at: string; text: string }
  | { kind: "error"; at: string; text: string }
  | RemoteAgentStepEvent;

export type RemoteAgentFinish =
  | "done"
  | "stopped"
  | "limit"
  | "timeout"
  | "error"
  | "question";

export type RemoteAgentRunState = {
  running: boolean;
  goal?: string;
  steps: number;
  approvalMode: RemoteApprovalMode;
  /** Which set of powers this run has. Shown before it starts, not only in the record. */
  commandSetId?: string;
  commandSetName?: string;
  /** Which model this run is asking. Named in the transcript, not only in the record. */
  modelName?: string;
  runId?: string;
  pending?: RemoteAgentProposal;
  events: RemoteAgentEvent[];
  finished?: RemoteAgentFinish;
  /** Whether a session exists that an answer can continue. */
  resumable: boolean;
  /** Where this run's record is being written, for the button that opens it. */
  recordPath?: string;
};

/**
 * How hard the model is asked to think, when it is a model that can be asked.
 *
 * Pi's own scale (`ThinkingLevel`). A cheap question and a broken server are not the same job,
 * and the difference is money and minutes — so it is chosen per run, beside the model.
 */
export type RemoteThinking = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export type RemoteAgentStartInput = {
  goal: string;
  approvalMode: RemoteApprovalMode;
  /**
   * The categories this run may use, when no named agent decided them.
   *
   * Several, because one job crosses shelves: reading logs to explain what the package update
   * did is two categories, and making the operator pick one was making them pick which half of
   * the question to ask.
   */
  commandCategoryIds?: string[];
  /** What a single-category run named, before the catalog. Read from old saved state only. */
  commandSetId?: string;
  /** Which registered model answers this run. Absent means the default one. */
  modelId?: string;
  /** Which named way of working this run was started as, for the record and the transcript. */
  profileId?: string;
  /** Terminals the operator handed over with this message. See `RemoteAttachment`. */
  attachments?: RemoteAttachment[];
  /** How hard to think. Absent means Pi's own default. */
  thinking?: RemoteThinking;
  /**
   * Shell or screen, when no named agent decided it.
   *
   * A server with RDP and no SSH can only be worked through its screen, and the window knows
   * that without anybody configuring an agent for it.
   */
  control?: "shell" | "screen";
};

/**
 * A terminal's text, handed to the agent because the operator said so.
 *
 * The agent has no view of the shell somebody is typing in — that shell has no allowlist and no
 * record, and giving an agent a second way onto a customer's machine is the one thing this whole
 * design refuses. What can be handed over is what is *on the screen*, as text, when the operator
 * attaches it. It travels with one message and is written into the run's record.
 */
export type RemoteAttachment = {
  /** What the tab is called: "Terminal 1". Shown in the conversation, so nothing is sent unseen. */
  title: string;
  text: string;
};

/**
 * One model an operator has registered.
 *
 * A list rather than a single one, because the choice is not made once. A local model over a
 * self-hosted endpoint is free and stays inside the building; a subscription answers harder
 * questions; a cheap remote one is for reading logs. Which of those is right depends on the
 * server in front of you and on whose output may leave, and that is a decision per run, not per
 * installation.
 *
 * There is no catalogue of models here: every entry was typed by a person.
 */
export type RemoteModel = {
  /** Stable across renames — the run records it and the composer remembers it. */
  id: string;
  /** What the operator calls it. Shown in the picker. */
  name: string;
  /**
   * How it is reached.
   *
   * `codex` is OpenAI's own command-line client, already signed in with the operator's ChatGPT
   * subscription — no key to paste, and nothing here pretending to be somebody else's client.
   * `endpoint` is any OpenAI-compatible address, including a self-hosted one.
   */
  provider: "endpoint" | "codex";
  /**
   * Which of Pi's own providers, when `provider` is not `endpoint`.
   *
   * `openai-codex` (ChatGPT subscription), `anthropic` (Claude), `google` (Gemini), `xai`
   * (Grok), and the rest Pi ships. Absent means the ChatGPT subscription, which is what this
   * setting used to mean when it was the only one.
   */
  piProvider?: string;
  /** `endpoint` only. */
  baseUrl: string;
  /** `endpoint` only: the name the endpoint knows it by. */
  modelId: string;
  /** `codex` only. Empty means whatever `codex` is itself configured to use. */
  codexModel?: string;
  /** Whether `read_screen` is offered. A model that cannot see is not asked to look. */
  supportsImages: boolean;
  /** Whether a key is stored for this one. The key itself never comes back. */
  hasApiKey: boolean;
};

/** A model as it is saved. The key rides separately and only when it changes. */
export type RemoteModelInput = Omit<RemoteModel, "hasApiKey"> & {
  /** A new key. Left out means "keep the stored one". */
  apiKey?: string;
  clearApiKey?: boolean;
};

/**
 * A named way of working: which model, what it may run, how far it may go alone, and what it
 * should keep in mind.
 *
 * The four choices that are made before every run, made once and given a name. "Read the logs"
 * is a cheap model with a read-only allowlist and no approvals to give; "Fix production" is the
 * careful model, the set with sudo, and a person on every step. Picking one in the conversation
 * sets all four at once, which is the point — they are wrong in combination, not one at a time.
 */
export type RemoteAgentProfile = {
  id: string;
  name: string;
  /**
   * What this agent works with: the shell over SSH, or the desktop over RDP.
   *
   * Never both — see `piTools.ts`. A server with no SSH at all is worked through the screen,
   * which is the whole reason the second one exists.
   */
  control?: "shell" | "screen";
  /** Empty means "whatever the default model is". */
  modelId?: string;
  /**
   * The categories of command this agent may use, merged for the run.
   *
   * Categories rather than one hand-made list: building a list per agent meant picking the same
   * fifty command names again every time, and two agents that both wanted to read logs said so
   * twice. A category is written once and joined by whoever needs it — and it carries its own
   * read/write settings, so joining it brings the judgement with it.
   */
  commandCategoryIds?: string[];
  /** Names this agent may run that no category covers. The exception, not the rule. */
  extraCommands?: string[];
  /** Superseded: permissions live on the installation now, not on a sub-agent. Read once. */
  allowSudo?: boolean;
  /** Superseded, read for migration only. */
  autoReads?: boolean;
  /** Superseded, read for migration only — folded into the installation's rules. */
  rules?: RemoteRuleSet;
  /** Superseded by `commandCategoryIds`. Read when an old settings file is opened. */
  commandSetId?: string;
  approvalMode: RemoteApprovalMode;
  /** Added to the system prompt for runs started as this one. */
  instructions?: string;
  /**
   * Other named agents this one may hand a task to.
   *
   * Empty for almost every profile, and ignored for a run that is itself delegated: one level
   * deep, so a mistake cannot recurse. Naming an agent here is what gives this one the
   * `delegate` tool at all.
   */
  delegates?: string[];
};

export type RemoteAgentSettings = {
  /**
   * Tools from extensions that are allowed to reach the agent.
   *
   * Named one by one, and off until they are. Everything else about an extension — the events it
   * hooks, what it logs — happens whether or not this list mentions it; what this gates is the
   * agent being able to *call* it.
   */
  extensionTools: string[];
  /** Which wall local execution uses: `auto`, or a named backend. */
  sandbox: "auto" | "seatbelt" | "linux" | "docker";
  /** The named ways of working, and which one a new conversation starts as. */
  profiles: RemoteAgentProfile[];
  defaultProfileId?: string;
  models: RemoteModel[];
  /** Which one a run uses when nobody picked. Empty when there are none yet. */
  defaultModelId?: string;
  commandSets: RemoteCommandSet[];
  /**
   * The installation's exceptions to the catalog. One set for every conversation and every
   * sub-agent — permissions belong to the operator's installation, not to a named way of
   * working. Edited on the command-knowledge screen.
   */
  rules: RemoteRuleSet;
  /** Whether catalog reads run unattended. The one dial; on unless turned off. */
  autoReads: boolean;
  /** Whether sudo may be used at all (a person is still asked every time it is). */
  allowSudo: boolean;
  /** Whether every run keeps the whole conversation with the model, beside its record. */
  tracing: boolean;
  /**
   * What was remembered on each server, from approval cards mid-run.
   *
   * Never part of `RemoteAgentSettingsInput`: the settings screen shows these but cannot send
   * them back, which is what keeps a stale settings window from erasing a decision made while it
   * was open.
   */
  hostRules: RemoteHostRules[];
};

/**
 * What this machine can do about walls, as the window is told it.
 *
 * `canBuild: false` is the only thing that opens the exception of ADR 0002, and `consent` is what
 * the person at this machine said about it. Both are read fresh: the window shows the state, it
 * does not remember a click.
 */
export type RemoteWallState = {
  wall?: string;
  canBuild: boolean;
  consent: { accepted: boolean; at?: string; machine?: string };
};

export type RemoteAgentSettingsInput = {
  extensionTools?: string[];
  sandbox?: "auto" | "seatbelt" | "linux" | "docker";
  profiles?: RemoteAgentProfile[];
  defaultProfileId?: string;
  models: RemoteModelInput[];
  defaultModelId?: string;
  commandSets: RemoteCommandSet[];
  /** The installation's exceptions and dials. Absent means "leave them as they stand". */
  rules?: RemoteRuleSet;
  autoReads?: boolean;
  allowSudo?: boolean;
  tracing?: boolean;
};

/*
 * Nothing here stops a run.
 *
 * There was a ceiling on commands and a clock on the whole run, and both were this application
 * deciding when somebody else's work had gone on long enough. A run ends when the agent says it
 * is done, or when the operator presses stop. What keeps a customer's server safe is the
 * allowlist and the approval in front of every command — not a number.
 */

/*
 * There is no clock on a run.
 *
 * There was: fifteen minutes, chosen here. Workspace ADR 0001 item 6 asks for a bound that is not
 * optional, and this was read as "a timer" — but a timer measures the wrong thing. It cuts a slow
 * job that is going fine and tolerates a fast one that is going nowhere. What bounds a run is the
 * operator: every command stops for them unless they chose automatic, and the stop button is
 * always there. That is the ADR's intent; the number was this file's invention.
 */

/**
 * One finished conversation, as the sidebar lists it.
 *
 * Read from the record on disk rather than kept in memory: the point of a history is that it
 * survives the window being closed, and a list that only knows about this session's runs would
 * be empty exactly when somebody goes looking for what happened yesterday.
 */
export type RemoteRunSummary = {
  id: string;
  startedAt: string;
  goal?: string;
  commandSet?: string;
  /** How many commands were attempted, refusals included. */
  steps: number;
  finish?: RemoteAgentFinish;
};

/** A finished conversation, read back. Same shape the run wrote. */
export type RemoteRunDocument = {
  id: string;
  host: string;
  goal?: string;
  commandSet?: string;
  approvalMode: string;
  startedAt: string;
  finish?: RemoteAgentFinish;
  finishedAt?: string;
  steps: Array<{
    at: string;
    command?: string;
    /** A file this step kept, openable from the record months later. */
    file?: { name: string; savedAs: string; bytes: number; sha256: string };
    code?: number;
    output?: string;
    refused?: string;
    error?: string;
    timedOut?: boolean;
    usedSecret?: boolean;
  }>;
};

export type MachinaRemoteAgentApi = {
  settings(): Promise<RemoteAgentSettings>;
  /** Whether the codex CLI is on this machine and signed in, for the settings screen. */
  codexStatus(): Promise<{ version?: string; signedIn: boolean }>;
  saveSettings(input: RemoteAgentSettingsInput): Promise<RemoteAgentSettings>;
  /** Which wall this machine can build, and what its operator has said about having none. */
  wall(): Promise<RemoteWallState>;
  /** Take the responsibility on, or hand it back. Refused where a wall can be built. */
  acceptNoWall(accepted: boolean): Promise<RemoteWallState>;

  getState(hostId: string): Promise<RemoteAgentRunState | undefined>;
  start(hostId: string, input: RemoteAgentStartInput): Promise<void>;
  say(hostId: string, text: string, attachments?: RemoteAttachment[]): Promise<void>;
  answer(hostId: string, text: string): Promise<void>;
  reset(hostId: string): Promise<void>;
  approve(hostId: string, toolCallId: string, remember?: RememberChoice): Promise<boolean>;
  reject(
    hostId: string,
    toolCallId: string,
    note?: string,
    remember?: RememberChoice,
  ): Promise<boolean>;
  stop(hostId: string): Promise<void>;
  setApprovalMode(hostId: string, mode: RemoteApprovalMode): Promise<void>;
  /** Show a record in the file manager. Without a run id, the one this session is writing. */
  revealRecord(hostId: string, runId?: string): Promise<void>;
  /** Show a file a run kept in the operator's file manager. */
  revealKept(hostId: string, runId: string, name: string): Promise<void>;
  /** Copy it somewhere the operator chooses. Returns where, or nothing if they changed their mind. */
  saveKept(hostId: string, runId: string, name: string): Promise<string | undefined>;
  /** How often this server has seen a program before, from the run records. */
  commandHistory(hostId: string, program: string): Promise<{ count: number; lastAt?: string }>;
  /** The shipped catalog, searched by name or description. */
  catalogSearch(query: string, os?: "linux" | "windows"): Promise<CatalogEntry[]>;
  /** How much the catalog knows, for the settings screen's opening line. */
  catalogCounts(): Promise<{ linux: number; windows: number; tier1: number; total: number }>;
  /** Forget everything one agent remembered on one server. */
  forgetHostRules(hostId: string): Promise<void>;
  /** Past conversations with this server, newest first. */
  listRuns(hostId: string): Promise<RemoteRunSummary[]>;
  loadRun(hostId: string, runId: string): Promise<RemoteRunDocument>;
  onState(listener: (hostId: string, state: RemoteAgentRunState) => void): () => void;
  /** The settings were saved — possibly in another window. Whatever shows them re-reads. */
  onSettingsSaved(listener: () => void): () => void;

  // ── the server's dossier (the logbook) ────────────────────────────────────
  /** This server's notes and handovers. */
  serverContext(hostId: string): Promise<ServerDossier>;
  saveServerNotes(hostId: string, notes: string): Promise<ServerDossier>;
  deleteHandover(hostId: string, at: string, runId: string): Promise<ServerDossier>;
  /** Correct one of the agent's notes by hand, or write one of your own under a new title. */
  saveAgentNote(hostId: string, title: string, text: string): Promise<ServerDossier>;
  /** Forget one of them. The title is what names it. */
  deleteAgentNote(hostId: string, title: string): Promise<ServerDossier>;
  /** Read the facts now, for the panel — the same probes the agent uses at run start. */
  factsPreview(hostId: string): Promise<ServerFactsView>;
  /** A model's second opinion on a command, for the approval card. Advisory; may be undefined. */
  riskHint(command: string): Promise<{ risky: boolean; note: string } | undefined>;
  /** A customer-facing Markdown report over a period (ISO strings, inclusive). */
  buildReport(hostId: string, from?: string, to?: string): Promise<string>;
  /** Save a report to a file the operator chooses. Returns the path, or nothing if cancelled. */
  /** How big this run's trace is, or nothing when it kept none. */
  traceSize(hostId: string, runId: string): Promise<number | undefined>;
  /** Write the whole conversation out: the lines as they are, or as something to read. */
  saveTrace(
    hostId: string,
    runId: string,
    format: "jsonl" | "markdown",
  ): Promise<string | undefined>;
  saveReport(hostId: string, markdown: string): Promise<string | undefined>;
  /** A run finished, or notes/handovers changed — the logbook panel re-reads. */
  onServerContextChanged(listener: (hostId: string) => void): () => void;
};
