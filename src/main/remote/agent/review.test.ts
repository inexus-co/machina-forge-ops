import { describe, expect, it } from "vitest";
import type { RemoteCommandSet } from "../../../shared/remoteAgent";
import { inspect } from "./inspect";
import { parseReview, reviewPrompt } from "./review";

/**
 * The reading a model gives a file before it is installed.
 *
 * The interesting behaviour is what happens when the model is wrong, lazy or being played:
 * a reply that is not JSON must fail loudly rather than show an empty card, and the file being
 * read must be presented as material rather than as instructions.
 */

const SETS: RemoteCommandSet[] = [
  { id: "s", name: "Read only", allow: ["ls", "cat", "docker"], allowSudo: false },
];

const SKILL = `---
name: deploy
description: update it and swap it in
commands: [docker, systemctl]
---

The steps are in the body.
`;

describe("what a model makes of it", () => {
  it("the text goes as material, alongside what the mechanical check found", () => {
    const prompt = reviewPrompt("skill", SKILL, SETS, inspect("skill", SKILL, SETS));
    expect(prompt).toContain("Kind: Skill");
    expect(prompt).toContain("The allowlist on this machine: cat docker ls");
    expect(prompt).toContain("Of those, not on the allowlist: systemctl");
    /* The text is fenced. Where the material stops has to be unambiguous, or it reads as
       instruction. */
    expect(prompt).toContain("<<<material begins");
    expect(prompt).toContain("material ends>>>");
  });

  it("text too long is cut, and it says it was cut", () => {
    const long = `${SKILL}\n${"x".repeat(60_000)}`;
    const prompt = reviewPrompt("skill", long, SETS, inspect("skill", long, SETS));
    expect(prompt).toContain("the rest was not sent");
    expect(prompt.length).toBeLessThan(45_000);
  });

  it("the JSON is taken out of its fence", () => {
    const said = ["I had a look.", "```json", '{"summary":"It updates it and swaps it in","concerns":[]}', "```"].join(
      "\n",
    );
    expect(parseReview(said)).toEqual({ summary: "It updates it and swaps it in", concerns: [] });
  });

  it("a concern arrives as a what and a why; an empty one is dropped", () => {
    const said = JSON.stringify({
      summary: "a deployment",
      concerns: [
        { what: "systemctl restart", why: "the service goes down" },
        { what: "", why: "this one has no name" },
      ],
    });
    expect(parseReview(said).concerns).toEqual([
      { what: "systemctl restart", why: "the service goes down" },
    ]);
  });

  it("an unreadable answer is a failure, not an empty result", () => {
    /* An empty card reads as "nothing was found", which is the worst thing it could say. */
    expect(() => parseReview("It looks fine to me.")).toThrow();
    expect(() => parseReview("{broken")).toThrow();
    expect(() => parseReview(JSON.stringify({ concerns: [] }))).toThrow();
  });
});
