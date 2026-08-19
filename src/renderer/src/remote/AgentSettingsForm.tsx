import { useEffect, useState } from "react";
import { formatDateTime, t } from "../../../shared/i18n";
import { useT } from "../i18n";
import type { AuthPromptView } from "../../../shared/remoteResources";
import type {
  RemoteAgentSettings,
  RemoteCommandSet,
  RemoteModel,
  RemoteWallState,
} from "../../../shared/remoteAgent";
import { SwapLabel } from "./SwapLabel";

/**
 * What the agent is, and what it may do.
 *
 * Two things on one screen because they are one decision. A model with nothing to run is a bill;
 * an allowlist without a model is a promise about nobody. And the list is the whole of the
 * guarantee that a person actually writes — everything else in ADR 0001 is enforced in code, but
 * *which commands* is a judgement, made here, before a run starts.
 *
 * Models are a list. One installation reaches more than one: a model on the workbench that costs
 * nothing and never leaves the building, a subscription for the hard questions, a cheap remote
 * one for reading logs. Which is right depends on the server in front of you and on whose output
 * is allowed to leave — a decision per run, so the run is where it is finally made. This page
 * says what may be chosen from, and which is chosen when nobody says.
 */

/** A model being edited, with the key that has not been sent yet. */
type Draft = RemoteModel & { apiKey?: string; clearApiKey?: boolean };

/**
 * The model each well-known service is asked for when nobody says.
 *
 * Only a default — the list of services itself comes from Pi (`listProviders`), because only Pi
 * knows which of them take a plan login and which take a key. Anything not named here simply has
 * no default, and the operator writes the model id.
 */
/**
 * The name the operator knows a service by, where it differs from the one Pi prints.
 *
 * Nobody says「OpenAI Codex」or「Google」— they say ChatGPT and Gemini. Both are shown rather
 * than one substituted for the other, because the provider's own name is what appears in that
 * service's own billing page.
 */
const ALSO_KNOWN_AS: Record<string, string> = {
  "openai-codex": "ChatGPT",
  anthropic: "Claude",
  google: "Gemini",
  xai: "Grok",
  "kimi-coding": "Kimi",
};

/** The ones an operator here is most likely to have, first in the list. The rest stay in order. */
const FAMILIAR = [
  "openai-codex",
  "anthropic",
  "google",
  "openai",
  "xai",
  "github-copilot",
  "openrouter",
  "deepseek",
  "mistral",
  "groq",
];

const serviceName = (provider: { id: string; name: string }) =>
  ALSO_KNOWN_AS[provider.id] ? `${provider.name}（${ALSO_KNOWN_AS[provider.id]}）` : provider.name;

const familiarFirst = <T extends { id: string }>(list: T[]) =>
  [...list].sort((a, b) => {
    const rank = (id: string) => (FAMILIAR.indexOf(id) === -1 ? FAMILIAR.length : FAMILIAR.indexOf(id));
    return rank(a.id) - rank(b.id);
  });

const DEFAULT_MODELS: Record<string, string> = {
  "openai-codex": "gpt-5.5",
  anthropic: "claude-opus-4-8",
  google: "gemini-3.1-pro-preview",
  xai: "grok-4.5",
  openai: "gpt-5.5",
  "github-copilot": "gpt-5.4",
  openrouter: "moonshotai/kimi-k2.6",
  deepseek: "deepseek-v4-pro",
  groq: "openai/gpt-oss-120b",
  mistral: "devstral-medium-latest",
  "amazon-bedrock": "us.anthropic.claude-opus-4-6-v1",
};

const newModel = (): Draft => ({
  id: `model-${Date.now().toString(36)}`,
  name: "",
  provider: "codex",
  baseUrl: "",
  modelId: "",
  supportsImages: true,
  hasApiKey: false,
});


export function AgentSettingsForm({
  onError,
  onSaved,
  registerSave,
  section = "model",
}: {
  onError: (message?: string) => void;
  /** Lends this page's save to the dialog's footer, which is the only one there is. */
  /**
   * Lends this page's save to the dialog's footer, with whether there is anything to save.
   *
   * The footer has one button for whichever page is open; `dirty` is what lets it be a button
   * that means something — enabled when this page has something unsaved, and off when it does
   * not. That, and not a message afterwards, is how a settings dialog says it saved.
   */
  registerSave?: (save: () => Promise<void>, dirty: boolean) => void;
  /** Told after a successful save, so the conversations re-read what is now in force. */
  onSaved: () => void;
  /**
   * Which half to show.
   *
   * Both halves are one saved object, and each instance loads all of it and writes all of it
   * back — so a page showing only the allowlist cannot lose the models behind it.
   */
  section?: "model" | "local";
}) {
  const t = useT();
  const [models, setModels] = useState<Draft[]>([]);
  /** What Pi can reach, read from Pi rather than written down here. See `listProviders`. */
  const [providers, setProviders] = useState<
    Array<{ id: string; name: string; subscription: boolean; apiKey: boolean }>
  >([]);
  const [defaultModelId, setDefaultModelId] = useState<string>();
  /** Which one is open for editing. One at a time: a page of every field is unreadable. */
  /*
   * The model being filled in, as a copy.
   *
   * It used to be the row itself: every keystroke went into the list behind the dialog, so a
   * model nobody had added yet was already listed — "(no name)" growing a letter at a time —
   * and closing the dialog left it there. A dialog is kept or abandoned, and the list is what
   * has been kept.
   */
  const [draft, setDraft] = useState<Draft>();
  const [codex, setCodex] = useState<{ version?: string; signedIn: boolean }>();
  /** Whose Pi login the subscription would use, and whether it is signed in. */
  const [subscription, setSubscription] = useState<{
    signedIn: boolean;
    path: string;
    from: "operator" | "forge";
  }>();
  const [sets, setSets] = useState<RemoteCommandSet[]>([]);
  /** Which isolation local execution runs behind. See the section at the foot of "what it can do". */
  const [sandbox, setSandbox] = useState<"auto" | "seatbelt" | "linux" | "docker">("auto");
  /** Whether every run keeps the whole conversation with the model beside its record. */
  const [tracing, setTracing] = useState(true);
  /** What this machine can actually build, read from the machine rather than assumed from its OS. */
  const [wall, setWall] = useState<RemoteWallState>();
  /*
   * Signing in to a service, here rather than in a terminal.
   *
   * What the provider wants — a browser page, a code, a key — arrives as notes and prompts while
   * the flow runs. The screen used to print `pi login openai-codex` and leave; this application's
   * own plumbing is not an instruction anybody can follow.
   */
  const [loginBusy, setLoginBusy] = useState<string>();
  const [loginNote, setLoginNote] = useState<string>();
  const [loginPrompt, setLoginPrompt] = useState<AuthPromptView>();
  /** The code a service wants typed into its own page, kept apart so it can be read at a glance. */
  const [loginCode, setLoginCode] = useState<string>();
  const [loginAnswer, setLoginAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  /** What was last read or written, to compare against — see `dirty`. */
  const [kept, setKept] = useState<string>();

  const shape = (input: {
    models: RemoteModel[];
    defaultModelId?: string;
    sandbox: string;
    tracing: boolean;
  }) =>
    JSON.stringify({
      models: input.models.map((model) => ({ ...model, apiKey: undefined, clearApiKey: undefined })),
      defaultModelId: input.defaultModelId,
      sandbox: input.sandbox,
      tracing: input.tracing,
    });

  const adopt = (settings: RemoteAgentSettings) => {
    setModels(settings.models);
    setDefaultModelId(settings.defaultModelId);
    setSets(settings.commandSets);
    setSandbox(settings.sandbox);
    setTracing(settings.tracing);
    setKept(shape({ ...settings, tracing: settings.tracing }));
  };

  /*
   * Watch for the credential, rather than waiting for the flow to say it is done.
   *
   * `runtime.login` stores the credential and *then* re-reads every provider's catalogue over the
   * network, and that second part can sit there for a long time — long enough that a login which
   * had already worked looked frozen behind "finishing…". What the operator asked for is
   * done the moment the credential exists, so that is what closes the window.
   */
  useEffect(() => {
    if (!loginBusy) return;
    const provider = loginBusy;
    const timer = setInterval(() => {
      void window.machina.remoteResources
        .subscription(provider)
        .then((status) => {
          if (!status.signedIn) return;
          setSubscription(status);
          setLoginBusy(undefined);
          setLoginPrompt(undefined);
          setLoginNote(undefined);
        })
        .catch(() => undefined);
    }, 1000);
    return () => clearInterval(timer);
  }, [loginBusy]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await window.machina.remoteAgent.settings();
        if (!cancelled) adopt(settings);
      } catch (cause) {
        onError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    void window.machina.remoteResources
      .providers()
      .then((list) => {
        if (!cancelled) setProviders(list);
      })
      .catch(() => undefined);
    void window.machina.remoteResources
      .subscription()
      .then((status) => {
        if (!cancelled) setSubscription(status);
      })
      .catch(() => undefined);
    const offPrompt = window.machina.remoteResources.onLoginPrompt((prompt) => {
      setLoginPrompt(prompt);
      setLoginAnswer("");
    });
    const offNote = window.machina.remoteResources.onLoginNote((note) => {
      setLoginCode(note.type === "device_code" ? note.userCode : undefined);
      setLoginNote(
        note.type === "auth_url"
          ? t("A browser has opened. Give permission there.")
          : note.type === "device_code"
            ? t("A browser has opened. Type this code into it.")
            : (note.message ?? ""),
      );
    });
    void window.machina.remoteAgent
      .codexStatus()
      .then((status) => {
        if (!cancelled) setCodex(status);
      })
      .catch(() => undefined);
    void window.machina.remoteAgent
      .wall()
      .then((state) => {
        if (!cancelled) setWall(state);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      offPrompt();
      offNote();
    };
    // Read once when the page opens. It is the only writer while it is on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty =
    kept !== undefined && kept !== shape({ models, defaultModelId, sandbox, tracing });

  useEffect(() => {
    registerSave?.(() => save(), dirty);
    // The dialog holds one page at a time; whichever is on screen lends its save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const save = (kept?: Draft) =>
    (async () => {
      /* What the list becomes if a dialog is being saved: the copy put back, or added. */
      const list = kept
        ? models.some((model) => model.id === kept.id)
          ? models.map((model) => (model.id === kept.id ? kept : model))
          : [...models, kept]
        : models;
      setBusy(true);
      onError(undefined);
      try {
        adopt(
          await window.machina.remoteAgent.saveSettings({
            models: list.map((model) => ({
              id: model.id,
              // A model nobody named is still a model; call it what it is rather than refuse.
              name: model.name.trim() || (model.provider === "codex" ? "Codex CLI" : t("Model")),
              provider: model.provider,
              piProvider: model.piProvider,
              baseUrl: model.baseUrl.trim(),
              modelId: model.modelId.trim(),
              codexModel: model.codexModel?.trim() || undefined,
              supportsImages: model.supportsImages,
              // Empty means "keep the stored one", as everywhere else a credential is typed here.
              apiKey: model.apiKey || undefined,
              clearApiKey: model.clearApiKey,
            })),
            /* The first model to arrive is the one everything uses until somebody says otherwise. */
            defaultModelId: defaultModelId ?? list[0]?.id,
            /* Sent back as they came: this page no longer edits them, and leaving them out
               would save an empty list over what migration still reads. */
            commandSets: sets,
            sandbox,
            tracing,
          }),
        );
        // The boxes empty on a successful save, so a stored key is never shown as pending text.
        setDraft(undefined);
        onSaved();
      } catch (cause) {
        onError(cause instanceof Error ? cause.message : String(cause));
        /* Rethrown so the footer does not say "Saved" over a failure. */
        throw cause;
      } finally {
        setBusy(false);
      }
    })();

  /*
   * The services with a login of their own, as Pi describes them.
   *
   * Read from Pi rather than listed here: a hand-written list said Gemini was one, and the
   * operator who picked it got a login button for a service that has no login.
   */
  const subscriptionProviders = familiarFirst(providers.filter((provider) => provider.subscription));

  const chosenProvider = draft?.piProvider || subscriptionProviders[0]?.id || "openai-codex";
  const chosenDefaultModel = DEFAULT_MODELS[chosenProvider];

  const editing = draft;

  const editModel = (change: Partial<Draft>) =>
    setDraft((current) => (current ? { ...current, ...change } : current));

  return (
    <div className="settings-body">
      {section === "model" && (
      <section className="settings-section">
        <div className="settings-lede">
          <h2>{t("Model")}</h2>
          <p>
            {t("Who the agent asks. It is the same for every server, and each run can pick one from the conversation's menu. What gets sent is the goal you wrote, the commands the agent ran and what came back. Where a customer's output ends up differs by model, so check before choosing.")}
          </p>
        </div>

        <div className="settings-toolbar">
          <h3>{t("Registered")}</h3>
          <span className="count">{models.length}</span>
          <button
            className="settings-add"
            type="button"
            /* Nothing is added here. The dialog opens on a blank one, and saving adds it. */
            onClick={() => setDraft(newModel())}
          >
            {t("+ Add a model")}
          </button>
        </div>

        <div className="settings-list">
          {models.length === 0 && (
            <p className="settings-empty">
              {t("None yet. Until one is added, the agent cannot run.")}
            </p>
          )}

          {models.map((model) => (
            <div className="settings-row" key={model.id}>
              <div className="settings-row-head">
                {/* The default is a choice among them, so it is a radio in the list rather than
                    a dropdown somewhere else. */}
                <label className="settings-row-mark" title={t("Make it the default")}>
                  <input
                    checked={defaultModelId === model.id}
                    name="default-model"
                    type="radio"
                    onChange={() => setDefaultModelId(model.id)}
                  />
                </label>
                <button
                  className="settings-row-body"
                  type="button"
                  onClick={() => setDraft({ ...model })}
                >
                  <span>{model.name.trim() || t("(no name)")}</span>
                  <small>
                    {describeModel(
                      model,
                      (() => {
                        const provider = providers.find((each) => each.id === model.piProvider);
                        return provider ? serviceName(provider) : undefined;
                      })(),
                    )}
                  </small>
                </button>
                <button
                  className="settings-row-remove"
                  type="button"
                  onClick={() => {
                    setModels((current) => current.filter((each) => each.id !== model.id));
                    if (defaultModelId === model.id) setDefaultModelId(undefined);
                  }}
                >
                  {t("Delete")}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/*
          One model at a time, in a dialog.

          Expanding it inside the row pushed the list around and put a form where a list was;
          adding one did the same before the thing existed. A dialog is what this is: a few
          fields, filled in, kept or abandoned.
        */}
        {editing && (
          <div className="field-dialog-scrim" role="presentation" onClick={() => setDraft(undefined)}>
            <div
              aria-label={t("Model settings")}
              aria-modal
              className="field-dialog"
              role="dialog"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="field-dialog-head">
                <span>{editing.name.trim() || t("New model")}</span>
                <button
                  aria-label={t("Close")}
                  className="field-dialog-close"
                  type="button"
                  onClick={() => setDraft(undefined)}
                >
                  ✕
                </button>
              </header>

              <div className="field-dialog-body">
                <label>
                  {t("What to call it (it appears in the conversation's menu)")}
                  <input
                    autoFocus
                    placeholder={t("Our GPU box / the GPT subscription")}
                    value={editing.name}
                    onChange={(event) => editModel({ name: event.target.value })}
                  />
                </label>

                {/*
                  Two ways, which is how many there are.

                  A third card once stood between these for "a service's API key", picked from
                  Pi's provider list. It was the same act as the right-hand one — type an address
                  and a key — dressed as a different decision, so it split one thing in two and
                  made the operator choose between them.
                */}
                <p className="settings-note">{t("How will you use it?")}</p>
                <div className="auth-choice">
                  <button
                    className={editing.provider === "codex" ? "active" : undefined}
                    type="button"
                    onClick={() =>
                      editModel({ provider: "codex", piProvider: subscriptionProviders[0]?.id })
                    }
                  >
                    {t("Through a subscription")}
                    <small>{t("ChatGPT, Claude and the like, paid monthly. You sign in")}</small>
                  </button>
                  <button
                    className={editing.provider === "endpoint" ? "active" : undefined}
                    type="button"
                    onClick={() => editModel({ provider: "endpoint" })}
                  >
                    {t("With an API key")}
                    <small>{t("Gemini, OpenAI, our own GPU box. You fill in a URL and a key")}</small>
                  </button>
                </div>

                {editing.provider === "codex" ? (
                  <>
                    <label>
                      {t("Service")}
                      <select
                        value={chosenProvider}
                        onChange={(event) => {
                          editModel({ piProvider: event.target.value });
                          /* Each service is signed in to separately; the badge must follow. */
                          void window.machina.remoteResources
                            .subscription(event.target.value)
                            .then(setSubscription)
                            .catch(() => undefined);
                        }}
                      >
                        {subscriptionProviders.map(
                          (provider) => (
                            <option key={provider.id} value={provider.id}>
                              {serviceName(provider)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    {/*
                      Signed in or not, and a button that does it.

                      This used to print `pi login openai-codex` and stop there. Whether the
                      provider wants a browser page or a code, it says so through the flow — the
                      window carries the question, and the credential is stored where Pi keeps
                      it. The path is in the title, for whoever is debugging rather than working.
                    */}
                    {/*
                      One button, which says what pressing it does.

                      It was a badge reading "not signed in" beside a button reading "sign in" —
                      the same fact twice, once as a label and once as an offer. A control that
                      turns into "sign out" has already said it worked.
                    */}
                    <div className="login-state" title={subscription?.path}>
                      {subscription?.signedIn ? (
                        <button
                          className="quiet"
                          type="button"
                          onClick={() =>
                            void window.machina.remoteResources
                              .logout(chosenProvider)
                              .then(() =>
                                window.machina.remoteResources
                                  .subscription(chosenProvider)
                                  .then(setSubscription),
                              )
                              .catch((cause: unknown) =>
                                onError(cause instanceof Error ? cause.message : String(cause)),
                              )
                          }
                        >
                          {t("Sign out")}
                        </button>
                      ) : (
                        <button
                          disabled={Boolean(loginBusy)}
                          type="button"
                          onClick={() => {
                            const providerId = chosenProvider;
                            setLoginBusy(providerId);
                            setLoginNote(t("Starting the sign-in…"));
                            void window.machina.remoteResources
                              .login(providerId)
                              .then(async () => {
                                /*
                                 * Say it worked only if it did. Cancelling ends the flow here
                                 * too, and the button is a fact rather than an intention.
                                 */
                                const status =
                                  await window.machina.remoteResources.subscription(providerId);
                                setSubscription(status);
                                setLoginNote(status.signedIn ? t("Signed in.") : undefined);
                              })
                              .catch((cause: unknown) => {
                                setLoginNote(undefined);
                                /*
                                 * What the provider says when this goes wrong is a sentence out
                                 * of a library — "State mismatch." was the one that arrived — and
                                 * nobody maintaining a server can act on it. The console keeps it
                                 * for whoever is debugging.
                                 */
                                console.error("login", cause);
                                onError(
                                  t("Could not sign in. Try again — if the browser page is still open, close it first."),
                                );
                              })
                              .finally(() => {
                                setLoginBusy(undefined);
                                setLoginPrompt(undefined);
                              });
                          }}
                        >
                          <SwapLabel active={Boolean(loginBusy)} off={t("Sign in")} on={t("Signing in…")} />
                        </button>
                      )}
                    </div>

                    {/*
                      Nothing about the login itself is shown here.

                      The flow's questions used to appear between these fields, so pressing
                      Signing in grew the form and moved everything below it. What a provider
                      wants is its own window, on top of this one — see `<LoginDialog>`.
                    */}
                    <label>
                      {chosenDefaultModel
                        ? t("Model ID (empty means {model})", { model: chosenDefaultModel })
                        : t("Model ID (the name that service calls it)")}
                      <input
                        placeholder={chosenDefaultModel}
                        value={editing.codexModel ?? ""}
                        onChange={(event) =>
                          editModel({ codexModel: event.target.value })
                        }
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      {t("The URL to reach (ending in /v1)")}
                      <input
                        placeholder="http://192.168.10.9:8000/v1"
                        value={editing.baseUrl}
                        onChange={(event) => editModel({ baseUrl: event.target.value })}
                      />
                    </label>
                    <label>
                      {t("Model ID (the name that service calls it)")}
                      <input
                        placeholder="qwen3-coder / gpt-5.6-luna"
                        value={editing.modelId}
                        onChange={(event) => editModel({ modelId: event.target.value })}
                      />
                    </label>
                    <label>
                      {t("API key (encrypted and kept on this machine)")}
                      <input
                        placeholder={editing.hasApiKey ? t("Saved. Type only to change it") : ""}
                        type="password"
                        value={editing.apiKey ?? ""}
                        onChange={(event) =>
                          editModel({ apiKey: event.target.value, clearApiKey: false })
                        }
                      />
                    </label>
                    {editing.hasApiKey && (
                      <label className="inline-check">
                        <input
                          checked={Boolean(editing.clearApiKey)}
                          type="checkbox"
                          onChange={(event) =>
                            editModel({
                              clearApiKey: event.target.checked,
                              apiKey: "",
                            })
                          }
                        />
                        {t("Forget the saved key")}
                      </label>
                    )}
                  </>
                )}

                <label className="inline-check">
                  <input
                    checked={editing.supportsImages}
                    type="checkbox"
                    onChange={(event) =>
                      editModel({ supportsImages: event.target.checked })
                    }
                  />
                  {t("It can read images (an agent that works the screen needs this)")}
                </label>
              </div>

              <footer className="field-dialog-foot">
                <button className="secondary" type="button" onClick={() => setDraft(undefined)}>
                  {t("Cancel")}
                </button>
                <button disabled={busy} type="button" onClick={() => void save(editing).catch(() => undefined)}>
                  {/* "Add" while it is new: the button says what pressing it will do. */}
                  <SwapLabel
                    active={busy}
                    off={models.some((model) => model.id === editing.id) ? t("Save") : t("Add")}
                    on={t("Saving…")}
                  />
                </button>
              </footer>
            </div>
          </div>
        )}

        {loginBusy && (
          <LoginDialog
            answer={loginAnswer}
            code={loginCode}
            note={loginNote}
            prompt={loginPrompt}
            service={(() => {
              const provider = providers.find((each) => each.id === loginBusy);
              return provider ? serviceName(provider) : t("Service");
            })()}
            onAnswer={(value) => void window.machina.remoteResources.answerLogin(value)}
            onCancel={() => {
              void window.machina.remoteResources.cancelLogin();
              setLoginBusy(undefined);
              setLoginPrompt(undefined);
              setLoginNote(undefined);
              setLoginCode(undefined);
            }}
            onType={setLoginAnswer}
          />
        )}

        {/*
          * What is kept of the conversation with the model.
          *
          * Here rather than on a page of its own because it is a fact about the model: the record
          * already keeps every command and its output, and this is the other half — the prompt,
          * the answers, the tool calls. It is on by default, because the first time anybody wants
          * it is after a run went wrong, which is too late to turn it on.
          */}
        <fieldset className="settings-fieldset">
          <legend>{t("What is kept of each run")}</legend>
          <label className="settings-check">
            <input
              checked={tracing}
              type="checkbox"
              onChange={(event) => setTracing(event.target.checked)}
            />
            {t("Keep the whole conversation with the model")}
          </label>
          <p className="settings-note">
            {t("Everything sent to the model and everything it said, run by run, beside the run's record on this machine. Nothing is sent anywhere for it. Open a run under \"Runs\" to write one out. A long run is a few hundred kilobytes; a very long one, a few megabytes.")}
          </p>
        </fieldset>

        {/* `() =>`, not `save`: a click handler is called with the event, and `save` takes a
            model as its first argument — the event went into the list as a model and the save
            died on `name.trim()`. */}
      </section>
      )}


      {/*
        * The wall, in its own section.
        *
        * It used to sit under the allowlist; the allowlist became the catalog and the agents'
        * exceptions, and the wall — which answers "what may run *here*" — kept its own page.
        */}
      {section === "local" && (
      <section className="settings-section">
        <div className="settings-lede">
          <h2>{t("Run here")}</h2>
          <p>
            {t("The agent can do its analysis and write files in an isolated workspace inside this machine. What that workspace allows is chosen here.")}
          </p>
        </div>
        <fieldset className="settings-fieldset">
          <legend>{t("Isolation")}</legend>
          <p className="settings-note">
            {t("The agent can do its analysis and write files in an isolated workspace inside this machine. It has no network there, cannot write outside the workspace, and cannot read your home. What reaches the server is still one allowed command at a time.")}
          </p>
          <label>
            {t("How to isolate")}
            <select
              value={sandbox}
              onChange={(event) =>
                setSandbox(event.target.value as "auto" | "seatbelt" | "linux" | "docker")
              }
            >
              <option value="auto">{t("Match this machine (recommended)")}</option>
              <option value="seatbelt">{t("macOS isolation (sandbox-exec)")}</option>
              <option value="linux">{t("Linux isolation (bubblewrap)")}</option>
              <option value="docker">Docker</option>
            </select>
          </label>
          <p className="settings-note">
            {t("If the isolation you chose cannot be built on this machine, running here is switched off altogether. It is not a limit that a setting can loosen. Choosing Docker requires the image to be here already — nothing is fetched at run time.")}
          </p>
          {wall?.canBuild && (
            <p className="settings-note">{t("Isolation on this machine: {wall}", { wall: wall.wall ?? "" })}</p>
          )}

          {/*
            * The exception, and only where it applies.
            *
            * Not shown on a machine that can build a wall — there is nothing to decide there, and
            * an offer to turn safety off is an invitation to turn safety off. The wording names
            * what is lost rather than asking for agreement in general, and the consent stays on
            * this screen afterwards instead of disappearing once it has been clicked. ADR 0002.
            */}
          {wall && !wall.canBuild && (
            <div className="settings-danger">
              <strong>{t("This machine has no way to isolate.")}</strong>
              <p>
                {t("Turn this on and the commands the agent writes run")}<b>{t("on this machine, with your own privileges")}</b>
                {t(". Your customers' saved credentials and the models' API keys are within reach of those privileges. To get isolation back, install WSL2 or Docker.")}
              </p>
              <p>
                {t("Even switched on, running here still needs")}<b>{t("approval line by line")}</b>
                {t("(the automatic setting does not change this). The record keeps the fact that it ran without isolation.")}
              </p>
              <label className="settings-check">
                <input
                  checked={wall.consent.accepted}
                  type="checkbox"
                  onChange={(event) =>
                    void window.machina.remoteAgent
                      .acceptNoWall(event.target.checked)
                      .then(setWall)
                      .catch((cause: unknown) =>
                        onError(cause instanceof Error ? cause.message : String(cause)),
                      )
                  }
                />
                {t("Take responsibility and allow running without isolation")}
              </label>
              {wall.consent.accepted && wall.consent.at && (
                <p className="settings-note">
                  {formatDateTime(wall.consent.at)}
                  {t(" on this machine (")}
                  {wall.consent.machine}
                  {t(").")}
                </p>
              )}
            </div>
          )}
        </fieldset>
      </section>
      )}
    </div>
  );
}

/** What a row is, in the one line the list has room for. */
function describeModel(model: RemoteModel, name?: string) {
  if (model.provider === "codex") {
    /* `||`, not `??`: an empty string is what a select gives back when its value is not one of
       its options, and falling through to it names no service at all. */
    const id = model.piProvider || "openai-codex";
    return `${name ?? id}・${model.codexModel?.trim() || DEFAULT_MODELS[id] || t("default")}`;
  }
  const where = model.baseUrl.trim() || t("Nowhere to connect");
  const which = model.modelId.trim() || t("No model named");
  return `${which}・${where}${model.hasApiKey ? "" : t(" · no key set")}`;
}

/** The same two buttons under whichever half is on screen. */
/*
 * What a provider asks for while signing in, asked in its own window.
 *
 * Two rules meet here. The questions do not go into the model's form — a dialog that grows while
 * somebody is reading it moves every control below the new part. And the provider's own words are
 * not shown: they arrive in English out of a library ("paste the authorization code / redirect URL
 * here"), which is not a sentence to put in front of the person maintaining a customer's server.
 * The type of question is enough to say it in Japanese; the original is on the box for whoever is
 * debugging rather than working.
 */
function LoginDialog({
  answer,
  code,
  note,
  prompt,
  service,
  onAnswer,
  onCancel,
  onType,
}: {
  answer: string;
  code?: string;
  note?: string;
  prompt?: AuthPromptView;
  service: string;
  onAnswer: (value: string) => void;
  onCancel: () => void;
  onType: (value: string) => void;
}) {
  const t = useT();
  /*
   * The paste box, out of the way until it is wanted.
   *
   * The browser flow finishes by itself: the page redirects, the callback lands, and this window
   * closes. Its manual fallback — "or paste the authorization code here" — is a second, stranger
   * way to do the same thing, and standing open under the sentence it contradicts, it read as a
   * form somebody had to fill in. It is behind a line now, for the flow that goes wrong.
   */
  const [showManual, setShowManual] = useState(false);
  const manual = prompt !== undefined && prompt.type !== "select";
  const asked =
    prompt === undefined
      ? undefined
      : prompt.type === "secret"
        ? t("Paste the API key.")
        : prompt.type === "select"
          ? t("Which one shall it be?")
          : t("Paste the code the browser shows after you allow it (or the URL it sends you back to).");

  return (
    <div className="field-dialog-scrim" role="presentation">
      <div aria-label={t("Sign in")} aria-modal className="field-dialog login-dialog" role="dialog">
        <header className="field-dialog-head">
          <span>{t("Sign in to {service}", { service })}</span>
          <button
            aria-label={t("Close")}
            className="field-dialog-close"
            type="button"
            onClick={onCancel}
          >
            ✕
          </button>
        </header>

        <div className="field-dialog-body login-body">
          <p className="login-step">{note ?? t("Starting the sign-in…")}</p>
          {code && <p className="login-code">{code}</p>}

          {/* A key is the whole point of the question; a code is a fallback. */}
          {prompt?.type === "secret" && (
            <div className="login-prompt">
              <p>{asked}</p>
              <input
                autoFocus
                placeholder={prompt.placeholder}
                type="password"
                value={answer}
                onChange={(event) => onType(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  onAnswer(answer);
                }}
              />
            </div>
          )}

          {prompt?.type === "select" && (
            <div className="login-prompt">
              <p>{asked}</p>
              <div className="login-options">
                {(prompt.options ?? []).map((option) => (
                  <button key={option.id} type="button" onClick={() => onAnswer(option.id)}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {manual && prompt?.type !== "secret" && !showManual && (
            <button className="quiet login-manual" type="button" onClick={() => setShowManual(true)}>
              {t("If it will not work, paste the code")}
            </button>
          )}

          {manual && prompt?.type !== "secret" && showManual && (
            <div className="login-prompt">
              <p>{asked}</p>
              <input
                autoFocus
                placeholder={prompt?.placeholder}
                type="text"
                value={answer}
                onChange={(event) => onType(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  onAnswer(answer);
                }}
              />
            </div>
          )}
        </div>

        <footer className="field-dialog-foot">
          <button className="secondary" type="button" onClick={onCancel}>
            {t("Cancel")}
          </button>
          {/* Always here, so the footer does not change shape when a question arrives. */}
          <button
            disabled={!(prompt?.type === "secret" || (manual && showManual))}
            type="button"
            onClick={() => onAnswer(answer)}
          >
            {t("Send")}
          </button>
        </footer>
      </div>
    </div>
  );
}

