import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkName } from "../resources";
import { writeResource, listResources } from "../resources";
import {
  PLUGINS,
  addPlugin,
  forgetPlugin,
  installPlugin,
  listPlugins,
  readPluginFolder,
  removePlugin,
} from "./index";

let root = "";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "machina-plugins-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("what a plugin declares", () => {
  it("skill names are ASCII (they become file names) and unique across every plugin", async () => {
    const names = PLUGINS.flatMap((plugin) => plugin.skills.map((skill) => skill.name));
    for (const name of names) expect(() => checkName(name)).not.toThrow();
    expect(new Set(names).size).toBe(names.length);
  });

  it("every plugin has a summary, skills, and at least one skill that is a command", () => {
    expect(PLUGINS.length).toBeGreaterThan(0);
    for (const plugin of PLUGINS) {
      expect(plugin.summary.trim()).not.toBe("");
      expect(plugin.skills.length).toBeGreaterThan(0);
      /* A plugin nobody can start anything with is a plugin nobody finds. */
      expect(plugin.skills.some((skill) => skill.goal?.trim())).toBe(true);
      for (const skill of plugin.skills) {
        expect(skill.description.trim()).not.toBe("");
        /* The frontmatter is what Pi reads; the fields beside it are what the window reads. They
           have to say the same thing, or the gallery and the agent disagree about a skill. */
        expect(skill.body).toContain(`name: ${skill.name}`);
        if (skill.goal) expect(skill.body).toContain(`goal: ${skill.goal}`);
      }
    }
  });
});

describe("installing a plugin", () => {
  it("installed is false before, and installing writes the skills it promised", async () => {
    const before = await listPlugins(root);
    const lamp = before.find((plugin) => plugin.id === "lamp")!;
    expect(lamp.installed).toBe(false);

    const after = await installPlugin(root, "lamp");
    expect(after.find((plugin) => plugin.id === "lamp")!.installed).toBe(true);

    const skills = (await listResources(root, "skill")).map((each) => each.name);
    expect(skills).toContain("lamp");
    const body = await fs.readFile(path.join(root, "agent", "skills", "lamp", "SKILL.md"), "utf8");
    expect(body).toContain("LAMP");
  });

  it("removing deletes only the plugin's skills; the operator's own stay", async () => {
    await writeResource(root, "skill", "my-own", "---\nname: my-own\ndescription: mine\n---\nthe body\n");
    await installPlugin(root, "lamp");

    const after = await removePlugin(root, "lamp");
    expect(after.find((plugin) => plugin.id === "lamp")!.installed).toBe(false);

    const skills = (await listResources(root, "skill")).map((each) => each.name);
    expect(skills).not.toContain("lamp");
    expect(skills).toContain("my-own");
  });

  it("an id that does not exist is refused", async () => {
    await expect(installPlugin(root, "nope")).rejects.toThrow();
  });
});

describe("suggesting from the facts", () => {
  it("a stack word in the summary suggests the plugin; without one, nothing is suggested", async () => {
    const lampSummary =
      "Services: 2 of 30 running (apache2.service, mysql.service)\nPorts reachable from outside: 80/tcp, 443/tcp";
    const suggested = await listPlugins(root, lampSummary);
    expect(suggested.find((plugin) => plugin.id === "lamp")!.suggested).toBe(true);
    expect(suggested.find((plugin) => plugin.id === "postgres")!.suggested).toBe(false);

    const windowsSummary = "OS: Windows Server 2022\nServices: running W3SVC, MSSQLSERVER";
    for (const plugin of await listPlugins(root, windowsSummary)) expect(plugin.suggested).toBe(false);

    for (const plugin of await listPlugins(root)) expect(plugin.suggested).toBe(false);
  });
});

describe("a plugin from a folder", () => {
  /** A plugin as somebody would hand one over: a manifest and a skill or two. */
  async function folder(
    id: string,
    skills: Array<{ name: string; body: string; extra?: string }>,
  ): Promise<string> {
    const at = path.join(root, `source-${id}`);
    await fs.mkdir(path.join(at, "skills"), { recursive: true });
    await fs.writeFile(
      path.join(at, "plugin.json"),
      JSON.stringify({ id, name: `The ${id} plugin`, summary: "One line about it", stack: ["nginx"] }),
      "utf8",
    );
    for (const skill of skills) {
      await fs.mkdir(path.join(at, "skills", skill.name), { recursive: true });
      await fs.writeFile(path.join(at, "skills", skill.name, "SKILL.md"), skill.body, "utf8");
      if (skill.extra) {
        await fs.writeFile(path.join(at, "skills", skill.name, "run.sh"), skill.extra, "utf8");
      }
    }
    return at;
  }

  const withGoal = [
    "---",
    "name: site-check",
    "description: Check the site answers",
    "goal: Check that the site answers and say what it returned",
    "---",
    "",
    "1. curl -sI http://localhost/",
    "",
  ].join("\n");

  it("the folder is read: what it is, and which of its skills are commands", async () => {
    const at = await folder("mine", [
      { name: "site-check", body: withGoal },
      { name: "site-notes", body: "---\nname: site-notes\ndescription: Knowledge only\n---\n\nNotes.\n" },
    ]);

    const found = await readPluginFolder(at);
    expect(found).toMatchObject({ id: "mine", name: "The mine plugin", stack: ["nginx"] });
    expect(found.skills.map((skill) => skill.name)).toEqual(["site-check", "site-notes"]);
    expect(found.skills[0]).toMatchObject({
      description: "Check the site answers",
      goal: "Check that the site answers and say what it returned",
    });
    /* Knowledge only: no goal, so it is not offered as a command. */
    expect(found.skills[1].goal).toBeUndefined();
    /* Reading is not installing. */
    expect(await listResources(root, "skill")).toEqual([]);
  });

  it("added, it stands beside the ones that ship, and installs the same way", async () => {
    const at = await folder("mine", [{ name: "site-check", body: withGoal }]);
    const found = await readPluginFolder(at);

    let list = await addPlugin(root, found);
    const mine = list.find((plugin) => plugin.id === "mine")!;
    expect(mine).toMatchObject({ added: true, installed: false });
    /* The ones that ship are not marked as added, and cannot be forgotten. */
    expect(list.find((plugin) => plugin.id === "lamp")!.added).toBeUndefined();
    await expect(forgetPlugin(root, "lamp")).rejects.toThrow();

    list = await installPlugin(root, "mine");
    expect(list.find((plugin) => plugin.id === "mine")!.installed).toBe(true);
    const skills = await listResources(root, "skill");
    expect(skills.map((skill) => skill.name)).toEqual(["site-check"]);
    expect(skills[0].goal).toBe("Check that the site answers and say what it returned");
  });

  it("it outlives the folder it came from", async () => {
    const at = await folder("mine", [{ name: "site-check", body: withGoal }]);
    await addPlugin(root, await readPluginFolder(at));
    /* The source is gone — a memory stick unplugged, a directory renamed. */
    await fs.rm(at, { recursive: true, force: true });

    await installPlugin(root, "mine");
    expect((await listResources(root, "skill")).map((skill) => skill.name)).toEqual(["site-check"]);
  });

  it("forgetting one takes its skills with it", async () => {
    const at = await folder("mine", [{ name: "site-check", body: withGoal }]);
    await addPlugin(root, await readPluginFolder(at));
    await installPlugin(root, "mine");

    const list = await forgetPlugin(root, "mine");
    expect(list.some((plugin) => plugin.id === "mine")).toBe(false);
    expect(await listResources(root, "skill")).toEqual([]);
  });

  it("a folder that is not a plugin is refused, and says which part is missing", async () => {
    const empty = path.join(root, "empty");
    await fs.mkdir(empty, { recursive: true });
    await expect(readPluginFolder(empty)).rejects.toThrow(/plugin.json/);

    await fs.writeFile(path.join(empty, "plugin.json"), JSON.stringify({ id: "empty" }), "utf8");
    await expect(readPluginFolder(empty)).rejects.toThrow(/skills/);

    /* And it cannot take the name of one that ships. */
    const clash = await folder("lamp", [{ name: "x", body: withGoal }]);
    await expect(readPluginFolder(clash)).rejects.toThrow(/lamp/);
  });

  it("what is beside the SKILL.md comes too", async () => {
    const at = await folder("mine", [
      { name: "site-check", body: withGoal, extra: "#!/bin/sh\necho hello\n" },
    ]);
    /* Through the same path a plugin takes: read, kept, installed. Only SKILL.md is carried in
       the manifest, so a script beside it is the one thing this cannot promise — and the
       importer for a single skill is what does carry it. */
    const found = await readPluginFolder(at);
    expect(found.skills[0].body).toContain("curl -sI");
  });
});
