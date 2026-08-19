import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULTS,
  MIGRATED_MODEL_ID,
  findModel,
  joinCategories,
  mergeRules,
  present,
  readSettings,
  settingsPath,
  upsertHostRule,
  writeSettings,
} from "./store";
import type { StoredSettings } from "./store";

/**
 * What is on disk, read back.
 *
 * The case worth a test is the old file. Models became a list, and an operator who had an
 * endpoint and a key configured before that must not be logged out by an update — a settings
 * screen that comes up empty after a version change is indistinguishable from one that lost the
 * credential.
 */

let root = "";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "machina-agent-store-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const write = (value: unknown) =>
  fs.writeFile(settingsPath(root), JSON.stringify(value), "utf8");

describe("saving the agent settings", () => {
  it("with nothing saved, there are no models and only the allowlists", async () => {
    const settings = await readSettings(root);
    expect(settings.models).toEqual([]);
    expect(settings.commandSets.length).toBeGreaterThan(0);
  });

  it("an old file with a single model is read as one, with a name", async () => {
    await write({
      provider: "endpoint",
      baseUrl: "https://api.example.com/v1",
      modelId: "gpt-5.6-luna",
      supportsImages: true,
      commandSets: [{ id: "s1", name: "Investigation", allow: ["ls"], allowSudo: false }],
    });

    const settings = await readSettings(root);
    expect(settings.models).toHaveLength(1);
    expect(settings.models[0]).toMatchObject({
      id: MIGRATED_MODEL_ID,
      name: "gpt-5.6-luna",
      provider: "endpoint",
      baseUrl: "https://api.example.com/v1",
    });
    // Already chosen: a migrated installation must not have to pick a default before it can run.
    expect(settings.defaultModelId).toBe(MIGRATED_MODEL_ID);
    expect(settings.commandSets[0].name).toBe("Investigation");
  });

  it("an old file with only a subscription is read as one as well", async () => {
    await write({ provider: "codex", codexModel: "gpt-5.6-codex", commandSets: [] });
    const settings = await readSettings(root);
    expect(settings.models[0]).toMatchObject({ provider: "codex", codexModel: "gpt-5.6-codex" });
  });

  it("an old file with nothing configured produces no model", async () => {
    await write({ provider: "endpoint", baseUrl: "", modelId: "", commandSets: [] });
    expect((await readSettings(root)).models).toEqual([]);
  });

  it("several models are written and read back as they were", async () => {
    await writeSettings(root, {
      extensionTools: [],
      sandbox: "auto" as const,
      locale: "ja" as const,
      profiles: [],
      models: [
        { id: "a", name: "In-house", provider: "endpoint", baseUrl: "http://gpu", modelId: "qwen", supportsImages: false },
        { id: "b", name: "Subscription", provider: "codex", baseUrl: "", modelId: "", supportsImages: true },
      ],
      defaultModelId: "b",
      commandSets: DEFAULTS.commandSets,
      autoReads: true,
      allowSudo: false,
      tracing: true,
      hostRules: [],
    });

    const settings = await readSettings(root);
    expect(settings.models.map((model) => model.id)).toEqual(["a", "b"]);
    expect(findModel(settings)?.id).toBe("b");
    expect(findModel(settings, "a")?.name).toBe("In-house");
    // A run naming a model that is gone falls back rather than failing.
    expect(findModel(settings, "gone")?.id).toBe("b");
  });

  it("a default pointing at a model that is gone falls back to the first one left", () => {
    const shown = present(
      {
        extensionTools: [],
        sandbox: "auto" as const,
        locale: "ja" as const,
        profiles: [],
        models: [
          { id: "a", name: "In-house", provider: "endpoint", baseUrl: "", modelId: "", supportsImages: true },
        ],
        defaultModelId: "the one that went",
        commandSets: [],
        autoReads: true,
        allowSudo: false,
        tracing: true,
        hostRules: [],
      },
      () => false,
    );
    expect(shown.defaultModelId).toBe("a");
  });

  it("the key itself never leaves; only whether there is one", () => {
    const shown = present(
      {
        extensionTools: [],
        sandbox: "auto" as const,
        locale: "ja" as const,
        profiles: [],
        models: [
          { id: "a", name: "In-house", provider: "endpoint", baseUrl: "", modelId: "", supportsImages: true },
          { id: "b", name: "Contract", provider: "endpoint", baseUrl: "", modelId: "", supportsImages: true },
        ],
        commandSets: [],
        autoReads: true,
        allowSudo: false,
        tracing: true,
        hostRules: [],
      },
      (id) => id === "b",
    );
    expect(shown.models.map((model) => model.hasApiKey)).toEqual([false, true]);
    expect(JSON.stringify(shown)).not.toContain("apiKey\":\"");
  });
});

describe("joining categories", () => {
  const settings: StoredSettings = {
    ...DEFAULTS,
    commandSets: [
      { id: "read", name: "Investigation", allow: ["ls", "docker"], allowSudo: false,
        quiet: { ls: "all" as const, docker: ["ps"] } },
      { id: "logs", name: "Logs", allow: ["journalctl", "docker"], allowSudo: false,
        quiet: { journalctl: "all" as const, docker: ["logs"] } },
    ],
  };

  it("the chosen categories' commands become one bundle", () => {
    const joined = joinCategories(settings, { commandCategoryIds: ["read", "logs"] });
    expect(joined.allow.sort()).toEqual(["docker", "journalctl", "ls"]);
    expect(joined.name).toBe("Investigation・Logs");
  });

  it("a command in two categories keeps both ways of reading it", () => {
    const joined = joinCategories(settings, { commandCategoryIds: ["read", "logs"] });
    expect(joined.quiet?.["docker"]).toEqual(["ps", "logs"]);
  });

  it("where one side says everything reads, that is what holds", () => {
    const both: StoredSettings = {
      ...settings,
      commandSets: [
        settings.commandSets[0],
        { ...settings.commandSets[1], quiet: { docker: "all" as const } },
      ],
    };
    expect(joinCategories(both, { commandCategoryIds: ["read", "logs"] }).quiet?.["docker"]).toBe("all");
  });

  it("a command added outside any category is confirmed every time", () => {
    const joined = joinCategories(settings, { commandCategoryIds: ["read"], extraCommands: ["rsync"] });
    expect(joined.allow).toContain("rsync");
    expect(joined.quiet?.["rsync"]).toBeUndefined();
  });

  it("sudo belongs to the agent, not to a category", () => {
    expect(joinCategories(settings, { commandCategoryIds: ["read"] }).allowSudo).toBe(false);
    expect(joinCategories(settings, { commandCategoryIds: ["read"], allowSudo: true }).allowSudo).toBe(true);
  });
});

describe("migrating the old settings (permissions move to the installation)", () => {
  /*
   * The promise: judgements that agree with the catalog migrate to zero exceptions, and only the
   * disagreements survive — as the installation's rules, whichever profile used to carry them.
   */
  it("an old setting that lands where the catalog lands produces no exception", async () => {
    await write({
      extensionTools: [],
      sandbox: "auto",
      profiles: [{ id: "p1", name: "Investigator", approvalMode: "step", delegates: [],
        commandCategoryIds: ["files"] }],
      models: [],
      commandSets: DEFAULTS.commandSets,
    });
    const settings = await readSettings(root);
    expect(settings.rules).toEqual({});
  });

  it("only the difference becomes an exception, whether it loosened or tightened", async () => {
    await write({
      extensionTools: [],
      sandbox: "auto",
      profiles: [{ id: "p1", name: "Mixed", approvalMode: "step", delegates: [],
        commandCategoryIds: ["c1"], extraCommands: ["mycustomtool"], allowSudo: true }],
      models: [],
      commandSets: [{
        id: "c1", name: "Mixed", allow: ["ls", "docker", "wget", "bash"], allowSudo: false,
        quiet: { ls: "all", docker: ["ps", "logs"], wget: "all" },
      }],
    });
    const settings = await readSettings(root);
    const rules = settings.rules ?? {};
    // ls: quiet all before, and the catalog reads it too → no exception.
    expect(rules["ls"]).toBeUndefined();
    // docker: the old verb list is narrower than the catalog → keep the old one.
    expect(rules["docker"]).toMatchObject({ action: "ask", autoVerbs: ["ps", "logs"] });
    expect(rules["docker"]?.origin?.by).toBe("migrated");
    // wget: quiet all before, a write in the catalog → the operator's loosening stays as auto.
    expect(rules["wget"]).toMatchObject({ action: "auto" });
    // bash: it was on the old list (confirmed every time). The catalog refuses it by default →
    // ask stays, and nothing is lost.
    expect(rules["bash"]).toMatchObject({ action: "ask" });
    // Not in the catalog and confirmed every time is what the catalog already does with the
    // unknown, so it is no exception.
    expect(rules["mycustomtool"]).toBeUndefined();
    // The old profile's sudo survives as the installation's sudo.
    expect(settings.allowSudo).toBe(true);
  });

  it("memory that hung off a profile is folded per server, and the stricter word wins", async () => {
    await write({
      ...DEFAULTS,
      rules: {},
      hostRules: [
        { profileId: "p1", hostId: "h1", rules: { wget: { action: "auto" } } },
        { profileId: "p2", hostId: "h1", rules: { wget: { action: "deny" } } },
        { profileId: "p1", hostId: "h2", rules: { tar: { action: "auto" } } },
      ],
    });
    const settings = await readSettings(root);
    expect(settings.hostRules).toHaveLength(2);
    const h1 = settings.hostRules.find((each) => each.hostId === "h1");
    expect(h1?.rules["wget"]).toMatchObject({ action: "deny" });
  });
});

describe("what is remembered per server", () => {
  it("it can be written and read back", async () => {
    await writeSettings(root, {
      ...DEFAULTS,
      hostRules: [{ hostId: "h1",
        rules: { docker: { action: "ask", autoVerbs: ["restart"],
          origin: { by: "run", runId: "r1", hostId: "h1", at: "2026-08-15T00:00:00Z" } } } }],
    });
    const settings = await readSettings(root);
    expect(settings.hostRules).toHaveLength(1);
    expect(settings.hostRules[0].rules["docker"]).toMatchObject({
      action: "ask", autoVerbs: ["restart"],
    });
  });

  it("mergeRules: a server's memory beats the installation's exception, program by program", () => {
    const settings: StoredSettings = {
      ...DEFAULTS,
      rules: { curl: { action: "auto" }, wget: { action: "auto" } },
      hostRules: [{ hostId: "h1", rules: { curl: { action: "deny" } } }],
    };
    const merged = mergeRules(settings, "h1");
    expect(merged.rules["curl"]).toMatchObject({ action: "deny" });
    expect(merged.rules["wget"]).toMatchObject({ action: "auto" });
    // Nothing is carried over to another server.
    expect(mergeRules(settings, "h2").rules["curl"]).toMatchObject({ action: "auto" });
  });

  it("mergeRules: the same name in a different case folds into one, and the server's wins", () => {
    const settings: StoredSettings = {
      ...DEFAULTS,
      rules: { "Get-Service": { action: "ask" } },
      hostRules: [{ hostId: "h1", rules: { "get-service": { action: "auto" } } }],
    };
    const merged = mergeRules(settings, "h1");
    expect(Object.keys(merged.rules)).toHaveLength(1);
    expect(Object.values(merged.rules)[0]).toMatchObject({ action: "auto" });
  });

  it("upsertHostRule: a remembered verb joins the same program's list of verbs", () => {
    const at = "2026-08-15T00:00:00Z";
    let settings: StoredSettings = { ...DEFAULTS, hostRules: [] };
    settings = upsertHostRule(settings, { hostId: "h1",
      program: "systemctl", action: "auto", verb: "restart", runId: "r1", at });
    settings = upsertHostRule(settings, { hostId: "h1",
      program: "systemctl", action: "auto", verb: "reload", runId: "r2", at });
    expect(settings.hostRules).toHaveLength(1);
    expect(settings.hostRules[0].rules["systemctl"]).toMatchObject({
      action: "ask", autoVerbs: ["restart", "reload"],
    });
  });

  it("upsertHostRule: automatic or never, for a whole program, replaces what was there", () => {
    const at = "2026-08-15T00:00:00Z";
    let settings: StoredSettings = { ...DEFAULTS, hostRules: [] };
    settings = upsertHostRule(settings, { hostId: "h1",
      program: "wget", action: "auto", verb: "x", at });
    settings = upsertHostRule(settings, { hostId: "h1",
      program: "wget", action: "auto", at });
    expect(settings.hostRules[0].rules["wget"]).toMatchObject({ action: "auto" });
    settings = upsertHostRule(settings, { hostId: "h1",
      program: "wget", action: "deny", at });
    expect(settings.hostRules[0].rules["wget"]).toMatchObject({ action: "deny" });
    expect(settings.hostRules[0].rules["wget"].autoVerbs).toBeUndefined();
  });
});
