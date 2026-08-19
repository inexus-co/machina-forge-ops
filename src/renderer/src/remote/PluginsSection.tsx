import { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n";
import type { BuiltinPlugin, PluginView } from "../../../shared/remotePlugins";
import { SwapLabel } from "./SwapLabel";

/**
 * The gallery of ready-made plugins.
 *
 * A plugin is knowledge for a shape of server the operator meets again and again — a LAMP box, an
 * Nginx front — with a few first sentences to save writing them. Everything a plugin installs ships
 * with the build, so pressing install writes its skills locally in an instant; there is nothing to
 * download and nothing to configure.
 *
 * What a plugin brings is shown before it is installed, opened in the row: which skills, and which
 * investigations it makes one-click. It carries no permissions and no way of working — those stay
 * the installation's, the same for every server (rule 5: what a decision rests on goes on screen).
 */
export function PluginsSection({
  onChanged,
  onError,
}: {
  /** Told when something was installed or removed, so the rail's count follows. */
  onChanged?: () => void;
  onError: (message?: string) => void;
}) {
  const t = useT();
  const [items, setItems] = useState<PluginView[]>([]);
  const [open, setOpen] = useState<string>();
  const [busy, setBusy] = useState<string>();
  /** A folder being read, and what was found in it — shown before anything is kept. */
  const [reading, setReading] = useState(false);
  const [found, setFound] = useState<BuiltinPlugin>();

  const load = useCallback(() => {
    void window.machina.remotePlugins
      .list()
      .then(setItems)
      .catch((cause) => onError(describe(cause)));
  }, [onError]);

  useEffect(load, [load]);
  /* A plugin installed from the chat's suggestion, while this gallery is open, shows here at once. */
  useEffect(() => window.machina.remotePlugins.onChanged(load), [load]);

  const install = (id: string) => {
    setBusy(id);
    onError(undefined);
    void window.machina.remotePlugins
      .install(id)
      .then((next) => {
        setItems(next);
        onChanged?.();
      })
      .catch((cause) => onError(describe(cause)))
      .finally(() => setBusy(undefined));
  };

  const remove = (id: string) => {
    setBusy(id);
    onError(undefined);
    void window.machina.remotePlugins
      .remove(id)
      .then((next) => {
        setItems(next);
        onChanged?.();
      })
      .catch((cause) => onError(describe(cause)))
      .finally(() => setBusy(undefined));
  };

  /* Chosen from a folder and shown, before anything is written. */
  const choose = () => {
    setReading(true);
    onError(undefined);
    void window.machina.remotePlugins
      .readFolder()
      .then((plugin) => plugin && setFound(plugin))
      .catch((cause) => onError(describe(cause)))
      .finally(() => setReading(false));
  };

  const keep = (plugin: BuiltinPlugin) => {
    setBusy(plugin.id);
    onError(undefined);
    void window.machina.remotePlugins
      .add(plugin)
      .then((next) => {
        setItems(next);
        setFound(undefined);
        setOpen(plugin.id);
        onChanged?.();
      })
      .catch((cause) => onError(describe(cause)))
      .finally(() => setBusy(undefined));
  };

  const forget = (id: string) => {
    setBusy(id);
    onError(undefined);
    void window.machina.remotePlugins
      .forget(id)
      .then((next) => {
        setItems(next);
        onChanged?.();
      })
      .catch((cause) => onError(describe(cause)))
      .finally(() => setBusy(undefined));
  };

  const installed = items.filter((plugin) => plugin.installed).length;

  return (
    <div className="settings-body">
      <div className="settings-lede">
        <h2>{t("Plugins")}</h2>
        <p>
          {t("How to look into the usual set-ups, installed in one go. Once in, the knowledge reaches the agent and the standard investigations are ready in the chat's + menu. Nothing to configure. Permissions and behaviour do not change — what may be run is still the setting for the whole installation.")}
        </p>
      </div>

      <div className="settings-toolbar">
        <h3>{t("Plugins available")}</h3>
        <span className="count">{`${installed} / ${items.length}`}</span>
        {/*
          One from a folder on this machine.

          Nothing is fetched: the operator points at a folder, what is in it is shown, and it is
          written down only when they press add. That is the whole of "somebody else's plugin"
          here, and the reason there is no address bar for it.
        */}
        <div className="settings-toolbar-actions">
          <button className="settings-add" disabled={reading} type="button" onClick={choose}>
            {t("+ From a folder")}
          </button>
        </div>
      </div>

      {/*
        What was found, before anything is kept.

        A dialog because it asks a question (画面のルール1), and because what it shows is the
        material for that question: which skills, which of them are commands, and what each says
        it is for.
      */}
      {found && (
        <div className="field-dialog-scrim" role="presentation" onClick={() => setFound(undefined)}>
          <div
            aria-label={t("Add a plugin")}
            aria-modal="true"
            className="field-dialog"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="field-dialog-head">
              <span>{found.name}</span>
            </header>
            <div className="field-dialog-body">
              {found.summary && <p className="settings-note">{found.summary}</p>}
              <div className="plugin-brings">
                <strong>{t("The skills it installs")}</strong>
                {found.skills.map((skill) => (
                  <p className="plugin-line" key={skill.name}>
                    <code>{skill.name}</code>
                    <span>{skill.description}</span>
                    {skill.goal && <span className="plugin-command">{t("in the ＋ menu")}</span>}
                  </p>
                ))}
              </div>
              <p className="settings-note">
                {t("Nothing is installed by adding it: the skills are written when you press Install. Read them first — a skill is text the agent will act on.")}
              </p>
            </div>
            <footer className="field-dialog-foot">
              <button className="secondary" type="button" onClick={() => setFound(undefined)}>
                {t("Cancel")}
              </button>
              <button disabled={busy === found.id} type="button" onClick={() => keep(found)}>
                {t("Add")}
              </button>
            </footer>
          </div>
        </div>
      )}

      <div className="settings-list">
        {items.length === 0 && <p className="settings-empty">{t("No plugins.")}</p>}

        {items.map((plugin) => (
          <div className={open === plugin.id ? "settings-row open" : "settings-row"} key={plugin.id}>
            <div className="settings-row-head">
              <button
                className="settings-row-body"
                type="button"
                onClick={() => setOpen(open === plugin.id ? undefined : plugin.id)}
              >
                <span>
                  {t(plugin.name)}
                  {plugin.installed && <span className="plugin-badge">{t("installed")}</span>}
                </span>
                <small>{t(plugin.summary)}</small>
              </button>
              {plugin.installed ? (
                <button
                  className="settings-row-remove"
                  disabled={busy === plugin.id}
                  type="button"
                  onClick={() => remove(plugin.id)}
                >
                  <SwapLabel active={busy === plugin.id} off={t("Remove")} on={t("Removing…")} />
                </button>
              ) : (
                <button disabled={busy === plugin.id} type="button" onClick={() => install(plugin.id)}>
                  <SwapLabel active={busy === plugin.id} off={t("Install")} on={t("Installing…")} />
                </button>
              )}
              {/* Only what was added from a folder can be forgotten; the shipped ones stay. */}
              {plugin.added && (
                <button
                  className="settings-row-remove"
                  disabled={busy === plugin.id}
                  type="button"
                  onClick={() => forget(plugin.id)}
                >
                  {t("Forget")}
                </button>
              )}
            </div>

            {open === plugin.id && (
              <div className="settings-row-form plugin-detail">
                <div className="plugin-brings">
                  <strong>{t("The skills it installs")}</strong>
                  {plugin.skills.map((skill) => (
                    <p className="plugin-line" key={skill.name}>
                      <code>{skill.name}</code>
                      <span>{t(skill.description)}</span>
                      {/* A skill with a goal is a command: it appears in the chat's ＋ menu. */}
                      {skill.goal && <span className="plugin-command">{t("in the ＋ menu")}</span>}
                    </p>
                  ))}
                </div>
                <p className="settings-note">
                  {t("Installed, the knowledge above is always in the agent's view — the bodies are read only when needed. Removed, only what this plugin installed is deleted; anything you wrote yourself stays.")}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="settings-foot-note">
        {t("Plugins ship inside this application. Installing or removing one sends nothing over the network. What a plugin installed can also be seen under Skills.")}
      </p>
    </div>
  );
}

/**
 * The main process's sentence, without Electron's wrapper.
 *
 * The same unwrapping the other settings sections do — "Error invoking remote method 'x'" is not
 * for the operator.
 */
function describe(cause: unknown) {
  const raw = cause instanceof Error ? cause.message : String(cause);
  return raw
    .replace(/^Error invoking remote method '[^']*':\s*/, "")
    .replace(/^(Error|Zod\w*Error):\s*/, "")
    .trim();
}
