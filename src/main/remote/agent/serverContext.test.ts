import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MOST_AGENT_NOTES,
  MOST_AGENT_NOTE_CHARS,
  MOST_NOTES_CHARS,
  appendHandover,
  contextPath,
  deleteHandover,
  forgetServerContext,
  readDossier,
  writeAgentNote,
  writeNotes,
} from "./serverContext";

let root = "";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "machina-dossier-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("a server's logbook, on disk", () => {
  it("with nothing saved, an empty logbook comes back", async () => {
    expect(await readDossier(root, "h1")).toEqual({ notes: "", handovers: [] });
  });

  it("notes are written and read back, and cut at the limit", async () => {
    await writeNotes(root, "h1", "The production database is web-db. Restarts need care");
    expect((await readDossier(root, "h1")).notes).toContain("web-db");

    const long = "x".repeat(MOST_NOTES_CHARS + 500);
    const saved = await writeNotes(root, "h1", long);
    expect(saved.notes.length).toBe(MOST_NOTES_CHARS);
  });

  it("handovers are newest first, and cut at fifty", async () => {
    for (let i = 0; i < 60; i += 1) {
      await appendHandover(root, "h1", {
        at: `2026-08-16T00:${String(i).padStart(2, "0")}:00Z`,
        runId: `r${i}`,
        text: `what run ${i} found`,
      });
    }
    const dossier = await readDossier(root, "h1");
    expect(dossier.handovers).toHaveLength(50);
    expect(dossier.handovers[0].runId).toBe("r59"); // the newest is first
    expect(dossier.handovers.some((h) => h.runId === "r0")).toBe(false); // the old ones went
  });

  it("a handover with the same runId replaces the old one, so saying and finishing again is not two", async () => {
    await appendHandover(root, "h1", { at: "t1", runId: "r1", text: "how it is going" });
    await appendHandover(root, "h1", { at: "t2", runId: "r1", text: "how it ended" });
    const dossier = await readDossier(root, "h1");
    expect(dossier.handovers).toHaveLength(1);
    expect(dossier.handovers[0].text).toBe("how it ended");
  });

  it("appends that happen at once all survive, because they queue", async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        appendHandover(root, "h1", { at: `t${i}`, runId: `r${i}`, text: `n${i}` }),
      ),
    );
    expect((await readDossier(root, "h1")).handovers).toHaveLength(10);
  });

  it("one handover can be deleted", async () => {
    await appendHandover(root, "h1", { at: "t1", runId: "r1", text: "a" });
    await appendHandover(root, "h1", { at: "t2", runId: "r2", text: "b" });
    const after = await deleteHandover(root, "h1", "t1", "r1");
    expect(after.handovers.map((h) => h.runId)).toEqual(["r2"]);
  });

  it("notes and handovers are kept apart", async () => {
    await writeNotes(root, "h1", "a note");
    await appendHandover(root, "h1", { at: "t", runId: "r", text: "a handover" });
    const dossier = await readDossier(root, "h1");
    expect(dossier.notes).toBe("a note");
    expect(dossier.handovers).toHaveLength(1);
  });

  it("what a run established is kept by title, newest first, and corrected in place", async () => {
    await writeNotes(root, "h1", "a note of my own");
    await writeAgentNote(root, "h1", { at: "t1", runId: "r1", title: "Apache", text: "bitnami build" });
    await writeAgentNote(root, "h1", { at: "t2", runId: "r1", title: "WordPress", text: "prefix wp_" });

    let dossier = await readDossier(root, "h1");
    expect(dossier.agentNotes?.map((note) => note.title)).toEqual(["WordPress", "Apache"]);
    /* The operator's own note is a different thing and is left alone. */
    expect(dossier.notes).toBe("a note of my own");

    /* The same title corrects what was there rather than joining it. */
    await writeAgentNote(root, "h1", { at: "t3", title: "Apache", text: "bitnami, /opt/bitnami" });
    dossier = await readDossier(root, "h1");
    expect(dossier.agentNotes).toHaveLength(2);
    expect(dossier.agentNotes?.find((note) => note.title === "Apache")?.text).toBe("bitnami, /opt/bitnami");

    /* Empty text is how the panel forgets one. */
    await writeAgentNote(root, "h1", { at: "t4", title: "Apache", text: "  " });
    dossier = await readDossier(root, "h1");
    expect(dossier.agentNotes?.map((note) => note.title)).toEqual(["WordPress"]);
  });

  it("there is a ceiling, and the oldest is what goes", async () => {
    for (let i = 0; i < MOST_AGENT_NOTES + 3; i += 1) {
      await writeAgentNote(root, "h1", { at: `t${i}`, title: `note ${i}`, text: "x" });
    }
    const dossier = await readDossier(root, "h1");
    expect(dossier.agentNotes).toHaveLength(MOST_AGENT_NOTES);
    /* Newest first, so the ones left are the last written. */
    expect(dossier.agentNotes?.[0].title).toBe(`note ${MOST_AGENT_NOTES + 2}`);
    expect(dossier.agentNotes?.some((note) => note.title === "note 0")).toBe(false);
  });

  it("a note too long for a prompt is cut", async () => {
    await writeAgentNote(root, "h1", { at: "t", title: "long", text: "x".repeat(MOST_AGENT_NOTE_CHARS + 500) });
    const dossier = await readDossier(root, "h1");
    expect(dossier.agentNotes?.[0].text.length).toBe(MOST_AGENT_NOTE_CHARS);
  });

  it("forget takes the whole file with it", async () => {
    await writeNotes(root, "h1", "x");
    await forgetServerContext(root, "h1");
    await expect(fs.access(contextPath(root, "h1"))).rejects.toThrow();
    expect(await readDossier(root, "h1")).toEqual({ notes: "", handovers: [] });
  });

  it("a hostId that could be a path is refused", () => {
    expect(() => contextPath(root, "../etc/passwd")).toThrow();
    expect(() => contextPath(root, "a/b")).toThrow();
  });
});
