import { useEffect, useRef, useState } from "react";
import { formatDateTime, formatTime, t, type Translate } from "../../../shared/i18n";
import { useT } from "../i18n";
import type { RemoteRunDocument, RemoteRunSummary } from "../../../shared/remoteAgent";
import type { TypedCommand } from "../../../shared/remoteHistory";
import type { RecordingSummary } from "../../../shared/remoteRecording";
import { KeptFile } from "./RemoteAgentChat";
import { MenuButton } from "./SelectMenu";
import { SwapLabel } from "./SwapLabel";
import { describeError } from "./Toast";

/**
 * What was run on this server, in its own window.
 *
 * It used to take over the chat column, which is wrong twice: the conversation disappears while
 * you read, and the thing you usually want is to read the record *while* talking about it. It is
 * also not a conversation — it is evidence, and evidence is consulted beside the work rather than
 * instead of it. Same reasoning as the state and inventory panels (`remotePanels.ts`), so it
 * opens the same way.
 *
 * Nothing here can be re-run. A saved command list is a script, and a script that was right last
 * month is the thing that breaks a server this month.
 */

/*
 * A function, not a constant: words read at import time would be the language the window opened
 * in, and would keep saying it after the operator switched.
 */
const finishLabels = (t: Translate): Record<string, string> => ({
  done: t("Done"),
  stopped: t("Stopped"),
  limit: t("Stopped: too many"),
  timeout: t("Out of time"),
  error: t("Error"),
  question: t("Still asking"),
});

/** "3 minutes ago" / "yesterday" — the age is what somebody scans a list of runs by. */
/** A byte count somebody can weigh: a trace is offered with its size, not as a surprise. */
function size(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

function runAge(at: string) {
  const minutes = Math.round((Date.now() - new Date(at).getTime()) / 60000);
  if (minutes < 1) return t("just now");
  if (minutes < 60) return t("{minutes} min ago", { minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("{hours} h ago", { hours });
  const days = Math.round(hours / 24);
  return days === 1 ? t("yesterday") : t("{days} days ago", { days });
}

/**
 * Everything that has been run on this server, in one window.
 *
 * Two ways of reading the same fact. The command history is the flat list — what was run, when, and
 * by whom: the agent's commands and the ones typed into a session, together, because that is
 * what somebody means when they ask what has been run here. The runs view is one conversation at
 * a time, with its output and what was refused.
 *
 * The typed half used to live under the inventory, beside ports and cron — which is what the
 * *server* is,
 * not what was done to it.
 */
export function RunsPane({
  focus,
  hostId,
  onError,
  onType,
}: {
  focus?: string;
  hostId: string;
  onError: (message?: string) => void;
  /** Put a past command back on the session's line. The Enter is still a person's. */
  onType?: (command: string) => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<"history" | "runs" | "screen">("history");
  const [reportOpen, setReportOpen] = useState(false);
  const [runs, setRuns] = useState<RemoteRunSummary[]>([]);
  const [chosen, setChosen] = useState<string | undefined>(focus);
  const [document, setDocument] = useState<RemoteRunDocument>();
  /** How many bytes this run's trace holds. Undefined means it kept none. */
  const [trace, setTrace] = useState<number>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await window.machina.remoteAgent.listRuns(hostId);
        if (cancelled) return;
        setRuns(list);
        /* Opened with nothing named: the newest is what somebody just finished doing. */
        setChosen((current) => current ?? list[0]?.id);
      } catch (cause) {
        onError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    /* Pressed again while this window was already open, naming a different run. */
    const off = window.machina.remotePanels.onFocus((next) => setChosen(next));
    return () => {
      cancelled = true;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId]);

  /* How big this run's trace is, or nothing when it kept none. Read beside the record itself. */
  useEffect(() => {
    if (!chosen) {
      setTrace(undefined);
      return;
    }
    let cancelled = false;
    setTrace(undefined);
    void window.machina.remoteAgent
      .traceSize(hostId, chosen)
      .then((bytes) => !cancelled && setTrace(bytes))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hostId, chosen]);

  useEffect(() => {
    if (!chosen) return;
    let cancelled = false;
    setDocument(undefined);
    void (async () => {
      try {
        const next = await window.machina.remoteAgent.loadRun(hostId, chosen);
        if (!cancelled) setDocument(next);
      } catch (cause) {
        onError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId, chosen]);

  return (
    <div className="runs-window">
      {/* The same segmented control as screen / session / both: one way to switch between views. */}
      <div className="runs-tabs pane-segments" role="tablist">
        <button
          aria-selected={tab === "history"}
          className={tab === "history" ? "active" : undefined}
          role="tab"
          type="button"
          onClick={() => setTab("history")}
        >
          {t("Command history")}
        </button>
        <button
          aria-selected={tab === "runs"}
          className={tab === "runs" ? "active" : undefined}
          role="tab"
          type="button"
          onClick={() => setTab("runs")}
        >
          {t("Runs")}
        </button>
        <button
          aria-selected={tab === "screen"}
          className={tab === "screen" ? "active" : undefined}
          role="tab"
          type="button"
          onClick={() => setTab("screen")}
        >
          {t("Screen recordings")}
        </button>
        <button className="secondary runs-report-open" type="button" onClick={() => setReportOpen(true)}>
          {t("Write a report")}
        </button>
      </div>

      {reportOpen && (
        <ReportDialog hostId={hostId} onClose={() => setReportOpen(false)} onError={onError} />
      )}

      {tab === "screen" && <Recordings hostId={hostId} onError={onError} />}

      {tab === "history" && (
        <CommandHistory
          hostId={hostId}
          onError={onError}
          onOpenRun={(runId) => {
            setChosen(runId);
            setTab("runs");
          }}
          onType={onType}
        />
      )}

      {tab === "runs" && (
    <div className="runs-pane">
      <div className="runs-list">
        {runs.length === 0 && <p className="chat-history-empty">{t("No runs recorded yet.")}</p>}
        {runs.map((item) => (
          <button
            className={item.id === chosen ? "active" : undefined}
            key={item.id}
            title={item.goal}
            type="button"
            onClick={() => setChosen(item.id)}
          >
            <span className="chat-history-goal">{item.goal ?? t("(no goal)")}</span>
            <small>{runAge(item.startedAt)}</small>
          </button>
        ))}
      </div>

      <div className="runs-detail">
        {!chosen && runs.length > 0 && <p className="chat-empty">{t("Choose one on the left.")}</p>}
        {chosen && !document && <p className="chat-empty">{t("Loading…")}</p>}
        {document && (
          <>
            <div className="runs-detail-head">
              <span>{formatDateTime(document.startedAt)}</span>
              {document.finish && (
                <span>{finishLabels(t)[document.finish] ?? document.finish}</span>
              )}
              <span>
                {document.commandSet ?? t("Category unknown")}・
                {document.approvalMode === "auto"
                  ? t("Auto")
                  : document.approvalMode === "plan"
                    ? t("Plan only")
                    : t("Step by step")}
              </span>
              {/* Only where one was kept: an older run, or one made with tracing off, has none. */}
              {trace !== undefined && chosen && (
                <MenuButton
                  align="right"
                  label={t("What the model saw")}
                  title={t("Everything sent to the model and everything it said, this run")}
                >
                  {(close) => (
                    <>
                      <p className="menu-heading">{t("Write it out ({size})", { size: size(trace) })}</p>
                      {(
                        [
                          { id: "markdown", label: "Markdown", note: t("The prompt and every turn, to read") },
                          { id: "jsonl", label: "JSON Lines", note: t("Every event as it arrived") },
                        ] as const
                      ).map((each) => (
                        <button
                          key={each.id}
                          type="button"
                          onClick={() => {
                            close();
                            void window.machina.remoteAgent
                              .saveTrace(hostId, chosen, each.id)
                              .catch((cause: unknown) => onError(describeError(cause)));
                          }}
                        >
                          <span className="menu-check" />
                          {each.label}
                          <span className="menu-note">{each.note}</span>
                        </button>
                      ))}
                    </>
                  )}
                </MenuButton>
              )}
            </div>

            {document.goal && <p className="runs-goal">{document.goal}</p>}

            {document.steps.map((step, index) => (
              <div
                className={`chat-step ${step.refused || step.error ? "failed" : ""}`}
                key={`${step.at}-${index}`}
              >
                <div className="chat-step-head">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <code className="remote-command">{step.command ?? "—"}</code>
                  <small>
                    {step.refused
                      ? t("Not run")
                      : step.error
                        ? t("Failed")
                        : step.timedOut
                          ? t("Out of time")
                          : t("exit {code}", { code: step.code ?? "" })}
                  </small>
                  <time>{formatTime(step.at)}</time>
                </div>
                {(step.refused || step.error) && (
                  <p className="chat-step-reason">{step.refused ?? step.error}</p>
                )}
                {step.output && <pre className="remote-output">{step.output}</pre>}
                {/* Kept beside the record it belongs to, so it is still openable months later. */}
                {step.file && <KeptFile file={step.file} hostId={hostId} runId={chosen} />}
                {step.usedSecret && (
                  <p className="chat-step-reason">{t("A setting was passed in, so the output was not kept.")}</p>
                )}
              </div>
            ))}

            {document.steps.length === 0 && (
              <p className="chat-empty">{t("Not one command was run.")}</p>
            )}

            <p className="chat-line done">
              {(document as { summary?: string }).summary ??
                finishLabels(t)[document.finish ?? ""] ??
                t("The record ends here.")}
            </p>
          </>
        )}
      </div>
    </div>
      )}
    </div>
  );
}

/**
 * A customer-facing report over a period, previewed then saved.
 *
 * A dialog because it asks for input (the dates) — screen rule 1. The preview scrolls inside its
 * own box so the dialog holds still; saving writes a Markdown file the operator chooses.
 */
function ReportDialog({
  hostId,
  onClose,
  onError,
}: {
  hostId: string;
  onClose: () => void;
  onError: (message?: string) => void;
}) {
  const t = useT();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [markdown, setMarkdown] = useState<string>();
  const [busy, setBusy] = useState(false);

  const preview = () => {
    setBusy(true);
    onError(undefined);
    /* The pickers give a local day; widen it to that day's local midnight-to-midnight and send as
       ISO, so records stamped in UTC are filtered against the day the operator actually meant. */
    const start = new Date(`${from}T00:00:00`).toISOString();
    const end = new Date(`${to}T23:59:59.999`).toISOString();
    void window.machina.remoteAgent
      .buildReport(hostId, start, end)
      .then(setMarkdown)
      .catch((cause) => onError(describeError(cause)))
      .finally(() => setBusy(false));
  };

  const save = () => {
    if (!markdown) return;
    void window.machina.remoteAgent
      .saveReport(hostId, markdown)
      .catch((cause) => onError(describeError(cause)));
  };

  return (
    <div className="field-dialog-scrim" role="presentation" onClick={onClose}>
      <div
        aria-label={t("Work report")}
        aria-modal
        className="field-dialog report-dialog"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="field-dialog-head">
          <span>{t("Write a work report")}</span>
          <button aria-label={t("Close")} className="field-dialog-close" type="button" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="field-dialog-body">
          <div className="report-range">
            <label>
              {t("From")}
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label>
              {t("To")}
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
            <button className="secondary" disabled={busy} type="button" onClick={preview}>
              <SwapLabel active={busy} off={t("Create")} on={t("Creating…")} />
            </button>
          </div>
          {markdown === undefined ? (
            <p className="settings-note">{t("Choose the dates and press Create, and you get a report you can hand to the customer.")}</p>
          ) : (
            <pre className="report-preview">{markdown}</pre>
          )}
        </div>

        <footer className="field-dialog-foot">
          <button className="secondary" type="button" onClick={onClose}>
            {t("Close")}
          </button>
          <button disabled={!markdown} type="button" onClick={save}>
            {t("Save")}
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Every command this server has seen from here, whoever ran it.
 *
 * The agent's come out of the run records — one file per run, read newest first — and the typed
 * ones from the line recorder. Merged by time, labelled by who, because "what has been run on
 * this box" is one question.
 */
function CommandHistory({
  hostId,
  onError,
  onOpenRun,
  onType,
}: {
  hostId: string;
  onError: (message?: string) => void;
  onOpenRun: (runId: string) => void;
  onType?: (command: string) => void;
}) {
  const t = useT();
  const [rows, setRows] = useState<
    Array<{
      at: string;
      command: string;
      by: "agent" | "hand";
      runId?: string;
      note?: string;
      output?: string;
      /** Which session it was typed into. Only the typed ones have one. */
      where?: string;
    }>
  >();
  /** Which rows are showing what came back, and whether everything is open at once. */
  const [open, setOpen] = useState<string>();
  const [openAll, setOpenAll] = useState(false);
  const [query, setQuery] = useState("");
  /** All / agent / typed. A merged list answers "what happened"; a filtered one answers "what did
      I do". */
  const [only, setOnly] = useState<"all" | "agent" | "hand">("all");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const read = () => {
    setBusy(true);
    void (async () => {
      try {
        const [typed, runs] = await Promise.all([
          window.machina.remoteHistory.read(hostId) as Promise<TypedCommand[]>,
          window.machina.remoteAgent.listRuns(hostId),
        ]);
        /* The newest twenty runs: enough to answer "what happened today" without reading a year. */
        const documents = await Promise.all(
          runs.slice(0, 20).map((run) =>
            window.machina.remoteAgent.loadRun(hostId, run.id).catch(() => undefined),
          ),
        );
        const fromAgent = documents.flatMap((document) =>
          (document?.steps ?? []).flatMap((step) =>
            step.command
              ? [
                  {
                    at: step.at,
                    command: step.command,
                    by: "agent" as const,
                    runId: document?.id,
                    note: step.refused ? t("Not run") : step.error ? t("Failed") : undefined,
                    output: step.output ?? step.refused ?? step.error,
                  },
                ]
              : [],
          ),
        );
        /*
         * Every typed line belongs to a session, so every row says which one.
         *
         * The name is written with the command now, but the lines from before that carry only the
         * session's id. They are still traceable: the ids are numbered in the order they first
         * appear, which is the order the sessions were opened, so an old row reads "Session 2"
         * exactly as its tab did. Nothing says "typed" — that is not the name of anything.
         */
        const numbers = new Map<string, number>();
        for (const item of [...typed].sort((a, b) => a.at.localeCompare(b.at))) {
          if (!numbers.has(item.sessionId)) numbers.set(item.sessionId, numbers.size + 1);
        }
        const byHand = typed.map((item) => ({
          at: item.at,
          command: item.command,
          by: "hand" as const,
          where: item.session ?? t("Session {n}", { n: numbers.get(item.sessionId) ?? 1 }),
        }));
        setRows(
          [...fromAgent, ...byHand].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 800),
        );
      } catch (cause) {
        onError(describeError(cause));
      } finally {
        setBusy(false);
      }
    })();
  };

  useEffect(read, [hostId]);

  const shown = (rows ?? [])
    .filter((row) => only === "all" || (only === "agent" ? row.by === "agent" : row.by === "hand"))
    .filter((row) => !query || row.command.includes(query));

  return (
    <div className="runs-history">
      {/* Over the whole page while a file is being written: nothing under it moves or is pressed. */}
      {saving && (
        <div className="runs-busy" role="status">
          <span className="runs-busy-mark" />
          {t("Writing it out…")}
        </div>
      )}
      <div className="files-bar">
        <div className="pane-segments history-only" role="tablist">
          {(
            [
              { id: "all", label: t("All") },
              { id: "agent", label: "Agent" },
              { id: "hand", label: t("Session") },
            ] as const
          ).map((each) => (
            <button
              aria-selected={only === each.id}
              className={only === each.id ? "active" : undefined}
              key={each.id}
              role="tab"
              type="button"
              onClick={() => setOnly(each.id)}
            >
              {each.label}
            </button>
          ))}
        </div>
        <input
          className="files-path"
          placeholder={t("Only commands containing this text")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {/*
          The icon travels inside the label's two states.
          
          Outside it, the button reserves the width of the longer word and the pair sits at one
          end of that width — which reads as a gap after the icon, or as a group nudged off centre.
          Swapped together, the whole thing is one block and the block is centred.
        */}
        <button
          className="quiet"
          type="button"
          onClick={() => {
            setOpenAll((current) => !current);
            setOpen(undefined);
          }}
        >
          <SwapLabel
            active={openAll}
            off={
              <span className="with-icon">
                <ExpandIcon open={false} />
                {t("Show every output")}
              </span>
            }
            on={
              <span className="with-icon">
                <ExpandIcon open />
                {t("Collapse every output")}
              </span>
            }
          />
        </button>
        {/*
          What leaves is what is on the screen: the same filter, the same search, the same order.
          The format is the question of who is going to read it.
        */}
        <MenuButton label={<DownloadLabel />} title={t("Write out what is showing")}>
          {(close) => (
            <>
              <p className="menu-heading">
                {t("Write out this list ({count})", { count: shown.length })}
              </p>
              {(
                [
                  { id: "csv", label: "CSV", note: t("Excel, spreadsheets") },
                  { id: "markdown", label: "Markdown", note: t("To paste into a report") },
                  { id: "pdf", label: "PDF", note: t("Hand over as it is") },
                  { id: "json", label: "JSON", note: t("To read in another program") },
                ] as const
              ).map((each) => (
                <button
                  key={each.id}
                  type="button"
                  onClick={() => {
                    close();
                    setSaving(true);
                    void window.machina.remoteHistory
                      .export(hostId, each.id, shown)
                      .then((where) => {
                        if (where) onError(undefined);
                      })
                      .catch((cause: unknown) => onError(describeError(cause)))
                      .finally(() => setSaving(false));
                  }}
                >
                  {each.label}
                  <span className="menu-note">{each.note}</span>
                </button>
              ))}
            </>
          )}
        </MenuButton>

        <button className="quiet" disabled={busy} type="button" onClick={read}>
          <SwapLabel
            active={busy}
            off={
              <span className="with-icon">
                <ReloadIcon />
                {t("Reload")}
              </span>
            }
            on={
              <span className="with-icon">
                <ReloadIcon />
                {t("Loading…")}
              </span>
            }
          />
        </button>
      </div>

      <div className="history-list">
        {shown.length === 0 && (
          <p className="files-empty">
            {rows && rows.length > 0
              ? t("No command contains that text.")
              : t("None yet. What the agent ran and what you typed in a session both end up here.")}
          </p>
        )}
        {shown.map((row, index) => (
          <div key={`${row.at}-${index}`}>
          <div className="history-row">
            <time>{formatDateTime(row.at)}</time>
            {/* Whose hand, and — for a typed one — which session it was typed into. */}
            <span className={row.by === "agent" ? "history-by agent" : "history-by"}>
              {row.by === "agent" ? "Agent" : row.where}
            </span>
            <code>{row.command}</code>
            {/*
              Four slots, always four.

              Every row draws the same columns whether or not it has something to put in them, so
              Copy sits under copy on every line and nothing moves when an output opens. Laid
              out right-to-left they lined up with nothing: a row with two buttons put its copy
              where the row above had its record.
            */}
            <span className="history-actions">
              <span className="history-slot note">
                {row.note && <span className="history-note">{row.note}</span>}
                {row.by === "hand" && (
                  <span className="history-note quiet-note">{t("The output was not kept")}</span>
                )}
              </span>

              <span className="history-slot">
                {row.by === "agent" && row.output && (
                  <button
                    className="quiet"
                    type="button"
                    onClick={() =>
                      setOpen((current) =>
                        current === `${row.at}-${index}` ? undefined : `${row.at}-${index}`,
                      )
                    }
                  >
                    {/* SwapLabel, never a ternary: both states are laid out, so the width is theirs. */}
                    <SwapLabel
                      active={openAll || open === `${row.at}-${index}`}
                      off={
                        <span className="with-icon">
                          <ExpandIcon open={false} />
                          {t("Show the output")}
                        </span>
                      }
                      on={
                        <span className="with-icon">
                          <ExpandIcon open />
                          {t("Hide the output")}
                        </span>
                      }
                    />
                  </button>
                )}
              </span>

              <span className="history-slot">
                <button
                  className="quiet with-icon"
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(row.command)}
                >
                  <CopyIcon />
                  {t("Copy")}
                </button>
              </span>

              <span className="history-slot">
                {row.by === "agent" && row.runId && (
                  <button
                    className="quiet with-icon"
                    type="button"
                    onClick={() => onOpenRun(row.runId!)}
                  >
                    <RecordIcon />
                    {t("Show this run")}
                  </button>
                )}
                {row.by === "hand" && onType && (
                  <button
                    className="quiet with-icon"
                    type="button"
                    onClick={() => onType(row.command)}
                  >
                    <SessionIcon />
                    {t("Put it in a session")}
                  </button>
                )}
              </span>
            </span>
          </div>
          {(openAll ? open !== `${row.at}-${index}` : open === `${row.at}-${index}`) && row.output && (
            <pre className="remote-output history-output">{row.output}</pre>
          )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* A chevron that turns: open or closed, in one glyph that never changes the button's width. */
function ExpandIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      fill="none"
      height="12"
      style={{ transform: open ? "rotate(90deg)" : undefined }}
      viewBox="0 0 12 12"
      width="12"
    >
      <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

function ReloadIcon() {
  return (
    <svg aria-hidden fill="none" height="12" viewBox="0 0 12 12" width="12">
      <path d="M10 6a4 4 0 1 1-1.2-2.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      <path d="M10.2 1.6v2.6H7.6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden fill="none" height="12" viewBox="0 0 12 12" width="12">
      <rect height="7" rx="1.4" stroke="currentColor" strokeWidth="1.4" width="6" x="4.3" y="3.7" />
      <path d="M2.8 8.3A1.4 1.4 0 0 1 1.7 7V2.9c0-.7.5-1.2 1.1-1.2h3.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

/** The run this command belongs to. */
function RecordIcon() {
  return (
    <svg aria-hidden fill="none" height="12" viewBox="0 0 12 12" width="12">
      <rect height="9" rx="1.6" stroke="currentColor" strokeWidth="1.4" width="8" x="2" y="1.5" />
      <path d="M4.2 4.3h3.6M4.2 6.4h3.6M4.2 8.5h2.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" />
    </svg>
  );
}

/** A prompt: the line this command would be put back on. */
function SessionIcon() {
  return (
    <svg aria-hidden fill="none" height="12" viewBox="0 0 12 12" width="12">
      <rect height="8" rx="1.6" stroke="currentColor" strokeWidth="1.4" width="10" x="1" y="2" />
      <path d="M3.4 5 5 6.6 3.4 8.2M6.6 8.2h2.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" />
    </svg>
  );
}

/** The download control's own label, whose width does not change while a file is being written. */
/*
 * The button says one thing, always.
 *
 * A spinner inside a control is the worst place for it: the control changes shape, and the thing
 * you were about to press becomes the thing telling you to wait. What is happening is happening
 * to the window, so the window says so — see `.runs-busy`.
 */
function DownloadLabel() {
  return (
    <span className="with-icon">
      <DownloadIcon />
      {t("Write out")}
    </span>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden fill="none" height="12" viewBox="0 0 12 12" width="12">
      <path d="M6 1.6v6.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      <path d="M3.6 5.6 6 8l2.4-2.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
      <path d="M2 9.6v.8h8v-.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * What was recorded of this server's screen.
 *
 * The third kind of record, listed beside the other two. A recording is watched here rather than
 * handed to the operating system: the answer to "what did we do on that machine" belongs in the
 * window that asked, and the pieces play one after another as though they were one file.
 */
function Recordings({
  hostId,
  onError,
}: {
  hostId: string;
  onError: (message?: string) => void;
}) {
  const t = useT();
  const [items, setItems] = useState<RecordingSummary[]>();
  const [playing, setPlaying] = useState<{ id: string; segment: number }>();
  const [busy, setBusy] = useState(false);

  const read = () => {
    void window.machina.remoteRecording
      .list(hostId)
      .then(setItems)
      .catch((cause: unknown) => onError(describeError(cause)));
  };

  useEffect(read, [hostId]);

  const shown = items ?? [];
  const open = shown.find((each) => each.id === playing?.id);

  return (
    <div className="runs-history">
      <div className="files-bar">
        <span className="files-empty">
          {shown.length > 0 ? t("{count} item|{count} items", { count: shown.length }) : ""}
        </span>
        <span className="chat-tools-gap" />
        <button className="quiet" type="button" onClick={read}>
          <span className="with-icon">
            <ReloadIcon />
            {t("Reload")}
          </span>
        </button>
      </div>

      {open && (
        <RecordingPlayer
          hostId={hostId}
          onClose={() => setPlaying(undefined)}
          onEnded={() =>
            setPlaying((current) =>
              current && current.segment + 1 < open.segments.length
                ? { ...current, segment: current.segment + 1 }
                : current,
            )
          }
          onError={onError}
          recording={open}
          segment={playing?.segment ?? 0}
        />
      )}

      <div className="history-list">
        {shown.length === 0 && (
          <p className="files-empty">
            {t("None yet. Recordings made with Record on the screen end up here.")}
          </p>
        )}
        {shown.map((item) => (
          <div className="history-row screen-capture-row" key={item.id}>
            <time>{formatDateTime(item.startedAt)}</time>
            <span className="history-by">{clockOf(lengthOf(item))}</span>
            <code>
              {t("{width}×{height} · {fps} fps · {parts} parts · {size}", {
                width: item.width,
                height: item.height,
                fps: item.fps,
                parts: item.segments.length,
                size: sizeOf(item.totalBytes),
              })}
              {item.endedAt ? "" : t(" · it ends part-way")}
            </code>
            <span className="history-actions">
              <span className="history-slot note">
                {item.note && (
                  <span className="history-note quiet-note" title={item.note}>
                    {item.note}
                  </span>
                )}
              </span>
              <span className="history-slot">
                <button
                  className="quiet with-icon"
                  type="button"
                  onClick={() => setPlaying({ id: item.id, segment: 0 })}
                >
                  <PlayIcon />
                  {t("Play")}
                </button>
              </span>
              <span className="history-slot">
                <button
                  className="quiet with-icon"
                  disabled={busy}
                  type="button"
                  onClick={() => {
                    setBusy(true);
                    void window.machina.remoteRecording
                      .save(hostId, item.id)
                      .catch((cause: unknown) => onError(describeError(cause)))
                      .finally(() => setBusy(false));
                  }}
                >
                  <DownloadIcon />
                  {t("Write out")}
                </button>
              </span>
              <span className="history-slot">
                <button
                  className="quiet with-icon"
                  disabled={busy}
                  type="button"
                  onClick={() => {
                    setBusy(true);
                    void window.machina.remoteRecording
                      .remove(hostId, item.id)
                      .then(() => {
                        if (playing?.id === item.id) setPlaying(undefined);
                        read();
                      })
                      .catch((cause: unknown) => onError(describeError(cause)))
                      .finally(() => setBusy(false));
                  }}
                >
                  <TrashIcon />
                  {t("Delete")}
                </button>
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** How long the whole recording runs: the pieces added up. */
const lengthOf = (item: RecordingSummary) =>
  Math.round(item.segments.reduce((total, each) => total + each.ms, 0) / 1000);

/** Honest at every scale: a 40KB recording said「1MB」when the smallest unit was megabytes. */
const sizeOf = (bytes: number) => {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)}GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1000))}KB`;
};

const clockOf = (seconds: number) => {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${two(Math.floor(seconds / 60))}:${two(seconds % 60)}`;
};

function PlayIcon() {
  return (
    <svg aria-hidden fill="none" height="12" viewBox="0 0 12 12" width="12">
      <path d="M3.6 2.4 9 6l-5.4 3.6V2.4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden fill="none" height="12" viewBox="0 0 12 12" width="12">
      <path d="M2.4 3.4h7.2M4.8 3.4V2.2h2.4v1.2M3.4 3.4l.5 6.2h4.2l.5-6.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3" />
    </svg>
  );
}

/**
 * A recording, played over the list rather than in front of it.
 *
 * Two things were wrong with showing it inline. It pushed the list down the moment it appeared —
 * the thing somebody had just pointed at moved — and its scrub bar did nothing for the first
 * second, because a recorded WebM carries no duration and the player is finding it out.
 *
 * So: it covers the pane (nothing below it moves), and it does not appear until it can be used.
 */
function RecordingPlayer({
  hostId,
  onClose,
  onEnded,
  onError,
  recording,
  segment,
}: {
  hostId: string;
  onClose: () => void;
  onEnded: () => void;
  onError: (message?: string) => void;
  recording: RecordingSummary;
  segment: number;
}) {
  const t = useT();
  const [ready, setReady] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  /*
   * A recording open is the window, whole.
   *
   * There was a "fill the window" toggle for a moment: two sizes, one of them a video sitting in a
   * frame with tabs above it and margins around it, which is what somebody complains about rather
   * than a size they wanted. Watching a recording is the only thing the window is doing while it
   * is open, so it takes the window; Escape and close put it back.
   */
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);

  /* A new piece is a new file: it is not ready until its own length is known. */
  useEffect(() => setReady(false), [recording.id, segment]);

  /*
   * The length, found by asking for the end.
   *
   * MediaRecorder writes as it goes and never returns to write the duration into the header, so
   * the file arrives claiming `Infinity`. Seeking past the end makes Chromium walk the clusters
   * and work it out; until that has happened the scrub bar is a decoration, which is exactly what
   * pressing it felt like. Done before the video is shown, so nobody presses it meanwhile.
   */
  const measure = () => {
    const node = video.current;
    if (!node) return;
    if (Number.isFinite(node.duration)) {
      setReady(true);
      void node.play().catch(() => undefined);
      return;
    }
    node.currentTime = 1e101;
    const settle = () => {
      if (!Number.isFinite(node.duration)) return;
      node.removeEventListener("durationchange", settle);
      node.currentTime = 0;
      setReady(true);
      void node.play().catch(() => undefined);
    };
    node.addEventListener("durationchange", settle);
  };

  return (
    <div className="screen-capture-player">
      <div className="screen-capture-stage">
        <video
          controls={ready}
          key={`${recording.id}-${segment}`}
          preload="auto"
          ref={video}
          src={`machina-recording://host/${encodeURIComponent(hostId)}/${recording.id}/${
            recording.segments[segment]?.name ?? "001.webm"
          }`}
          style={ready ? undefined : { visibility: "hidden" }}
          onEnded={onEnded}
          onError={() => onError(t("This recording cannot be played."))}
          onLoadedMetadata={measure}
        />
        {!ready && <p className="screen-capture-loading">{t("Loading…")}</p>}
      </div>
      <div className="screen-capture-player-bar">
        <span>
          {formatDateTime(recording.startedAt)}・
          {recording.segments.length > 1
            ? t("{at} of {total}", { at: segment + 1, total: recording.segments.length })
            : t("1 part")}
        </span>
        <button className="quiet" type="button" onClick={onClose}>
          {t("Close")}
        </button>
      </div>
    </div>
  );
}

