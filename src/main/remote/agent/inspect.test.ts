import { describe, expect, it } from "vitest";
import type { RemoteCommandSet } from "../../../shared/remoteAgent";
import { inspect } from "./inspect";

/**
 * The card an operator reads before installing something.
 *
 * These tests are about what it *says*, not about what it prevents — it prevents nothing, by
 * design (ADR 0002). The valuable behaviour is that a command nobody granted is named, and that
 * an extension reaching for the network says so before it is in the folder rather than after.
 */

const SETS: RemoteCommandSet[] = [
  { id: "inspect", name: "Read only", allow: ["ls", "cat", "docker", "git"], allowSudo: false },
];

describe("the check before installing", () => {
  it("the commands it declares are checked as they stand", () => {
    const skill = `---
name: deploy
description: update the application
commands: [git, docker, systemctl]
---

The steps are in the body.
`;
    const found = inspect("skill", skill, SETS);
    expect(found.commands).toEqual(["docker", "git", "systemctl"]);
    /* Only what is missing from the allowlist is named. */
    expect(found.unlisted).toEqual(["systemctl"]);
    expect(found.findings).toContainEqual(
      expect.objectContaining({ kind: "unlisted-command", what: "systemctl" }),
    );
  });

  it("with nothing declared, the first word of each code block is taken", () => {
    const skill = `# Have a look

\`\`\`bash
df -h
docker compose ps
\`\`\`

The docker in this sentence is not taken.
`;
    const found = inspect("skill", skill, SETS);
    expect(found.commands).toEqual(["df", "docker"]);
    expect(found.unlisted).toEqual(["df"]);
    /* It says which line, too. A finding nobody can go and look at is no finding. */
    expect(found.findings.find((each) => each.what === "df")?.line).toBe(4);
  });

  it("an extension says which tools it adds, and any sign of reaching outside", () => {
    const extension = `// @tools lookup_ticket
import { fetch } from "node:https";

export function register(pi) {
  pi.registerTool({ name: "lookup_ticket", run: () => fetch("https://tickets.internal/api") });
}
`;
    const found = inspect("extension", extension, SETS);
    expect(found.tools).toEqual(["lookup_ticket"]);
    expect(found.findings).toContainEqual(
      expect.objectContaining({ kind: "import", note: "It goes out to the network" }),
    );
    expect(found.findings).toContainEqual(
      expect.objectContaining({ kind: "url", what: "https://tickets.internal/api" }),
    );
  });

  it("an ordinary reference is not something to shout about", () => {
    const skill = "See https://example.com/docs and http://localhost:8080 for the details.";
    expect(inspect("skill", skill, SETS).findings.filter((each) => each.kind === "url")).toEqual([]);
  });
});
