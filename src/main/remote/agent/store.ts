import fs from "node:fs/promises";
import { t } from "../../../shared/i18n";
import path from "node:path";
import { z } from "zod";
import type {
  RemoteAgentSettings,
  RemoteCommandRule,
  RemoteCommandSet,
  RemoteModel,
  RemoteRuleSet,
  RulePolicy,
} from "../../../shared/remoteAgent";
import { findCommand } from "./catalog";
import { BUILT_IN_SETS } from "./policy";

/**
 * What the remote agent is configured with, between launches.
 *
 * The same split as everywhere else in this mode: `remote-agent.json` holds preferences, and the
 * API keys go in the encrypted store beside the server passwords. A key buys time on somebody
 * else's service and is a credential like any other.
 *
 * The command sets live here too, in the same file. They are the operator's decision about what
 * an agent may do on a customer's machine — reading them should not require opening a second
 * thing, and a set that was edited must survive a restart or the guarantee is theatre.
 */

/** Where one model's key is kept. Host ids are UUIDs, so nothing else can key to this. */
export function apiKeySecret(modelId: string) {
  return `__agent__.apiKey.${modelId}`;
}

/**
 * The key from before there was more than one model.
 *
 * Kept readable rather than migrated across: the encrypted store is written by a different part
 * of the application, and moving a credential between keys is a step that can fail halfway. The
 * migrated model carries the id `default`, so this is the key it looks under.
 */
export const LEGACY_API_KEY_SECRET = "__agent__.apiKey";

export const MIGRATED_MODEL_ID = "default";

const commandSetSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  allow: z.array(z.string().min(1).max(64).regex(/^[a-z0-9._-]+$/i)).max(200),
  allowSudo: z.boolean(),
  /*
   * What may run unattended, by program.
   *
   * Verbs are not command names: `-qa`, `--upgradable` and `list` all belong here, so the shape
   * is looser than `allow`. It is still bounded — a verb is a word, not a script.
   */
  quiet: z
    .record(
      z.string().min(1).max(64),
      z.union([z.literal("all"), z.array(z.string().min(1).max(64)).max(60)]),
    )
    .optional(),
});

/** A program name — the first word. PowerShell's `Get-Service` and `g++` both fit. */
const programName = z.string().min(1).max(64).regex(/^[a-z0-9._+-]+$/i);

const ruleSchema = z.object({
  action: z.enum(["auto", "ask", "deny"]),
  autoVerbs: z.array(z.string().min(1).max(64)).max(60).optional(),
  origin: z
    .object({
      by: z.enum(["run", "hand", "migrated"]),
      runId: z.string().max(80).optional(),
      hostId: z.string().max(64).optional(),
      at: z.string().max(40),
    })
    .optional(),
});

export const ruleSetSchema = z.record(programName, ruleSchema);

/**
 * This installation's memory on one server. Written mid-run; the settings screen never sends it
 * back. `profileId` is read from files written when memories hung on sub-agents, and folded
 * together by server on the way in.
 */
const hostRulesSchema = z.object({
  profileId: z.string().min(1).max(64).optional(),
  hostId: z.string().min(1).max(64),
  rules: ruleSetSchema,
});

const modelSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  /*
   * How the model is reached.
   *
   * `endpoint` is an address and a key of the operator's own. `codex` means "one of Pi's own
   * providers" — the name is left as it was so nobody's saved settings need rewriting — and
   * `piProvider` says which: `openai-codex` for the ChatGPT subscription, `anthropic` for
   * Claude, `google` for Gemini, `xai` for Grok, and so on.
   */
  provider: z.enum(["endpoint", "codex"]),
  piProvider: z.string().max(64).optional(),
  baseUrl: z.string().max(300).default(""),
  modelId: z.string().max(120).default(""),
  codexModel: z.string().max(120).optional(),
  supportsImages: z.boolean().default(true),
});

export type StoredModel = z.infer<typeof modelSchema>;

const profileSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  control: z.enum(["shell", "screen"]).default("shell"),
  modelId: z.string().max(64).optional(),
  /** The categories this agent joins. Written by the settings screen. */
  commandCategoryIds: z.array(z.string().max(64)).max(30).optional(),
  /** Names outside every category. The exception. */
  extraCommands: z.array(z.string().min(1).max(64).regex(/^[a-z0-9._-]+$/i)).max(60).optional(),
  /* The three below are superseded — permissions live on the installation now. Read once, on
     the way in, and folded into the global rules. */
  allowSudo: z.boolean().optional(),
  autoReads: z.boolean().optional(),
  rules: ruleSetSchema.optional(),
  /** What settings written before categories say. Read once, on the way in. */
  commandSetId: z.string().max(64).optional(),
  approvalMode: z.enum(["step", "auto", "plan"]).default("step"),
  instructions: z.string().max(4000).optional(),
  /** Which other profiles this one may delegate to. Empty means it has no `delegate` tool. */
  delegates: z.array(z.string().max(64)).max(10).default([]),
});

const settingsSchema = z.object({
  /**
   * Tools from extensions that the operator has allowed.
   *
   * Off unless named. An extension is code the operator installed, and a tool it registers
   * reaches whatever that code reaches — an external service, this machine's network. That is a
   * decision worth making once, visibly, rather than inheriting by dropping a file in a folder.
   */
  extensionTools: z.array(z.string().max(64)).max(50).default([]),
  /**
   * Which wall `run_local` should use, or `auto`.
   *
   * `auto` takes the operating system's own — a process, not a virtual machine. An operator who
   * would rather have one story on every machine names `docker` here and gets it on macOS too.
   * Naming one this machine cannot build means no local execution at all, which is the honest
   * outcome of asking for a wall that is not there.
   */
  sandbox: z.enum(["auto", "seatbelt", "linux", "docker"]).default("auto"),
  profiles: z.array(profileSchema).max(30).default([]),
  defaultProfileId: z.string().max(64).optional(),
  models: z.array(modelSchema).max(30),
  defaultModelId: z.string().max(64).optional(),
  commandSets: z.array(commandSetSchema).max(50),
  /** Absent on files from before the installation owned its rules — derived on read. */
  rules: ruleSetSchema.optional(),
  autoReads: z.boolean().default(true),
  allowSudo: z.boolean().default(false),
  /**
   * Whether to keep the whole conversation with the model, run by run.
   *
   * On by default: the first time anybody wants it is after a run went wrong, which is too late
   * to turn it on. It costs disk and nothing else — no request is made for it, and it holds
   * nothing the run record does not already hold.
   */
  tracing: z.boolean().default(true),
  hostRules: z.array(hostRulesSchema).max(500).default([]),
  /**
   * Which language the application speaks.
   *
   * Here rather than in a file of its own because it is a preference like any other, and because
   * the main process already reads this file before the first window — see `localeController.ts`.
   */
  locale: z.enum(["ja", "en", "zh-Hans", "zh-Hant"]).default("en"),
});

export type StoredSettings = z.infer<typeof settingsSchema>;

/**
 * The file as it was written before models were a list.
 *
 * One flat model, no name. Read here rather than left to fail, because an operator who had
 * configured an endpoint and a key should not be logged out by an update.
 */
const legacySchema = z.object({
  provider: z.enum(["endpoint", "codex"]).default("endpoint"),
  codexModel: z.string().max(120).optional(),
  baseUrl: z.string().max(300).default(""),
  modelId: z.string().max(120).default(""),
  supportsImages: z.boolean().default(true),
  commandSets: z.array(commandSetSchema).max(50).default(BUILT_IN_SETS),
});

/**
 * What an operator starts with.
 *
 * No model at all: there is no sensible guess, and a plausible-looking default would send a
 * customer's command output to whoever happens to answer at that address. The two command sets
 * are supplied because writing an allowlist from nothing is the step where somebody types `bash`
 * to get moving.
 */
export const DEFAULTS: StoredSettings = {
  extensionTools: [],
  sandbox: "auto",
  profiles: [],
  models: [],
  commandSets: BUILT_IN_SETS,
  rules: {},
  autoReads: true,
  allowSudo: false,
  tracing: true,
  hostRules: [],
  locale: "en",
};

export function settingsPath(userDataRoot: string) {
  return path.join(userDataRoot, "remote-agent.json");
}

/** The old flat shape as one named model, so nothing configured is lost on the way here. */
export function migrate(legacy: z.infer<typeof legacySchema>): StoredSettings {
  const configured =
    legacy.provider === "codex" || Boolean(legacy.baseUrl || legacy.modelId);
  if (!configured) {
    return {
      extensionTools: [],
      sandbox: "auto",
      profiles: [],
      models: [],
      commandSets: legacy.commandSets,
      autoReads: true,
      allowSudo: false,
      tracing: true,
      hostRules: [],
      locale: "en",
    };
  }
  return {
    extensionTools: [],
    sandbox: "auto",
    profiles: [],
    models: [
      {
        id: MIGRATED_MODEL_ID,
        name: legacy.provider === "codex" ? "Codex CLI" : legacy.modelId || t("Model"),
        provider: legacy.provider,
        baseUrl: legacy.baseUrl,
        modelId: legacy.modelId,
        codexModel: legacy.codexModel,
        supportsImages: legacy.supportsImages,
      },
    ],
    defaultModelId: MIGRATED_MODEL_ID,
    commandSets: legacy.commandSets,
    autoReads: true,
    allowSudo: false,
    tracing: true,
    hostRules: [],
    locale: "en",
  };
}

/**
 * A profile written before categories existed, read as one that has them.
 *
 * The one list it named becomes the one category it joins, and the sudo that lived on that list
 * becomes the agent's own — sudo is a power an agent has, not a kind of command. Done on the way
 * in rather than by rewriting the file, so an operator who goes back a version keeps their
 * settings.
 */
function withCategories(settings: StoredSettings): StoredSettings {
  return {
    ...settings,
    profiles: settings.profiles.map((profile) => {
      if (profile.commandCategoryIds) return profile;
      const joined = profile.commandSetId ? [profile.commandSetId] : [];
      const set = settings.commandSets.find((each) => each.id === profile.commandSetId);
      return {
        ...profile,
        commandCategoryIds: joined,
        allowSudo: profile.allowSudo ?? set?.allowSudo ?? false,
      };
    }),
  };
}

/** What one program was set to, in the terms the migration compares. */
type MigrationTarget = { action: "auto" | "ask" | "deny"; autoVerbs?: string[] };

/** What the catalog would decide for this program with no rule written. */
function catalogTarget(program: string): MigrationTarget {
  const entry = findCommand(program);
  if (!entry || entry.tier !== 1) return { action: "ask" };
  if (entry.class === "read") return { action: "auto" };
  if (entry.class === "shell") return { action: "deny" };
  if (entry.class === "verbs") {
    const autoVerbs = Object.entries(entry.verbs ?? {})
      .filter(([, kind]) => kind === "read")
      .map(([name]) => name);
    return { action: "ask", autoVerbs };
  }
  return { action: "ask" };
}

function sameTarget(a: MigrationTarget, b: MigrationTarget): boolean {
  if (a.action !== b.action) return false;
  const lower = (verbs?: string[]) => new Set((verbs ?? []).map((verb) => verb.toLowerCase()));
  const left = lower(a.autoVerbs);
  const right = lower(b.autoVerbs);
  return left.size === right.size && [...left].every((verb) => right.has(verb));
}

/** Which of two rules is the stricter word. deny beats ask beats auto; verbs union on a tie. */
function stricter(a: RemoteCommandRule, b: RemoteCommandRule): RemoteCommandRule {
  const rank = { deny: 3, ask: 2, auto: 1 } as const;
  if (rank[a.action] !== rank[b.action]) return rank[a.action] > rank[b.action] ? a : b;
  if (a.action === "ask" && b.action === "ask") {
    return { ...a, autoVerbs: [...new Set([...(a.autoVerbs ?? []), ...(b.autoVerbs ?? [])])] };
  }
  return a;
}

/**
 * Settings from before the installation owned its rules, read as though it always had.
 *
 * Two generations are folded in. Categories said, program by program, what could run unattended;
 * the catalog now says the same for everything it knows, so only the *differences* survive, as
 * global exceptions. Then the short-lived generation where rules hung on sub-agents: every
 * profile's exceptions and every (profile, server) memory are folded together — the stricter
 * word winning where two profiles disagreed, because a person who wrote "ask" somewhere meant it.
 *
 * Like `withCategories`, this converts on the way in and never rewrites the file, so going back
 * a version keeps the old settings working.
 */
function withRules(settings: StoredSettings): StoredSettings {
  const at = new Date().toISOString();

  /* Memories keyed by (profile, server) collapse to the server. */
  const byHost = new Map<string, RemoteRuleSet>();
  for (const entry of settings.hostRules) {
    const merged = byHost.get(entry.hostId) ?? {};
    for (const [name, rule] of Object.entries(entry.rules)) {
      merged[name] = merged[name] ? stricter(merged[name], rule) : rule;
    }
    byHost.set(entry.hostId, merged);
  }
  const hostRules = [...byHost.entries()].map(([hostId, rules]) => ({ hostId, rules }));

  if (settings.rules) return { ...settings, hostRules };

  /* No global rules yet: derive them from what the profiles used to carry. */
  const rules: RemoteRuleSet = {};
  const fold = (name: string, rule: RemoteCommandRule) => {
    rules[name] = rules[name] ? stricter(rules[name], rule) : rule;
  };
  for (const profile of settings.profiles) {
    if (profile.rules) {
      for (const [name, rule] of Object.entries(profile.rules)) fold(name, rule);
      continue;
    }
    const joined = joinCategories(settings, profile);
    for (const program of joined.allow) {
      const quiet = joined.quiet?.[program];
      const old: MigrationTarget =
        quiet === "all"
          ? { action: "auto" }
          : Array.isArray(quiet)
            ? { action: "ask", autoVerbs: quiet }
            : { action: "ask" };
      if (sameTarget(old, catalogTarget(program))) continue;
      fold(program, { ...old, origin: { by: "migrated", at } });
    }
  }
  return {
    ...settings,
    rules,
    /* The dials follow the most careful profile; sudo follows the most permissive, because a
       person who allowed it somewhere expects the power to survive the move. */
    autoReads: settings.profiles.every((profile) => profile.autoReads !== false),
    allowSudo: settings.allowSudo || settings.profiles.some((profile) => Boolean(profile.allowSudo)),
    hostRules,
  };
}

export async function readSettings(userDataRoot: string): Promise<StoredSettings> {
  try {
    const raw = JSON.parse(await fs.readFile(settingsPath(userDataRoot), "utf8"));
    const parsed = settingsSchema.safeParse(raw);
    if (parsed.success) return withRules(withCategories(parsed.data));
    const legacy = legacySchema.safeParse(raw);
    return legacy.success ? withRules(withCategories(migrate(legacy.data))) : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export async function writeSettings(userDataRoot: string, settings: StoredSettings) {
  await fs.writeFile(
    settingsPath(userDataRoot),
    `${JSON.stringify(settingsSchema.parse(settings), null, 2)}\n`,
    "utf8",
  );
}

/** What the renderer may see: everything except the keys, and whether each one has one. */
export function present(
  settings: StoredSettings,
  hasKey: (modelId: string) => boolean,
): RemoteAgentSettings {
  const models: RemoteModel[] = settings.models.map((model) => ({
    ...model,
    hasApiKey: hasKey(model.id),
  }));
  return {
    extensionTools: settings.extensionTools,
    sandbox: settings.sandbox,
    profiles: settings.profiles,
    // Same rule as the model's: a default naming something deleted is worse than none.
    defaultProfileId: settings.profiles.some((each) => each.id === settings.defaultProfileId)
      ? settings.defaultProfileId
      : settings.profiles[0]?.id,
    models,
    defaultModelId: models.some((model) => model.id === settings.defaultModelId)
      ? settings.defaultModelId
      : models[0]?.id,
    commandSets: settings.commandSets,
    rules: settings.rules ?? {},
    autoReads: settings.autoReads,
    allowSudo: settings.allowSudo,
    tracing: settings.tracing,
    hostRules: settings.hostRules.map((each) => ({ hostId: each.hostId, rules: each.rules })),
  };
}

/** The model a run should use: the one it named, else the default, else the only one there is. */
export function findModel(settings: StoredSettings, id?: string): StoredModel | undefined {
  if (id) {
    const named = settings.models.find((model) => model.id === id);
    if (named) return named;
  }
  return (
    settings.models.find((model) => model.id === settings.defaultModelId) ?? settings.models[0]
  );
}

export function findSet(settings: StoredSettings, id: string): RemoteCommandSet | undefined {
  return settings.commandSets.find((set) => set.id === id);
}

/**
 * The categories an agent joined, plus whatever it named on its own, as one set for the run.
 *
 * Everything downstream — the gate, the prompt, the record — reads one list, so joining is done
 * here and once. Two rules are worth knowing:
 *
 * - a command in two categories keeps both categories' words: the read-only ways of using it are
 *   the union, because each category was written by somebody who meant what they wrote
 * - "the whole program is read-only" wins over a list of ways, for the same reason. If that is
 *   wrong, it is wrong in the category, where it can be seen and changed
 *
 * Commands the agent named outside every category are `ask` — nothing said they were safe.
 */
export function joinCategories(
  settings: StoredSettings,
  profile: { name?: string; commandCategoryIds?: string[]; extraCommands?: string[]; allowSudo?: boolean },
): RemoteCommandSet {
  const chosen = (profile.commandCategoryIds ?? [])
    .map((id) => findSet(settings, id))
    .filter((each): each is RemoteCommandSet => Boolean(each));

  const allow = [...new Set([...chosen.flatMap((set) => set.allow), ...(profile.extraCommands ?? [])])];
  const quiet: Record<string, "all" | string[]> = {};
  for (const set of chosen) {
    for (const [name, said] of Object.entries(set.quiet ?? {})) {
      const before = quiet[name];
      if (said === "all" || before === "all") quiet[name] = "all";
      else quiet[name] = [...new Set([...(before ?? []), ...said])];
    }
  }

  return {
    id: "joined",
    name: chosen.length ? chosen.map((set) => set.name).join("・") : (profile.name ?? t("not named")),
    allow,
    allowSudo: Boolean(profile.allowSudo),
    ...(Object.keys(quiet).length ? { quiet } : {}),
  };
}

/**
 * The merged view one run judges under: the installation's exceptions, overridden — program by
 * program, case-insensitively — by what was remembered on this server.
 *
 * Case-insensitively because the rules themselves match that way: a rule spelled `Get-Service`
 * and a memory spelled `get-service` are the same program, and keeping both would make the
 * winner depend on iteration order. One policy for the conversation and every sub-agent it
 * delegates to: permissions belong to the installation, not to a named way of working.
 */
export function mergeRules(settings: StoredSettings, hostId: string): RulePolicy {
  const merged = new Map<string, [string, RemoteCommandRule]>();
  for (const [name, rule] of Object.entries(settings.rules ?? {})) {
    merged.set(name.toLowerCase(), [name, rule]);
  }
  const host = settings.hostRules.find((each) => each.hostId === hostId);
  for (const [name, rule] of Object.entries(host?.rules ?? {})) {
    merged.set(name.toLowerCase(), [name, rule]);
  }
  const rules: RemoteRuleSet = {};
  for (const [, [name, rule]] of merged) rules[name] = rule;
  return {
    name: t("Settings"),
    allowSudo: settings.allowSudo,
    autoReads: settings.autoReads,
    rules,
  };
}

/**
 * Write one remembered decision into this server's memory.
 *
 * A verb-level "automatic" merges into an `ask` rule's verb list rather than replacing it — two
 * cards remembered on two days are one rule with two verbs. A whole-program "automatic", or a
 * "never", replaces
 * whatever was there: the operator's later word is the word.
 */
export function upsertHostRule(
  settings: StoredSettings,
  input: {
    hostId: string;
    program: string;
    action: "auto" | "deny";
    verb?: string;
    runId?: string;
    at: string;
  },
): StoredSettings {
  const index = settings.hostRules.findIndex((each) => each.hostId === input.hostId);
  const existingRules = index >= 0 ? settings.hostRules[index].rules : {};
  const existingKey = Object.keys(existingRules).find(
    (key) => key.toLowerCase() === input.program.toLowerCase(),
  );
  const existing = existingKey ? existingRules[existingKey] : undefined;
  const origin = { by: "run" as const, runId: input.runId, hostId: input.hostId, at: input.at };

  let rule: RemoteCommandRule;
  if (input.action === "deny") {
    rule = { action: "deny", origin };
  } else if (input.verb) {
    if (existing?.action === "auto") {
      // Already broader than the verb being remembered; nothing to narrow.
      rule = existing;
    } else {
      const verbs = existing?.action === "ask" ? (existing.autoVerbs ?? []) : [];
      rule = { action: "ask", autoVerbs: [...new Set([...verbs, input.verb])], origin };
    }
  } else {
    rule = { action: "auto", origin };
  }

  const rules = { ...existingRules };
  if (existingKey && existingKey !== input.program) delete rules[existingKey];
  rules[input.program] = rule;
  const entry = { hostId: input.hostId, rules };
  const hostRules =
    index >= 0
      ? settings.hostRules.map((each, at) => (at === index ? entry : each))
      : [...settings.hostRules, entry];
  return { ...settings, hostRules };
}

/** The named way of working a run should use: the one it named, else the default. */
export function findProfile(settings: StoredSettings, id?: string) {
  if (id) {
    const named = settings.profiles.find((profile) => profile.id === id);
    if (named) return named;
  }
  return settings.profiles.find((profile) => profile.id === settings.defaultProfileId);
}
