import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { t } from "../../../shared/i18n";
import { listResources } from "./resources";
import type { StoredModel } from "./store";

/**
 * The agent's engine: Pi.
 *
 * Forge used to run its own loop against an OpenAI-compatible endpoint — enough for one goal and
 * four tools, and a dead end for everything asked of it since. Skills, prompt templates,
 * always-on instructions, extensions and packages are not features to be reinvented one by one;
 * they are what a coding agent already is, and `@earendil-works/pi-coding-agent` is one that is.
 *
 * **Pi owns the loop, the message history and the resources. It does not own the tools.** The
 * built-in ones — `bash`, `read`, `write`, `edit`, `grep`, `find`, `ls` — act on *this* machine,
 * the operator's own laptop, and are all disabled by naming ours in `tools`. What reaches a
 * customer's server still goes through the allowlist, the metacharacter rule and, for anything
 * destructive or elevated, a person. That guarantee is unchanged by the engine swap.
 *
 * The other half of the swap is the point of it: this path deliberately leaves Pi's resource
 * discovery **on**, pointed at a directory Forge owns. Skills, prompts and context files put
 * there by the operator are read by Pi itself — no code here reimplements any of them.
 */

/*
 * The subscription, and whose login it uses.
 *
 * Pi reaches ChatGPT Plus/Pro itself as the `openai-codex` provider, over OAuth, with tokens in
 * `auth.json` that it refreshes on its own. The `codex` CLI this application used to spawn for
 * the subscription is not needed under Pi — the same account is reached one layer down.
 *
 * Whose `auth.json`: **the operator's own, if they have one.** Forge runs on their machine and
 * they are already a Pi user; one `pi login` in a terminal then serves both, and this
 * application never holds, refreshes or stores somebody's OAuth tokens — which is a thing not to
 * own if Pi already owns it correctly. Where there is no such file, Forge falls back to its own
 * beside the rest of the agent's directory, and the settings screen says which one is in force
 * rather than leaving it to be guessed.
 */

/*
 * On the switchover, from an attempt that was reverted.
 *
 * The whole of it was written — Pi driving the loop, `createRemoteTools` as the only tools, the
 * session's `handle`/`runCommand`/`toolSchemas`/`messages` deleted — and against the stub
 * endpoint it ran away: requests without end until the heap gave out, in about eighty seconds.
 * Not diagnosed, so not kept: a runaway agent is worse than an old loop.
 *
 * Two things are known and worth starting from. Pi speaks only in streams, so any stub that
 * answers with a single JSON body makes it retry and then fail with "Stream ended without
 * finish_reason" — that part was fixed and is not the cause. What was not established is whether
 * the loop repeats because a tool result of ours is shaped wrongly (`terminate` ignored, or the
 * `content` array not what Pi expects from a custom tool) or because finishing the run from
 * inside a tool — `finish()` while Pi is still in its turn — leaves Pi with nothing to end on.
 * The next attempt should watch Pi's own events for one run before changing anything.
 */

/** The provider id Pi gives the ChatGPT subscription, and what it calls the model by default. */
export const SUBSCRIPTION_PROVIDER = "openai-codex";
export const SUBSCRIPTION_DEFAULT_MODEL = "gpt-5.5";

/** The operator's own Pi directory, which is where `pi login` writes. */
export function operatorAuthPath() {
  return path.join(os.homedir(), ".pi", "agent", "auth.json");
}

/**
 * Which credentials file this run should use, and where it came from.
 *
 * Read at the moment a session starts rather than remembered: the operator may log in while the
 * application is open, and the next run should simply work.
 */
export async function chooseAuthPath(userDataRoot: string): Promise<{
  path: string;
  from: "operator" | "forge";
}> {
  const theirs = operatorAuthPath();
  try {
    await fs.access(theirs);
    return { path: theirs, from: "operator" };
  } catch {
    return { path: path.join(agentDirectory(userDataRoot), "auth.json"), from: "forge" };
  }
}

/**
 * Whether a given provider is logged in, for the line on the settings screen that says so.
 *
 * Only whether — the token itself never crosses this boundary. Pi keys credentials by provider
 * name; what is under that key is Pi's business.
 */
export async function subscriptionStatus(userDataRoot: string, provider = SUBSCRIPTION_PROVIDER) {
  const auth = await chooseAuthPath(userDataRoot);
  try {
    const stored = JSON.parse(await fs.readFile(auth.path, "utf8")) as Record<string, unknown>;
    return { signedIn: Boolean(stored[provider]), path: auth.path, from: auth.from };
  } catch {
    return { signedIn: false, path: auth.path, from: auth.from };
  }
}

/**
 * Signing in to a service, inside the application.
 *
 * The alternative was telling the operator to open a terminal and run `pi login openai-codex`,
 * which is this application's own plumbing wearing the face of an instruction: nobody buying a
 * maintenance tool knows what `pi` is, and a GUI that asks for a shell command has given up.
 * The provider drives its own flow — it says "open this URL", or asks for a code, or asks for a
 * key — and the two callbacks below carry those to whoever is looking at the screen.
 */
export async function signIn(
  userDataRoot: string,
  providerId: string,
  ask: (prompt: AuthPrompt) => Promise<string>,
  tell: (event: AuthEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const pi = await loadPi();
  const agentDir = await ensureAgentDirectory(userDataRoot);
  const auth = await chooseAuthPath(userDataRoot);
  const runtime = await pi.ModelRuntime.create({
    modelsPath: await writeEmptyModelsFile(agentDir),
    authPath: auth.path,
  });
  const provider = runtime.getProvider(providerId);
  if (!provider) throw new Error(t("Pi does not know a service called {name}.", { name: providerId }));
  /* Only plans are signed in to from here; a key is typed into the model's own fields. */
  const type = provider.auth?.oauth ? "oauth" : "api_key";
  await runtime.login(providerId, type, { prompt: answered(ask), notify: tell, signal });
}

/**
 * The provider's first question, answered here instead of on the screen.
 *
 * Both services that ask one ask the same thing: browser, or device code for a machine with no
 * browser (`pi-ai/dist/auth/oauth/{openai-codex,radius}.js`). This is a desktop application with
 * a browser in front of the person using it, so the answer is always the same — and asking it in
 * the provider's English, in a window, was the difference between a login and a puzzle. Anything
 * else a provider might ask still goes to the screen.
 */
function answered(ask: (prompt: AuthPrompt) => Promise<string>) {
  return async (prompt: AuthPrompt): Promise<string> => {
    if (prompt.type === "select") {
      const options = prompt.options ?? [];
      const browser = options.find((option) => option.id === "browser");
      const device = options.find((option) => option.id === "device_code");
      if (browser && (await callbackPortFree())) return browser.id;
      /*
       * The browser method needs port 1455 for its callback, and something else may hold it — an
       * earlier login of ours that was never let go, or a `codex` on the same machine. Pi does not
       * treat that as a failure: it keeps going with a listener that never hears anything, the
       * callback reaches whoever *does* hold the port, and the browser shows that flow's "State
       * mismatch". The device code asks for no port at all, so it is the honest second choice.
       */
      if (device) return device.id;
      if (browser) return browser.id;
    }
    return ask(prompt);
  };
}

/** Whether the callback socket is ours to take. Same address as `pi-ai` binds. */
async function callbackPortFree(): Promise<boolean> {
  const net = await import("node:net");
  return await new Promise<boolean>((resolve) => {
    const probe = net
      .createServer()
      .once("error", () => resolve(false))
      .once("listening", () => probe.close(() => resolve(true)));
    probe.listen(1455, "127.0.0.1");
  });
}

/**
 * The services Pi can reach, and how each one is paid for.
 *
 * Read from Pi rather than kept as a list here, because the two are different questions and only
 * Pi knows the answer to the second: `openai-codex` and `anthropic` take a subscription login,
 * `google` takes a key and nothing else. A hand-written list said Gemini was a subscription, and
 * the operator who picked it was shown a login button for a service that has no login.
 */
export async function listProviders(
  userDataRoot: string,
): Promise<Array<{ id: string; name: string; subscription: boolean; apiKey: boolean }>> {
  const pi = await loadPi();
  const agentDir = await ensureAgentDirectory(userDataRoot);
  const auth = await chooseAuthPath(userDataRoot);
  const runtime = await pi.ModelRuntime.create({
    modelsPath: await writeEmptyModelsFile(agentDir),
    authPath: auth.path,
  });
  return runtime
    .getProviders()
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      subscription: Boolean(provider.auth?.oauth),
      apiKey: Boolean(provider.auth?.apiKey),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

/** Forget a service's credential. */
export async function signOut(userDataRoot: string, providerId: string): Promise<void> {
  const pi = await loadPi();
  const agentDir = await ensureAgentDirectory(userDataRoot);
  const auth = await chooseAuthPath(userDataRoot);
  const runtime = await pi.ModelRuntime.create({
    modelsPath: await writeEmptyModelsFile(agentDir),
    authPath: auth.path,
  });
  await runtime.logout(providerId);
}

/** Where Forge keeps the agent's own directory, in Pi's layout. */
export function agentDirectory(userDataRoot: string) {
  return path.join(userDataRoot, "agent");
}

/**
 * The directories Pi discovers resources from, created so they can be opened and filled.
 *
 * Named by Pi, not by us: `skills/` holds `<name>/SKILL.md`, `prompts/` holds `<name>.md`,
 * `extensions/` holds the ones that hook events, and `AGENTS.md` is the always-on instruction.
 */
export async function ensureAgentDirectory(userDataRoot: string) {
  const root = agentDirectory(userDataRoot);
  for (const name of ["skills", "prompts", "extensions", "sessions"]) {
    await fs.mkdir(path.join(root, name), { recursive: true });
  }
  return root;
}

/**
 * The chosen model, in the file Pi reads models from.
 *
 * Written each run rather than kept in step: the registry is edited in another window, and a
 * file that is only correct when somebody remembered to sync it is a file that is wrong.
 */
/**
 * One file per model, not one file for the agent.
 *
 * A single `models.json` was fine while one conversation had one model. It stopped being fine
 * the moment an agent could delegate: two children starting at the same time with different
 * endpoints both wrote it, the second overwrote the first, and the first then looked up a
 * provider that was no longer there — "Pi could not resolve the model" from a model that was
 * configured correctly. Measured, with two stub endpoints.
 *
 * Written under `models/` and named after the model, so two starts of the same model write the
 * same bytes and two of different models never meet.
 */
export function modelsFilePath(agentDir: string, modelId: string) {
  const safe = modelId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64) || "model";
  return path.join(agentDir, "models", `${safe}.json`);
}

export async function writeModelsFile(
  agentDir: string,
  model: StoredModel,
  apiKey: string | undefined,
) {
  const providerId = `forge-${model.id}`;
  const providers = {
    [providerId]: {
      baseUrl: model.baseUrl,
      api: "openai-completions",
      // Pi resolves `$VAR` itself; the key is handed over as a value, never written elsewhere.
      apiKey: apiKey ?? "",
      models: [{ id: model.modelId }],
    },
  };
  const file = modelsFilePath(agentDir, model.id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify({ providers }, null, 2)}\n`, "utf8");
  return { providerId, modelId: model.modelId, path: file };
}

async function writeEmptyModelsFile(agentDir: string) {
  const file = modelsFilePath(agentDir, "subscription");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify({ providers: {} }, null, 2)}\n`, "utf8");
  return file;
}

/**
 * One tool Forge hands to Pi.
 *
 * `parameters` is a TypeBox schema because that is what Pi validates against — a hand-written
 * JSON Schema is accepted at registration, advertised to the model, and then fails validation
 * when the model actually calls it, so the tool simply never runs. Measured, once.
 */
export type PiToolSpec = {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  run(args: Record<string, unknown>): Promise<string>;
};

/**
 * One skill's text, from the agent's own directory and nowhere else.
 *
 * The name is checked against the same rule the settings screen enforces, and the path is
 * resolved and compared: a name is a name, not a route out of the folder.
 */
export async function readSkillFile(userDataRoot: string, name: string) {
  const skills = path.join(agentDirectory(userDataRoot), "skills");
  const file = path.resolve(skills, name, "SKILL.md");
  if (!file.startsWith(path.resolve(skills) + path.sep)) {
    throw new Error(t("That skill cannot be read."));
  }
  return await fs.readFile(file, "utf8");
}

/**
 * How something said while the agent is working reaches it.
 *
 * Pi's own two words. `steer` lands after the turn's tool calls have finished and before the next
 * call to the model — the first moment where a change of mind is safe, because a tool call left
 * without its answer is a broken conversation. `followUp` waits for the whole run to end.
 */
export type PiDelivery = "steer" | "followUp";

export type PiSession = {
  prompt(text: string, options?: { streamingBehavior: PiDelivery }): Promise<void>;
  abort(): Promise<void>;
  dispose(): void;
  /** What Pi found in the agent directory, for the screen that manages it. */
  resources: {
    skills: Array<{ name: string; description: string }>;
    prompts: string[];
    extensions: string[];
  };
};

/**
 * What this module uses of Pi.
 *
 * Written out rather than imported so the dynamic import stays the only reference to the
 * package: it is a large ESM built for a terminal, and a failure to load has to be a sentence
 * about the agent rather than a window that will not open.
 */
type Pi = {
  defineTool: (spec: {
    name: string;
    label: string;
    description: string;
    parameters: unknown;
    /* Two arguments, in this order: Pi hands the call's id first. The result is content, not
       a string — a tool may answer with a picture. */
    execute: (
      toolCallId: string,
      args: Record<string, unknown>,
    ) => Promise<{ content: unknown[]; details: unknown; terminate?: boolean }>;
  }) => unknown;
  ModelRuntime: {
    create(options: { modelsPath: string; authPath: string }): Promise<ModelRuntime>;
  };
  DefaultResourceLoader: new (options: Record<string, unknown>) => {
    reload(): Promise<void>;
    getSkills?: () => { skills: Array<{ name: string; description?: string }> };
    getPromptTemplates?: () => { promptTemplates: Array<{ name: string }> };
    getExtensions?: () => { extensions: Array<{ name: string }> };
  };
  SessionManager: { create(cwd: string): unknown };
  createAgentSession(options: Record<string, unknown>): Promise<{
    session: {
      /* Pi refuses a prompt sent mid-stream unless it is told how to queue it. */
      prompt(text: string, options?: { streamingBehavior: PiDelivery }): Promise<void>;
      abort(): Promise<void>;
      dispose(): void;
      subscribe(listener: (event: PiEvent) => void): () => void;
    };
  }>;
};

/**
 * As much of Pi's model runtime as this application uses.
 *
 * `completeSimple` is one question and one answer, with no session, no tools and no resources
 * behind it. The installation card's reading uses it: what is being judged is a file, and an
 * agent loop with the operator's skills loaded would be judging it with the very things it is
 * supposed to be reading about.
 */
export type AuthPrompt = {
  type: "text" | "secret" | "select" | "manual_code";
  message: string;
  placeholder?: string;
  options?: ReadonlyArray<{ id: string; label: string; description?: string }>;
  /**
   * Fires when the provider no longer wants an answer.
   *
   * The browser flow asks for a pasted code *and* listens for the callback at the same time,
   * whichever arrives first. When the callback wins, this is how it says so — and a window that
   * ignores it leaves somebody staring at a box asking them to paste something they no longer
   * have to paste, on a login that already worked.
   */
  signal?: AbortSignal;
};

export type AuthEvent =
  | { type: "info"; message: string }
  | { type: "auth_url"; url: string; instructions?: string }
  | { type: "device_code"; userCode: string; verificationUri: string }
  | { type: string; [key: string]: unknown };

export type ModelRuntime = {
  getModel(provider: string, id: string): unknown;
  getProviders(): ReadonlyArray<{
    id: string;
    name: string;
    auth?: { apiKey?: unknown; oauth?: unknown };
  }>;
  getProvider(providerId: string): { auth?: { apiKey?: unknown; oauth?: unknown } } | undefined;
  checkAuth(providerId: string): Promise<{ type: string; source?: string } | undefined>;
  /** Runs the provider's own login and stores what it returns. See `signIn` below. */
  login(
    providerId: string,
    type: "api_key" | "oauth",
    interaction: {
      prompt(prompt: AuthPrompt): Promise<string>;
      notify(event: AuthEvent): void;
      /* Passed through to the provider, which gives up its socket and its polling when it fires. */
      signal?: AbortSignal;
    },
  ): Promise<unknown>;
  logout(providerId: string): Promise<void>;
  completeSimple(
    model: unknown,
    context: { systemPrompt?: string; messages: Array<{ role: string; content: string }> },
  ): Promise<{ content: Array<{ type: string; text?: string }>; errorMessage?: string }>;
};

export type PiEvent = {
  type: string;
  [key: string]: unknown;
};

export async function loadPi(): Promise<Pi> {
  try {
    return (await import("@earendil-works/pi-coding-agent")) as unknown as Pi;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(t("The agent's runtime (Pi) could not be loaded: {detail}", { detail }));
  }
}

/**
 * The model itself, resolved the way a run resolves it.
 *
 * Two kinds, one runtime: a subscription is Pi's own provider, reached with the operator's login;
 * an endpoint is written into a models file first. Nothing above here knows which it was. Shared
 * so that everything asking a model a question — a run, or the reading of a file about to be
 * installed — resolves it once, in one place, with one set of error messages.
 */
export async function resolveModel(
  userDataRoot: string,
  stored: StoredModel,
  apiKey?: string,
): Promise<{ modelRuntime: ModelRuntime; model: unknown }> {
  const pi = await loadPi();
  const agentDir = await ensureAgentDirectory(userDataRoot);
  const subscription = stored.provider === "codex";
  /* A subscription needs no file of ours — but the runtime still wants a path, so it gets one
     with nothing in it rather than whatever another run last wrote. */
  const chosen = subscription
    ? {
        providerId: stored.piProvider?.trim() || SUBSCRIPTION_PROVIDER,
        modelId: stored.codexModel?.trim() || SUBSCRIPTION_DEFAULT_MODEL,
        path: await writeEmptyModelsFile(agentDir),
      }
    : await writeModelsFile(agentDir, stored, apiKey);

  const auth = await chooseAuthPath(userDataRoot);
  const modelRuntime = await pi.ModelRuntime.create({
    modelsPath: chosen.path,
    authPath: auth.path,
  });
  const model = modelRuntime.getModel(chosen.providerId, chosen.modelId);
  if (!model) {
    throw new Error(
      subscription
        ? t(
            "{model} from {provider} could not be used. In the agent settings, sign in to that service or enter an API key for it.",
            { model: chosen.modelId, provider: chosen.providerId },
          )
        : t("Pi could not resolve the model “{name}”.", { name: stored.name }),
    );
  }
  return { modelRuntime, model };
}

export async function startPiSession(options: {
  userDataRoot: string;
  /**
   * The caller's own prompt, given what Pi found.
   *
   * A function because the skills are not known until the directory has been read, and naming
   * them is the caller's job here: Pi lists skills only for an agent that has a tool able to
   * read a file, and this one deliberately has none of Pi's.
   */
  systemPrompt: (skills: Array<{ name: string; description: string }>) => string;
  model: StoredModel;
  apiKey?: string;
  /** Pi's own scale. Passed straight through; a model with no reasoning ignores it. */
  thinking?: "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  /**
   * Tools already made with Pi's own `defineTool`, and their names.
   *
   * Already made, deliberately. Handing over descriptions and defining them here was one
   * definition too many: the caller's `defineTool` result went through it a second time, came
   * out with no name, and the model then asked for a tool that did not exist — over and over,
   * three thousand turns before anything noticed.
   */
  tools: unknown[];
  toolNames: string[];
  onEvent(event: PiEvent): void;
}): Promise<PiSession> {
  const pi = await loadPi();
  const agentDir = await ensureAgentDirectory(options.userDataRoot);
  const sessionsDir = path.join(agentDir, "sessions");

  /*
   * Two kinds of model, one runtime.
   *
   * A subscription is Pi's own provider, reached with the operator's login; an endpoint is
   * written into `models.json` first. Either way what comes back is a model object, and nothing
   * below here knows which it was.
   */
  /*
   * The skills, read straight from the directory.
   *
   * Not from the loader: Pi asks for the system prompt while it is still reloading, so anything
   * taken from `getSkills()` at that moment is empty — measured. The files are right there and
   * `listResources` already reads exactly this frontmatter, with tests.
   */
  const discovered = (await listResources(options.userDataRoot, "skill")).map((skill) => ({
    name: skill.name,
    description: skill.description,
  }));
  const { modelRuntime, model } = await resolveModel(
    options.userDataRoot,
    options.model,
    options.apiKey,
  );

  /*
   * Discovery is on, and pointed here.
   *
   * A tool whose actions land on a real keyboard has to turn all of this off — instructions
   * arriving from outside the operator's intent would be typed straight at the machine. Here they
   * are the feature: a skill is how "the way we look at a 502 on these servers" stops being
   * retyped every time.
   * `agentDir` keeps it to Forge's own directory rather than whatever is in `~/.pi`.
   */
  const resourceLoader = new pi.DefaultResourceLoader({
    cwd: sessionsDir,
    agentDir,
    /*
     * Added to what Pi assembles, not put in its place.
     *
     * Replacing it outright throws away the parts Pi builds from the directory: the list of skills with their descriptions, and
     * the always-on instructions. Those are the whole point of pointing Pi at a directory the
     * operator fills, and the first version of this dropped them on the floor.
     *
     * What Pi builds describes the tools that are actually enabled, which here are only ours, so
     * there is nothing in it advertising a shell on this machine.
     */
    /*
     * Only this directory's skills.
     *
     * Pi also finds `~/.pi/agent/skills` and `~/.agents/skills` — on this machine, seventeen of
     * them, written for coding: animation libraries, a registry, a video toolkit. They were
     * written for a different agent doing a different job, and putting them in front of one that
     * runs commands on a customer's server is noise at best. What the operator put in Forge's
     * own directory is what this agent knows.
     */
    skillsOverride: (current: { skills: Array<{ baseDir?: string; filePath?: string }> }) => ({
      ...current,
      skills: current.skills.filter((skill) =>
        (skill.baseDir ?? skill.filePath ?? "").startsWith(agentDir),
      ),
    }),
    systemPromptOverride: (base?: string) =>
      [base, options.systemPrompt(discovered)].filter(Boolean).join("\n\n"),
    noThemes: true,
  });
  await resourceLoader.reload();

  const { session } = await pi.createAgentSession({
    model,
    modelRuntime,
    ...(options.thinking ? { thinkingLevel: options.thinking } : {}),
    resourceLoader,
    sessionManager: pi.SessionManager.create(sessionsDir),
    cwd: sessionsDir,
    agentDir,
    /*
     * The safety boundary, written as an allowlist of tool names.
     *
     * Naming ours disables every built-in: nothing Pi ships can touch this machine's files or
     * run a shell on it. `noTools: "all"` is not used — it would take ours with it.
     */
    tools: options.toolNames,
    customTools: options.tools,
  });

  session.subscribe(options.onEvent);

  const named = (list?: Array<{ name: string }>) => (list ?? []).map((each) => each.name);
  return {
    prompt: (text, options) => session.prompt(text, options),
    abort: () => session.abort(),
    dispose: () => session.dispose(),
    resources: {
      skills: discovered,
      prompts: named(resourceLoader.getPromptTemplates?.().promptTemplates),
      extensions: named(resourceLoader.getExtensions?.().extensions),
    },
  };
}
