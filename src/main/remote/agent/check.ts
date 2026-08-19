/*
 * The checker an author runs, which is the reader the installation card uses.
 *
 * ADR 0002 asks for three things that are one thing: a written spec (`docs/skill-spec.md`), a
 * checker that can be run on its own, and a skill that tells an outside tool how to write to the
 * spec and how to run the checker. This file is the middle one, and it is thin on purpose —
 * everything it knows comes from `inspect()`, so a skill that passes here is read the same way
 * when Forge shows the card. A second implementation would drift, and the drift would always be
 * in the direction of passing something the real reader refuses.
 *
 *   node src/main/remote/agent/check.ts skills/deploy/SKILL.md --allow ls,cat,docker,git
 *
 * `--allow` is how the author's terminal learns what the operator's installation grants. Without
 * it the commands are still listed, but nothing is called unlisted — a checker that flags `ls`
 * because it was run outside the app teaches authors to ignore it.
 *
 * The import below carries its `.ts` on purpose: this file is run by `node` directly, without a
 * bundler, and Node resolves what is written.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { RemoteCommandSet } from "../../../shared/remoteAgent";
import { inspect, type Inspection } from "./inspect.ts";

export type CheckKind = "skill" | "prompt" | "extension";

/** What the file is, from where Pi would have found it. */
export function kindOf(file: string): CheckKind {
  const name = path.basename(file);
  if (/\.ts$/i.test(name)) return "extension";
  if (/^SKILL\.md$/i.test(name)) return "skill";
  if (/\.md$/i.test(name)) return path.basename(path.dirname(file)) === "prompts" ? "prompt" : "skill";
  throw new Error(`${name} is not a SKILL.md, a .md or a .ts.`);
}

export type CheckOptions = {
  /** Commands the installation grants, as `--allow` gave them. Absent means "not checked". */
  allow?: string[];
};

const HEADING: Record<Inspection["findings"][number]["kind"], string> = {
  command: "Commands it uses",
  "unlisted-command": "Commands not on the allowlist",
  import: "What reaches this machine",
  url: "Places outside it refers to",
  tool: "Tools it adds",
};

/**
 * What the author reads in their terminal.
 *
 * The same facts the card shows, in the order a person acts on them: what needs a decision
 * first, then what is merely worth knowing. Line numbers are kept — a finding nobody can go and
 * look at is a finding nobody can answer.
 */
export function report(
  file: string,
  kind: CheckKind,
  found: Inspection,
  options: CheckOptions = {},
): string {
  const label = { skill: "Skill", prompt: "Prompt", extension: "Extension" }[kind];
  const lines = [`${label}: ${file}`, ""];

  const decide = found.findings.filter((each) => needsDecision(kind, each.kind, options));
  const know = found.findings.filter((each) => !needsDecision(kind, each.kind, options));

  const write = (title: string, group: typeof found.findings) => {
    if (!group.length) return;
    lines.push(title);
    for (const each of group) {
      const where = each.line ? `line ${each.line} ` : "";
      lines.push(`  ${where}${each.what}${each.note ? ` — ${each.note}` : ""}`);
    }
    lines.push("");
  };

  write("Needs a person to decide", decide);
  for (const kindOfFinding of Object.keys(HEADING) as Array<keyof typeof HEADING>) {
    write(HEADING[kindOfFinding], know.filter((each) => each.kind === kindOfFinding));
  }

  if (!options.allow) {
    lines.push(
      "No allowlist was given. To check against one, pass it as --allow ls,cat,docker.",
      "",
    );
  }

  lines.push(
    decide.length
      ? `Verdict: ${decide.length} item(s) need a person to decide.`
      : "Verdict: nothing here for the mechanical check to stop on.",
    /* The line that stops this from being read as a safety certificate. */
    "This check is not what stops anything from running. What stops things is the allowlist, the\n"
      + "approvals and the record, at the time it runs; this only reads the file beforehand.",
  );
  return lines.join("\n");
}

/**
 * Findings a person has to answer, as against findings that are only worth knowing.
 *
 * A URL in a skill is where the runbook lives; a URL in an extension is somewhere code can send
 * what it has read. Same string, different question, so the file's kind decides. An unlisted
 * command is a decision only when an allowlist was actually given — without one, every command
 * is "unlisted" and the word means nothing.
 */
function needsDecision(
  kind: CheckKind,
  finding: Inspection["findings"][number]["kind"],
  options: CheckOptions,
) {
  if (finding === "unlisted-command") return Boolean(options.allow);
  if (kind !== "extension") return false;
  return finding === "import" || finding === "url";
}

/** Non-zero when something is waiting for a person, so a script can gate on it. */
export function exitCode(kind: CheckKind, found: Inspection, options: CheckOptions) {
  return found.findings.some((each) => needsDecision(kind, each.kind, options)) ? 1 : 0;
}

export function parseArgs(argv: string[]) {
  const args = [...argv];
  let allow: string[] | undefined;
  const files: string[] = [];
  while (args.length) {
    const arg = args.shift() as string;
    if (arg === "--allow") {
      const value = args.shift();
      if (!value) throw new Error("Give --allow a comma-separated list of command names.");
      allow = value.split(/[\s,]+/).filter(Boolean);
    } else if (arg.startsWith("--allow=")) {
      allow = arg.slice("--allow=".length).split(/[\s,]+/).filter(Boolean);
    } else if (arg.startsWith("-")) {
      throw new Error(`${arg} is not an option this knows.`);
    } else {
      files.push(arg);
    }
  }
  if (files.length !== 1) throw new Error("Give it exactly one file to check.");
  return { file: files[0], allow };
}

async function main(argv: string[]) {
  const { file, allow } = parseArgs(argv);
  const kind = kindOf(file);
  const content = await fs.readFile(file, "utf8");
  /* One set, named for where it came from: the operator's installation is not here to be read. */
  const sets: RemoteCommandSet[] = allow
    ? [{ id: "cli", name: "--allow", allow, allowSudo: false }]
    : [];
  const found = inspect(kind, content, sets);
  process.stdout.write(`${report(file, kind, found, { allow })}\n`);
  process.exitCode = exitCode(kind, found, { allow });
}

/* Run only when this file is the program, so the tests can import the pieces. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((cause: unknown) => {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 2;
  });
}
