import { useCallback, useEffect, useState } from "react";
import { formatDateTime, t, type Translate } from "../../../shared/i18n";
import { useT } from "../i18n";
import type {
  AgentResource,
  ResourceInspection,
  ResourceReview,
  ResourceKind,
} from "../../../shared/remoteResources";
import { SwapLabel } from "./SwapLabel";

/**
 * One category of the agent's own files: skills, prompts, or extensions.
 *
 * The three are the same screen because they are the same thing — a named file the agent reads —
 * and only the words and the template differ. Each row opens into the file itself: what is on
 * screen is what is on disk, because Pi reads the file and not this form. For the editing a text
 * box in a dialog is bad at, every row can be opened in the operator's own editor.
 */

/*
 * A function, not a constant: words read at import time would be the language the window opened
 * in, and would keep saying it after the operator switched.
 */
const wordsFor = (
  t: Translate,
): Record<
  ResourceKind,
  { title: string; lede: string; group: string; add: string; empty: string; hint: string }
> => ({
  skill: {
    title: t("Skills"),
    lede: t("A written procedure for one kind of work. Only the name and the description are always in view; the agent reads the body only when the work is related. It exists so that something like \"how to look at a 502 on this server\" need not be written out every time."),
    group: t("Skills"),
    add: t("+ Write a new one"),
    empty: t("None yet. If there is a procedure you want the agent to know, write it here."),
    hint: t("`skills/<name>/SKILL.md`. The description in the frontmatter is the sentence the agent reads when choosing; add a `goal:` and the skill also appears in a conversation's ＋ menu, putting that line in the box."),
  },
  prompt: {
    title: t("Prompts"),
    lede: t("An instruction you use often, under a name. Pick it from the + menu in a conversation and the text lands in the box."),
    group: t("Prompts"),
    add: t("+ Add a prompt"),
    empty: t("None yet. If you type the same instruction every time, you can name it and keep it here."),
    hint: t("`prompts/<name>.md`. Picked from the + menu, the body lands in the box — you can edit it before sending."),
  },
  extension: {
    title: t("Extensions"),
    lede: t("Code that steps in at the turning points of a run. It can hook just before a command runs, at the start of a session, and so on. It can also give the agent new tools."),
    group: t("Extensions"),
    add: t("+ Add an extension"),
    empty: t("None yet. Recording a run, stopping on a condition — that sort of thing is written here."),
    hint: t("`extensions/<name>.ts`. The events you can hook are listed in Pi's docs/extensions.md."),
  },
});

export function ResourceSection({
  kind,
  onChanged,
  onError,
}: {
  kind: ResourceKind;
  /** Told when the list changes, so the count beside the category follows. */
  onChanged?: () => void;
  onError: (message?: string) => void;
}) {
  const t = useT();
  const words = wordsFor(t)[kind];
  const [items, setItems] = useState<AgentResource[]>([]);
  const [open, setOpen] = useState<string>();
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState<string>();
  const [busy, setBusy] = useState(false);
  /** A file or folder being read in. Skills only — see the button. */
  const [importing, setImporting] = useState(false);
  /** The card for the open item: what it would bring. Read when it is opened. */
  const [card, setCard] = useState<ResourceInspection>();
  const [directory, setDirectory] = useState("");
  /** Which extension-registered tools the agent is allowed to call. */
  const [allowed, setAllowed] = useState<string[]>([]);

  const load = useCallback(() => {
    void window.machina.remoteResources
      .list(kind)
      .then(setItems)
      .catch((cause) => onError(describe(cause)));
    void window.machina.remoteResources.directory().then(setDirectory).catch(() => undefined);
    if (kind === "extension") {
      void window.machina.remoteAgent
        .settings()
        .then((settings) => setAllowed(settings.extensionTools))
        .catch(() => undefined);
    }
  }, [kind, onError]);

  useEffect(load, [load]);

  const bringIn = () => {
    setImporting(true);
    onError(undefined);
    void window.machina.remoteResources
      .importSkill()
      .then((name) => {
        if (!name) return;
        load();
        onChanged?.();
        /* Opened straight away: what came in is exactly what somebody wants to read first. */
        setOpen(name);
      })
      .catch((cause) => onError(describe(cause)))
      .finally(() => setImporting(false));
  };

  const openOne = (name: string) => {
    if (open === name) {
      setOpen(undefined);
      setCard(undefined);
      return;
    }
    void window.machina.remoteResources
      .read(kind, name)
      .then((text) => {
        setDraft(text);
        setOpen(name);
      })
      .catch((cause) => onError(describe(cause)));
    /* Read alongside, not before: a card that delays the text would be in the way. */
    setCard(undefined);
    void window.machina.remoteResources
      .inspect(kind, name)
      .then(setCard)
      .catch(() => undefined);
  };

  const save = (name: string) => {
    setBusy(true);
    onError(undefined);
    void window.machina.remoteResources
      .write(kind, name, draft)
      .then(async (next) => {
        setItems(next);
        setAdding(undefined);
        setOpen(name);
        onChanged?.();
        /* Read back what was written: a new one was filled in from the template by the main
           process, and the box would otherwise sit empty over a file that is not. */
        setDraft(await window.machina.remoteResources.read(kind, name));
      })
      .catch((cause) => onError(describe(cause)))
      .finally(() => setBusy(false));
  };

  /**
   * Allowing an extension's tools, one extension at a time.
   *
   * Saved immediately rather than with a button: it is a switch, and a switch that needs saving
   * is a switch nobody trusts. What is written is the list of tool names, which is what the run
   * reads — the extension itself is loaded either way.
   */
  const allow = (tools: string[], on: boolean) => {
    const next = on
      ? [...new Set([...allowed, ...tools])]
      : allowed.filter((each) => !tools.includes(each));
    setAllowed(next);
    void window.machina.remoteAgent
      .settings()
      .then((settings) =>
        window.machina.remoteAgent.saveSettings({
          extensionTools: next,
          profiles: settings.profiles,
          defaultProfileId: settings.defaultProfileId,
          models: settings.models.map((model) => ({
            id: model.id,
            name: model.name,
            provider: model.provider,
            piProvider: model.piProvider,
            baseUrl: model.baseUrl,
            modelId: model.modelId,
            codexModel: model.codexModel,
            supportsImages: model.supportsImages,
          })),
          defaultModelId: settings.defaultModelId,
          commandSets: settings.commandSets,
        }),
      )
      .then(() => onChanged?.())
      .catch((cause) => onError(describe(cause)));
  };

  const remove = (name: string) => {
    setBusy(true);
    void window.machina.remoteResources
      .remove(kind, name)
      .then((next) => {
        setItems(next);
        if (open === name) setOpen(undefined);
        onChanged?.();
      })
      .catch((cause) => onError(describe(cause)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="settings-body">
      <div className="settings-lede">
        <h2>{words.title}</h2>
        <p>{words.lede}</p>
      </div>

      <div className="settings-toolbar">
        <h3>{words.group}</h3>
        <span className="count">{items.length}</span>
        <div className="settings-toolbar-actions">
        {/*
          A skill that exists already, from a file or a folder on this machine.

          Writing one in this window is fine for a short one; anything written elsewhere — by an
          outside AI tool, by a colleague, by the author of a plugin — arrived with no way in at
          all. Skills only: an extension is code, and code arrives by being written here.
        */}
        {kind === "skill" && (
          <button className="settings-add" disabled={importing} type="button" onClick={bringIn}>
            {t("+ From a file")}
          </button>
        )}
        <button
          className="settings-add"
          disabled={adding !== undefined}
          type="button"
          onClick={() => {
            setAdding("");
            setDraft("");
            setOpen(undefined);
          }}
        >
          {words.add}
        </button>
        </div>
      </div>

      <div className="settings-list">
        {/*
          Naming a new one happens in a dialog, as everything else in this window does.

          It used to grow a row in the list for a thing that did not exist yet, above the things
          that do. A name is a small question; a dialog is what asking one looks like.
        */}
        {adding !== undefined && (
          <div className="field-dialog-scrim" role="presentation" onClick={() => setAdding(undefined)}>
            <div
              aria-label={words.add}
              aria-modal
              className="field-dialog"
              role="dialog"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="field-dialog-head">
                <span>{words.add.replace("＋ ", "")}</span>
                <button
                  aria-label={t("Close")}
                  className="field-dialog-close"
                  type="button"
                  onClick={() => setAdding(undefined)}
                >
                  ✕
                </button>
              </header>
              <div className="field-dialog-body">
                <label>
                  {t("Name (letters, digits and - _ .)")}
                  <input
                    autoFocus
                    placeholder={kind === "prompt" ? "review" : "disk-full"}
                    value={adding}
                    onChange={(event) => setAdding(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && adding.trim()) save(adding.trim());
                    }}
                  />
                </label>
                <p className="form-hint">{words.hint}</p>
              </div>
              <footer className="field-dialog-foot">
                <button className="secondary" type="button" onClick={() => setAdding(undefined)}>
                  {t("Cancel")}
                </button>
                <button
                  disabled={busy || adding.trim().length === 0}
                  type="button"
                  onClick={() => save(adding.trim())}
                >
                  <SwapLabel active={busy} off={t("Create")} on={t("Creating…")} />
                </button>
              </footer>
            </div>
          </div>
        )}

        {items.length === 0 && adding === undefined && (
          <p className="settings-empty">{words.empty}</p>
        )}

        {items.map((item) => (
          <div className={open === item.name ? "settings-row open" : "settings-row"} key={item.name}>
            <div className="settings-row-head">
              <button className="settings-row-body" type="button" onClick={() => openOne(item.name)}>
                <span>{item.name}</span>
                <small>{item.description || t("(no description)")}</small>
              </button>
              {kind === "extension" && (item.tools?.length ?? 0) > 0 && (
                <label
                  className="settings-row-switch"
                  title={t("Let the agent call: {tools}", { tools: item.tools?.join(" ") ?? "" })}
                >
                  <input
                    checked={(item.tools ?? []).every((tool) => allowed.includes(tool))}
                    type="checkbox"
                    onChange={(event) => allow(item.tools ?? [], event.target.checked)}
                  />
                  <span>{t("Allow its tools ({tools})", { tools: item.tools?.join(" ") ?? "" })}</span>
                </label>
              )}
              <button
                className="quiet settings-row-open"
                title={item.path}
                type="button"
                onClick={() => void window.machina.remoteResources.reveal(kind, item.name)}
              >
                {t("Open its folder")}
              </button>
              <button
                className="settings-row-remove"
                disabled={busy}
                type="button"
                onClick={() => remove(item.name)}
              >
                {t("Delete")}
              </button>
            </div>

            {open === item.name && (
              <div className="settings-row-form">
                {card && <InspectionCard card={card} kind={kind} name={open} />}
                <label>
                  {t("Contents")}
                  <textarea
                    className="settings-code"
                    rows={18}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                </label>
                <div className="settings-row-foot">
                  <button disabled={busy} type="button" onClick={() => save(item.name)}>
                    <SwapLabel active={busy} off={t("Save")} on={t("Saving…")} />
                  </button>
                  <span className="settings-row-note">
                    {formatDateTime(item.updatedAt)}・{formatSize(item.size)}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Where the files are, said plainly: this is a folder, and it can be worked on as one. */}
      <p className="settings-foot-note">
        {words.hint}
        {directory && <code>{directory}</code>}
      </p>
    </div>
  );
}

/**
 * The always-on instruction.
 *
 * One file rather than a list, because that is what it is: everything the agent should keep in
 * mind on every server, every run.
 */
/**
 * What this text would bring, in front of the operator.
 *
 * Says what was found, not what was concluded — and says plainly that it is not a wall. The
 * walls are the allowlist, the approval and the record, and they hold whether or not anybody
 * read this. See ADR 0002.
 */
function InspectionCard({
  card,
  kind,
  name,
}: {
  card: ResourceInspection;
  kind: ResourceKind;
  /** Which file to hand the model, if the operator asks for that reading too. */
  name: string;
}) {
  const t = useT();
  const notable = card.findings.filter((each) => each.kind !== "command");
  /*
   * The model's reading, and its state.
   *
   * Kept beside the machine's rather than mixed into it: one of them found names in the file and
   * the other formed an opinion, and a card that blends the two invites the opinion to be read
   * as a finding. ADR 0002.
   */
  const [review, setReview] = useState<ResourceReview>();
  const [reading, setReading] = useState(false);
  const [failed, setFailed] = useState<string>();

  /* A different file, or the same one edited: last time's reading is not about this text. */
  useEffect(() => {
    setReview(undefined);
    setFailed(undefined);
  }, [kind, name]);

  const read = () => {
    setReading(true);
    setFailed(undefined);
    void window.machina.remoteResources
      .review(kind, name)
      .then(setReview)
      .catch((cause: unknown) => setFailed(describe(cause)))
      .finally(() => setReading(false));
  };

  if (card.commands.length === 0 && notable.length === 0 && !review && !reading && !failed) {
    return null;
  }

  return (
    <div className="inspect-card">
      <strong>{t("Before you install it")}</strong>
      {card.commands.length > 0 && (
        <p>
          {t("Commands it uses:")}
          {card.commands.map((each) => (
            <code className={card.unlisted.includes(each) ? "unlisted" : undefined} key={each}>
              {each}
            </code>
          ))}
        </p>
      )}
      {card.unlisted.length > 0 && (
        <p className="inspect-warn">
          {t(
            "{names} are commands this application does not know, or of a kind it will not run. At run time they go to you, or are refused.",
            { names: card.unlisted.join("、") },
          )}
        </p>
      )}
      {notable.map((each, index) => (
        <p className="inspect-line" key={`${each.what}-${index}`}>
          {each.line ? <span className="inspect-at">{t("line {line}", { line: each.line })}</span> : null}
          <code>{each.what}</code>
          {each.note ? <span>{t(each.note)}</span> : null}
        </p>
      ))}
      <p className="settings-note">
        {t("This is the result of reading the contents, not something that stops anything running.")}
        {kind === "extension" ? t("An extension is") : t("A skill is")}
        {t("something its author can also hide things in. What protects you is the allowlist at run time, the approvals and the record.")}
      </p>

      {/*
        * The model's reading, asked for rather than assumed.
        *
        * The button says where the text goes, because pressing it sends this file to whichever
        * model is configured — and a skill is written in the customer's own vocabulary.
        */}
      <div className="inspect-model">
        {!review && (
          <button className="chip" disabled={reading} type="button" onClick={read}>
            {reading ? t("The model is reading it…") : t("Have the model read it too")}
          </button>
        )}
        {!review && !reading && (
          <span className="settings-note">
            {t("Press this and the body of the file is sent to the model you configured.")}
          </span>
        )}
        {failed && <p className="inspect-warn">{failed}</p>}
        {review && (
          <div className="inspect-review">
            {/* Named, so nobody has to work out which of the two readings they are looking at. */}
            <strong>{t("What the model made of it")}</strong>
            <p className="inspect-summary">{review.summary}</p>
            {review.concerns.length > 0 ? (
              review.concerns.map((each, index) => (
                <p className="inspect-line" key={`${each.what}-${index}`}>
                  <code>{each.what}</code>
                  <span>{each.why}</span>
                </p>
              ))
            ) : (
              <p className="inspect-line">
                <span>{t("The model says there is nothing worth flagging.")}</span>
              </p>
            )}
            <p className="settings-note">
              {t("This is what {by} made of it. It can be wrong.", { by: review.by })}
              {t("Anything the author hid does not show up here either.")}
              <button className="chip" disabled={reading} type="button" onClick={read}>
                {t("Read again")}
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function InstructionsSection({
  onError,
  registerSave,
}: {
  onError: (message?: string) => void;
  /** Lends this page's save to the dialog's footer, which is the only one there is. */
  registerSave?: (save: () => Promise<void>, dirty: boolean) => void;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    void window.machina.remoteResources
      .readInstructions()
      .then(setText)
      .catch((cause) => onError(describe(cause)));
  }, [onError]);

  const save = async () => {
    setBusy(true);
    onError(undefined);
    try {
      await window.machina.remoteResources.writeInstructions(text);
      setSaved(true);
    } catch (cause) {
      onError(describe(cause));
      /* Rethrown so the footer does not say "Saved" over a failure. */
      throw cause;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    registerSave?.(save, !saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  return (
    <div className="settings-body">
      <div className="settings-lede">
        <h2>{t("Instructions")}</h2>
        <p>
          {t("What you want kept to on every server and every run. Whatever is written here sits in front of the agent at all times. Keep it short, and only write what can be kept.")}
        </p>
      </div>

      <div className="settings-toolbar">
        <h3>{t("Instructions that always apply")}</h3>
        <span className="count">{text.trim() ? t("yes") : t("none")}</span>
      </div>

      <div className="settings-list">
        <div className="settings-row open">
          <div className="settings-row-form">
            <textarea
              className="settings-code"
              placeholder={t("e.g.\n- Answer in English\n- Before changing anything, say in one line what will change\n- If a service has to be stopped, say why first")}
              rows={16}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setSaved(false);
              }}
            />
            {/* The save is the dialog's, at the foot of the window; this only says where it stands. */}
            <div className="settings-row-foot">
              <span className="settings-row-note">
                {busy ? t("Saving…") : saved ? t("Saved") : t("There are unsaved changes")}
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="settings-foot-note">
        {t("Saved as `AGENTS.md`. Empty it and there are no instructions again.")}
      </p>
    </div>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The sentence the main process wrote, without the wrappers.
 *
 * Electron puts "Error invoking remote method 'x'" in front of everything that crosses the
 * boundary. What the operator needs is the part somebody wrote for them.
 */
function describe(cause: unknown) {
  const raw = cause instanceof Error ? cause.message : String(cause);
  return raw
    .replace(/^Error invoking remote method '[^']*':\s*/, "")
    .replace(/^(Error|Zod\w*Error):\s*/, "")
    .trim();
}

