import { useEffect, useState } from "react";
import { t, type Translate } from "../../../shared/i18n";
import { useT } from "../i18n";
import type {
  RemoteAgentProfile,
  RemoteAgentSettings,
  RemoteApprovalMode,
} from "../../../shared/remoteAgent";
import { SwapLabel } from "./SwapLabel";

/**
 * Named ways of working.
 *
 * Four choices are made before every run — which model, what it may run, how far it may go
 * alone, what it should keep in mind — and they are wrong in combination rather than one at a
 * time. "Read the logs" is the cheap model, reads only and no approvals to give; "Fix production"
 * is the careful model, the granted writes, and a person on every step. Naming the combination
 * is what makes it possible to pick the right one in a hurry.
 *
 * The dialog edits a copy (screen rule 1): typing here must not change the list behind it, and
 * closing without saving leaves nothing. What a sub-agent may run is not decided here at all:
 * permissions belong to the installation (the command-knowledge screen) and every sub-agent
 * inherits them — a named agent is a way of working, not a power.
 */

/*
 * A function, not a constant: words read at import time would be the language the window opened
 * in, and would keep saying it after the operator switched.
 */
const modes = (t: Translate): Array<{ value: RemoteApprovalMode; label: string }> => [
  { value: "step", label: t("Step by step") },
  { value: "auto", label: t("Automatic (destructive and sudo still asked)") },
  { value: "plan", label: t("Plan only (runs nothing)") },
];

export function ProfilesSection({
  onChanged,
  onError,
  registerSave,
}: {
  onChanged?: () => void;
  /** Lends this page's save to the dialog's footer, which is the only one there is. */
  registerSave?: (save: () => Promise<void>, dirty: boolean) => void;
  onError: (message?: string) => void;
}) {
  const t = useT();
  const [settings, setSettings] = useState<RemoteAgentSettings>();
  const [profiles, setProfiles] = useState<RemoteAgentProfile[]>([]);
  const [defaultId, setDefaultId] = useState<string>();
  /** The copy being edited. The list behind the dialog changes only on save. */
  const [draft, setDraft] = useState<RemoteAgentProfile>();
  const [busy, setBusy] = useState(false);

  /** What was last read or written, to compare against — the footer's Save reads this. */
  const [kept, setKept] = useState<string>();
  const shape = (list: RemoteAgentProfile[], id?: string) => JSON.stringify({ list, id });

  const adopt = (next: RemoteAgentSettings) => {
    setSettings(next);
    setProfiles(next.profiles);
    setDefaultId(next.defaultProfileId);
    setKept(shape(next.profiles, next.defaultProfileId));
  };

  useEffect(() => {
    void window.machina.remoteAgent
      .settings()
      .then(adopt)
      .catch((cause) => onError(describe(cause)));
  }, [onError]);

  const edit = (change: Partial<RemoteAgentProfile>) =>
    setDraft((current) => (current ? { ...current, ...change } : current));

  useEffect(() => {
    registerSave?.(() => save(), kept !== undefined && kept !== shape(profiles, defaultId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const save = async (list: RemoteAgentProfile[] = profiles) => {
    if (!settings) return;
    setBusy(true);
    onError(undefined);
    await window.machina.remoteAgent
      .saveSettings({
        profiles: list.map((profile) => ({
          ...profile,
          name: profile.name.trim() || t("Unnamed agent"),
        })),
        defaultProfileId: defaultId ?? list[0]?.id,
        /* The models are sent back as they came: this page does not show them, and leaving them
           out would be saving an empty list over the operator's. */
        models: (settings.models ?? []).map((model) => ({
          id: model.id,
          name: model.name,
          provider: model.provider,
          baseUrl: model.baseUrl,
          modelId: model.modelId,
          codexModel: model.codexModel,
          supportsImages: model.supportsImages,
        })),
        defaultModelId: settings.defaultModelId,
        commandSets: settings.commandSets,
      })
      .then((next) => {
        adopt(next);
        onChanged?.();
      })
      .catch((cause) => {
        onError(describe(cause));
        /* Rethrown so the footer does not say "Saved" over a failure. */
        throw cause;
      })
      .finally(() => setBusy(false));
  };

  /** Put the copy back into the list — replacing its original, or joining as a new row. */
  const commit = () => {
    if (!draft) return;
    const exists = profiles.some((each) => each.id === draft.id);
    const list = exists
      ? profiles.map((each) => (each.id === draft.id ? draft : each))
      : [...profiles, draft];
    setProfiles(list);
    setDefaultId((current) => current ?? draft.id);
    void save(list).catch(() => undefined);
    setDraft(undefined);
  };

  return (
    <div className="settings-body">
      <div className="settings-lede">
        <h2>{t("Sub-agents")}</h2>
        <p>
          {t("A model, an instruction and a way of approving, kept together under a name. You can pick one in a conversation, or hand work to it from another sub-agent. What it may run is not decided here — every one of them follows the rules under Command knowledge.")}
        </p>
      </div>

      <div className="settings-toolbar">
        <h3>{t("Registered")}</h3>
        <span className="count">{profiles.length}</span>
        <button
          className="settings-add"
          type="button"
          onClick={() =>
            setDraft({
              id: `agent-${Date.now().toString(36)}`,
              name: "",
              control: "shell",
              approvalMode: "step",
            })
          }
        >
          {t("+ Add an agent")}
        </button>
      </div>

      <div className="settings-list">
        {profiles.length === 0 && (
          <p className="settings-empty">
            {t("None yet. If there is work you do often, you can name the combination and keep it here.")}
          </p>
        )}

        {profiles.map((profile) => (
          <div className="settings-row" key={profile.id}>
            <div className="settings-row-head">
              <label className="settings-row-mark" title={t("Make it the default")}>
                <input
                  checked={defaultId === profile.id}
                  name="default-profile"
                  type="radio"
                  onChange={() => setDefaultId(profile.id)}
                />
              </label>
              <button
                className="settings-row-body"
                type="button"
                onClick={() => setDraft(structuredClone(profile))}
              >
                <span>{profile.name.trim() || t("(no name)")}</span>
                <small>{summarise(profile, settings)}</small>
              </button>
              <button
                className="settings-row-remove"
                type="button"
                onClick={() => {
                  setProfiles((current) => current.filter((each) => each.id !== profile.id));
                  if (defaultId === profile.id) setDefaultId(undefined);
                }}
              >
                {t("Delete")}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* The choices, in a dialog, on a copy: a row is not a form, and typing is not saving. */}
      {draft && (
        <div className="field-dialog-scrim" role="presentation" onClick={() => setDraft(undefined)}>
          <div
            aria-label={t("Sub-agent settings")}
            aria-modal
            className="field-dialog"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="field-dialog-head">
              <span>{draft.name.trim() || t("New agent")}</span>
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
                {t("Name")}
                <input
                  autoFocus
                  placeholder={t("Read the logs only / fix production")}
                  value={draft.name}
                  onChange={(event) => edit({ name: event.target.value })}
                />
              </label>

              {/*
                What this agent works with. The rest of the dialog changes with it, because a
                screen agent has no commands to configure — there is no way to read "click here"
                and know what it does.
              */}
              <div className="auth-choice">
                <button
                  className={(draft.control ?? "shell") === "shell" ? "active" : undefined}
                  type="button"
                  onClick={() => edit({ control: "shell" })}
                >
                  {t("Run commands (SSH)")}
                </button>
                <button
                  className={draft.control === "screen" ? "active" : undefined}
                  type="button"
                  onClick={() => edit({ control: "screen" })}
                >
                  {t("Work the screen (RDP)")}
                </button>
              </div>
              {draft.control === "screen" && (
                <p className="form-hint">
                  {t("It works the screen with a mouse and a keyboard. This agent")}
                  <strong>{t("cannot run any command at all")}</strong>
                  {t("— if it could open a shell on the screen and type, the rules about commands would mean nothing. Servers without SSH are looked after this way. For anything that stops a service, use Approve each one and watch it action by action.")}
                </p>
              )}

              <div className="profile-grid">
                <label>
                  {t("Model")}
                  <select
                    value={draft.modelId ?? ""}
                    onChange={(event) => edit({ modelId: event.target.value || undefined })}
                  >
                    <option value="">{t("The default model")}</option>
                    {(settings?.models ?? []).map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  {t("How to approve")}
                  <select
                    value={draft.approvalMode}
                    onChange={(event) =>
                      edit({ approvalMode: event.target.value as RemoteApprovalMode })
                    }
                  >
                    {modes(t).map((mode) => (
                      <option key={mode.value} value={mode.value}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/*
                * Who this agent may hand work to.
                *
                * Off unless named, and it cannot name itself. A child runs with its own model
                * and its own rules, and its commands land in this conversation's record — so
                * this is a decision about power, made here rather than inferred from a prompt.
                */}
              {profiles.length > 1 && (
                <fieldset className="settings-fieldset">
                  <legend>{t("Who it may hand work to (optional)")}</legend>
                  <div className="settings-checks">
                    {profiles
                      .filter((each) => each.id !== draft.id && each.name.trim())
                      .map((each) => (
                        <label className="settings-check" key={each.id}>
                          <input
                            checked={(draft.delegates ?? []).includes(each.id)}
                            type="checkbox"
                            onChange={(event) => {
                              const chosen = new Set(draft.delegates ?? []);
                              if (event.target.checked) chosen.add(each.id);
                              else chosen.delete(each.id);
                              edit({ delegates: [...chosen] });
                            }}
                          />
                          <span>{each.name}</span>
                        </label>
                      ))}
                  </div>
                  <p className="settings-note">
                    {t("Whoever is handed the work uses its own model and its own command rules. It cannot hand the work on again.")}
                  </p>
                </fieldset>
              )}

              <label>
                {t("Instructions for this agent (optional)")}
                <textarea
                  className="settings-code"
                  placeholder={t("e.g. On production, always say why before stopping anything")}
                  rows={5}
                  value={draft.instructions ?? ""}
                  onChange={(event) => edit({ instructions: event.target.value || undefined })}
                />
              </label>
            </div>

            <footer className="field-dialog-foot">
              <button className="secondary" type="button" onClick={() => setDraft(undefined)}>
                {t("Cancel")}
              </button>
              <button disabled={busy} type="button" onClick={commit}>
                <SwapLabel active={busy} off={t("Save")} on={t("Saving…")} />
              </button>
            </footer>
          </div>
        </div>
      )}

    </div>
  );
}

/** The row's second line: the choices, in the order they are made. */
function summarise(profile: RemoteAgentProfile, settings?: RemoteAgentSettings) {
  const model = settings?.models.find((each) => each.id === profile.modelId);
  const mode = modes(t).find((each) => each.value === profile.approvalMode)?.label ?? "";
  return [
    profile.control === "screen" ? t("Works the screen") : t("Runs commands"),
    model?.name ?? t("The default model"),
    mode,
  ]
    .filter(Boolean)
    .join("・");
}

function describe(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
