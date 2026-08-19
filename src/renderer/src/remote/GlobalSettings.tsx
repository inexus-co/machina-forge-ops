import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { AgentSettingsForm } from "./AgentSettingsForm";
import { CatalogSection } from "./CatalogSection";
import { KnownHostsSection } from "./KnownHostsSection";
import { PluginsSection } from "./PluginsSection";
import { LanguageSection } from "./LanguageSection";
import { ProfilesSection } from "./ProfilesSection";
import { InstructionsSection, ResourceSection } from "./ResourceSection";

/**
 * The settings that belong to the application rather than to a server.
 *
 * The model, what an agent may run, and which servers have been vouched for are one decision each
 * and they apply to every customer at once — reaching them through one particular server's
 * connection form said the opposite, and somebody editing them while looking at one machine could
 * reasonably think they had changed that machine.
 *
 * Built as a settings window in the shape editors use for this: a rail of categories on the left
 * with how many things are in each, and one card on the right holding a heading, what the
 * category is for, the action that adds to it, and the list itself. The first attempt was the
 * full-window screen shrunk into a window — a 260px rail holding three words and a footnote with
 * nowhere to sit — which is what "a screen" looks like when it is put somewhere it does not fit.
 */

const SECTIONS = [
  "profiles",
  "model",
  "catalog",
  "local",
  "plugins",
  "skill",
  "instructions",
  "extension",
  "hosts",
  "language",
] as const;

type Section = (typeof SECTIONS)[number];

/** Whether what arrived from outside names a page here. Anything else opens on the first one. */
function isSection(value: string | undefined): value is Section {
  return SECTIONS.includes(value as Section);
}

export function GlobalSettings({
  focus,
  onClose,
  onError,
  onSaved,
}: {
  /** Which page to open on, when something sent the operator here for a reason. */
  focus?: string;
  onClose: () => void;
  onError: (message?: string) => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [section, setSection] = useState<Section>(isSection(focus) ? focus : "model");
  /*
   * The page's own save, lent to the footer.
   *
   * Only three pages have anything to save — the rest write as they go (a skill is a file, a key
   * is forgotten the moment it is removed). So the footer always has close in the same place,
   * and save appears beside it when the page has something to keep.
   */
  const saving = useRef<(() => Promise<void>) | undefined>(undefined);
  /**
   * Whether the page on screen has anything unsaved.
   *
   * The button is the answer: it lights up when there is something to save and goes back to grey
   * when there is not. Nothing else — writing a settings file takes no time worth reporting, and
   * a button that narrates itself is a button in the way.
   */
  const [dirty, setDirty] = useState(false);
  /*
   * Called by whichever page is on screen, on every render of it.
   *
   * `dirty` goes through state because the footer draws from it; the function itself does not,
   * because storing a function in state would call it.
   */
  const registerSave = useCallback((save: () => Promise<void>, isDirty: boolean) => {
    saving.current = save;
    setDirty(isDirty);
  }, []);

  const savable =
    section === "model" ||
    section === "local" ||
    section === "catalog" ||
    section === "profiles" ||
    section === "instructions";
  /** How many things are in each category, for the rail. */
  const [counts, setCounts] = useState<Record<Section, number>>({
    profiles: 0,
    model: 0,
    catalog: 0,
    local: 0,
    plugins: 0,
    skill: 0,
    instructions: 0,
    extension: 0,
    hosts: 0,
    language: 0,
  });

  const count = useCallback(() => {
    void (async () => {
      try {
        const [settings, hosts, skills, extensions, instructions, catalog, plugins] =
          await Promise.all([
          window.machina.remoteAgent.settings(),
          window.machina.remote.listKnownHosts(),
          window.machina.remoteResources.list("skill"),
          window.machina.remoteResources.list("extension"),
            window.machina.remoteResources.readInstructions(),
            window.machina.remoteAgent.catalogCounts(),
            window.machina.remotePlugins.list(),
          ]);
        setCounts({
          profiles: settings.profiles.length,
          model: settings.models.length,
          catalog: catalog.total,
          local: 0,
          /* How many plugins are in, not how many exist: the rail says what is active. */
          plugins: plugins.filter((plugin) => plugin.installed).length,
          skill: skills.length,
          /* Not a count: it is one file, and what matters is whether it says anything. */
          instructions: instructions.trim() ? 1 : 0,
          extension: extensions.length,
          hosts: hosts.length,
          language: 0,
        });
      } catch {
        // A number beside a category is not worth an error message.
      }
    })();
  }, []);

  useEffect(count, [count]);
  // Whoever saved it — this window or another — the numbers follow.
  useEffect(() => window.machina.remoteAgent.onSettingsSaved(count), [count]);
  // A plugin installed or removed anywhere moves the plugin count too.
  useEffect(() => window.machina.remotePlugins.onChanged(count), [count]);

  /*
   * The order is the order somebody sets an agent up in: what it asks, what it may run, what it
   * knows how to do, what it always keeps in mind, and then the two that are rarely touched.
   */
  const sections: Array<{ id: Section; label: string; icon: ReactElement }> = [
    { id: "catalog", label: t("Command knowledge"), icon: <RulesIcon /> },
    { id: "model", label: t("Model"), icon: <ModelIcon /> },
    { id: "profiles", label: t("Sub-agents"), icon: <AgentIcon /> },
    { id: "local", label: t("Run here"), icon: <WallIcon /> },
    { id: "plugins", label: t("Plugins"), icon: <PluginIcon /> },
    { id: "skill", label: t("Skills"), icon: <SkillIcon /> },
    { id: "instructions", label: t("Instructions"), icon: <InstructionsIcon /> },
    { id: "extension", label: t("Extensions"), icon: <ExtensionIcon /> },
    { id: "hosts", label: t("Server keys"), icon: <KeyIcon /> },
    /* Named in two scripts on purpose: on a first launch everything here is Japanese, and this is
       the one row somebody who cannot read it has to be able to find. */
    { id: "language", label: t("Language"), icon: <LanguageIcon /> },
  ];

  return (
    <div className="settings-modal">
      {/*
        The dialog's own bar.
        
        The window has no frame of its own, so this is it: what the dialog is on the left, the
        way out on the right — which is where a dialog's close button belongs, and is not where
        macOS would have put it. The empty part of the row moves the window.
      */}
      <header className="settings-bar">
        <span className="settings-bar-title">{t("Settings")}</span>
        <button
          aria-label={t("Close")}
          className="settings-bar-close"
          title={t("Close")}
          type="button"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>

      <nav aria-label={t("Settings")} className="settings-rail">
        {sections.map((item) => (
          <button
            aria-current={section === item.id}
            className={section === item.id ? "active" : undefined}
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
            {/* The count is the useful part: it says whether a category has anything in it
                before you go and look. */}
            <small>{counts[item.id] || ""}</small>
          </button>
        ))}
      </nav>

      {/*
        One frame for every page.
        
        Each section used to draw its own bottom row — one had save alone, another had it
        beside close in the other order, and each sat at a different height because it scrolled
        with the content. The card owns the frame now: the page scrolls inside it and the row is
        the floor, in the same place on every tab.
      */}
      <main className="settings-card">
        <div className="settings-scroll">
        {section === "hosts" && <KnownHostsSection onChanged={count} onError={onError} />}
        {section === "language" && <LanguageSection onError={onError} />}
        {section === "instructions" && (
          <InstructionsSection onError={onError} registerSave={registerSave} />
        )}
        {section === "plugins" && <PluginsSection onChanged={count} onError={onError} />}
        {section === "profiles" && (
          <ProfilesSection
            onChanged={() => {
              count();
              onSaved();
            }}
            onError={onError}
            registerSave={registerSave}
          />
        )}
        {(section === "skill" || section === "extension") && (
          <ResourceSection key={section} kind={section} onChanged={count} onError={onError} />
        )}
        {section === "catalog" && (
          <CatalogSection
            onError={onError}
            onSaved={() => {
              count();
              onSaved();
            }}
            registerSave={registerSave}
          />
        )}
        {(section === "model" || section === "local") && (
          <AgentSettingsForm
            key={section}
            onError={onError}
            onSaved={() => {
              count();
              onSaved();
            }}
            registerSave={registerSave}
            section={section}
          />
        )}
        </div>

        <footer className="settings-foot">
          <button className="secondary" type="button" onClick={onClose}>
            {t("Close")}
          </button>
          {savable && (
            <button
              disabled={!dirty}
              type="button"
              onClick={() => void saving.current?.().catch(() => undefined)}
            >
              {t("Save")}
            </button>
          )}
        </footer>
      </main>
    </div>
  );
}

/** A lightbulb: something the agent knows how to do. */
function SkillIcon() {
  return (
    <svg
      aria-hidden
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      width="16"
    >
      <path d="M9 18h6M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2z" />
    </svg>
  );
}

/** A bookmark: a phrase kept to hand. */
/** An open book: what is always in front of it. */
function InstructionsIcon() {
  return (
    <svg
      aria-hidden
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      width="16"
    >
      <path d="M2 4.5h7a3 3 0 0 1 3 3V21a2.5 2.5 0 0 0-2.5-2.5H2z" />
      <path d="M22 4.5h-7a3 3 0 0 0-3 3V21a2.5 2.5 0 0 1 2.5-2.5H22z" />
    </svg>
  );
}

/** A plug: code that joins in at the seams. */
function ExtensionIcon() {
  return (
    <svg
      aria-hidden
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      width="16"
    >
      <path d="M9 2v6M15 2v6" />
      <path d="M6 8h12v4a6 6 0 0 1-6 6 6 6 0 0 1-6-6z" />
      <path d="M12 18v4" />
    </svg>
  );
}

/** A toolbox: a ready-made set of skills for a shape of server. */
function PluginIcon() {
  return (
    <svg
      aria-hidden
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      width="16"
    >
      <rect height="12" rx="2" width="18" x="3" y="8" />
      <path d="M3 13h18" />
      <path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M10 13v2M14 13v2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden
      fill="none"
      height="15"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.9"
      viewBox="0 0 24 24"
      width="15"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/*
 * The rail's marks, on the same 24-unit grid as everything else that is drawn here.
 */

/** Two brackets around a slash: a named way of working, as editors mark an agent. */
function AgentIcon() {
  return (
    <svg
      aria-hidden
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      width="16"
    >
      <path d="M7 4a4 4 0 0 0-4 4v8a4 4 0 0 0 4 4M17 4a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4M14 7l-4 10" />
    </svg>
  );
}

/** A chip: the thing being asked. */
function ModelIcon() {
  return (
    <svg
      aria-hidden
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      width="16"
    >
      <rect height="12" rx="2" width="12" x="6" y="6" />
      <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
    </svg>
  );
}

/** A checked list: what it may run. */
function RulesIcon() {
  return (
    <svg
      aria-hidden
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      width="16"
    >
      <path d="m3 7 2 2 4-4M3 17l2 2 4-4M13 6h8M13 12h8M13 18h8" />
    </svg>
  );
}

/** A wall with a door: what runs on this side, and the one way through. */
function WallIcon() {
  return (
    <svg
      aria-hidden
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      width="16"
    >
      <rect height="16" rx="2" width="18" x="3" y="4" />
      <path d="M3 9h18M3 14h18M9 4v5M15 9v5M9 14v6" />
    </svg>
  );
}

/** A globe: the one symbol for this that needs no words, which is the point of the row. */
function LanguageIcon() {
  return (
    <svg
      aria-hidden
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      width="16"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg
      aria-hidden
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      width="16"
    >
      <path d="M2.6 17.4A2 2 0 0 0 2 18.8V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.2a2 2 0 0 0 1.4-.6l.8-.8a6.5 6.5 0 1 0-4-4z" />
      <circle cx="16.5" cy="7.5" r="0.6" />
    </svg>
  );
}
