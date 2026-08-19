import { contextBridge, ipcRenderer } from "electron";
import type { MachinaOpsApi } from "../shared/api";
import type { Locale } from "../shared/i18n";
import type { CatalogEntry } from "../shared/catalog";
import type {
  HostKeyChange,
  HostKeyQuestion,
  RemoteClipboard,
  RemoteHostInput,
  RemoteHostState,
  RemoteScreenEvent,
} from "../shared/remote";
import type { RemoteListing, Transfer } from "../shared/remoteFiles";
import type { HistoryExportRow, HistoryFormat, TypedCommand } from "../shared/remoteHistory";
import type { PanelKind } from "../shared/remotePanels";
import type { RecordingSummary } from "../shared/remoteRecording";
import type {
  AuthPromptView,
  AgentResource,
  ResourceInspection,
  ResourceKind,
  ResourceReview,
} from "../shared/remoteResources";
import type { BuiltinPlugin, PluginView } from "../shared/remotePlugins";
import type { Inventory, LogSource } from "../shared/remoteInventory";
import type { HostStatus, HostStatusError } from "../shared/remoteStatus";
import type {
  RemoteAgentRunState,
  RememberChoice,
  RemoteAgentSettings,
  RemoteAgentSettingsInput,
  RemoteAgentStartInput,
  RemoteAttachment,
  RemoteApprovalMode,
  RemoteRunDocument,
  RemoteRunSummary,
  RemoteWallState,
  ServerDossier,
  ServerFactsView,
} from "../shared/remoteAgent";

/**
 * The bridge, and the whole of it.
 *
 * Every line here is a hole in the wall between the window and the main process, so the list is
 * meant to be read: what is not written here cannot be reached from the renderer at all. Nothing
 * returns a password or an API key — those go in and stay in.
 */

const api: MachinaOpsApi = {
  i18n: {
    /* The one synchronous call on this bridge — the page cannot be drawn without it. */
    initial: () => ipcRenderer.sendSync("i18n:sync") as Locale,
    /* Asked again once the window is drawing — see `localeController`. */
    current: () => ipcRenderer.invoke("i18n:current") as Promise<Locale>,
    set: (locale: Locale) => ipcRenderer.invoke("i18n:set", locale) as Promise<void>,
    onChanged: (listener: (locale: Locale) => void) => {
      const handler = (_event: unknown, locale: Locale) => listener(locale);
      ipcRenderer.on("i18n:changed", handler);
      return () => ipcRenderer.removeListener("i18n:changed", handler);
    },
  },
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chromium: process.versions.chrome,
  },
  remote: {
    list: () => ipcRenderer.invoke("remote:list") as Promise<RemoteHostState[]>,
    create: (input: RemoteHostInput) =>
      ipcRenderer.invoke("remote:create", input) as Promise<RemoteHostState>,
    update: (id: string, input: RemoteHostInput) =>
      ipcRenderer.invoke("remote:update", id, input) as Promise<RemoteHostState>,
    remove: (id: string) => ipcRenderer.invoke("remote:remove", id) as Promise<void>,
    onChanged: (listener: (hosts: RemoteHostState[]) => void) => {
      const handler = (_event: unknown, hosts: RemoteHostState[]) => listener(hosts);
      ipcRenderer.on("remote:changed", handler);
      return () => ipcRenderer.removeListener("remote:changed", handler);
    },

    /** The window itself, full screen. Not a pane filling the work area. */
    setFullScreen: (on: boolean) =>
      ipcRenderer.invoke("remote:set-fullscreen", on) as Promise<void>,
    onFullScreen: (listener: (on: boolean) => void) => {
      const handler = (_event: unknown, on: boolean) => listener(on);
      ipcRenderer.on("remote:fullscreen", handler);
      return () => ipcRenderer.removeListener("remote:fullscreen", handler);
    },
    pickKeyFile: () =>
      ipcRenderer.invoke("remote:pick-key-file") as Promise<string | undefined>,

    onHostKeyQuestion: (listener: (question: HostKeyQuestion) => void) => {
      const handler = (_event: unknown, question: HostKeyQuestion) => listener(question);
      ipcRenderer.on("remote:host-key-question", handler);
      return () => ipcRenderer.removeListener("remote:host-key-question", handler);
    },
    onHostKeyChanged: (listener: (change: HostKeyChange) => void) => {
      const handler = (_event: unknown, change: HostKeyChange) => listener(change);
      ipcRenderer.on("remote:host-key-changed", handler);
      return () => ipcRenderer.removeListener("remote:host-key-changed", handler);
    },
    answerHostKey: (id: string, trusted: boolean) =>
      ipcRenderer.invoke("remote:host-key-answer", id, trusted) as Promise<void>,
    listKnownHosts: async () => {
      const known = (await ipcRenderer.invoke("remote:list-known-hosts")) as Record<
        string,
        { algorithm: string; fingerprint: string; addedAt: string }
      >;
      return Object.entries(known).map(([key, record]) => ({ key, ...record }));
    },
    forgetHostKey: (key: string) =>
      ipcRenderer.invoke("remote:forget-host-key", key) as Promise<void>,

    sshOpen: (id: string, keep?: string) =>
      ipcRenderer.invoke("remote:ssh-open", id, keep) as Promise<string>,
    localTmux: () =>
      ipcRenderer.invoke("remote:local-tmux") as Promise<string | undefined>,
    sshClose: (id: string, sessionId: string) =>
      ipcRenderer.invoke("remote:ssh-close", id, sessionId) as Promise<void>,
    sshType: (id: string, data: string) =>
      ipcRenderer.invoke("remote:ssh-type", id, data) as Promise<void>,
    uiState: () =>
      ipcRenderer.invoke("remote:ui-state") as Promise<Record<string, number | string>>,
    setUiState: (patch: Record<string, number | string>) =>
      ipcRenderer.invoke("remote:set-ui-state", patch) as Promise<Record<string, number | string>>,
    sshWrite: (id: string, sessionId: string, data: string) =>
      ipcRenderer.invoke("remote:ssh-write", id, sessionId, data) as Promise<void>,
    sshResize: (id: string, sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke("remote:ssh-resize", id, sessionId, cols, rows) as Promise<void>,
    onSshData: (listener: (id: string, sessionId: string, chunk: string) => void) => {
      const handler = (_event: unknown, id: string, sessionId: string, chunk: string) =>
        listener(id, sessionId, chunk);
      ipcRenderer.on("remote:ssh-data", handler);
      return () => ipcRenderer.removeListener("remote:ssh-data", handler);
    },
    onSshClosed: (
      listener: (id: string, sessionId: string, detail?: string) => void,
    ) => {
      const handler = (
        _event: unknown,
        id: string,
        sessionId: string,
        detail?: string,
      ) => listener(id, sessionId, detail);
      ipcRenderer.on("remote:ssh-closed", handler);
      return () => ipcRenderer.removeListener("remote:ssh-closed", handler);
    },

    rdpOpen: (id: string, width: number, height: number) =>
      ipcRenderer.invoke("remote:rdp-open", id, width, height) as Promise<void>,
    rdpClose: (id: string) => ipcRenderer.invoke("remote:rdp-close", id) as Promise<void>,
    /** Ask for the whole desktop again — a fresh canvas has nothing but future changes. */
    rdpRepaint: (id: string) => ipcRenderer.invoke("remote:rdp-repaint", id) as Promise<void>,
    /*
     * `send`, not `invoke`: input has no answer to wait for.
     *
     * `invoke` is a request and a reply, and one of those per pointer move is a round trip
     * through the main process for every pixel the hand travels.
     */
    rdpMouse: (id: string, x: number, y: number, buttons: number) =>
      ipcRenderer.send("remote:rdp-mouse", id, x, y, buttons),
    rdpWheel: (id: string, x: number, y: number, notches: number) =>
      ipcRenderer.send("remote:rdp-wheel", id, x, y, notches),
    rdpKey: (id: string, scancode: number, down: boolean) =>
      ipcRenderer.send("remote:rdp-key", id, scancode, down),
    /* The VNC screen — the same surface over RFB. Paints arrive on the shared `onScreen`. */
    vncOpen: (id: string) => ipcRenderer.invoke("remote:vnc-open", id) as Promise<void>,
    vncClose: (id: string) => ipcRenderer.invoke("remote:vnc-close", id) as Promise<void>,
    vncRepaint: (id: string) => ipcRenderer.invoke("remote:vnc-repaint", id) as Promise<void>,
    vncMouse: (id: string, x: number, y: number, buttons: number) =>
      ipcRenderer.send("remote:vnc-mouse", id, x, y, buttons),
    vncWheel: (id: string, x: number, y: number, notches: number) =>
      ipcRenderer.send("remote:vnc-wheel", id, x, y, notches),
    vncKey: (id: string, scancode: number, down: boolean) =>
      ipcRenderer.send("remote:vnc-key", id, scancode, down),
    clipboard: (id: string) =>
      ipcRenderer.invoke("remote:clipboard", id) as Promise<RemoteClipboard>,
    sendClipboard: (id: string) =>
      ipcRenderer.invoke("remote:clipboard-send", id) as Promise<RemoteClipboard>,
    typeClipboard: (id: string) =>
      ipcRenderer.invoke("remote:clipboard-type", id) as Promise<RemoteClipboard>,
    onScreen: (listener: (id: string, event: RemoteScreenEvent) => void) => {
      const handler = (_event: unknown, id: string, screen: RemoteScreenEvent) =>
        listener(id, screen);
      ipcRenderer.on("remote:screen", handler);
      return () => ipcRenderer.removeListener("remote:screen", handler);
    },
  },
  remoteFiles: {
    list: (hostId: string, remotePath?: string) =>
      ipcRenderer.invoke("remote-files:list", hostId, remotePath) as Promise<RemoteListing>,
    upload: (hostId: string, remoteDirectory: string, localPaths: string[]) =>
      ipcRenderer.invoke(
        "remote-files:upload",
        hostId,
        remoteDirectory,
        localPaths,
      ) as Promise<string[]>,
    chooseAndUpload: (hostId: string, remoteDirectory: string) =>
      ipcRenderer.invoke(
        "remote-files:choose-and-upload",
        hostId,
        remoteDirectory,
      ) as Promise<string[]>,
    download: (hostId: string, remotePaths: string[]) =>
      ipcRenderer.invoke("remote-files:download", hostId, remotePaths) as Promise<string[]>,
    cancel: (transferId: string) =>
      ipcRenderer.invoke("remote-files:cancel", transferId) as Promise<void>,
    reveal: (transferId: string) =>
      ipcRenderer.invoke("remote-files:reveal", transferId) as Promise<void>,
    onTransfer: (listener: (transfer: Transfer) => void) => {
      const handler = (_event: unknown, transfer: Transfer) => listener(transfer);
      ipcRenderer.on("remote-files:transfer", handler);
      return () => ipcRenderer.removeListener("remote-files:transfer", handler);
    },
  },
  remoteInventory: {
    read: (hostId: string) =>
      ipcRenderer.invoke("remote-inventory:read", hostId) as Promise<Inventory>,
    commands: (hostId: string) =>
      ipcRenderer.invoke("remote-inventory:commands", hostId) as Promise<string[]>,
    describeCommand: (hostId: string, program: string) =>
      ipcRenderer.invoke("remote-inventory:describe-command", hostId, program) as Promise<
        string | undefined
      >,
    logSources: (hostId: string) =>
      ipcRenderer.invoke("remote-inventory:log-sources", hostId) as Promise<LogSource[]>,
    followLog: (hostId: string, source: LogSource, filter?: string) =>
      ipcRenderer.invoke("remote-inventory:follow-log", hostId, source, filter) as Promise<void>,
    stopLog: (hostId: string) =>
      ipcRenderer.invoke("remote-inventory:stop-log", hostId) as Promise<void>,
    onLogLines: (listener: (hostId: string, lines: string[]) => void) => {
      const handler = (_event: unknown, hostId: string, lines: string[]) =>
        listener(hostId, lines);
      ipcRenderer.on("remote-inventory:log-lines", handler);
      return () => ipcRenderer.removeListener("remote-inventory:log-lines", handler);
    },
    onLogClosed: (listener: (hostId: string, detail?: string) => void) => {
      const handler = (_event: unknown, hostId: string, detail?: string) =>
        listener(hostId, detail);
      ipcRenderer.on("remote-inventory:log-closed", handler);
      return () => ipcRenderer.removeListener("remote-inventory:log-closed", handler);
    },
  },
  remoteResources: {
    list: (kind: ResourceKind) =>
      ipcRenderer.invoke("remote-resources:list", kind) as Promise<AgentResource[]>,
    read: (kind: ResourceKind, name: string) =>
      ipcRenderer.invoke("remote-resources:read", kind, name) as Promise<string>,
    review: (kind: ResourceKind, name: string) =>
      ipcRenderer.invoke("remote-resources:review", kind, name) as Promise<ResourceReview>,
    inspect: (kind: ResourceKind, name: string) =>
      ipcRenderer.invoke("remote-resources:inspect", kind, name) as Promise<ResourceInspection>,
    write: (kind: ResourceKind, name: string, content: string) =>
      ipcRenderer.invoke("remote-resources:write", kind, name, content) as Promise<AgentResource[]>,
    remove: (kind: ResourceKind, name: string) =>
      ipcRenderer.invoke("remote-resources:remove", kind, name) as Promise<AgentResource[]>,
    readInstructions: () =>
      ipcRenderer.invoke("remote-resources:read-instructions") as Promise<string>,
    writeInstructions: (content: string) =>
      ipcRenderer.invoke("remote-resources:write-instructions", content) as Promise<void>,
    importSkill: () =>
      ipcRenderer.invoke("remote-resources:import-skill") as Promise<string | undefined>,
    reveal: (kind: ResourceKind, name: string) =>
      ipcRenderer.invoke("remote-resources:reveal", kind, name) as Promise<void>,
    directory: () => ipcRenderer.invoke("remote-resources:directory") as Promise<string>,
    /** Which services Pi can reach, and whether each takes a subscription login or a key. */
    providers: () =>
      ipcRenderer.invoke("remote-resources:providers") as Promise<
        Array<{ id: string; name: string; subscription: boolean; apiKey: boolean }>
      >,
    /** Sign in to a service from the window. The provider drives; these carry its questions. */
    login: (providerId: string) =>
      ipcRenderer.invoke("remote-resources:login", providerId) as Promise<void>,
    answerLogin: (value: string) =>
      ipcRenderer.invoke("remote-resources:answer-login", value) as Promise<void>,
    cancelLogin: () => ipcRenderer.invoke("remote-resources:cancel-login") as Promise<void>,
    logout: (providerId: string) =>
      ipcRenderer.invoke("remote-resources:logout", providerId) as Promise<void>,
    onLoginPrompt: (listener: (prompt?: AuthPromptView) => void) => {
      const handler = (_event: unknown, prompt?: AuthPromptView) => listener(prompt);
      ipcRenderer.on("remote-resources:login-prompt", handler);
      return () => ipcRenderer.removeListener("remote-resources:login-prompt", handler);
    },
    onLoginNote: (listener: (note: { type: string; message?: string; url?: string; userCode?: string; verificationUri?: string }) => void) => {
      const handler = (_event: unknown, note: Parameters<typeof listener>[0]) => listener(note);
      ipcRenderer.on("remote-resources:login-note", handler);
      return () => ipcRenderer.removeListener("remote-resources:login-note", handler);
    },
    subscription: (providerId?: string) =>
      ipcRenderer.invoke("remote-resources:subscription", providerId) as Promise<{
        signedIn: boolean;
        path: string;
        from: "operator" | "forge";
      }>,
  },
  remotePlugins: {
    list: (hostId?: string) =>
      ipcRenderer.invoke("remote-plugins:list", hostId) as Promise<PluginView[]>,
    install: (id: string) => ipcRenderer.invoke("remote-plugins:install", id) as Promise<PluginView[]>,
    remove: (id: string) => ipcRenderer.invoke("remote-plugins:remove", id) as Promise<PluginView[]>,
    readFolder: () =>
      ipcRenderer.invoke("remote-plugins:read-folder") as Promise<BuiltinPlugin | undefined>,
    add: (plugin: BuiltinPlugin) =>
      ipcRenderer.invoke("remote-plugins:add", plugin) as Promise<PluginView[]>,
    forget: (id: string) => ipcRenderer.invoke("remote-plugins:forget", id) as Promise<PluginView[]>,
    onChanged: (listener: () => void) => {
      const handler = () => listener();
      ipcRenderer.on("remote-plugins:changed", handler);
      return () => ipcRenderer.removeListener("remote-plugins:changed", handler);
    },
  },
  remoteRecording: {
    start: (hostId: string, shape: { width: number; height: number; fps: number }) =>
      ipcRenderer.invoke("remote-recording:start", hostId, shape) as Promise<string>,
    /* The encoder's output, as it comes. Not one blob at the end: a long recording would sit in
       memory until it was over. */
    chunk: (id: string, data: ArrayBuffer) =>
      ipcRenderer.invoke("remote-recording:chunk", id, data) as Promise<void>,
    next: (id: string) => ipcRenderer.invoke("remote-recording:next", id) as Promise<string>,
    stop: (id: string, note?: string) =>
      ipcRenderer.invoke("remote-recording:stop", id, note) as Promise<RecordingSummary | undefined>,
    list: (hostId: string) =>
      ipcRenderer.invoke("remote-recording:list", hostId) as Promise<RecordingSummary[]>,
    remove: (hostId: string, id: string) =>
      ipcRenderer.invoke("remote-recording:remove", hostId, id) as Promise<void>,
    save: (hostId: string, id: string) =>
      ipcRenderer.invoke("remote-recording:save", hostId, id) as Promise<string | undefined>,
  },
  remotePanels: {
    open: (kind: PanelKind, hostId: string, focus?: string) =>
      ipcRenderer.invoke("remote-panels:open", kind, hostId, focus) as Promise<PanelKind[]>,
    close: (kind: PanelKind, hostId: string) =>
      ipcRenderer.invoke("remote-panels:close", kind, hostId) as Promise<PanelKind[]>,
    list: (hostId: string) =>
      ipcRenderer.invoke("remote-panels:list", hostId) as Promise<PanelKind[]>,
    fit: (contentHeight: number) =>
      ipcRenderer.invoke("remote-panels:fit", contentHeight) as Promise<void>,
    onFocus: (listener: (focus: string) => void) => {
      const handler = (_event: unknown, focus: string) => listener(focus);
      ipcRenderer.on("remote-panels:focus", handler);
      return () => ipcRenderer.removeListener("remote-panels:focus", handler);
    },
    onChange: (listener: (hostId: string, open: PanelKind[]) => void) => {
      const handler = (_event: unknown, hostId: string, open: PanelKind[]) =>
        listener(hostId, open);
      ipcRenderer.on("remote-panels:changed", handler);
      return () => ipcRenderer.removeListener("remote-panels:changed", handler);
    },
  },
  remoteHistory: {
    read: (hostId: string) =>
      ipcRenderer.invoke("remote-history:read", hostId) as Promise<TypedCommand[]>,
    export: (hostId: string, format: HistoryFormat, rows: HistoryExportRow[]) =>
      ipcRenderer.invoke("remote-history:export", hostId, format, rows) as Promise<
        string | undefined
      >,
  },
  remoteStatus: {
    watch: (hostId: string) =>
      ipcRenderer.invoke("remote-status:watch", hostId) as Promise<void>,
    stop: (hostId: string) => ipcRenderer.invoke("remote-status:stop", hostId) as Promise<void>,
    refresh: (hostId: string) =>
      ipcRenderer.invoke("remote-status:refresh", hostId) as Promise<void>,
    popOut: (hostId: string, title: string) =>
      ipcRenderer.invoke("remote-status:pop-out", hostId, title) as Promise<void>,
    popIn: (hostId: string) =>
      ipcRenderer.invoke("remote-status:pop-in", hostId) as Promise<void>,
    onStatus: (
      listener: (
        hostId: string,
        status: HostStatus | undefined,
        error?: HostStatusError,
      ) => void,
    ) => {
      const handler = (
        _event: unknown,
        hostId: string,
        status: HostStatus | undefined,
        error?: HostStatusError,
      ) => listener(hostId, status, error);
      ipcRenderer.on("remote-status:status", handler);
      return () => ipcRenderer.removeListener("remote-status:status", handler);
    },
  },
  remoteAgent: {
    settings: () =>
      ipcRenderer.invoke("remote-agent:settings") as Promise<RemoteAgentSettings>,
    codexStatus: () =>
      ipcRenderer.invoke("remote-agent:codex-status") as Promise<{
        version?: string;
        signedIn: boolean;
      }>,
    saveSettings: (input: RemoteAgentSettingsInput) =>
      ipcRenderer.invoke("remote-agent:save-settings", input) as Promise<RemoteAgentSettings>,
    wall: () => ipcRenderer.invoke("remote-agent:wall") as Promise<RemoteWallState>,
    acceptNoWall: (accepted: boolean) =>
      ipcRenderer.invoke("remote-agent:accept-no-wall", accepted) as Promise<RemoteWallState>,

    getState: (hostId: string) =>
      ipcRenderer.invoke("remote-agent:get-state", hostId) as Promise<
        RemoteAgentRunState | undefined
      >,
    start: (hostId: string, input: RemoteAgentStartInput) =>
      ipcRenderer.invoke("remote-agent:start", hostId, input) as Promise<void>,
    say: (hostId: string, text: string, attachments?: RemoteAttachment[]) =>
      ipcRenderer.invoke("remote-agent:say", hostId, text, attachments) as Promise<void>,
    answer: (hostId: string, text: string) =>
      ipcRenderer.invoke("remote-agent:answer", hostId, text) as Promise<void>,
    reset: (hostId: string) =>
      ipcRenderer.invoke("remote-agent:reset", hostId) as Promise<void>,
    approve: (hostId: string, toolCallId: string, remember?: RememberChoice) =>
      ipcRenderer.invoke("remote-agent:approve", hostId, toolCallId, remember) as Promise<boolean>,
    reject: (hostId: string, toolCallId: string, note?: string, remember?: RememberChoice) =>
      ipcRenderer.invoke(
        "remote-agent:reject",
        hostId,
        toolCallId,
        note,
        remember,
      ) as Promise<boolean>,
    stop: (hostId: string) => ipcRenderer.invoke("remote-agent:stop", hostId) as Promise<void>,
    setApprovalMode: (hostId: string, mode: RemoteApprovalMode) =>
      ipcRenderer.invoke("remote-agent:set-approval-mode", hostId, mode) as Promise<void>,
    revealKept: (hostId: string, runId: string, name: string) =>
      ipcRenderer.invoke("remote-agent:reveal-kept", hostId, runId, name) as Promise<void>,
    saveKept: (hostId: string, runId: string, name: string) =>
      ipcRenderer.invoke("remote-agent:save-kept", hostId, runId, name) as Promise<
        string | undefined
      >,
    revealRecord: (hostId: string, runId?: string) =>
      ipcRenderer.invoke("remote-agent:reveal-record", hostId, runId) as Promise<void>,
    commandHistory: (hostId: string, program: string) =>
      ipcRenderer.invoke("remote-agent:command-history", hostId, program) as Promise<{
        count: number;
        lastAt?: string;
      }>,
    catalogSearch: (query: string, os?: "linux" | "windows") =>
      ipcRenderer.invoke("remote-agent:catalog-search", query, os) as Promise<CatalogEntry[]>,
    catalogCounts: () =>
      ipcRenderer.invoke("remote-agent:catalog-counts") as Promise<{
        linux: number;
        windows: number;
        tier1: number;
        total: number;
      }>,
    forgetHostRules: (hostId: string) =>
      ipcRenderer.invoke("remote-agent:forget-host-rules", hostId) as Promise<void>,
    listRuns: (hostId: string) =>
      ipcRenderer.invoke("remote-agent:list-runs", hostId) as Promise<RemoteRunSummary[]>,
    loadRun: (hostId: string, runId: string) =>
      ipcRenderer.invoke("remote-agent:load-run", hostId, runId) as Promise<RemoteRunDocument>,
    onState: (listener: (hostId: string, state: RemoteAgentRunState) => void) => {
      const handler = (_event: unknown, hostId: string, state: RemoteAgentRunState) =>
        listener(hostId, state);
      ipcRenderer.on("remote-agent:state", handler);
      return () => ipcRenderer.removeListener("remote-agent:state", handler);
    },
    onSettingsSaved: (listener: () => void) => {
      const handler = () => listener();
      ipcRenderer.on("remote-agent:settings-saved", handler);
      return () => ipcRenderer.removeListener("remote-agent:settings-saved", handler);
    },
    serverContext: (hostId: string) =>
      ipcRenderer.invoke("remote-agent:server-context", hostId) as Promise<ServerDossier>,
    saveServerNotes: (hostId: string, notes: string) =>
      ipcRenderer.invoke("remote-agent:save-server-notes", hostId, notes) as Promise<ServerDossier>,
    deleteHandover: (hostId: string, at: string, runId: string) =>
      ipcRenderer.invoke("remote-agent:delete-handover", hostId, at, runId) as Promise<ServerDossier>,
    saveAgentNote: (hostId: string, title: string, text: string) =>
      ipcRenderer.invoke("remote-agent:save-agent-note", hostId, title, text) as Promise<ServerDossier>,
    deleteAgentNote: (hostId: string, title: string) =>
      ipcRenderer.invoke("remote-agent:delete-agent-note", hostId, title) as Promise<ServerDossier>,
    factsPreview: (hostId: string) =>
      ipcRenderer.invoke("remote-agent:facts-preview", hostId) as Promise<ServerFactsView>,
    riskHint: (command: string) =>
      ipcRenderer.invoke("remote-agent:risk-hint", command) as Promise<
        { risky: boolean; note: string } | undefined
      >,
    buildReport: (hostId: string, from?: string, to?: string) =>
      ipcRenderer.invoke("remote-agent:build-report", hostId, from, to) as Promise<string>,
    traceSize: (hostId: string, runId: string) =>
      ipcRenderer.invoke("remote-agent:trace-size", hostId, runId) as Promise<number | undefined>,
    saveTrace: (hostId: string, runId: string, format: "jsonl" | "markdown") =>
      ipcRenderer.invoke("remote-agent:save-trace", hostId, runId, format) as Promise<
        string | undefined
      >,
    saveReport: (hostId: string, markdown: string) =>
      ipcRenderer.invoke("remote-agent:save-report", hostId, markdown) as Promise<
        string | undefined
      >,
    onServerContextChanged: (listener: (hostId: string) => void) => {
      const handler = (_event: unknown, hostId: string) => listener(hostId);
      ipcRenderer.on("remote-agent:server-context-changed", handler);
      return () => ipcRenderer.removeListener("remote-agent:server-context-changed", handler);
    },
  },
};

contextBridge.exposeInMainWorld("machina", api);
