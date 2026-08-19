import type { RemoteCommandSet } from "../../../shared/remoteAgent";
import { INSPECTION_NOTES } from "../../../shared/remoteResources";

/**
 * What a skill or an extension would bring, read before it is installed.
 *
 * ADR 0002 makes the position explicit: **this is not a wall.** A determined author can hide
 * things from a scanner, and the model that reads the prose can be fooled. The walls are the
 * ones at execution time — the allowlist, the approval, the record. This is the pair of eyes in
 * front of them, so that installing something is a decision made with the facts rather than a
 * decision made because the file was already in the folder.
 *
 * Two layers, and the difference matters:
 *
 * - **the machine's reading** — what is written here. Names of commands, imports that reach the
 *   network or spawn processes, declared tools. Certain, in the narrow sense that what it finds
 *   is really there
 * - **the model's reading** — a summary and a judgement, produced elsewhere and shown beside
 *   this. Helpful, and fallible
 *
 * The card is what the operator sees. It says what was found, not what was concluded.
 *
 * Nothing in this file touches the disk or Electron, and that is deliberate: `check.ts` runs it
 * from a plain `node`, so the checker an author runs while writing is the same code that reads
 * the file at install time. A checker that is a second implementation is a checker that passes
 * things the real one refuses.
 */

export type InspectionFinding = {
  /** What kind of thing was noticed, for grouping on the card. */
  kind: "command" | "unlisted-command" | "import" | "url" | "tool";
  /** The thing itself: a command name, a module, a URL, a tool name. */
  what: string;
  /** Where it was found, 1-indexed, so the operator can go and look. */
  line?: number;
  /** Why it is on the card. Absent for things that are simply listed. */
  note?: string;
};

export type Inspection = {
  /** Commands the text asks for — from `commands:` if declared, otherwise from the prose. */
  commands: string[];
  /** Of those, the ones no allowlist in this installation grants. */
  unlisted: string[];
  /** For an extension: the tools it says it registers. */
  tools: string[];
  findings: InspectionFinding[];
};

/**
 * Modules an extension has no ordinary reason to want.
 *
 * An extension is code in Forge's own process — it can reach whatever Node can. Naming these is
 * not a prohibition; it is the difference between an operator who knows a package talks to the
 * network and one who finds out later.
 */
const NOTABLE_IMPORTS: Array<{ pattern: RegExp; note: string }> = [
  { pattern: /\bnode:child_process\b|require\(["']child_process["']\)/, note: INSPECTION_NOTES.startsProcesses },
  { pattern: /\bnode:fs\b|require\(["']fs["']\)/, note: INSPECTION_NOTES.readsFiles },
  { pattern: /\bnode:net\b|\bnode:http2?\b|\bnode:https\b/, note: INSPECTION_NOTES.network },
  { pattern: /\bfetch\s*\(/, note: INSPECTION_NOTES.networkFetch },
  { pattern: /\bnode:os\b/, note: INSPECTION_NOTES.readsMachine },
];

/**
 * The tools an extension says it registers.
 *
 * Declared in a comment at the top of the file — `// @tools recall remember` — and read without
 * running anything. Pi would know the real answer only after loading the extension, and loading
 * it means executing somebody's code to find out what it wants permission for, which is the
 * wrong order. What is written here is what the operator is agreeing to.
 */
export function declaredTools(content: string): string[] {
  const match = /^\s*(?:\/\/|\*|#)\s*@tools\s+(.+)$/m.exec(content);
  if (!match) return [];
  return match[1]
    .split(/[\s,]+/)
    .map((name) => name.trim())
    .filter((name) => /^[a-z][a-z0-9_]{0,63}$/i.test(name));
}

/** `commands:` in the frontmatter — a skill saying which programs it will have the agent run. */
function declaredCommands(content: string): string[] | undefined {
  const front = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!front) return undefined;
  const line = /^commands:\s*(.+)$/m.exec(front[1]);
  if (!line) return undefined;
  return line[1]
    .replace(/[[\]"']/g, " ")
    .split(/[\s,]+/)
    .map((each) => each.trim())
    .filter(Boolean);
}

/**
 * Command names in fenced blocks, when nothing was declared.
 *
 * Deliberately shallow: the first word of each line inside ``` fences. A skill that hides a
 * command from this is not stopped by it — that is the allowlist's job at execution time. What
 * this buys is the common case, where the skill is honest and the operator wants to know what it
 * will reach for.
 */
function commandsInProse(content: string): InspectionFinding[] {
  const found: InspectionFinding[] = [];
  let fenced = false;
  content.split("\n").forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (!fenced) return;
    const word = /^\s*\$?\s*([a-z][a-z0-9._-]{1,30})\b/i.exec(line);
    if (!word) return;
    found.push({ kind: "command", what: word[1], line: index + 1 });
  });
  return found;
}

export function inspect(
  kind: "skill" | "prompt" | "extension",
  content: string,
  sets: RemoteCommandSet[],
): Inspection {
  const findings: InspectionFinding[] = [];

  /*
   * Declared beats guessed.
   *
   * With `commands:` in the frontmatter the check becomes "compare two lists", which cannot be
   * wrong; without it, the prose is read, which can. A skill that wants to be checkable says so.
   */
  const declared = declaredCommands(content);
  const fromProse = kind === "extension" ? [] : commandsInProse(content);
  const commands = [...new Set(declared ?? fromProse.map((each) => each.what))].sort();
  if (declared) {
    commands.forEach((what) => findings.push({ kind: "command", what, note: INSPECTION_NOTES.declared }));
  } else {
    findings.push(...fromProse);
  }

  const granted = new Set(sets.flatMap((set) => set.allow));
  const unlisted = commands.filter((each) => !granted.has(each));
  unlisted.forEach((what) =>
    findings.push({
      kind: "unlisted-command",
      what,
      note: INSPECTION_NOTES.unlisted,
    }),
  );

  const tools = kind === "extension" ? declaredTools(content) : [];
  tools.forEach((what) =>
    findings.push({ kind: "tool", what, note: INSPECTION_NOTES.addsTool }),
  );

  if (kind === "extension") {
    for (const { pattern, note } of NOTABLE_IMPORTS) {
      const at = content.split("\n").findIndex((line) => pattern.test(line));
      if (at >= 0) {
        findings.push({
          kind: "import",
          what: content.split("\n")[at].trim().slice(0, 80),
          line: at + 1,
          note,
        });
      }
    }
  }

  /* A URL in a skill is usually documentation; in an extension it is a destination. */
  content.split("\n").forEach((line, index) => {
    const url = /https?:\/\/[^\s"'`)]+/.exec(line);
    if (!url) return;
    if (/localhost|127\.0\.0\.1|example\.(com|org)/.test(url[0])) return;
    findings.push({
      kind: "url",
      what: url[0].slice(0, 100),
      line: index + 1,
      note: kind === "extension" ? INSPECTION_NOTES.outboundUrl : INSPECTION_NOTES.referencedUrl,
    });
  });

  return { commands, unlisted, tools, findings };
}
