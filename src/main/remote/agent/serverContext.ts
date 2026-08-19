import fs from "node:fs/promises";
import { t } from "../../../shared/i18n";
import path from "node:path";
import type { ServerDossier, ServerHandover, ServerNote } from "../../../shared/remoteAgent";

/**
 * A server's dossier on disk — the part of its logbook this machine keeps.
 *
 * `<userData>/server-context/<hostId>.json` holds the operator's notes and the handovers past
 * runs left behind. The facts (what is true now) are collected fresh at run start, never stored here.
 *
 * One writer, serialized per host: notes are saved from the panel, handovers appended mid-run,
 * and both are read-modify-write. Without the queue two of them could interleave and one would
 * be lost — the same hazard `enqueueSettingsWrite` guards in the agent controller.
 */

const MOST_HANDOVERS = 50;
/**
 * How many of the agent's notes are kept, and how long each may be.
 *
 * They go into every later run's prompt, so this is a budget rather than a preference: ten notes
 * of two thousand characters is about five thousand tokens of "what is known about this machine",
 * which is worth the room. Past ten, the oldest goes — and the panel says so, rather than the
 * eleventh silently not being written.
 */
export const MOST_AGENT_NOTES = 10;
export const MOST_AGENT_NOTE_CHARS = 2000;
export const MOST_NOTES_CHARS = 8000;

/** hostId becomes a path segment, so it is held to the shape host ids actually have. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export function contextPath(userDataRoot: string, hostId: string): string {
  if (!SAFE_ID.test(hostId)) throw new Error(t("That is not a valid host id: {id}", { id: hostId }));
  return path.join(userDataRoot, "server-context", `${hostId}.json`);
}

const queues = new Map<string, Promise<unknown>>();

/** Run `work` after any pending read/write for this host, so none interleave. */
function enqueue<T>(hostId: string, work: () => Promise<T>): Promise<T> {
  const next = (queues.get(hostId) ?? Promise.resolve()).then(work, work);
  queues.set(
    hostId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

async function load(userDataRoot: string, hostId: string): Promise<ServerDossier> {
  try {
    const raw = JSON.parse(await fs.readFile(contextPath(userDataRoot, hostId), "utf8"));
    const notes = typeof raw?.notes === "string" ? raw.notes : "";
    const handovers = Array.isArray(raw?.handovers)
      ? raw.handovers.filter(
          (h: unknown): h is ServerHandover =>
            Boolean(h) &&
            typeof (h as ServerHandover).at === "string" &&
            typeof (h as ServerHandover).runId === "string" &&
            typeof (h as ServerHandover).text === "string",
        )
      : [];
    const agentNotes = Array.isArray(raw?.agentNotes)
      ? raw.agentNotes.flatMap((note: unknown): ServerNote[] => {
          const each = note as Partial<ServerNote> | null;
          return each && typeof each.at === "string" && typeof each.title === "string" && typeof each.text === "string"
            ? [{ at: each.at, title: each.title, text: each.text, ...(each.runId ? { runId: each.runId } : {}) }]
            : [];
        })
      : [];
    const lastFacts =
      raw?.lastFacts &&
      typeof raw.lastFacts.at === "string" &&
      typeof raw.lastFacts.summary === "string"
        ? { at: raw.lastFacts.at, summary: raw.lastFacts.summary }
        : undefined;
    return {
      notes,
      handovers,
      ...(agentNotes.length ? { agentNotes } : {}),
      ...(lastFacts ? { lastFacts } : {}),
    };
  } catch {
    return { notes: "", handovers: [] };
  }
}

async function store(userDataRoot: string, hostId: string, dossier: ServerDossier): Promise<void> {
  const file = contextPath(userDataRoot, hostId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(dossier, null, 2)}\n`, "utf8");
}

export function readDossier(userDataRoot: string, hostId: string): Promise<ServerDossier> {
  return enqueue(hostId, () => load(userDataRoot, hostId));
}

export function writeNotes(
  userDataRoot: string,
  hostId: string,
  notes: string,
): Promise<ServerDossier> {
  return enqueue(hostId, async () => {
    const current = await load(userDataRoot, hostId);
    const next: ServerDossier = { ...current, notes: notes.slice(0, MOST_NOTES_CHARS) };
    await store(userDataRoot, hostId, next);
    return next;
  });
}

/**
 * Add a handover, newest first, capped. A handover for a runId that already has one replaces it,
 * so a run that ends, is continued with `say`, and ends again leaves one entry, not two.
 */
export function appendHandover(
  userDataRoot: string,
  hostId: string,
  handover: ServerHandover,
): Promise<ServerDossier> {
  return enqueue(hostId, async () => {
    const current = await load(userDataRoot, hostId);
    const others = current.handovers.filter((h) => h.runId !== handover.runId);
    const next: ServerDossier = {
      ...current,
      handovers: [handover, ...others].slice(0, MOST_HANDOVERS),
    };
    await store(userDataRoot, hostId, next);
    return next;
  });
}

/**
 * Write one of the agent's notes, by title.
 *
 * The same title replaces what was there — a second look at the database should correct the note
 * about the database, not sit beside it as a rival. A new title joins the front. Empty text
 * deletes it, which is how the panel's forget works.
 */
export function writeAgentNote(
  userDataRoot: string,
  hostId: string,
  note: ServerNote,
): Promise<ServerDossier> {
  return enqueue(hostId, async () => {
    const current = await load(userDataRoot, hostId);
    const title = note.title.trim().slice(0, 120);
    const text = note.text.trim().slice(0, MOST_AGENT_NOTE_CHARS);
    const others = (current.agentNotes ?? []).filter((each) => each.title !== title);
    const next: ServerDossier = {
      ...current,
      agentNotes: text
        ? [{ ...note, title, text }, ...others].slice(0, MOST_AGENT_NOTES)
        : others,
    };
    if (next.agentNotes?.length === 0) delete next.agentNotes;
    await store(userDataRoot, hostId, next);
    return next;
  });
}

/**
 * Remember the last facts summary, for suggesting plugins without a fresh probe.
 *
 * Written whenever facts are collected anyway (run start, panel preview). Notes and handovers are
 * preserved — this is the same read-modify-write on the same per-host queue.
 */
export function writeLastFacts(
  userDataRoot: string,
  hostId: string,
  lastFacts: { at: string; summary: string },
): Promise<ServerDossier> {
  return enqueue(hostId, async () => {
    const current = await load(userDataRoot, hostId);
    const next: ServerDossier = { ...current, lastFacts };
    await store(userDataRoot, hostId, next);
    return next;
  });
}

export function deleteHandover(
  userDataRoot: string,
  hostId: string,
  at: string,
  runId: string,
): Promise<ServerDossier> {
  return enqueue(hostId, async () => {
    const current = await load(userDataRoot, hostId);
    const next: ServerDossier = {
      ...current,
      handovers: current.handovers.filter((h) => !(h.at === at && h.runId === runId)),
    };
    await store(userDataRoot, hostId, next);
    return next;
  });
}

/** The host was removed: its dossier goes with it. */
export function forgetServerContext(userDataRoot: string, hostId: string): Promise<void> {
  return enqueue(hostId, async () => {
    await fs.rm(contextPath(userDataRoot, hostId), { force: true });
  });
}
