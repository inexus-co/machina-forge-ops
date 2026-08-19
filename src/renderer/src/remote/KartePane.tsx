import { useEffect, useState } from "react";
import { formatDateTime } from "../../../shared/i18n";
import { useT } from "../i18n";
import type { ServerDossier, ServerFactsView } from "../../../shared/remoteAgent";
import { SwapLabel } from "./SwapLabel";

/**
 * A server's logbook, in one place: what reaches the agent, and what the operator can add.
 *
 * The lede says it plainly — everything on this pane is handed to the agent at the start of the
 * next run. Five sections: what earlier runs established, the notes the operator writes, the
 * handovers past runs left, the summary of facts the app would collect, and this server's memory
 * of the approvals it has accumulated. Nothing here changes the server; forgetting all of that memory reuses the same
 * forget the catalog screen has.
 */

export function KartePane({
  hostId,
  onError,
}: {
  hostId: string;
  onError: (message?: string) => void;
}) {
  const t = useT();
  const [dossier, setDossier] = useState<ServerDossier>();
  const [notes, setNotes] = useState("");
  const [savedNotes, setSavedNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [facts, setFacts] = useState<ServerFactsView>();
  const [factsError, setFactsError] = useState<string>();
  const [reading, setReading] = useState(false);
  const [openDetail, setOpenDetail] = useState(false);
  const [memory, setMemory] = useState<Array<{ program: string; text: string }>>([]);
  /** One of the agent's notes being corrected by hand: its title, and the text as it is edited. */
  const [editing, setEditing] = useState<{ title: string; text: string }>();
  const [savingNote, setSavingNote] = useState(false);
  const [writingFile, setWritingFile] = useState(false);

  const adopt = (next: ServerDossier) => {
    setDossier(next);
    setNotes(next.notes);
    setSavedNotes(next.notes);
  };

  const load = () =>
    void window.machina.remoteAgent
      .serverContext(hostId)
      .then(adopt)
      .catch((cause) => onError(describe(cause)));

  const loadMemory = () =>
    void window.machina.remoteAgent
      .settings()
      .then((settings) => {
        const slice = settings.hostRules.find((each) => each.hostId === hostId);
        setMemory(
          Object.entries(slice?.rules ?? {}).map(([program, rule]) => ({
            program,
            text: rule.action === "deny" ? t("Refused") : t("Automatic"),
          })),
        );
      })
      .catch(() => undefined);

  useEffect(() => {
    load();
    loadMemory();
    // Read the facts once when the pane opens; the operator can refresh.
    refreshFacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId]);

  // A run finishing (a new handover) or another window saving notes re-reads this pane.
  useEffect(() => window.machina.remoteAgent.onServerContextChanged((id) => id === hostId && load()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => window.machina.remoteAgent.onSettingsSaved(loadMemory));

  const refreshFacts = () => {
    setReading(true);
    setFactsError(undefined);
    void window.machina.remoteAgent
      .factsPreview(hostId)
      .then(setFacts)
      .catch((cause) => setFactsError(describe(cause)))
      .finally(() => setReading(false));
  };

  const saveNotes = () => {
    setSaving(true);
    onError(undefined);
    void window.machina.remoteAgent
      .saveServerNotes(hostId, notes)
      .then(adopt)
      .catch((cause) => onError(describe(cause)))
      .finally(() => setSaving(false));
  };

  const saveNote = (title: string, text: string) => {
    setSavingNote(true);
    onError(undefined);
    void window.machina.remoteAgent
      .saveAgentNote(hostId, title, text)
      .then((next) => {
        adopt(next);
        setEditing(undefined);
      })
      .catch((cause) => onError(describe(cause)))
      .finally(() => setSavingNote(false));
  };

  /*
   * All of them, as one document.
   *
   * What used to be a report per run, which nobody read twice. These are what is known about the
   * machine now, so writing them out is the thing worth handing to somebody.
   */
  const writeToFile = () => {
    setWritingFile(true);
    onError(undefined);
    const markdown = [
      `# ${t("What is known about this server")}`,
      ...established.map((note) => `## ${note.title}\n\n${note.text}`),
    ].join("\n\n");
    void window.machina.remoteAgent
      .saveReport(hostId, `${markdown}\n`)
      .catch((cause) => onError(describe(cause)))
      .finally(() => setWritingFile(false));
  };

  const dirty = notes !== savedNotes;
  const established = dossier?.agentNotes ?? [];
  const handovers = dossier?.handovers ?? [];

  return (
    <div className="settings-body karte-pane">
      <div className="settings-lede">
        <h2>{t("Server logbook")}</h2>
        <p>{t("What you see here is handed to the agent at the start of its next run.")}</p>
      </div>

      {/*
        What earlier runs found out, and the one thing on this pane the agent writes.

        First because it is what somebody opens this for. Titled, so a second look at the database
        corrects the note about the database; correctable here, because the operator knows things
        no command prints and an out-of-date note is worse than none.
      */}
      <fieldset className="settings-fieldset">
        <legend>{t("What earlier runs established")}</legend>
        {established.length === 0 ? (
          <p className="settings-note">
            {t("Nothing yet. As an investigation works something out, it writes it here — and the next run is handed it instead of finding it again.")}
          </p>
        ) : (
          <>
            {established.map((note) => (
              <div className="karte-note" key={note.title}>
                <div className="karte-handover-head">
                  <span>
                    {note.title}
                    {"　"}
                    <small>{day(note.at)}</small>
                  </span>
                  <span className="karte-note-actions">
                    <button
                      className="quiet"
                      type="button"
                      onClick={() =>
                        setEditing(
                          editing?.title === note.title
                            ? undefined
                            : { title: note.title, text: note.text },
                        )
                      }
                    >
                      {t("Correct it")}
                    </button>
                    <button
                      className="quiet"
                      type="button"
                      onClick={() => {
                        void window.machina.remoteAgent
                          .deleteAgentNote(hostId, note.title)
                          .then(adopt)
                          .catch((cause) => onError(describe(cause)));
                      }}
                    >
                      {t("Clear")}
                    </button>
                  </span>
                </div>
                {editing?.title === note.title ? (
                  <>
                    <textarea
                      className="settings-code"
                      rows={8}
                      value={editing.text}
                      onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                    />
                    <div className="karte-notes-foot">
                      <small>{t("The next run is handed what you save here.")}</small>
                      <button
                        disabled={savingNote}
                        type="button"
                        onClick={() => saveNote(editing.title, editing.text)}
                      >
                        {t("Save")}
                      </button>
                    </div>
                  </>
                ) : (
                  <pre className="karte-facts">{note.text}</pre>
                )}
              </div>
            ))}
            <div className="karte-notes-foot">
              <small>{t("{count} of {most} kept. Past that, the oldest goes.", { count: established.length, most: 10 })}</small>
              <button
                className="secondary"
                disabled={writingFile}
                type="button"
                onClick={writeToFile}
              >
                {t("Save as a file")}
              </button>
            </div>
          </>
        )}
      </fieldset>

      <fieldset className="settings-fieldset">
        <legend>{t("Your notes")}</legend>
        <textarea
          className="settings-code"
          placeholder={t("What the agent should know about this server (e.g. production DB is web-db; be careful about restarts)")}
          rows={5}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        <div className="karte-notes-foot">
          <small>{dirty ? t("There are unsaved changes") : t("Saved")}</small>
          <button disabled={saving || !dirty} type="button" onClick={saveNotes}>
            <SwapLabel active={saving} off={t("Save")} on={t("Saving…")} />
          </button>
        </div>
      </fieldset>

      <fieldset className="settings-fieldset">
        <legend>{t("Handover")}</legend>
        {handovers.length === 0 && (
          <p className="settings-note">{t("None yet. Every run that ends in done leaves its summary here.")}</p>
        )}
        {handovers.map((h) => (
          <div className="karte-handover" key={`${h.at}-${h.runId}`}>
            <div className="karte-handover-head">
              <span>
                {day(h.at)}
                {h.goal ? `　「${h.goal}」` : ""}
              </span>
              <button
                aria-label={t("Delete this handover")}
                className="quiet"
                type="button"
                onClick={() => {
                  void window.machina.remoteAgent
                    .deleteHandover(hostId, h.at, h.runId)
                    .then(adopt)
                    .catch((cause) => onError(describe(cause)));
                }}
              >
                {t("Clear")}
              </button>
            </div>
            <p>{h.text}</p>
          </div>
        ))}
      </fieldset>

      <fieldset className="settings-fieldset">
        <legend>{t("The facts handed to the agent (summary)")}</legend>
        <div className="karte-facts-head">
          <small>{facts ? t("as of {when}", { when: day(facts.at) }) : reading ? t("Loading…") : ""}</small>
          <button className="secondary" disabled={reading} type="button" onClick={refreshFacts}>
            <SwapLabel active={reading} off={t("Read again")} on={t("Loading…")} />
          </button>
        </div>
        {factsError ? (
          <p className="settings-note">
            {/SSH|could not be read/i.test(factsError)
              ? t("It has not been read yet: connect to this server, or press Read again.")
              : t("Could not read it just now: {reason}", { reason: factsError })}
          </p>
        ) : facts ? (
          <>
            <pre className="karte-facts">{facts.summary || t("(nothing could be read)")}</pre>
            {facts.detail && (
              <>
                <button className="quiet" type="button" onClick={() => setOpenDetail((v) => !v)}>
                  <SwapLabel active={openDetail} off={t("Show all")} on={t("Collapse all")} />
                </button>
                {openDetail && <pre className="karte-facts karte-facts-detail">{facts.detail}</pre>}
              </>
            )}
          </>
        ) : (
          <p className="settings-note">{t("Loading…")}</p>
        )}
      </fieldset>

      <fieldset className="settings-fieldset">
        <legend>{t("What is remembered for this server")}</legend>
        {memory.length === 0 ? (
          <p className="settings-note">
            {t("None yet. Choosing \"from now on\" on an approval card during a run collects them here.")}
          </p>
        ) : (
          <>
            <div className="karte-memory">
              {memory.map((m) => (
                <div className="karte-memory-row" key={m.program}>
                  <code className="allow-name">{m.program}</code>
                  <span>{m.text}</span>
                </div>
              ))}
            </div>
            <div className="karte-memory-foot">
              <button
                className="danger quiet"
                type="button"
                onClick={() => {
                  void window.machina.remoteAgent
                    .forgetHostRules(hostId)
                    .then(loadMemory)
                    .catch((cause) => onError(describe(cause)));
                }}
              >
                {t("Clear everything remembered for this server")}
              </button>
            </div>
          </>
        )}
      </fieldset>
    </div>
  );
}

function day(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : formatDateTime(d);
}

function describe(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
