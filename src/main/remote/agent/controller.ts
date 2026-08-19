import fs from "node:fs/promises";
import { t } from "../../../shared/i18n";
import path from "node:path";
import { programOf } from "./policy";
import { catalogCounts, searchCatalog } from "./catalog";
import { CommandRunner } from "../commandRunner";
import { collectFacts, renderFactsDetail, summarizeFacts } from "./facts";
import { riskHint } from "./riskHint";
import { buildReport } from "./report";
import { parseTrace, renderTrace } from "./trace";
import {
  MOST_AGENT_NOTE_CHARS,
  appendHandover,
  deleteHandover,
  forgetServerContext,
  readDossier,
  writeAgentNote,
  writeLastFacts,
  writeNotes,
} from "./serverContext";
import { BrowserWindow, dialog, ipcMain, nativeImage, shell } from "electron";
import { z } from "zod";
import type {
  RemoteAgentRunState,
  RemoteAgentSettings,
  RemoteAgentStartInput,
  RemoteRunDocument,
  RemoteRunSummary,
} from "../../../shared/remoteAgent";
import { LOCAL_AGENT_HOST } from "../../../shared/remoteAgent";
import type { SshTarget } from "../sshSession";
import { codexStatus } from "./codex";
import { Listeners } from "../listeners";
import { readRemoteFile, writeRemoteFile } from "../files/controller";
import type { WallState } from "./sandbox/consent";
import { wallState, writeConsent } from "./sandbox/consent";
import { RemoteAgentSession } from "./session";
import type { StoredModel } from "./store";
import {
  apiKeySecret,
  findModel,
  findProfile,
  mergeRules,
  LEGACY_API_KEY_SECRET,
  MIGRATED_MODEL_ID,
  present,
  readSettings,
  ruleSetSchema,
  upsertHostRule,
  writeSettings,
} from "./store";

/**
 * IPC for the remote agent.
 *
 * Separate from the screen and terminal controller because what it guards is different. That one
 * keeps a password out of the renderer; this one keeps a command inside the guarantee — the
 * renderer can ask for a run and can approve one, and cannot say what an agent is allowed to
 * execute without that going through the stored command set first.
 */

export type AgentControllerDeps = {
  userDataRoot: string;
  /** Where to run commands for this host, or a refusal naming what is missing. */
  sshTarget(hostId: string): Promise<SshTarget>;
  /** The desktop as BGRA, if a screen is open for this host. */
  snapshot(hostId: string): { width: number; height: number; data: Buffer } | undefined;
  /** The desktop's pointer and keyboard, for an agent that works the screen. */
  mouse(hostId: string, x: number, y: number, buttons: number): void;
  key(hostId: string, code: number, down: boolean): void;
  /** One character, as a UTF-16 code unit, for what no key can type. */
  unicode(hostId: string, code: number): void;
  hostName(hostId: string): string | undefined;
  /** Every stored API key, by the secret name a model keys to. */
  apiKeys(): Promise<Map<string, string>>;
  saveApiKey(secretName: string, value: string | undefined): Promise<void>;
  /** Values an agent may name but never see, for this host. */
  secrets(hostId: string): Promise<Map<string, string>>;
};

const sessions = new Map<string, RemoteAgentSession>();
/*
 * Everyone listening.
 *
 * The settings are edited in a window of their own now, so "the renderer that asked last" is the
 * wrong answer twice over: a run's state has to reach the main window while the settings window
 * is in front, and a save has to reach the conversation that is about to use it.
 */
const listeners = new Listeners();
let deps: AgentControllerDeps;

/**
 * Per-host command runners for the logbook panel's facts preview.
 *
 * Separate from the session's own runner: the panel reads facts while no run is active (or
 * alongside one), and a run may not exist. One connection per host, reused, torn down when the
 * host is forgotten or the app quits.
 */
const factsRunners = new Map<string, CommandRunner>();

function factsRunnerFor(hostId: string): CommandRunner {
  const existing = factsRunners.get(hostId);
  if (existing) return existing;
  const runner = new CommandRunner();
  factsRunners.set(hostId, runner);
  return runner;
}

/**
 * Every write to `remote-agent.json` goes through here, one after another.
 *
 * Two writers exist: the settings screen's whole-object save, and a run remembering a decision
 * mid-approval. Both are read-modify-write, so two of them interleaved would silently drop one
 * side's change — the queue makes the interleaving impossible rather than unlikely.
 */
let settingsWrites: Promise<unknown> = Promise.resolve();
export function enqueueSettingsWrite<T>(work: () => Promise<T>): Promise<T> {
  const next = settingsWrites.then(work, work);
  settingsWrites = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/** What an approval card may ask to be kept. Anything else in the argument is refused. */
const rememberSchema = z.union([
  z.object({ action: z.literal("auto"), verbOnly: z.boolean().optional() }),
  z.object({ action: z.literal("deny") }),
]);

const idSchema = z.string().min(1).max(64);
/** A run id becomes a file name, so it may never contain a path. */
const runIdSchema = z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/);

/**
 * A terminal handed over with a message.
 *
 * Bounded: eight of them, 60k each. What arrives is text the operator chose to send, and a
 * ceiling here is the difference between "the screen" and "somebody's whole build log".
 */
const attachmentSchema = z
  .array(z.object({ title: z.string().min(1).max(40), text: z.string().min(1).max(60_000) }))
  .max(8);

const startSchema = z.object({
  goal: z.string().min(1).max(4000),
  approvalMode: z.enum(["step", "auto", "plan"]),
  commandCategoryIds: z.array(z.string().min(1).max(64)).max(30).optional(),
  /* Pre-catalog composers named a category here. Accepted, ignored. */
  commandSetId: z.string().max(64).optional(),
  modelId: z.string().max(64).optional(),
  profileId: z.string().max(64).optional(),
  attachments: attachmentSchema.optional(),
  thinking: z.enum(["minimal", "low", "medium", "high", "xhigh", "max"]).optional(),
  control: z.enum(["shell", "screen"]).optional(),
});

const settingsInputSchema = z.object({
  models: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        name: z.string().min(1).max(80),
        provider: z.enum(["endpoint", "codex"]),
        /* Which service, when it is one of Pi's. Dropped here once, which quietly turned every
           subscription model back into ChatGPT however it was saved. */
        piProvider: z.string().max(64).optional(),
        baseUrl: z.string().max(300).default(""),
        modelId: z.string().max(120).default(""),
        codexModel: z.string().max(120).optional(),
        supportsImages: z.boolean().default(true),
        apiKey: z.string().max(400).optional(),
        clearApiKey: z.boolean().optional(),
      }),
    )
    .max(30),
  defaultModelId: z.string().max(64).optional(),
  profiles: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        name: z.string().min(1).max(80),
        control: z.enum(["shell", "screen"]).default("shell"),
        modelId: z.string().max(64).optional(),
        /** The categories this agent joins, and what it may run outside them. */
        commandCategoryIds: z.array(z.string().max(64)).max(30).optional(),
        extraCommands: z.array(z.string().min(1).max(64).regex(/^[a-z0-9._-]+$/i)).max(60).optional(),
        allowSudo: z.boolean().optional(),
        /* Without these two the parse would silently strip them, and saving a profile would
           quietly erase its exceptions. */
        autoReads: z.boolean().optional(),
        rules: ruleSetSchema.optional(),
        commandSetId: z.string().max(64).optional(),
        approvalMode: z.enum(["step", "auto", "plan"]).default("step"),
        instructions: z.string().max(4000).optional(),
        delegates: z.array(z.string().max(64)).max(10).default([]),
      }),
    )
    .max(30)
    .optional(),
  defaultProfileId: z.string().max(64).optional(),
  extensionTools: z.array(z.string().max(64)).max(50).optional(),
  sandbox: z.enum(["auto", "seatbelt", "linux", "docker"]).optional(),
  /* The installation's own permissions: exceptions and the two dials. */
  rules: ruleSetSchema.optional(),
  autoReads: z.boolean().optional(),
  allowSudo: z.boolean().optional(),
  tracing: z.boolean().optional(),
  commandSets: z.array(
    z.object({
      id: z.string().min(1).max(64),
      name: z.string().min(1).max(80),
      allow: z.array(z.string().min(1).max(64).regex(/^[a-z0-9._-]+$/i)).max(200),
      allowSudo: z.boolean(),
      quiet: z
        .record(
          z.string().min(1).max(64),
          z.union([z.literal("all"), z.array(z.string().min(1).max(64)).max(60)]),
        )
        .optional(),
    }),
  ),
});

/** Which secret name holds a model's key, including the one written before models were a list. */
async function keyFor(model: { id: string }): Promise<string | undefined> {
  const keys = await deps.apiKeys();
  return (
    keys.get(apiKeySecret(model.id)) ??
    (model.id === MIGRATED_MODEL_ID ? keys.get(LEGACY_API_KEY_SECRET) : undefined)
  );
}

async function presentSettings(): Promise<RemoteAgentSettings> {
  const [settings, keys] = await Promise.all([readSettings(deps.userDataRoot), deps.apiKeys()]);
  return present(settings, (id) =>
    keys.has(apiKeySecret(id)) || (id === MIGRATED_MODEL_ID && keys.has(LEGACY_API_KEY_SECRET)),
  );
}

function publish(hostId: string, state: RemoteAgentRunState) {
  listeners.send("remote-agent:state", hostId, state);
}

/**
 * The desktop, as something a model can look at.
 *
 * JPEG rather than PNG: a 1024×768 desktop is a megabyte or two as PNG and a tenth of that as
 * JPEG, and nothing here depends on the difference.
 */
async function screenshot(hostId: string): Promise<string | undefined> {
  const surface = deps.snapshot(hostId);
  if (!surface) return undefined;
  const image = nativeImage.createFromBitmap(surface.data, {
    width: surface.width,
    height: surface.height,
  });
  if (image.isEmpty()) return undefined;
  return `data:image/jpeg;base64,${image.toJPEG(70).toString("base64")}`;
}

/** Where one host's records live. The run id is the file name, so it must stay a plain name. */
function recordDirectory(hostId: string) {
  return path.join(deps.userDataRoot, "remote-runs", hostId);
}

/**
 * Past runs on a host, newest first — read from the records on disk. Used by the `list-runs`
 * handler and by the recent-runs lines in the logbook, so it lives once here.
 */
async function listRunSummaries(hostId: string): Promise<RemoteRunSummary[]> {
  const directory = recordDirectory(hostId);
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const summaries: RemoteRunSummary[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const document = JSON.parse(
        await fs.readFile(path.join(directory, name), "utf8"),
      ) as RemoteRunDocument;
      summaries.push({
        id: document.id ?? name.replace(/\.json$/, ""),
        startedAt: document.startedAt,
        goal: document.goal,
        commandSet: document.commandSet,
        steps: document.steps?.length ?? 0,
        finish: document.finish,
      });
    } catch {
      // A half-written or hand-edited record is skipped rather than taking the list with it.
    }
  }
  // Newest first: the run somebody is looking for is almost always the last one.
  return summaries.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/**
 * A named agent, resolved into a run's worth of settings.
 *
 * The same three lookups a run start does — the way of working, its allowlist, its model — done
 * for a child instead. It throws sentences rather than returning nothing: what comes back from a
 * delegation is read by a model, and "there is no such allowlist" is something it can act on.
 */
async function resolveNamedAgent(profileId: string) {
  const settings = await readSettings(deps.userDataRoot);
  const profile = settings.profiles.find((each) => each.id === profileId);
  if (!profile) throw new Error(t("That agent is not registered."));

  const model = findModel(settings, profile.modelId);
  if (!model) throw new Error(t("No model is registered for {name} to use.", { name: profile.name }));
  const { apiKey } = await resolveModel(model.id);

  /* No policy of its own: permissions belong to the installation, and a delegated agent runs
     under the same live policy as the conversation that asked it. */
  return {
    id: profile.id,
    name: profile.name,
    control: profile.control,
    approvalMode: profile.approvalMode,
    instructions: profile.instructions,
    model,
    apiKey,
    supportsImages: model.supportsImages,
  };
}

function sessionFor(hostId: string): RemoteAgentSession {
  const existing = sessions.get(hostId);
  if (existing) return existing;

  /*
   * The conversation that belongs to no server.
   *
   * Everything that needs a server is left out rather than handed over and made to fail: no ssh
   * target, no screen, no file transfer. What remains is this machine's — the wall, what it
   * produced, the skills — which is enough to plan with, to write a skill, or to ask a question
   * before there is a customer's machine to point at.
   */
  const local = hostId === LOCAL_AGENT_HOST;
  const name = local ? t("this machine") : deps.hostName(hostId);
  if (!name) throw new Error(t("That server is not registered."));

  const session = new RemoteAgentSession({
    hostId,
    hostName: name,
    userDataRoot: deps.userDataRoot,
    ...(local ? {} : { sshTarget: () => deps.sshTarget(hostId) }),
    screenshot: () => (local ? Promise.resolve(undefined) : screenshot(hostId)),
    /* The operator's transfer path, lent to the agent under ADR 0002's seven steps. */
    ...(local
      ? {}
      : {
          readFile: (target: string) => readRemoteFile(hostId, target),
          writeFile: (target: string, content: string) => writeRemoteFile(hostId, target, content),
        }),
    mouse: (x, y, buttons) => deps.mouse(hostId, x, y, buttons),
    key: (code, down) => deps.key(hostId, code, down),
    unicode: (code) => deps.unicode(hostId, code),
    screenSize: () => {
      const surface = deps.snapshot(hostId);
      return surface ? { width: surface.width, height: surface.height } : undefined;
    },
    model: (modelId?: string) => resolveModel(modelId),
    namedAgent: (profileId: string) => resolveNamedAgent(profileId),
    rememberRule: async (input) => {
      await enqueueSettingsWrite(async () => {
        const current = await readSettings(deps.userDataRoot);
        const updated = upsertHostRule(current, { ...input, at: new Date().toISOString() });
        await writeSettings(deps.userDataRoot, updated);
      });
      /* The settings window may be open; what it shows about this server's memory just changed. */
      listeners.send("remote-agent:settings-saved");
    },
    secrets: () => (local ? Promise.resolve(new Map<string, string>()) : deps.secrets(hostId)),
    recordRoot: path.join(deps.userDataRoot, "remote-runs"),
    /* The server-less local conversation has no dossier and no run history to carry. */
    ...(local
      ? {}
      : {
          dossier: {
            read: () => readDossier(deps.userDataRoot, hostId),
            appendHandover: async (handover) => {
              const next = await appendHandover(deps.userDataRoot, hostId, handover);
              listeners.send("remote-agent:server-context-changed", hostId);
              return next;
            },
            saveNote: async (note) => {
              const next = await writeAgentNote(deps.userDataRoot, hostId, note);
              listeners.send("remote-agent:server-context-changed", hostId);
              return next;
            },
            saveFacts: (facts) => writeLastFacts(deps.userDataRoot, hostId, facts),
          },
          recentRuns: () => listRunSummaries(hostId),
        }),
    onState: (state) => publish(hostId, state),
  });
  sessions.set(hostId, session);
  return session;
}

/** The chosen model and its key, or a refusal that says which part is missing. */
async function resolveModel(modelId?: string): Promise<{ model: StoredModel; apiKey?: string }> {
  const settings = await readSettings(deps.userDataRoot);
  const model = findModel(settings, modelId);
  if (!model) {
    throw new Error(t("No model is registered. Add one in the settings."));
  }

  /*
   * The subscription is Pi's to reach.
   *
   * It used to mean spawning the `codex` CLI; Pi talks to the same account itself with the
   * operator's own login. Only the presence of a login is checked here — the provider's own
   * answer beats a guess about why it might fail.
   */
  if (model.provider === "codex") {
    /*
     * One of Pi's own providers. A login is one way in; an API key in the environment is
     * another, and Pi resolves that itself — so a missing login is a warning here, not a
     * refusal. The provider's real answer is better than a guess about why it might fail.
     */
    return { model };
  }

  if (!model.baseUrl || !model.modelId) {
    throw new Error(t("\"{name}\" has no address and no model name.", { name: model.name }));
  }
  const apiKey = await keyFor(model);
  if (!apiKey) throw new Error(t("\"{name}\" has no API key set.", { name: model.name }));
  return { model, apiKey };
}

/** Let go of every conversation on quit. Nothing on the far end is stopped. */
export function disposeRemoteAgents() {
  for (const session of sessions.values()) session.dispose();
  sessions.clear();
  for (const runner of factsRunners.values()) runner.stop();
  factsRunners.clear();
}

/** A host being removed takes its conversation and its dossier with it. */
export function forgetRemoteAgent(hostId: string) {
  sessions.get(hostId)?.dispose();
  sessions.delete(hostId);
  factsRunners.get(hostId)?.stop();
  factsRunners.delete(hostId);
  void forgetServerContext(deps.userDataRoot, hostId).catch(() => undefined);
}

export function registerRemoteAgentController(controllerDeps: AgentControllerDeps) {
  deps = controllerDeps;

  ipcMain.handle("remote-agent:settings", async (event): Promise<RemoteAgentSettings> => {
    listeners.add(event.sender);
    return await presentSettings();
  });

  ipcMain.handle("remote-agent:save-settings", async (_event, raw: unknown) => {
    const input = settingsInputSchema.parse(raw);
    /* A page that shows one half writes back only that half; the rest is left as it stands. */
    await enqueueSettingsWrite(async () => {
      const current = await readSettings(deps.userDataRoot);
      await writeSettings(deps.userDataRoot, {
        extensionTools: input.extensionTools ?? current.extensionTools,
        sandbox: input.sandbox ?? current.sandbox,
        profiles: input.profiles ?? current.profiles,
        defaultProfileId: input.defaultProfileId ?? current.defaultProfileId,
        models: input.models.map((model) => ({
          id: model.id,
          name: model.name.trim(),
          provider: model.provider,
          piProvider: model.piProvider?.trim() || undefined,
          baseUrl: model.baseUrl.trim(),
          modelId: model.modelId.trim(),
          codexModel: model.codexModel?.trim() || undefined,
          supportsImages: model.supportsImages,
        })),
        defaultModelId: input.defaultModelId,
        commandSets: input.commandSets,
        rules: input.rules ?? current.rules,
        autoReads: input.autoReads ?? current.autoReads,
        allowSudo: input.allowSudo ?? current.allowSudo,
        tracing: input.tracing ?? current.tracing,
        /* Never from the input: the run writes these, and a stale settings window must not erase
         * a decision made while it was open. */
        hostRules: current.hostRules,
        /* Nor this: the language is switched from its own place and applies at once, so a settings
           window opened before the switch would otherwise put the old language back. */
        locale: current.locale,
      });
    });

    /*
     * An empty key means "keep the stored one", the same rule the password fields follow. Only
     * `clearApiKey` forgets it, because a box that starts empty on every launch would otherwise
     * log the operator out of their provider whenever they corrected a model name.
     */
    for (const model of input.models) {
      if (model.clearApiKey) await deps.saveApiKey(apiKeySecret(model.id), undefined);
      else if (model.apiKey) await deps.saveApiKey(apiKeySecret(model.id), model.apiKey);
    }
    /* A model that was deleted takes its key with it: nothing can reach it any more. */
    const kept = new Set(input.models.map((model) => apiKeySecret(model.id)));
    for (const name of (await deps.apiKeys()).keys()) {
      if (name.startsWith("__agent__.apiKey.") && !kept.has(name)) {
        await deps.saveApiKey(name, undefined);
      }
    }

    /* Said out loud: the conversation is in another window and has to re-read what is now in
       force before its next run, or it would go on naming a model that was just deleted. */
    listeners.send("remote-agent:settings-saved");
    return await presentSettings();
  });

  /*
   * What this machine can do about walls, and what its operator has said about it.
   *
   * Read every time the settings open rather than remembered in the renderer: ADR 0002 wants the
   * consent visible, and a value fetched once and cached is a value that stops being looked at.
   */
  ipcMain.handle("remote-agent:wall", async (): Promise<WallState> => {
    const settings = await readSettings(deps.userDataRoot);
    return await wallState(
      deps.userDataRoot,
      settings.sandbox === "auto" ? undefined : settings.sandbox,
    );
  });

  ipcMain.handle("remote-agent:accept-no-wall", async (_event, raw: unknown): Promise<WallState> => {
    const accepted = z.boolean().parse(raw);
    /*
     * Refused where a wall can be built.
     *
     * The exception is for machines with no mechanism, not for operators who would rather not
     * have one. Checked here rather than in the window, because the window is not the guard.
     */
    const settings = await readSettings(deps.userDataRoot);
    const preferred = settings.sandbox === "auto" ? undefined : settings.sandbox;
    const state = await wallState(deps.userDataRoot, preferred);
    if (accepted && state.canBuild) {
      throw new Error(t("This machine can isolate. Running without isolation is not needed."));
    }
    await writeConsent(deps.userDataRoot, accepted);
    /* Every window re-reads: the conversation carries the same notice, and it must not lag. */
    listeners.send("remote-agent:settings-saved");
    return await wallState(deps.userDataRoot, preferred);
  });

  ipcMain.handle("remote-agent:codex-status", () => codexStatus());

  ipcMain.handle("remote-agent:get-state", (event, rawId: unknown) => {
    listeners.add(event.sender);
    return sessions.get(idSchema.parse(rawId))?.state;
  });

  ipcMain.handle("remote-agent:start", async (event, rawId: unknown, rawInput: unknown) => {
    listeners.add(event.sender);
    const hostId = idSchema.parse(rawId);
    let input: RemoteAgentStartInput = startSchema.parse(rawInput);

    const settings = await readSettings(deps.userDataRoot);
    /*
     * A named way of working decides all four at once.
     *
     * What it names wins over what the composer had lying around — that is the whole point of
     * choosing one. What it leaves blank stays as the conversation had it.
     */
    const profile = findProfile(settings, input.profileId);
    if (profile) {
      input = {
        ...input,
        commandSetId: profile.commandSetId ?? input.commandSetId,
        modelId: profile.modelId ?? input.modelId,
        approvalMode: profile.approvalMode,
      };
    }
    /*
     * What this run may run: the agent's exceptions over the shipped catalog, plus what this
     * installation has remembered on this server. The same policy whether or not a sub-agent
     * was picked — a named agent is a way of working (model, instructions, mode), not a power.
     */
    const policy = mergeRules(settings, hostId);
    const model = findModel(settings, input.modelId);
    if (!model) {
      throw new Error(t("No model is registered. Add one in the settings."));
    }
    /*
     * Who this run may hand work to.
     *
     * Named on the profile, resolved to real ones here: a profile that lists an agent somebody
     * has since deleted simply has one fewer, rather than a `delegate` tool that fails when it
     * is used.
     */
    const delegates = (profile?.delegates ?? [])
      .flatMap((id) => {
        const named = settings.profiles.find((each) => each.id === id);
        return named && named.id !== profile?.id ? [named] : [];
      })
      .map((each) => ({
        id: each.id,
        name: each.name,
        purpose: each.instructions?.split("\n")[0]?.slice(0, 80),
      }));

    const session = sessionFor(hostId);
    /* Read here, not held: the operator may have turned it off since the last run. */
    session.tracing = settings.tracing;
    await session.start(
      { ...input, modelId: model.id, profileId: profile?.id },
      policy,
      model,
      profile?.instructions,
      settings.extensionTools,
      profile?.control ?? input.control ?? "shell",
      delegates,
      settings.sandbox,
    );
  });

  ipcMain.handle(
    "remote-agent:say",
    async (_event, rawId: unknown, rawText: unknown, rawAttachments: unknown) => {
      await sessionFor(idSchema.parse(rawId)).say(
        z.string().min(1).max(4000).parse(rawText),
        rawAttachments === undefined ? undefined : attachmentSchema.parse(rawAttachments),
      );
    },
  );

  // The same thing as `say` from this side; two names because they are different acts on screen.
  ipcMain.handle("remote-agent:answer", async (_event, rawId: unknown, rawText: unknown) => {
    await sessionFor(idSchema.parse(rawId)).say(z.string().min(1).max(4000).parse(rawText));
  });

  ipcMain.handle("remote-agent:reset", (_event, rawId: unknown) => {
    sessions.get(idSchema.parse(rawId))?.reset();
  });

  ipcMain.handle(
    "remote-agent:approve",
    (_event, rawId: unknown, rawCallId: unknown, rawRemember: unknown) =>
      sessions
        .get(idSchema.parse(rawId))
        ?.decide(
          String(rawCallId),
          true,
          undefined,
          rawRemember === undefined ? undefined : rememberSchema.parse(rawRemember),
        ) ?? false,
  );

  ipcMain.handle(
    "remote-agent:reject",
    (_event, rawId: unknown, rawCallId: unknown, rawNote: unknown, rawRemember: unknown) =>
      sessions
        .get(idSchema.parse(rawId))
        ?.decide(
          String(rawCallId),
          false,
          rawNote === undefined ? undefined : z.string().max(500).parse(rawNote),
          rawRemember === undefined ? undefined : rememberSchema.parse(rawRemember),
        ) ?? false,
  );

  ipcMain.handle("remote-agent:stop", (_event, rawId: unknown) => {
    sessions.get(idSchema.parse(rawId))?.stop();
  });

  ipcMain.handle(
    "remote-agent:set-approval-mode",
    (_event, rawId: unknown, rawMode: unknown) => {
      sessions
        .get(idSchema.parse(rawId))
        ?.setApprovalMode(z.enum(["step", "auto", "plan"]).parse(rawMode));
    },
  );

  ipcMain.handle(
    "remote-agent:reveal-record",
    (_event, rawId: unknown, rawRunId: unknown) => {
      const hostId = idSchema.parse(rawId);
      const file =
        rawRunId === undefined
          ? sessions.get(hostId)?.state.recordPath
          : path.join(recordDirectory(hostId), `${runIdSchema.parse(rawRunId)}.json`);
      if (file) shell.showItemInFolder(file);
    },
  );

  /**
   * A file a run kept, opened or copied out — and nothing else on this disk.
   *
   * The renderer names it by (host, run, savedAs) rather than by path, and the path is built
   * here. `savedAs` still has to be checked: it comes from a record, records are written from
   * what tools reported, and a `../..` in one of them must not turn "show me the report" into
   * "show me anything on this machine".
   */
  const keptFile = (rawId: unknown, rawRunId: unknown, rawName: unknown) => {
    const hostId = idSchema.parse(rawId);
    const runId = runIdSchema.parse(rawRunId);
    const name = z.string().min(1).max(400).parse(rawName);
    const root = path.join(recordDirectory(hostId), runId, "files");
    const file = path.resolve(root, name);
    if (file !== root && !file.startsWith(root + path.sep)) {
      throw new Error(t("That file cannot be opened."));
    }
    return file;
  };

  ipcMain.handle(
    "remote-agent:reveal-kept",
    (_event, rawId: unknown, rawRunId: unknown, rawName: unknown) => {
      shell.showItemInFolder(keptFile(rawId, rawRunId, rawName));
    },
  );

  /* Copied out, never moved: the record keeps its own copy of what a run produced. */
  ipcMain.handle(
    "remote-agent:save-kept",
    async (
      event,
      rawId: unknown,
      rawRunId: unknown,
      rawName: unknown,
    ): Promise<string | undefined> => {
      const from = keptFile(rawId, rawRunId, rawName);
      const window = BrowserWindow.fromWebContents(event.sender);
      const chosen = await (window
        ? dialog.showSaveDialog(window, { defaultPath: path.basename(from) })
        : dialog.showSaveDialog({ defaultPath: path.basename(from) }));
      if (chosen.canceled || !chosen.filePath) return undefined;
      await fs.copyFile(from, chosen.filePath);
      return chosen.filePath;
    },
  );

  /*
   * Past conversations, read from disk.
   *
   * Every file is opened to build the list. A handful of runs per server is what this holds, and
   * the alternative — a separate index — is a second thing that can disagree with the records it
   * describes. If a server ever accumulates enough runs for this to be slow, the fix is to keep
   * fewer of them, not to trust an index.
   */
  /* The shipped catalog, for the settings screen: what this application knows, searchably. */
  ipcMain.handle(
    "remote-agent:catalog-search",
    (_event, rawQuery: unknown, rawOs: unknown) =>
      searchCatalog(
        z.string().max(100).parse(rawQuery),
        rawOs === undefined ? undefined : z.enum(["linux", "windows"]).parse(rawOs),
      ),
  );

  ipcMain.handle("remote-agent:catalog-counts", () => catalogCounts());

  /*
   * A second opinion on a command the operator is about to approve. Advisory only — never a gate.
   * Uses the default model; returns undefined (no hint) on any failure.
   */
  ipcMain.handle("remote-agent:risk-hint", async (_event, rawCommand: unknown) => {
    const command = z.string().min(1).max(2000).parse(rawCommand);
    const settings = await readSettings(deps.userDataRoot);
    const model = findModel(settings);
    if (!model) return undefined;
    const { apiKey } = await resolveModel(model.id).catch(() => ({ apiKey: undefined }));
    return await riskHint({ userDataRoot: deps.userDataRoot, command, model, apiKey });
  });


  /*
   * Forget what one agent remembered on one server — the whole slice at once.
   *
   * Deliberately coarse: the memory was built decision by decision on real approval cards, and
   * pruning it entry by entry in a settings screen is exactly the hand-tended table this design
   * left behind. Wrong memory? Clear it and let the next run re-ask.
   */
  ipcMain.handle("remote-agent:forget-host-rules", async (_event, rawHostId: unknown) => {
    const hostId = idSchema.parse(rawHostId);
    await enqueueSettingsWrite(async () => {
      const current = await readSettings(deps.userDataRoot);
      await writeSettings(deps.userDataRoot, {
        ...current,
        hostRules: current.hostRules.filter((each) => each.hostId !== hostId),
      });
    });
    listeners.send("remote-agent:settings-saved");
  });

  /*
   * How often this agent's server has seen a program before — judgement material for the card.
   *
   * Read from the run records on disk, the same read `list-runs` does. Records per host are few
   * (see the comment there), so counting on demand beats keeping an index that can drift.
   */
  ipcMain.handle(
    "remote-agent:command-history",
    async (
      _event,
      rawId: unknown,
      rawProgram: unknown,
    ): Promise<{ count: number; lastAt?: string }> => {
      const directory = recordDirectory(idSchema.parse(rawId));
      const program = z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-z0-9._+-]+$/i)
        .parse(rawProgram)
        .toLowerCase();
      const names = await fs.readdir(directory).catch(() => [] as string[]);
      let count = 0;
      let lastAt: string | undefined;
      for (const name of names) {
        if (!name.endsWith(".json")) continue;
        try {
          const document = JSON.parse(
            await fs.readFile(path.join(directory, name), "utf8"),
          ) as RemoteRunDocument;
          for (const step of document.steps ?? []) {
            /* Only what actually ran: refusals and bracketed record lines ([file], [rule]…) are
               not "this server has seen it before". */
            if (!step.command || step.command.startsWith("[") || step.refused) continue;
            if (programOf(step.command)?.toLowerCase() !== program) continue;
            count += 1;
            if (!lastAt || step.at > lastAt) lastAt = step.at;
          }
        } catch {
          // A half-written record is skipped, same as in list-runs.
        }
      }
      return { count, lastAt };
    },
  );

  ipcMain.handle("remote-agent:list-runs", (_event, rawId: unknown) =>
    listRunSummaries(idSchema.parse(rawId)),
  );

  // ── the server's dossier (the logbook) ────────────────────────────────────
  ipcMain.handle("remote-agent:server-context", (event, rawId: unknown) => {
    listeners.add(event.sender);
    return readDossier(deps.userDataRoot, idSchema.parse(rawId));
  });

  ipcMain.handle("remote-agent:save-server-notes", async (_event, rawId, rawNotes: unknown) => {
    const hostId = idSchema.parse(rawId);
    const next = await writeNotes(deps.userDataRoot, hostId, z.string().max(8000).parse(rawNotes));
    listeners.send("remote-agent:server-context-changed", hostId);
    return next;
  });

  ipcMain.handle(
    "remote-agent:delete-handover",
    async (_event, rawId, rawAt: unknown, rawRunId: unknown) => {
      const hostId = idSchema.parse(rawId);
      const next = await deleteHandover(
        deps.userDataRoot,
        hostId,
        z.string().max(40).parse(rawAt),
        z.string().max(80).parse(rawRunId),
      );
      listeners.send("remote-agent:server-context-changed", hostId);
      return next;
    },
  );

  /*
   * The agent's notes, corrected or forgotten by hand.
   *
   * Written by the agent as it establishes things; the operator owns them afterwards, because a
   * note that has gone out of date is worse than no note — it is put in front of every later run.
   */
  ipcMain.handle(
    "remote-agent:save-agent-note",
    async (_event, rawId, rawTitle: unknown, rawText: unknown) => {
      const hostId = idSchema.parse(rawId);
      const next = await writeAgentNote(deps.userDataRoot, hostId, {
        at: new Date().toISOString(),
        title: z.string().min(1).max(120).parse(rawTitle),
        text: z.string().max(MOST_AGENT_NOTE_CHARS).parse(rawText),
      });
      listeners.send("remote-agent:server-context-changed", hostId);
      return next;
    },
  );

  ipcMain.handle("remote-agent:delete-agent-note", async (_event, rawId, rawTitle: unknown) => {
    const hostId = idSchema.parse(rawId);
    const next = await writeAgentNote(deps.userDataRoot, hostId, {
      at: new Date().toISOString(),
      title: z.string().min(1).max(120).parse(rawTitle),
      text: "",
    });
    listeners.send("remote-agent:server-context-changed", hostId);
    return next;
  });

  /* Read the facts now, for the panel. Reuses the same fixed probes the agent uses at run start. */
  ipcMain.handle("remote-agent:facts-preview", async (_event, rawId: unknown) => {
    const hostId = idSchema.parse(rawId);
    const facts = await collectFacts(async (command, timeoutMs, maxOutputBytes) => {
      const target = await deps.sshTarget(hostId);
      return await factsRunnerFor(hostId).run(target, command, { timeoutMs, maxOutputBytes });
    });
    const summary = summarizeFacts(facts);
    /* Remembered so a plugin can be suggested later without collecting again. */
    void writeLastFacts(deps.userDataRoot, hostId, { at: facts.at, summary }).catch(() => undefined);
    return { at: facts.at, summary, detail: renderFactsDetail(facts) };
  });

  /*
   * A customer-facing report over a period, from the run records and the dossier's handovers.
   * Raw command output is left out (report.ts) — this goes to a customer, the record stays for us.
   */
  ipcMain.handle(
    "remote-agent:build-report",
    async (_event, rawId: unknown, rawFrom: unknown, rawTo: unknown) => {
      const hostId = idSchema.parse(rawId);
      const from = rawFrom === undefined ? undefined : z.string().max(40).parse(rawFrom);
      const to = rawTo === undefined ? undefined : z.string().max(40).parse(rawTo);
      const directory = recordDirectory(hostId);
      const names = await fs.readdir(directory).catch(() => [] as string[]);
      const docs: RemoteRunDocument[] = [];
      for (const name of names) {
        if (!name.endsWith(".json")) continue;
        try {
          const doc = JSON.parse(
            await fs.readFile(path.join(directory, name), "utf8"),
          ) as RemoteRunDocument;
          const at = doc.startedAt ?? "";
          if (from && at < from) continue;
          if (to && at > to) continue;
          docs.push(doc);
        } catch {
          // skip a half-written record
        }
      }
      docs.sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
      const dossier = await readDossier(deps.userDataRoot, hostId).catch(() => undefined);
      const handovers = (dossier?.handovers ?? []).filter((h) => {
        if (from && h.at < from) return false;
        if (to && h.at > to) return false;
        return true;
      });
      return buildReport({
        hostName: deps.hostName(hostId) ?? hostId,
        from,
        to,
        docs,
        handovers,
        now: new Date().toISOString(),
      });
    },
  );

  ipcMain.handle(
    "remote-agent:save-report",
    async (event, rawId: unknown, rawMarkdown: unknown): Promise<string | undefined> => {
      const hostId = idSchema.parse(rawId);
      const markdown = z.string().max(2_000_000).parse(rawMarkdown);
      const name = (deps.hostName(hostId) ?? hostId).replace(/[^A-Za-z0-9_一-龠ぁ-んァ-ヶー-]/g, "_");
      const parent = BrowserWindow.fromWebContents(event.sender);
      const options = {
        defaultPath: t("{name}-work-report.md", { name }),
        filters: [{ name: "Markdown", extensions: ["md"] }],
      };
      const result = parent
        ? await dialog.showSaveDialog(parent, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return undefined;
      await fs.writeFile(result.filePath, markdown, "utf8");
      return result.filePath;
    },
  );

  ipcMain.handle(
    "remote-agent:load-run",
    async (_event, rawId: unknown, rawRunId: unknown): Promise<RemoteRunDocument> => {
      const file = path.join(
        recordDirectory(idSchema.parse(rawId)),
        `${runIdSchema.parse(rawRunId)}.json`,
      );
      return JSON.parse(await fs.readFile(file, "utf8")) as RemoteRunDocument;
    },
  );

  const tracePath = (hostId: string, runId: string) =>
    path.join(recordDirectory(hostId), `${runId}.trace.jsonl`);

  /* Whether this run kept one, and how big it is — so the window offers it only when it exists. */
  ipcMain.handle(
    "remote-agent:trace-size",
    async (_event, rawId: unknown, rawRunId: unknown): Promise<number | undefined> => {
      try {
        const stat = await fs.stat(tracePath(idSchema.parse(rawId), runIdSchema.parse(rawRunId)));
        return stat.size;
      } catch {
        /* No trace: an older run, or one made with tracing turned off. */
        return undefined;
      }
    },
  );

  /*
   * The whole conversation, out of the application.
   *
   * Two forms because there are two readers: the JSON Lines for a program (or for pasting into a
   * bug report), and the Markdown for a person who wants to see what the model was told.
   */
  ipcMain.handle(
    "remote-agent:save-trace",
    async (
      event,
      rawId: unknown,
      rawRunId: unknown,
      rawFormat: unknown,
    ): Promise<string | undefined> => {
      const hostId = idSchema.parse(rawId);
      const runId = runIdSchema.parse(rawRunId);
      const format = z.enum(["jsonl", "markdown"]).parse(rawFormat);
      const raw = await fs.readFile(tracePath(hostId, runId), "utf8");
      const body = format === "jsonl" ? raw : renderTrace(parseTrace(raw));
      const name = (deps.hostName(hostId) ?? hostId).replace(/[^A-Za-z0-9_一-龠ぁ-んァ-ヶー-]/g, "_");
      const parent = BrowserWindow.fromWebContents(event.sender);
      const options = {
        defaultPath: `${name}-${runId}-trace.${format === "jsonl" ? "jsonl" : "md"}`,
        filters:
          format === "jsonl"
            ? [{ name: "JSON Lines", extensions: ["jsonl"] }]
            : [{ name: "Markdown", extensions: ["md"] }],
      };
      const result = parent
        ? await dialog.showSaveDialog(parent, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return undefined;
      await fs.writeFile(result.filePath, body, "utf8");
      return result.filePath;
    },
  );
}
