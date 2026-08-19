import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openTrace, parseTrace, renderTrace } from "./trace";

/**
 * The trace, held to the two things it is for.
 *
 * It has to survive a run that dies — a file written at the end is a file that is never there
 * when it is wanted — and it has to hold everything, including the parts that are not plain JSON.
 */

let root = "";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "machina-trace-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const read = (file: string) => fs.readFile(file, "utf8");

describe("writing a trace", () => {
  it("one line per event, as it happens, with the directory made on the way", async () => {
    const file = path.join(root, "host", "run.trace.jsonl");
    const trace = openTrace(file);
    trace.note("run", { goal: "have a look" });
    trace.note("pi", { event: { type: "message_end", message: { role: "assistant" } } });
    await trace.close();

    const lines = parseTrace(await read(file));
    expect(lines.map((line) => line.kind)).toEqual(["run", "pi"]);
    expect(lines[0]?.["goal"]).toBe("have a look");
    /* Every line is stamped: the interesting question is usually when, not only what. */
    expect(String(lines[1]?.at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("what JSON cannot hold is written readably rather than dropped", async () => {
    const file = path.join(root, "run.trace.jsonl");
    const trace = openTrace(file);
    const cycle: Record<string, unknown> = { name: "turn" };
    cycle["itself"] = cycle;
    trace.note("pi", {
      event: {
        failure: new Error("the provider said no"),
        headers: new Map([["x-request-id", "abc"]]),
        seen: new Set([1, 2]),
        cycle,
      },
    });
    await trace.close();

    const [line] = parseTrace(await read(file));
    const event = line?.["event"] as Record<string, unknown>;
    expect((event["failure"] as { error?: string }).error).toBe("the provider said no");
    expect(event["headers"]).toEqual({ "x-request-id": "abc" });
    expect(event["seen"]).toEqual([1, 2]);
    /* The cycle is named rather than throwing halfway through a run. */
    expect((event["cycle"] as Record<string, unknown>)["itself"]).toBe("[already above]");
  });

  it("a limit stops it, and the file says where it stopped", async () => {
    const file = path.join(root, "run.trace.jsonl");
    const trace = openTrace(file, 400);
    for (let i = 0; i < 50; i += 1) trace.note("pi", { event: { type: "turn_end", i } });
    await trace.close();

    const lines = parseTrace(await read(file));
    expect(lines.length).toBeLessThan(20);
    expect(lines[lines.length - 1]?.kind).toBe("cut");
  });

  it("a file cut mid-line still reads up to the cut", async () => {
    const good = JSON.stringify({ at: "t", kind: "run", goal: "have a look" });
    expect(parseTrace(`${good}\n{"kind":"pi","event":{"typ`)).toHaveLength(1);
  });
});

describe("the trace as something to read", () => {
  const lines = [
    {
      at: "2026-08-18T07:58:00.000Z",
      kind: "run",
      runId: "2026-08-18T07-58-00",
      host: "web01",
      goal: "check the WordPress configuration",
      mode: "auto",
      control: "shell",
      model: { id: "m1", name: "Opus 5" },
      skills: ["unfamiliar-server"],
      systemPrompt: "You are helping to maintain web01.",
    },
    {
      at: "2026-08-18T07:58:04.000Z",
      kind: "pi",
      event: { type: "message_end", message: { role: "assistant", content: "Looking at the vhosts." } },
    },
    {
      at: "2026-08-18T07:58:05.000Z",
      kind: "pi",
      event: { type: "tool_execution_start", toolName: "run_command", args: { command: "httpd -S" } },
    },
    {
      at: "2026-08-18T07:58:06.000Z",
      kind: "pi",
      event: { type: "tool_execution_end", toolName: "run_command", result: "exit code 0", isError: false },
    },
    { at: "2026-08-18T07:58:07.000Z", kind: "pi", event: { type: "turn_end" } },
    { at: "2026-08-18T07:58:08.000Z", kind: "finish", finished: "done", text: "had a look" },
  ];

  const markdown = renderTrace(lines);

  it("the prompt the model was given is there in full, at the top", () => {
    expect(markdown).toContain("web01 — what the agent was told and said");
    expect(markdown).toContain("You are helping to maintain web01.");
    expect(markdown).toContain("unfamiliar-server");
    expect(markdown.indexOf("You are helping")).toBeLessThan(markdown.indexOf("Looking at the vhosts"));
  });

  it("each turn, each tool call and each result, in order", () => {
    expect(markdown).toContain("assistant");
    expect(markdown).toContain("calls run_command");
    expect(markdown).toContain("httpd -S");
    expect(markdown).toContain("run_command came back");
    expect(markdown).toContain("How it ended: done");
  });

  it("an event nobody wrote a shape for still appears", () => {
    /* The point of a trace: a Pi release with a new event must not make it disappear here. */
    const md = renderTrace([{ at: "t", kind: "pi", event: { type: "compaction_start" } }]);
    expect(md).toContain("compaction_start");
    const other = renderTrace([{ at: "t", kind: "something-new", detail: "kept anyway" }]);
    expect(other).toContain("kept anyway");
  });
});
