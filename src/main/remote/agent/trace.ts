import fs from "node:fs/promises";
import path from "node:path";

/**
 * Everything the model was sent and everything it said, as a line per event.
 *
 * The run record answers "what was run on the server". This answers a different question: what
 * did this agent actually see and decide. Without it, a run that went wrong leaves only its
 * commands — and the interesting part is usually the turn before the command, in a prompt nobody
 * kept.
 *
 * **JSON Lines, written as it happens.** A run that crashes or is killed still leaves everything
 * up to the crash, which is exactly the run somebody wants to read. One file per run, beside the
 * record: `<host>/<run>.trace.jsonl`.
 *
 * **Nothing is summarised.** The events are written as they arrived, whole. A trace that decided
 * what mattered would be a trace that dropped the line the reader needed.
 *
 * On secrets: the model's conversation is the one place a credential never reaches. Values are
 * put into a command after the model wrote it, and command output is masked before it goes back
 * — so a trace holds no more than the record already does.
 */

/** How much one run may write before the trace stops. A trace is not a reason to fill a disk. */
export const MOST_TRACE_BYTES = 200_000_000;

export type TraceWriter = {
  /** Add one line. Never throws and never blocks the run: a trace is not worth a failed run. */
  note(kind: string, data: Record<string, unknown>): void;
  /** Flush what is queued. Safe to call twice. */
  close(): Promise<void>;
};

/**
 * Depth-first JSON, with what JSON cannot hold made readable rather than dropped.
 *
 * Pi's events carry whatever a provider returned: a `Map` of headers, an `Error` from a failed
 * turn, a Buffer. `JSON.stringify` turns each of those into `{}` — a line that says an event
 * happened and nothing about it. A cycle is possible too (a message referring to its own turn),
 * and one of those would throw in the middle of a run.
 */
function line(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, raw) => {
    if (raw instanceof Error) {
      return { error: raw.message, stack: raw.stack };
    }
    if (raw instanceof Map) return Object.fromEntries(raw);
    if (raw instanceof Set) return [...raw];
    if (typeof raw === "bigint") return raw.toString();
    if (typeof raw === "function") return `[function ${raw.name || "anonymous"}]`;
    if (typeof raw === "object" && raw !== null) {
      if (seen.has(raw)) return "[already above]";
      seen.add(raw);
    }
    return raw as unknown;
  });
}

/**
 * Open a trace for one run.
 *
 * Appends are serialized through one promise, the same way the record is written: two events can
 * arrive in the same tick, and interleaved appends would produce a line that is not JSON.
 */
export function openTrace(file: string, limitBytes: number = MOST_TRACE_BYTES): TraceWriter {
  let queue: Promise<void> = fs.mkdir(path.dirname(file), { recursive: true }).then(
    () => undefined,
    () => undefined,
  );
  let written = 0;
  let stopped = false;

  const append = (text: string) => {
    queue = queue.then(
      () => fs.appendFile(file, text, "utf8").catch(() => undefined),
      () => undefined,
    );
  };

  return {
    note(kind, data) {
      if (stopped) return;
      let text: string;
      try {
        text = `${line({ at: new Date().toISOString(), kind, ...data })}\n`;
      } catch (cause) {
        /* Even the fallback is a line: a trace that silently skips is worse than an ugly one. */
        text = `${line({
          at: new Date().toISOString(),
          kind: "unwritable",
          about: kind,
          why: cause instanceof Error ? cause.message : String(cause),
        })}\n`;
      }
      written += Buffer.byteLength(text);
      if (written > limitBytes) {
        stopped = true;
        append(
          `${line({
            at: new Date().toISOString(),
            kind: "cut",
            why: `the trace passed ${limitBytes} bytes, and stops here`,
          })}\n`,
        );
        return;
      }
      append(text);
    },
    async close() {
      await queue;
    },
  };
}

/** One line of a trace, as it comes back off disk. */
export type TraceLine = { at?: string; kind?: string; [key: string]: unknown };

/** Every line that parses. A half-written last line (a run that was killed) is skipped. */
export function parseTrace(text: string): TraceLine[] {
  const lines: TraceLine[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    try {
      const value = JSON.parse(raw);
      if (value && typeof value === "object") lines.push(value as TraceLine);
    } catch {
      /* The tail of a file whose run was killed mid-append. Everything before it still reads. */
    }
  }
  return lines;
}

const fence = (body: string, language = "") => ["```" + language, body, "```"].join("\n");

/** The text parts of a message, whoever wrote it. */
function messageText(message: unknown): string {
  const content = (message as { content?: unknown })?.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((part) => {
      const piece = part as { type?: string; text?: string };
      return piece.type === "text" && piece.text ? [piece.text.trim()] : [];
    })
    .join("\n")
    .trim();
}

const clock = (iso?: string) => (iso ?? "").slice(11, 19);

/**
 * The trace as something a person reads.
 *
 * Deliberately not a summary: every line in the file appears here. What this adds is shape — the
 * prompt in one block at the top, each turn under a heading, a tool call beside the result it
 * got — and a fenced JSON block for any event this does not have a shape for, so a new event type
 * in a later version of Pi shows up rather than disappearing.
 */
export function renderTrace(lines: TraceLine[]): string {
  const out: string[] = [];
  const head = lines.find((line) => line.kind === "run");
  const model = head?.["model"] as { name?: string } | undefined;
  out.push(`# ${String(head?.["host"] ?? "")} — what the agent was told and said`);
  out.push(
    [
      head?.["runId"] ? `Run ${String(head["runId"])}` : "",
      model?.name ? `Model ${model.name}` : "",
      head?.["mode"] ? `Mode ${String(head["mode"])}` : "",
      head?.["control"] ? String(head["control"]) : "",
    ]
      .filter(Boolean)
      .join(" · "),
  );
  if (head?.["goal"]) out.push(`Goal: ${String(head["goal"])}`);

  for (const line of lines) {
    if (line.kind === "run" || line.kind === "delegated") {
      const who = line.kind === "run" ? "" : ` (${String(line["by"] ?? "")})`;
      out.push(`## The prompt the model was given${who}`);
      if (line["task"]) out.push(`Task: ${String(line["task"])}`);
      const skills = line["skills"];
      if (Array.isArray(skills) && skills.length) out.push(`Skills: ${skills.join(", ")}`);
      out.push(fence(String(line["systemPrompt"] ?? "")));
      if (line.kind === "run") out.push("## The conversation");
      continue;
    }
    if (line.kind === "finish") {
      out.push(`## How it ended: ${String(line["finished"] ?? "")}`);
      if (line["text"]) out.push(String(line["text"]));
      continue;
    }
    if (line.kind === "cut" || line.kind === "unwritable") {
      out.push(`> ${line.kind}: ${String(line["why"] ?? "")}`);
      continue;
    }
    if (line.kind !== "pi") {
      out.push(fence(JSON.stringify(line, null, 2), "json"));
      continue;
    }

    const by = line["by"] ? ` · ${String(line["by"])}` : "";
    const event = (line["event"] ?? {}) as Record<string, unknown>;
    const type = String(event["type"] ?? "");
    if (type === "message_end") {
      const message = event["message"] as { role?: string } | undefined;
      const said = messageText(message);
      out.push(`### ${clock(line.at)}${by} · ${message?.role ?? "message"}`);
      out.push(said || "_(nothing but tool calls)_");
      continue;
    }
    if (type === "tool_execution_start") {
      out.push(`#### ${clock(line.at)}${by} · calls ${String(event["toolName"] ?? "")}`);
      out.push(fence(JSON.stringify(event["args"] ?? {}, null, 2), "json"));
      continue;
    }
    if (type === "tool_execution_end") {
      const failed = event["isError"] ? " (failed)" : "";
      out.push(`#### ${clock(line.at)}${by} · ${String(event["toolName"] ?? "")} came back${failed}`);
      out.push(fence(JSON.stringify(event["result"] ?? null, null, 2), "json"));
      continue;
    }
    /* Everything else — turns, retries, compaction, queue changes — as it arrived. */
    if (type === "message_update" || type === "message_start") continue;
    out.push(`- ${clock(line.at)}${by} · ${type || "event"}`);
  }
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n") + "\n";
}
