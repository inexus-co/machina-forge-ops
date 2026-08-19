import fs from "node:fs/promises";
import path from "node:path";
import type { AgentResource, ResourceKind } from "../../../shared/remoteResources";
/* The same reading the installation card does, so the list and the card never disagree. */
import { declaredTools } from "./inspect";
import { agentDirectory, ensureAgentDirectory } from "./pi";
import { t } from "../../../shared/i18n";

/**
 * The agent's own files, read and written for the settings screen.
 *
 * Pi's layout, not ours: `skills/<name>/SKILL.md`, `prompts/<name>.md`,
 * `extensions/<name>.ts`, and `AGENTS.md` beside them. Nothing here parses a skill for the
 * agent's benefit — Pi does that — it parses only the frontmatter the list has to show.
 */

/** Where each kind lives, and what one of them is called on disk. */
const SHAPE: Record<
  ResourceKind,
  { directory: string; extension: string; inDirectory: boolean }
> = {
  skill: { directory: "skills", extension: ".md", inDirectory: true },
  prompt: { directory: "prompts", extension: ".md", inDirectory: false },
  extension: { directory: "extensions", extension: ".ts", inDirectory: false },
};

/**
 * A name that cannot leave its directory.
 *
 * These names come from a text field and become paths. Anything with a separator, a dot segment
 * or a character that is not plainly a name is refused rather than cleaned up — a "sanitised"
 * path is a path somebody has to reason about later.
 */
export function checkName(name: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(name) || name.includes("..")) {
    throw new Error(
      t(
        "A name may use letters, digits and - _ . only, up to 63 characters (Pi looks for the file under this name).",
      ),
    );
  }
  return name;
}

function fileFor(root: string, kind: ResourceKind, name: string) {
  const shape = SHAPE[kind];
  checkName(name);
  return shape.inDirectory
    ? path.join(root, shape.directory, name, "SKILL.md")
    : path.join(root, shape.directory, `${name}${shape.extension}`);
}

/**
 * The frontmatter's description, or the first line that says anything.
 *
 * The same fallback Pi documents for prompt templates, applied to all three: a file somebody
 * wrote in a hurry still shows something useful in the list.
 */
export function describe(content: string): string {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (match) {
    const line = match[1]
      .split("\n")
      .find((each) => /^description\s*:/.test(each.trim()));
    if (line) {
      return line
        .slice(line.indexOf(":") + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  }
  const body = match ? content.slice(match[0].length) : content;
  const first = body
    .split("\n")
    .map((line) => line.replace(/^[#/*\s]+/, "").trim())
    .find((line) => line.length > 0);
  return first ?? "";
}

/**
 * The one line a skill puts in the message box when it is picked.
 *
 * A skill is knowledge, and `goal:` is what asking for that knowledge looks like: "Look into the
 * 5xx errors on this site". Written in the frontmatter beside the description, it turns the skill
 * into something the operator can start with one press — the ＋ menu is this application's command
 * list. A skill without one is still a skill; it simply is not offered as a command.
 */
export function goalOf(content: string): string | undefined {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!match) return undefined;
  const line = match[1].split("\n").find((each) => /^goal\s*:/.test(each.trim()));
  if (!line) return undefined;
  const text = line
    .slice(line.indexOf(":") + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
  return text || undefined;
}

export async function listResources(
  userDataRoot: string,
  kind: ResourceKind,
): Promise<AgentResource[]> {
  const root = await ensureAgentDirectory(userDataRoot);
  const shape = SHAPE[kind];
  const directory = path.join(root, shape.directory);
  const found: AgentResource[] = [];

  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const name = shape.inDirectory
      ? entry.name
      : entry.name.endsWith(shape.extension)
        ? entry.name.slice(0, -shape.extension.length)
        : undefined;
    if (!name) continue;
    if (shape.inDirectory !== entry.isDirectory()) continue;

    const file = shape.inDirectory
      ? path.join(directory, entry.name, "SKILL.md")
      : path.join(directory, entry.name);
    try {
      const [content, stat] = await Promise.all([
        fs.readFile(file, "utf8"),
        fs.stat(shape.inDirectory ? path.join(directory, entry.name) : file),
      ]);
      found.push({
        kind,
        name,
        description: describe(content),
        ...(kind === "skill" && goalOf(content) ? { goal: goalOf(content) } : {}),
        ...(kind === "extension" ? { tools: declaredTools(content) } : {}),
        path: file,
        size: await sizeOf(shape.inDirectory ? path.join(directory, entry.name) : file),
        updatedAt: stat.mtime.toISOString(),
      });
    } catch {
      // A directory without a SKILL.md is not a skill; Pi ignores it and so does this list.
    }
  }

  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/** A skill is a folder — its scripts and references count towards what it weighs. */
async function sizeOf(target: string): Promise<number> {
  const stat = await fs.stat(target);
  if (!stat.isDirectory()) return stat.size;
  let total = 0;
  for (const entry of await fs.readdir(target, { withFileTypes: true })) {
    total += await sizeOf(path.join(target, entry.name));
  }
  return total;
}

export async function readResource(userDataRoot: string, kind: ResourceKind, name: string) {
  const root = await ensureAgentDirectory(userDataRoot);
  return await fs.readFile(fileFor(root, kind, name), "utf8");
}

export async function writeResource(
  userDataRoot: string,
  kind: ResourceKind,
  name: string,
  content: string,
) {
  const root = await ensureAgentDirectory(userDataRoot);
  const file = fileFor(root, kind, name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  /* A new one starts from the template rather than from nothing: an empty SKILL.md is a skill
     Pi will warn about, and an empty file is not what "create" means. */
  const text = content.trim() ? content : template(kind, name);
  await fs.writeFile(file, text.endsWith("\n") ? text : `${text}\n`, "utf8");
  return await listResources(userDataRoot, kind);
}

/**
 * A skill that already exists somewhere on this machine, brought in as it is.
 *
 * Two shapes, because skills come in two: a single `SKILL.md`, and a folder holding one beside
 * its scripts and references. A folder is copied whole — a skill whose `scripts/` was left behind
 * is a skill that fails on its first run.
 *
 * The name comes from the frontmatter when it says one, and from the file or folder otherwise;
 * either way it goes through `checkName`, because it becomes a directory here. Nothing is
 * executed and nothing is fetched: this is a copy.
 */
export async function importSkill(userDataRoot: string, from: string): Promise<string> {
  const stat = await fs.stat(from);
  const source = stat.isDirectory() ? path.join(from, "SKILL.md") : from;
  const content = await fs.readFile(source, "utf8").catch(() => {
    throw new Error(t("There is no SKILL.md in that folder."));
  });

  const declared = /^---\n([\s\S]*?)\n---/.exec(content)?.[1]
    ?.split("\n")
    .find((line) => /^name\s*:/.test(line.trim()))
    ?.split(":")
    .slice(1)
    .join(":")
    .trim()
    .replace(/^["']|["']$/g, "");
  const fallback = stat.isDirectory() ? path.basename(from) : path.basename(from, path.extname(from));
  const name = checkName(declared || fallback);

  await writeResource(userDataRoot, "skill", name, content);

  if (stat.isDirectory()) {
    /* Everything beside it: scripts, references, whatever the author put there. `SKILL.md` is
       written above rather than copied, so what lands is what was read and checked. */
    const to = path.join(agentDirectory(userDataRoot), "skills", name);
    for (const entry of await fs.readdir(from, { withFileTypes: true })) {
      if (entry.name === "SKILL.md") continue;
      await fs.cp(path.join(from, entry.name), path.join(to, entry.name), {
        recursive: true,
        force: true,
      });
    }
  }
  return name;
}

export async function removeResource(userDataRoot: string, kind: ResourceKind, name: string) {
  const root = await ensureAgentDirectory(userDataRoot);
  const file = fileFor(root, kind, name);
  // A skill takes its folder with it; the other two are one file each.
  const target = SHAPE[kind].inDirectory ? path.dirname(file) : file;
  await fs.rm(target, { recursive: true, force: true });
  return await listResources(userDataRoot, kind);
}

export function resourcePath(userDataRoot: string, kind: ResourceKind, name: string) {
  return fileFor(agentDirectory(userDataRoot), kind, name);
}

/** The always-on instruction. One file, named by Pi's convention. */
export function instructionsPath(userDataRoot: string) {
  return path.join(agentDirectory(userDataRoot), "AGENTS.md");
}

export async function readInstructions(userDataRoot: string) {
  await ensureAgentDirectory(userDataRoot);
  try {
    return await fs.readFile(instructionsPath(userDataRoot), "utf8");
  } catch {
    return "";
  }
}

export async function writeInstructions(userDataRoot: string, content: string) {
  await ensureAgentDirectory(userDataRoot);
  const text = content.trim();
  if (!text) {
    // Empty means none: an empty AGENTS.md is still a context file Pi loads and shows.
    await fs.rm(instructionsPath(userDataRoot), { force: true });
    return;
  }
  await fs.writeFile(instructionsPath(userDataRoot), `${text}\n`, "utf8");
}

/** What a new one starts as. Enough of the shape that the first save is already valid. */
export function template(kind: ResourceKind, name: string) {
  if (kind === "skill") {
    return [
      "---",
      `name: ${name}`,
      `description: ${t("When to use it and what it does. The agent reads this line to choose.")}`,
      `goal: ${t("What to ask for when this is picked from the ＋ menu. Leave it out and it is knowledge only.")}`,
      "---",
      "",
      `# ${name}`,
      "",
      `## ${t("Steps")}`,
      "",
      "1. ",
      "",
    ].join("\n");
  }
  if (kind === "prompt") {
    return [
      "---",
      `description: ${t("What this prompt does")}`,
      "---",
      "",
      "",
    ].join("\n");
  }
  return [
    "// @tools",
    `//   ${t("Name here the tools this extension registers, separated by spaces.")}`,
    `//   ${t("For example: // @tools recall remember")}`,
    `//   ${t("Only the names written here reach the agent, and only once the settings allow them.")}`,
    "",
    'import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";',
    "",
    `/** ${t("Steps in at the points of a run. The events you can use are in Pi's docs/extensions.md.")} */`,
    "export default function (pi: ExtensionAPI) {",
    '  pi.on("tool_call", async (event, ctx) => {',
    `    // ${t("For example: keep a record, or stop the run when something holds")}`,
    "  });",
    "",
    `  // ${t("To reach an outside service, register a tool here.")}`,
    "  // pi.registerTool({ name: \"recall\", ... });",
    "}",
    "",
  ].join("\n");
}

