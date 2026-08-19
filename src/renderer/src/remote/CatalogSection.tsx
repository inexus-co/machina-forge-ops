import { useEffect, useRef, useState } from "react";
import { catalogText, formatNumber, type Translate } from "../../../shared/i18n";
import { useT } from "../i18n";
import type { CatalogEntry } from "../../../shared/catalog";
import type {
  RemoteAgentSettings,
  RemoteCommandRule,
  RemoteRuleSet,
} from "../../../shared/remoteAgent";

/**
 * Every command the application knows, and the operator's own word on each — one screen.
 *
 * There is no separate editor and no separate vocabulary: the list shows how each command is
 * treated, and pressing a different treatment on its row *is* the setting. Pressing the one the
 * catalog already says removes the operator's word again. Everything decided here belongs to the
 * installation — every conversation and every sub-agent obeys the same list. What stops on an
 * approval card mid-run is remembered per server, shown further down, and cleared per server.
 */

/** How a command may be treated. `partial` is the catalog's own "reads only" judgement. */
/*
 * A function, not a constant.
 *
 * Words read at import time would be the language the application started in, and would go on
 * saying it after the operator switched. Everything in this file that holds a sentence is built
 * where it is drawn, for that reason alone.
 */
const states = (t: Translate) =>
  [
    { value: "auto", label: t("Automatic"), note: t("Runs without asking (destructive ones and sudo are always asked)") },
    {
      value: "partial",
      label: t("Partly automatic"),
      note: t("Runs without asking only in the forms that read"),
    },
    { value: "ask", label: t("Ask"), note: t("Asks a person before every run") },
    { value: "deny", label: t("Refused"), note: t("Refused without asking, and the reason goes back into the conversation") },
  ] as const;

type State = ReturnType<typeof states>[number]["value"];

/** What the catalog itself says about an entry, in the same words the buttons use. */
function catalogState(entry: CatalogEntry): State {
  if (entry.tier !== 1) return "ask";
  if (entry.class === "read") return "auto";
  // Shells and script-takers are refused on the target by default.
  if (entry.class === "shell" || entry.class === "code") return "deny";
  if (entry.class === "verbs") return "partial";
  return "ask";
}

const SHOWN = 60;

export function CatalogSection({
  onError,
  onSaved,
  registerSave,
}: {
  onError: (message?: string) => void;
  /** Told after a successful save, so the conversations re-read what is now in force. */
  onSaved?: () => void;
  /** Lends this page's save to the dialog's footer, which is the only one there is. */
  registerSave?: (save: () => Promise<void>, dirty: boolean) => void;
}) {
  const t = useT();
  const [counts, setCounts] = useState<{ linux: number; windows: number; total: number }>();
  const [query, setQuery] = useState("");
  const [os, setOs] = useState<"linux" | "windows" | undefined>(undefined);
  const [mineOnly, setMineOnly] = useState(false);
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [hosts, setHosts] = useState<Array<{ id: string; name: string }>>([]);

  /* The installation's word: the two dials and the per-command decisions, saved as one thing. */
  const [settings, setSettings] = useState<RemoteAgentSettings>();
  const [autoReads, setAutoReads] = useState(true);
  const [allowSudo, setAllowSudo] = useState(false);
  const [rules, setRules] = useState<RemoteRuleSet>({});
  const latest = useRef({ autoReads, allowSudo, rules });
  latest.current = { autoReads, allowSudo, rules };

  /** What was last read or written, to compare against — the footer's Save reads this. */
  const [kept, setKept] = useState<string>();
  const shape = (reads: boolean, sudo: boolean, decided: RemoteRuleSet) =>
    JSON.stringify({ reads, sudo, decided });

  const adopt = (next: RemoteAgentSettings) => {
    setSettings(next);
    setAutoReads(next.autoReads);
    setAllowSudo(next.allowSudo);
    setRules(next.rules);
    setKept(shape(next.autoReads, next.allowSudo, next.rules));
  };

  useEffect(() => {
    void window.machina.remoteAgent
      .catalogCounts()
      .then(setCounts)
      .catch(() => undefined);
    void window.machina.remoteAgent
      .settings()
      .then(adopt)
      .catch((cause) => onError(describe(cause)));
    void window.machina.remote
      .list()
      .then((list) => setHosts(list.map((host) => ({ id: host.id, name: host.name }))))
      .catch(() => undefined);
    // Read once when the page opens. It is the only writer while it is on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    void window.machina.remoteAgent
      .catalogSearch(query, os)
      .then((found) => alive && setEntries(found))
      .catch((cause) => onError(describe(cause)));
    return () => {
      alive = false;
    };
  }, [query, os, onError]);

  const save = async () => {
    if (!settings) return;
    onError(undefined);
    const { autoReads: reads, allowSudo: sudo, rules: decided } = latest.current;
    await window.machina.remoteAgent
      .saveSettings({
        /* The rest is sent back as it came — this page shows none of it, and leaving it out
           would save an empty list over the operator's. */
        models: (settings.models ?? []).map((model) => ({
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
        rules: decided,
        autoReads: reads,
        allowSudo: sudo,
      })
      .then((next) => {
        adopt(next);
        onSaved?.();
      })
      .catch((cause) => {
        onError(describe(cause));
        /* Rethrown so the footer does not say "Saved" over a failure. */
        throw cause;
      });
  };

  useEffect(() => {
    registerSave?.(() => save(), kept !== undefined && kept !== shape(autoReads, allowSudo, rules));
    // The dialog holds one page at a time; whichever is on screen lends its save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  /** Case-insensitive, the same way the gate reads the rules. */
  const ruleFor = (name: string): [string, RemoteCommandRule] | undefined => {
    const direct = rules[name];
    if (direct) return [name, direct];
    const lower = name.toLowerCase();
    for (const [key, rule] of Object.entries(rules)) {
      if (key.toLowerCase() === lower) return [key, rule];
    }
    return undefined;
  };

  /** Press a treatment. Pressing the catalog's own removes the operator's word again. */
  const decide = (entry: CatalogEntry, state: State) => {
    const found = ruleFor(entry.name);
    setRules((current) => {
      const next = { ...current };
      if (found) delete next[found[0]];
      if (state !== catalogState(entry)) {
        next[entry.name] = {
          action: state === "partial" ? "ask" : state,
          origin: { by: "hand", at: new Date().toISOString() },
        };
      }
      return next;
    });
  };


  /*
   * The "decided here" view shows every decision, whatever the search box holds — filtering the
   * current page of results would hide a decision that happens to sort past it.
   */
  const [decided, setDecided] = useState<CatalogEntry[]>([]);
  useEffect(() => {
    if (!mineOnly) return;
    let alive = true;
    void (async () => {
      const rows: CatalogEntry[] = [];
      for (const name of Object.keys(latest.current.rules).sort()) {
        const hits = await window.machina.remoteAgent.catalogSearch(name);
        const hit = hits.find((each) => each.name.toLowerCase() === name.toLowerCase());
        rows.push(
          hit ?? { name, os: "linux", summary: t("A command the catalogue does not have"), class: "write", tier: 2 },
        );
      }
      if (alive) setDecided(rows);
    })();
    return () => {
      alive = false;
    };
  }, [mineOnly, rules]);

  const decidedCount = Object.keys(rules).length;
  const shown = mineOnly ? decided : entries;
  const memories = (settings?.hostRules ?? []).filter(
    (each) => Object.keys(each.rules).length > 0,
  );

  return (
    <div className="settings-body catalog-body">
      <div className="settings-lede">
        <h2>{t("Command knowledge")}</h2>
        <p>
          {counts
            ? t(
                "This application knows {linux} commands on Linux and {windows} on Windows. The ones that read run on their own, the ones that change a server are asked about, and the ones that destroy always go to a person. To treat a command differently, press its button in the list.",
                { linux: formatNumber(counts.linux), windows: formatNumber(counts.windows) },
              )
            : t("Loading…")}
        </p>
      </div>

      <fieldset className="settings-fieldset">
        <legend>{t("Rules for everything")}</legend>
        <label className="settings-check">
          <input
            checked={autoReads}
            type="checkbox"
            onChange={(event) => setAutoReads(event.target.checked)}
          />
          {t("Run commands that only read without asking")}
        </label>
        <label className="settings-check">
          <input
            checked={allowSudo}
            type="checkbox"
            onChange={(event) => setAllowSudo(event.target.checked)}
          />
          {t("Allow sudo (approved each time it is used)")}
        </label>
      </fieldset>

      <div className="settings-toolbar">
        <h3>{t("List")}</h3>
        <span className="count">{counts?.total ?? ""}</span>
      </div>

      <div className="catalog-controls">
        <input
          placeholder={t("Search the name or the description (e.g. systemctl, log)")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="catalog-os">
          {(
            [
              { value: undefined, label: t("All") },
              { value: "linux" as const, label: "Linux" },
              { value: "windows" as const, label: "Windows" },
            ] as const
          ).map((choice) => (
            <button
              className={os === choice.value ? "tag on" : "tag"}
              key={choice.label}
              type="button"
              onClick={() => setOs(choice.value)}
            >
              {choice.label}
            </button>
          ))}
          <button
            className={mineOnly ? "tag on" : "tag"}
            title={t("Show only what you treat differently from the catalogue")}
            type="button"
            onClick={() => setMineOnly((current) => !current)}
          >
            {t("Decided by you {count}", { count: decidedCount })}
          </button>
        </div>
      </div>

      <div className="settings-list">
        {shown.slice(0, SHOWN).map((entry) => {
          const found = ruleFor(entry.name);
          const base = catalogState(entry);
          const state: State = found
            ? found[1].action === "ask" && found[1].autoVerbs?.length
              ? "partial"
              : (found[1].action as State)
            : base;
          return (
            <div className="catalog-row" key={`${entry.name}-${entry.os}`}>
              <code className="allow-name" title={entry.original ?? catalogText(entry.summary)}>
                {entry.name}
              </code>
              <div className="catalog-states">
                {states(t).map((choice) => (
                  <button
                    className={state === choice.value ? "tag on" : "tag"}
                    /* "partly automatic" is the catalog's own judgement for two-sided commands; it cannot
                       be granted to anything else, so elsewhere the button only sits disabled —
                       present, so every row has the same shape. */
                    disabled={choice.value === "partial" && base !== "partial"}
                    key={choice.value}
                    title={
                      choice.value === "partial" && base === "partial"
                        ? t("{note} (automatic: {verbs})", {
                            note: choice.note,
                            verbs: readVerbs(entry).join(" "),
                          })
                        : choice.note
                    }
                    type="button"
                    onClick={() => decide(entry, choice.value)}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
              <span className="catalog-summary" title={entry.original ?? catalogText(entry.summary)}>
                {catalogText(entry.summary)}
              </span>
              <small className="rules-origin">
                {found ? (state === base ? "" : t("Decided by you")) : ""}
              </small>
            </div>
          );
        })}
        {!mineOnly && shown.length > SHOWN && (
          <p className="settings-note">
            {t("{count} more. Narrow the search.", { count: shown.length - SHOWN })}
          </p>
        )}
        {shown.length === 0 && (
          <p className="settings-empty">
            {mineOnly
              ? t("You have not overridden anything. The catalogue's judgement stands.")
              : t("Nothing found. A command nobody knows can still be run — it stops first and you decide.")}
          </p>
        )}
      </div>


      {memories.length > 0 && (
        <fieldset className="settings-fieldset">
          <legend>{t("What is remembered per server")}</legend>
          {memories.map((slice) => (
            <div className="catalog-pack" key={slice.hostId}>
              <div>
                <span>{hosts.find((host) => host.id === slice.hostId)?.name ?? slice.hostId}</span>
                <small>
                  {Object.entries(slice.rules)
                    .map(
                      ([name, rule]) =>
                        `${name}：${rule.action === "deny" ? t("Refused") : t("Automatic")}`,
                    )
                    .join("　")}
                </small>
              </div>
              <button
                className="danger quiet"
                type="button"
                onClick={() => {
                  void window.machina.remoteAgent
                    .forgetHostRules(slice.hostId)
                    .then(() => window.machina.remoteAgent.settings())
                    .then(adopt)
                    .catch((cause) => onError(describe(cause)));
                }}
              >
                {t("Clear")}
              </button>
            </div>
          ))}
          <p className="settings-note">
            {t("What you chose under \"from now on\" on an approval card during a run. It applies to that server only. Entries cannot be edited one by one — clear them and decide again on the next run.")}
          </p>
        </fieldset>
      )}
    </div>
  );
}

function readVerbs(entry: CatalogEntry) {
  return Object.entries(entry.verbs ?? {})
    .filter(([, kind]) => kind === "read")
    .map(([name]) => name);
}

function describe(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
