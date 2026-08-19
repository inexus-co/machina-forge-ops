import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readConsent, writeConsent } from "./consent";
import { chooseSandbox } from "./index";
import { noWall } from "./none";

/**
 * The one exception in ADR 0002, and the conditions that make it an exception rather than a switch.
 *
 * What is tested here is refusal: off unless somebody said so, and off again the moment the same
 * answer arrives on a different machine. The other two conditions — every command stops for a
 * person, and the record says `sandboxed: false` — belong to the tool and are tested with it.
 */

let root = "";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "machina-consent-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("consenting to run with no isolation", () => {
  it("it is off to begin with", async () => {
    expect(await readConsent(root)).toEqual({ accepted: false });
  });

  it("given by hand, it records when and on which machine", async () => {
    const written = await writeConsent(root, true);
    expect(written.accepted).toBe(true);
    expect(written.machine).toBe(os.hostname());

    const read = await readConsent(root);
    expect(read.accepted).toBe(true);
    expect(read.at).toBe(written.at);
  });

  it("consent given on another machine is not consent", async () => {
    await writeConsent(root, true);
    const file = path.join(root, "agent", "no-wall.json");
    const stored = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
    /* The situation: the whole userData was copied to another machine. */
    await fs.writeFile(file, JSON.stringify({ ...stored, machine: "somebody else's computer" }), "utf8");

    expect(await readConsent(root)).toEqual({ accepted: false });
  });

  it("it can be taken back", async () => {
    await writeConsent(root, true);
    expect(await writeConsent(root, false)).toEqual({ accepted: false });
    expect(await readConsent(root)).toEqual({ accepted: false });
  });

  it("syncing the settings does not turn it on", async () => {
    /* Consent lives outside the settings file: exporting the settings does not carry it. */
    const written = await writeConsent(root, true);
    expect(written.accepted).toBe(true);
    const inside = await fs.readdir(path.join(root, "agent"));
    expect(inside).toContain("no-wall.json");
  });

  it("it is never chosen on its own", async () => {
    expect(await noWall.available()).toBe(false);
    const chosen = await chooseSandbox();
    expect(chosen?.name).not.toBe("none");
    expect((await chooseSandbox("none" as never))?.name).toBeUndefined();
  });
});
