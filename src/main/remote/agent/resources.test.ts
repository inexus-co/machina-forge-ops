import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../../../shared/i18n";
import {
  checkName,
  describe as describeResource,
  importSkill,
  listResources,
  readInstructions,
  readResource,
  removeResource,
  template,
  writeInstructions,
  writeResource,
} from "./resources";

/**
 * The agent's files, in Pi's layout.
 *
 * What is worth testing is the part a person can break from a text field: a name that escapes
 * its directory, a description read from frontmatter that is not there, and a skill whose folder
 * has to go with it.
 */

let root = "";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "machina-res-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

setLocale("en");

describe("the agent's files", () => {
  it("a skill is written where Pi looks for it", async () => {
    await writeResource(root, "skill", "disk-full", template("skill", "disk-full"));
    const file = path.join(root, "agent", "skills", "disk-full", "SKILL.md");
    expect((await fs.stat(file)).isFile()).toBe(true);

    const list = await listResources(root, "skill");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "disk-full", kind: "skill" });
    expect(list[0].description).toContain("When to use it");
  });

  it("a prompt and an extension are one file each", async () => {
    await writeResource(root, "prompt", "review", template("prompt", "review"));
    await writeResource(root, "extension", "audit", template("extension", "audit"));
    expect((await fs.stat(path.join(root, "agent", "prompts", "review.md"))).isFile()).toBe(true);
    expect((await fs.stat(path.join(root, "agent", "extensions", "audit.ts"))).isFile()).toBe(true);
    expect((await listResources(root, "prompt")).map((each) => each.name)).toEqual(["review"]);
    expect((await listResources(root, "extension")).map((each) => each.name)).toEqual(["audit"]);
  });

  it("a directory with no SKILL.md is not listed", async () => {
    await fs.mkdir(path.join(root, "agent", "skills", "half-done"), { recursive: true });
    expect(await listResources(root, "skill")).toEqual([]);
  });

  it("deleting a skill takes what is inside it too", async () => {
    await writeResource(root, "skill", "disk-full", template("skill", "disk-full"));
    const scripts = path.join(root, "agent", "skills", "disk-full", "scripts");
    await fs.mkdir(scripts, { recursive: true });
    await fs.writeFile(path.join(scripts, "look.sh"), "df -h\n", "utf8");

    expect(await removeResource(root, "skill", "disk-full")).toEqual([]);
    await expect(fs.stat(path.join(root, "agent", "skills", "disk-full"))).rejects.toThrow();
  });

  it("a name that reaches out of the directory is refused", async () => {
    /* The last one is a name in another script: Pi looks for the file under this name. */
    for (const bad of ["../escape", "a/b", ".hidden", "", "名前"]) {
      expect(() => checkName(bad)).toThrow();
    }
    await expect(writeResource(root, "prompt", "../escape", "x")).rejects.toThrow();
    expect(checkName("disk-full_2.1")).toBe("disk-full_2.1");
  });

  it("the description comes from the frontmatter, or from the first line", () => {
    expect(describeResource("---\nname: a\ndescription: how to look at a disk\n---\n\n# a\n")).toBe(
      "how to look at a disk",
    );
    expect(describeResource("# A heading\n\nthe body\n")).toBe("A heading");
    expect(describeResource("")).toBe("");
  });

  it("a skill that exists already is brought in whole, scripts and all", async () => {
    const from = path.join(root, "somewhere", "disk-full");
    await fs.mkdir(path.join(from, "scripts"), { recursive: true });
    await fs.writeFile(
      path.join(from, "SKILL.md"),
      "---\nname: disk-full\ndescription: what to look at when a disk fills up\ngoal: Find out what is filling the disk\n---\n\n1. df -h\n",
      "utf8",
    );
    await fs.writeFile(path.join(from, "scripts", "top.sh"), "#!/bin/sh\ndu -sh /*\n", "utf8");

    const name = await importSkill(root, from);
    expect(name).toBe("disk-full");

    const list = await listResources(root, "skill");
    expect(list.map((each) => each.name)).toEqual(["disk-full"]);
    expect(list[0].goal).toBe("Find out what is filling the disk");
    /* The folder came with it: a skill whose scripts were left behind fails on its first run. */
    expect(await fs.readFile(path.join(root, "agent", "skills", "disk-full", "scripts", "top.sh"), "utf8"))
      .toContain("du -sh");
  });

  it("a single SKILL.md is taken by the name it declares, not the one on the file", async () => {
    const file = path.join(root, "whatever.md");
    await fs.writeFile(file, "---\nname: nginx-502\ndescription: 502s\n---\n\nLook upstream.\n", "utf8");
    expect(await importSkill(root, file)).toBe("nginx-502");
    expect((await listResources(root, "skill")).map((each) => each.name)).toEqual(["nginx-502"]);
  });

  it("with no name declared, the file's own name is used — and still has to be a name", async () => {
    const file = path.join(root, "morning-check.md");
    await fs.writeFile(file, "# Morning check\n\nHave a look.\n", "utf8");
    expect(await importSkill(root, file)).toBe("morning-check");

    const bad = path.join(root, "名前.md");
    await fs.writeFile(bad, "# a skill\n", "utf8");
    await expect(importSkill(root, bad)).rejects.toThrow();
  });

  it("the instructions are one file, and an empty one is removed", async () => {
    expect(await readInstructions(root)).toBe("");
    await writeInstructions(root, "  Answer in plain sentences.  ");
    expect(await readInstructions(root)).toBe("Answer in plain sentences.\n");
    await writeInstructions(root, "   ");
    expect(await readInstructions(root)).toBe("");
    await expect(fs.stat(path.join(root, "agent", "AGENTS.md"))).rejects.toThrow();
  });

  it("what was written reads back as it was", async () => {
    await writeResource(root, "prompt", "review", "---\ndescription: a look\n---\nthe body");
    expect(await readResource(root, "prompt", "review")).toBe("---\ndescription: a look\n---\nthe body\n");
  });
});
