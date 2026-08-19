import { describe, expect, it } from "vitest";
import { exitCode, kindOf, parseArgs, report } from "./check";
import { inspect } from "./inspect";

/**
 * The checker as an author meets it: a terminal, an exit code, and a file they are writing.
 *
 * What matters here is that it tells the truth about what it did *not* check. Run without an
 * allowlist it cannot say a command is unlisted, and a checker that claims a clean bill it has
 * no basis for is worse than no checker.
 */

const SKILL = `---
name: deploy
description: update the application
commands: [git, docker, systemctl]
---

The steps are in the body.
`;

describe("the check command", () => {
  it("where the file sits decides what is being checked", () => {
    expect(kindOf("skills/deploy/SKILL.md")).toBe("skill");
    expect(kindOf("extensions/tickets.ts")).toBe("extension");
    expect(kindOf("prompts/morning-check.md")).toBe("prompt");
    expect(() => kindOf("README.txt")).toThrow();
  });

  it("given an allowlist, it names what is missing from it and exits non-zero", () => {
    const allow = ["git", "docker"];
    const found = inspect("skill", SKILL, [
      { id: "cli", name: "--allow", allow, allowSudo: false },
    ]);
    const text = report("SKILL.md", "skill", found, { allow });
    expect(text).toContain("Needs a person to decide");
    expect(text).toContain("systemctl");
    expect(exitCode("skill", found, { allow })).toBe(1);
  });

  it("with no allowlist it says it did not check against one, and does not fail", () => {
    const found = inspect("skill", SKILL, []);
    const text = report("SKILL.md", "skill", found, {});
    expect(text).toContain("No allowlist was given");
    /* Everything counts as "not on the allowlist", and none of it is offered as a reason to stop. */
    expect(text).not.toContain("Needs a person to decide");
    expect(exitCode("skill", found, {})).toBe(0);
  });

  it("an extension that reaches outside asks a person, allowlist or not", () => {
    const extension = `// @tools lookup_ticket
import { fetch } from "node:https";
export function register() {}
`;
    const found = inspect("extension", extension, []);
    expect(report("tickets.ts", "extension", found, {})).toContain("It goes out to the network");
    expect(exitCode("extension", found, {})).toBe(1);
  });

  it("a URL in a skill is a reference; a URL in an extension is somewhere it can send", () => {
    const skill = `${SKILL}\nSee https://runbook.internal/deploy for the details.\n`;
    const found = inspect("skill", skill, []);
    /* Stopping an author over a page their runbook points at gives them nothing to do. */
    expect(exitCode("skill", found, {})).toBe(0);
    expect(report("SKILL.md", "skill", found, {})).toContain("runbook.internal");
  });

  it("it says every time that it is not what stops anything", () => {
    const found = inspect("skill", SKILL, []);
    expect(report("SKILL.md", "skill", found, {})).toContain("not what stops anything from running");
  });

  it("it reads its arguments", () => {
    expect(parseArgs(["a/SKILL.md", "--allow", "ls,cat"])).toEqual({
      file: "a/SKILL.md",
      allow: ["ls", "cat"],
    });
    expect(parseArgs(["--allow=ls cat", "a/SKILL.md"]).allow).toEqual(["ls", "cat"]);
    expect(() => parseArgs([])).toThrow();
    expect(() => parseArgs(["a", "b"])).toThrow();
  });
});
