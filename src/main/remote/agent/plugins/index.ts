import fs from "node:fs/promises";
import path from "node:path";
import { t } from "../../../../shared/i18n";
import type { BuiltinPlugin, PluginView } from "../../../../shared/remotePlugins";
import { agentDirectory } from "../pi";
import {
  checkName,
  describe,
  goalOf,
  listResources,
  removeResource,
  writeResource,
} from "../resources";
import { PLUGINS } from "./catalog";

/**
 * Installing, listing and removing plugins — over the same skill files the settings screen edits.
 *
 * A plugin is nothing new on disk: it is a set of skills written to `skills/<name>/SKILL.md`. So
 * install writes them, remove deletes them, and "installed" is just whether they are all there.
 * Kept free of Electron so it can be tested against a temp directory.
 *
 * Two kinds, one list. The ones that ship are compiled into the build; the ones the operator adds
 * from a folder are copied — skills and all — into `<userData>/agent/plugins/<id>.json`, so a
 * plugin keeps working after the folder it came from is moved, renamed or deleted. Nothing is
 * fetched, at either time.
 */

export { PLUGINS };

/** How much of a folder is read. A plugin is text; anything this size is not a plugin. */
const MOST_SKILLS = 40;
const MOST_SKILL_BYTES = 200_000;

const pluginsDirectory = (userDataRoot: string) => path.join(agentDirectory(userDataRoot), "plugins");

/** The manifest read back with everything needed to install it again. */
async function added(userDataRoot: string): Promise<BuiltinPlugin[]> {
  const directory = pluginsDirectory(userDataRoot);
  let names: string[] = [];
  try {
    names = (await fs.readdir(directory)).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  const found: BuiltinPlugin[] = [];
  for (const name of names) {
    try {
      const raw = JSON.parse(await fs.readFile(path.join(directory, name), "utf8"));
      const plugin = asPlugin(raw);
      if (plugin) found.push(plugin);
    } catch {
      /* A manifest somebody edited into something unreadable is skipped, not fatal: the rest of
         the list is still worth showing. */
    }
  }
  return found;
}

/** Whatever came off disk, if it has the shape of a plugin. */
function asPlugin(raw: unknown): BuiltinPlugin | undefined {
  const value = raw as Partial<BuiltinPlugin> | null;
  if (!value || typeof value.id !== "string" || typeof value.name !== "string") return undefined;
  if (!Array.isArray(value.skills) || value.skills.length === 0) return undefined;
  const skills = value.skills.flatMap((skill) =>
    skill && typeof skill.name === "string" && typeof skill.body === "string"
      ? [
          {
            name: skill.name,
            description: typeof skill.description === "string" ? skill.description : "",
            ...(typeof skill.goal === "string" && skill.goal ? { goal: skill.goal } : {}),
            body: skill.body,
          },
        ]
      : [],
  );
  if (skills.length === 0) return undefined;
  return {
    id: value.id,
    name: value.name,
    summary: typeof value.summary === "string" ? value.summary : "",
    stack: Array.isArray(value.stack) ? value.stack.filter((word) => typeof word === "string") : [],
    skills,
  };
}

async function all(userDataRoot: string): Promise<BuiltinPlugin[]> {
  return [...PLUGINS, ...(await added(userDataRoot))];
}

async function plugin(userDataRoot: string, id: string): Promise<BuiltinPlugin> {
  const found = (await all(userDataRoot)).find((each) => each.id === id);
  if (!found) throw new Error(t("There is no plugin called {id}.", { id }));
  return found;
}

/**
 * The plugins, each with what this machine and this server make of it.
 *
 * `installed` is true when every one of a plugin's skills is present. `suggested` is true when the
 * server's last-collected facts name something in the plugin's stack — lower-cased substring match,
 * which is enough for service names and container images and asks nothing of the model. With no
 * facts summary (no run yet, or a screen-only server) nothing is suggested.
 */
export async function listPlugins(userDataRoot: string, factsSummary?: string): Promise<PluginView[]> {
  const present = new Set((await listResources(userDataRoot, "skill")).map((each) => each.name));
  const haystack = (factsSummary ?? "").toLowerCase();
  const shipped = new Set(PLUGINS.map((each) => each.id));
  return (await all(userDataRoot)).map((each) => ({
    id: each.id,
    name: each.name,
    summary: each.summary,
    skills: each.skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      ...(skill.goal ? { goal: skill.goal } : {}),
    })),
    installed: each.skills.every((skill) => present.has(skill.name)),
    suggested: haystack.length > 0 && each.stack.some((word) => haystack.includes(word.toLowerCase())),
    /* What the row may offer: a shipped plugin cannot be forgotten, only uninstalled. */
    ...(shipped.has(each.id) ? {} : { added: true }),
  }));
}

/** Write the plugin's skills, overwriting any of the same name. Returns the refreshed list. */
export async function installPlugin(userDataRoot: string, id: string): Promise<PluginView[]> {
  for (const skill of (await plugin(userDataRoot, id)).skills) {
    await writeResource(userDataRoot, "skill", skill.name, skill.body);
  }
  return await listPlugins(userDataRoot);
}

/**
 * Remove only the skills this plugin owns.
 *
 * A skill absent already is not an error (force). Skills the operator wrote are never touched —
 * only the exact names the plugin declares are removed.
 */
export async function removePlugin(userDataRoot: string, id: string): Promise<PluginView[]> {
  const present = new Set((await listResources(userDataRoot, "skill")).map((each) => each.name));
  for (const skill of (await plugin(userDataRoot, id)).skills) {
    if (present.has(skill.name)) await removeResource(userDataRoot, "skill", skill.name);
  }
  return await listPlugins(userDataRoot);
}

/**
 * A folder on this machine, read as a plugin.
 *
 * The shape is the one it installs: a `plugin.json` saying what it is, and a `skills/` folder of
 * `<name>/SKILL.md`. Nothing is fetched and nothing is run — every file here is text that ends up
 * in front of a model, and the operator sees what it contains before it goes in.
 *
 * Read, not copied: this returns what was found so the window can show it. `addPlugin` is what
 * writes it down.
 */
export async function readPluginFolder(folder: string): Promise<BuiltinPlugin> {
  let manifest: Record<string, unknown> = {};
  try {
    manifest = JSON.parse(await fs.readFile(path.join(folder, "plugin.json"), "utf8"));
  } catch {
    throw new Error(t("This folder has no plugin.json."));
  }
  const id = String(manifest["id"] ?? path.basename(folder));
  checkName(id);
  if (PLUGINS.some((each) => each.id === id)) {
    throw new Error(t("A plugin that ships with the application is already called {id}.", { id }));
  }

  const skillsDirectory = path.join(folder, "skills");
  let entries: string[] = [];
  try {
    entries = (await fs.readdir(skillsDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    throw new Error(t("This folder has no skills directory."));
  }
  if (entries.length === 0) throw new Error(t("There is not one skill in this folder."));
  if (entries.length > MOST_SKILLS) {
    throw new Error(t("A plugin may hold up to {count} skills.", { count: MOST_SKILLS }));
  }

  const skills: BuiltinPlugin["skills"] = [];
  for (const name of entries.sort()) {
    checkName(name);
    const file = path.join(skillsDirectory, name, "SKILL.md");
    const stat = await fs.stat(file).catch(() => undefined);
    if (!stat?.isFile()) throw new Error(t("{name} has no SKILL.md.", { name }));
    if (stat.size > MOST_SKILL_BYTES) {
      throw new Error(t("{name} is too large to read as a skill.", { name }));
    }
    const body = await fs.readFile(file, "utf8");
    const goal = goalOf(body);
    skills.push({ name, description: describe(body), ...(goal ? { goal } : {}), body });
  }

  return {
    id,
    name: String(manifest["name"] ?? id),
    summary: String(manifest["summary"] ?? ""),
    stack: Array.isArray(manifest["stack"])
      ? (manifest["stack"] as unknown[]).filter((word): word is string => typeof word === "string")
      : [],
    skills,
  };
}

/**
 * Write the plugin down, so it survives the folder it came from.
 *
 * Its skills are copied into the manifest rather than referenced: a plugin whose source folder was
 * on a memory stick would otherwise be a row that fails when it is pressed.
 */
export async function addPlugin(userDataRoot: string, plugin: BuiltinPlugin): Promise<PluginView[]> {
  const directory = pluginsDirectory(userDataRoot);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, `${checkName(plugin.id)}.json`),
    `${JSON.stringify(plugin, null, 2)}\n`,
    "utf8",
  );
  return await listPlugins(userDataRoot);
}

/**
 * Forget a plugin the operator added: its skills go, and so does the manifest.
 *
 * The skills go because leaving them would leave a set of files nobody can now name — the row
 * that knew what they were is what is being deleted.
 */
export async function forgetPlugin(userDataRoot: string, id: string): Promise<PluginView[]> {
  if (PLUGINS.some((each) => each.id === id)) {
    throw new Error(t("A plugin that ships with the application cannot be forgotten."));
  }
  await removePlugin(userDataRoot, id);
  await fs.rm(path.join(pluginsDirectory(userDataRoot), `${checkName(id)}.json`), { force: true });
  return await listPlugins(userDataRoot);
}
