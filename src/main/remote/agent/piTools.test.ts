import { describe, expect, it } from "vitest";
import { setLocale } from "../../../shared/i18n";
import type { RulePolicy } from "../../../shared/remoteAgent";
import { createRemoteTools, remoteToolNames, type ToolRuntime } from "./piTools";

/**
 * The gates, with the engine taken away.
 *
 * Pi calls `execute`; everything that decides whether a customer's server is touched happens
 * inside it. These tests hold a fake runtime and check the things the guarantee is made of:
 * shells and denials refuse, shell metacharacters refuse, a person is asked when a person is
 * owed, and reads run without one.
 */

/* The tools are written in English; the policy's sentences go through t(). Pin the language. */
setLocale("en");

const POLICY: RulePolicy = {
  name: "Test",
  allowSudo: false,
  autoReads: true,
  rules: {},
};

/** A stand-in for Pi's `defineTool`: keeps the spec so a test can call `execute` directly. */
type Spec = {
  name: string;
  /** The schema Pi shows the model. Read here to check which parameters were offered at all. */
  parameters?: { properties?: Record<string, unknown> };
  execute: (id: string, args: Record<string, unknown>) => Promise<{ content: unknown[]; terminate?: boolean }>;
};
const specs: Spec[] = [];
const defineTool = ((spec: Spec) => {
  specs.push(spec);
  return spec;
}) as never;

function build(overrides: Partial<ToolRuntime> = {}) {
  specs.length = 0;
  const ran: string[] = [];
  const asked: Array<{ command: string; frame?: string }> = [];
  const recorded: Array<Record<string, unknown>> = [];
  const waited: Array<number | undefined> = [];
  const clicks: string[] = [];
  const keys: Array<[number, boolean]> = [];
  const characters: number[] = [];
  const handed: Array<{ id: string; task: string }> = [];
  const local: string[] = [];
  const kept: string[] = [];
  let spent = 0;
  const runtime: ToolRuntime = {
    control: "shell",
    mouse: (x, y, buttons) => clicks.push(`${x},${y},${buttons}`),
    key: (code, down) => keys.push([code, down]),
    unicode: (code) => characters.push(code),
    screenSize: () => ({ width: 1280, height: 800 }),
    policy: () => POLICY,
    mode: "auto",
    spend: () => (spent += 1),
    localRun: async (command) => {
      local.push(command);
      return { ok: true, code: 0, output: "output from here" };
    },
    /* Only where there is a wall to have produced something — as in `session.ts`. */
    keep: overrides.sandbox
      ? async (relative) => {
          kept.push(relative);
          if (relative.includes("..")) {
            throw new Error("A file outside the working directory cannot be saved.");
          }
          return { savedAs: relative, sha256: "abc123", bytes: 42 };
        }
      : undefined,
    delegates: () => [],
    delegate: async (id, task) => {
      handed.push({ id, task });
      return { ok: true, summary: "The disk was at 80%." };
    },
    secrets: async () => new Map([["password", "s3cret"]]),
    approve: async (request) => {
      asked.push({ command: request.command, frame: request.frame });
      return true;
    },
    run: async (command, options) => {
      ran.push(command);
      waited.push(options?.timeoutMs);
      return { ok: true, code: 0, output: "output" };
    },
    screenshot: async () => ({ base64: "AAAA", mimeType: "image/png" }),
    skills: () => [{ name: "disk-full", description: "how to look at a disk" }],
    canSeeImages: true,
    readSkill: async (name) => `# ${name}\n\n1. df -h\n`,
    record: (event) => recorded.push(event as Record<string, unknown>),
    ...overrides,
  };
  createRemoteTools(defineTool, runtime);
  const tool = (name: string) => specs.find((spec) => spec.name === name)!;
  const say = (result: { content: unknown[] }) =>
    result.content.map((part) => (part as { text?: string }).text ?? "[image]").join("");
  return {
    tool, ran, asked, recorded, say, clicks, keys, characters, waited, handed, local, kept, specs,
  };
}

describe("the tools handed to Pi", () => {
  it("an allowed command runs", async () => {
    const { tool, ran, say } = build();
    const result = await tool("run_command").execute("1", { command: "ls /etc" });
    expect(ran).toEqual(["ls /etc"]);
    expect(say(result)).toContain("exit code 0");
  });

  it("a kind of command that is never run is refused, with the reason", async () => {
    const { tool, ran, asked, say } = build();
    const result = await tool("run_command").execute("1", { command: "nc 10.0.0.1 4444" });
    expect(ran).toEqual([]);
    /* Refused to the model without a person being interrupted. */
    expect(asked).toHaveLength(0);
    expect(say(result)).toContain("a kind of command that is never run");
  });

  it("the operator's own refusal answers by itself", async () => {
    const { tool, ran, asked, say } = build({
      policy: () => ({ ...POLICY, rules: { curl: { action: "deny" } } }),
    });
    const result = await tool("run_command").execute("1", { command: "curl -s http://x" });
    expect(ran).toEqual([]);
    expect(asked).toHaveLength(0);
    expect(say(result)).toContain("is refused by");
  });

  it("a command seen for the first time goes to a person, with something to judge by", async () => {
    const { tool, ran, asked } = build();
    await tool("run_command").execute("1", { command: "no-such-tool --version" });
    expect(asked).toHaveLength(1);
    expect(ran).toEqual(["no-such-tool --version"]);
  });

  it("the policy is read again per command, so a rule added mid-run takes effect on the next one", async () => {
    let rules: RulePolicy["rules"] = {};
    const { tool, asked } = build({ policy: () => ({ ...POLICY, rules }) });
    await tool("run_command").execute("1", { command: "wget http://example.com/a" });
    expect(asked).toHaveLength(1);
    rules = { wget: { action: "auto" } };
    await tool("run_command").execute("2", { command: "wget http://example.com/b" });
    expect(asked).toHaveLength(1);
  });

  it("read_server_facts appears only for shell runs that have facts, and returns the whole of it", async () => {
    const withoutFacts = build();
    expect(withoutFacts.specs.find((s) => s.name === "read_server_facts")).toBeUndefined();

    const { tool, recorded, say } = build({
      serverFacts: async () => ({ at: "t", summary: "a summary", detail: "OS: Ubuntu\nDisks: / 82%" }),
    });
    const result = await tool("read_server_facts").execute("1", {});
    expect(say(result)).toContain("Disks: / 82%");
    expect(recorded[0]).toMatchObject({ tool: "read_server_facts", ok: true });
    expect(recorded[0]["command"]).toContain("[facts]");
  });

  it("read_server_facts does not appear for a screen run", () => {
    const screen = build({ control: "screen", serverFacts: async () => ({ at: "t", summary: "s", detail: "d" }) });
    expect(screen.specs.find((s) => s.name === "read_server_facts")).toBeUndefined();
  });

  it("fetch_log checks the path or unit and says only that it was copied", async () => {
    const fetched: Array<Record<string, unknown>> = [];
    const { tool, say, recorded } = build({
      sandbox: "seatbelt",
      fetchLog: async (input) => {
        fetched.push(input as Record<string, unknown>);
        return { savedAs: "logs/access.log", lines: 20000, bytes: 4_000_000 };
      },
    });
    const bad = await tool("fetch_log").execute("1", { path: "../etc/passwd", lines: 10 });
    expect(say(bad)).toContain("must be absolute");
    expect(fetched).toHaveLength(0);

    const ok = await tool("fetch_log").execute("2", { path: "/var/log/nginx/access.log", lines: 20000 });
    expect(say(ok)).toContain("logs/access.log");
    expect(say(ok)).not.toContain("HTTP"); // the contents do not come back
    expect(fetched[0]).toMatchObject({ path: "/var/log/nginx/access.log", lines: 20000 });
    expect(recorded.at(-1)).toMatchObject({ tool: "fetch_log", ok: true });
  });

  it("fetch_log does not appear when there is no workspace", () => {
    const noWall = build({ fetchLog: async () => ({ savedAs: "x", lines: 1, bytes: 1 }) });
    expect(noWall.specs.find((s) => s.name === "fetch_log")).toBeUndefined();
  });

  it("a card that stopped carries what to judge by: the program, what it is, whether it can be remembered", async () => {
    const gates: Array<Record<string, unknown>> = [];
    const { tool } = build({
      approve: async (request) => {
        gates.push((request as { gate?: Record<string, unknown> }).gate ?? {});
        return true;
      },
    });
    await tool("run_command").execute("1", { command: "systemctl restart nginx" });
    expect(gates[0]).toMatchObject({
      program: "systemctl",
      verb: "restart",
      stop: "catalog",
      canRemember: true,
    });
    expect(gates[0]["summary"]).toBeTruthy();

    await tool("run_command").execute("2", { command: "rm -rf /tmp/x" });
    expect(gates[1]).toMatchObject({ stop: "floor", canRemember: false });
  });

  it("chaining does not get through by hiding behind an allowed command", async () => {
    const { tool, ran, say } = build();
    const result = await tool("run_command").execute("1", { command: "ls /; cat /etc/shadow" });
    expect(ran).toEqual([]);
    expect(say(result)).toContain("one command on one line");
  });

  it("a destructive command asks a person even in automatic mode", async () => {
    const { tool, asked, ran } = build({ mode: "auto" });
    await tool("run_command").execute("1", { command: "rm -rf /var/tmp/x" });
    expect(asked).toHaveLength(1);
    expect(ran).toEqual(["rm -rf /var/tmp/x"]);
  });

  it("without approval, nothing runs", async () => {
    const { tool, ran, say } = build({ mode: "step", approve: async () => false });
    const result = await tool("run_command").execute("1", { command: "ls /" });
    expect(ran).toEqual([]);
    expect(say(result)).toContain("was not approved");
  });

  it("in plan mode nothing is sent to the server", async () => {
    const { tool, ran, say } = build({ mode: "plan" });
    const result = await tool("run_command").execute("1", { command: "ls /" });
    expect(ran).toEqual([]);
    expect(say(result)).toContain("This is a plan");
  });

  it("a command using a secret runs with the value filled in, and its output is not kept", async () => {
    const { tool, ran, recorded, say } = build();
    const result = await tool("run_command").execute("1", {
      command: "cat {{password}}",
    });
    expect(ran).toEqual(["cat s3cret"]);
    expect(say(result)).toContain("the output is not kept");
    expect(recorded[0]).toMatchObject({ usedSecret: true });
    expect(recorded[0]["output"]).toBeUndefined();
  });

  it("two minutes by default; something long like a build can name its own", async () => {
    const { tool, waited } = build();
    await tool("run_command").execute("1", { command: "ls /" });
    await tool("run_command").execute("2", {
      command: "docker compose -f /srv/app/compose.yaml build",
      wait_seconds: 900,
    });
    expect(waited).toEqual([120_000, 900_000]);
  });

  it("a long output reaches the model as its head and tail; the record keeps all of it", async () => {
    const lines = Array.from({ length: 500 }, (_, index) => `line ${index}`);
    const { tool, recorded, say } = build({
      run: async () => ({ ok: true, code: 0, output: lines.join("\n") }),
    });
    const said = say(await tool("run_command").execute("1", { command: "ls /" }));

    expect(said).toContain("line 0");
    expect(said).toContain("line 499");
    expect(said).toContain("340 lines left out");
    expect(said).not.toContain("line 200");
    /* The record is not trimmed: being able to read all of it later is what makes it evidence. */
    expect(String(recorded[0]["output"]).split("\n")).toHaveLength(500);
  });

  it("a timeout is reported together with what it printed", async () => {
    const { tool, say } = build({
      run: async () => ({ ok: false, output: "Step 3/9", timedOut: true }),
    });
    const said = say(await tool("run_command").execute("1", { command: "ls /", wait_seconds: 5 }));
    expect(said).toContain("Cut off after 5 seconds");
    expect(said).toContain("Step 3/9");
  });

  it("the screen comes back as an image", async () => {
    const { tool } = build();
    const result = await tool("read_screen").execute("1", {});
    expect(result.content[0]).toMatchObject({ type: "image", mimeType: "image/png" });
  });

  it("a model that cannot read a picture is not given the screen tools", () => {
    const { tool } = build({ canSeeImages: false });
    expect(tool("read_screen")).toBeUndefined();
    expect(tool("run_command")).toBeDefined();
  });

  it("when there is no screen, it says so", async () => {
    const { tool, say } = build({ screenshot: async () => undefined });
    expect(say(await tool("read_screen").execute("1", {}))).toContain("No screen is open");
  });

  it("a skill is read by name; an unknown name is refused", async () => {
    const { tool, say } = build();
    expect(say(await tool("read_skill").execute("1", { name: "disk-full" }))).toContain("df -h");
    const unknown = say(await tool("read_skill").execute("2", { name: "../../etc/passwd" }));
    expect(unknown).toContain("There is no skill called");
    expect(unknown).toContain("disk-full");
  });

  it("a screen agent has no shell, and a shell agent has no hands", () => {
    const shell = build({ control: "shell" });
    expect(shell.tool("run_command")).toBeDefined();
    for (const name of ["click", "type_text", "press_keys", "wait"]) {
      expect(shell.tool(name)).toBeUndefined();
    }

    const screen = build({ control: "screen" });
    expect(screen.tool("run_command")).toBeUndefined();
    for (const name of ["click", "type_text", "press_keys"]) {
      expect(screen.tool(name)).toBeDefined();
    }
  });

  it("a click goes through approval, and outside the screen is refused", async () => {
    const { tool, clicks, asked, say } = build({ control: "screen", mode: "step" });
    await tool("click").execute("1", { x: 100, y: 200 });
    expect(asked).toHaveLength(1);
    /* Down then up, at the same place. */
    expect(clicks).toEqual(["100,200,1", "100,200,0"]);

    const outside = say(await tool("click").execute("2", { x: 5000, y: 10 }));
    expect(outside).toContain("off the screen");
    expect(clicks).toHaveLength(2);
  });

  it("without approval, nothing reaches the screen", async () => {
    const { tool, clicks } = build({ control: "screen", mode: "step", approve: async () => false });
    await tool("click").execute("1", { x: 10, y: 10 });
    expect(clicks).toEqual([]);
  });

  it("ASCII goes as key presses; anything else goes as the character itself", async () => {
    const { tool, keys, characters, say } = build({ control: "screen", mode: "auto" });
    await tool("type_text").execute("1", { text: "Ok!" });
    /* Shift is held for the capital and for the bang, and released after each. */
    expect(keys.length).toBeGreaterThan(6);
    expect(keys[0]).toEqual([0x2a, true]);
    expect(characters).toEqual([]);

    const said = say(await tool("type_text").execute("2", { text: "あA" }));
    /* The kana as its code point, the letter as a key — one string, both paths. */
    expect(characters).toEqual(["あ".charCodeAt(0)]);
    expect(keys.some(([code, down]) => code === 0x1e && down)).toBe(true);
    expect(said).toContain("confirm with read_screen");
  });

  it("outside the basic plane, a character goes as its two UTF-16 units", async () => {
    const { tool, characters } = build({ control: "screen", mode: "auto" });
    await tool("type_text").execute("1", { text: "\u{20BB7}" });
    expect(characters).toEqual([0xd842, 0xdfb7]);
  });

  it("keys pressed together go down in order and come up in reverse", async () => {
    const { tool, keys } = build({ control: "screen", mode: "auto" });
    await tool("press_keys").execute("1", { keys: ["ctrl", "c"] });
    expect(keys).toEqual([
      [0x1d, true],
      [0x2e, true],
      [0x2e, false],
      [0x1d, false],
    ]);
  });

  it("a click records the picture before, the picture after, and where it pressed", async () => {
    const asked: Array<Record<string, unknown>> = [];
    const { tool, recorded } = build({
      control: "screen",
      mode: "step",
      approve: async (request) => {
        asked.push(request as unknown as Record<string, unknown>);
        return true;
      },
    });
    await tool("click").execute("1", { x: 10, y: 20 });

    /* The card carries what the agent was looking at, and where — "click (10, 20)"
       cannot be judged, and a box burned into the picture would cover the thing pressed. */
    expect(asked[0]["frame"]).toContain("data:image/png;base64,");
    expect(asked[0]["point"]).toEqual({ x: 10, y: 20, kind: "click" });

    const step = recorded.find((each) => each["kind"] === "step")!;
    expect(step["point"]).toEqual({ x: 10, y: 20, kind: "click" });
    expect(String(step["frameBefore"])).toContain("data:image/png;base64,");
    expect(String(step["frameAfter"])).toContain("data:image/png;base64,");
  }, 10_000);

  it("while somebody is being asked, a command that needs nobody waits", async () => {
    /*
     * Pi runs a turn's tools side by side. Deciding about one command while another is already
     * touching the machine is deciding about a moving target.
     */
    let release: (() => void) | undefined;
    const asking = new Promise<void>((resolve) => (release = resolve));
    const { tool, ran } = build({
      mode: "auto",
      pause: () => asking,
    });

    const read = tool("run_command").execute("1", { command: "ls /" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ran).toEqual([]);

    release!();
    await read;
    expect(ran).toEqual(["ls /"]);
  });

  it("ask_human and done both stop the run there", async () => {
    const { tool, recorded } = build();
    expect((await tool("ask_human").execute("1", { question: "which one?" })).terminate).toBe(true);
    expect((await tool("done").execute("2", { summary: "had a look" })).terminate).toBe(true);
    expect(recorded.map((each) => each["kind"])).toEqual(["question", "done"]);
  });

  it("what was established is written down under its title, and lands in the record", async () => {
    const written: Array<[string, string]> = [];
    const { tool, recorded, say } = build({
      saveNote: async (title, body) => void written.push([title, body]),
    });

    const said = say(
      await tool("write_note").execute("1", {
        title: "WordPress on this host",
        body: "DB at 127.0.0.1:3306, prefix wp_",
      }),
    );
    expect(written).toEqual([["WordPress on this host", "DB at 127.0.0.1:3306, prefix wp_"]]);
    expect(said).toContain("WordPress on this host");
    /* The record keeps what was written, so an old note can be read back after it was replaced. */
    expect(recorded[0]).toMatchObject({
      tool: "write_note",
      command: "[note] WordPress on this host",
      ok: true,
      output: "DB at 127.0.0.1:3306, prefix wp_",
    });
    /* It does not end the run, and it can be written more than once. */
    expect(
      (await tool("write_note").execute("2", { title: "Apache", body: "bitnami build" })).terminate,
    ).toBeUndefined();
  });

  it("with no logbook to write into, there is no note tool", () => {
    expect(build().tool("write_note")).toBeUndefined();
  });

  it("with nobody to hand work to, the delegate tool does not appear", () => {
    expect(build().tool("delegate")).toBeUndefined();
    const withOne = build({ delegates: () => [{ id: "p1", name: "disk survey" }] });
    expect(withOne.tool("delegate")).toBeDefined();
  });

  it("either a name or an id works; an unknown one is refused", async () => {
    const { tool, handed, say } = build({
      delegates: () => [{ id: "p1", name: "disk survey", purpose: "anything about capacity" }],
    });
    await tool("delegate").execute("1", { tasks: [{ agent: "disk survey", task: "look at the free space on /" }] });
    await tool("delegate").execute("2", { tasks: [{ agent: "p1", task: "again" }] });
    expect(handed).toEqual([
      { id: "p1", task: "look at the free space on /" },
      { id: "p1", task: "again" },
    ]);

    const unknown = say(
      await tool("delegate").execute("3", { tasks: [{ agent: "nobody", task: "have a look" }] }),
    );
    expect(unknown).toContain("There is no agent called");
    expect(unknown).toContain("disk survey");
    expect(handed).toHaveLength(2);
  });

  it("in plan mode nothing is handed over either", async () => {
    const { tool, handed, say } = build({
      mode: "plan",
      delegates: () => [{ id: "p1", name: "disk survey" }],
    });
    expect(
      say(await tool("delegate").execute("1", { tasks: [{ agent: "p1", task: "have a look" }] })),
    ).toContain("This is a plan");
    expect(handed).toEqual([]);
  });

  it("only the other agent's report comes back", async () => {
    const { tool, say } = build({
      delegates: () => [{ id: "p1", name: "disk survey" }],
      delegate: async () => ({ ok: false, summary: "Could not connect over SSH." }),
    });
    const said = say(
      await tool("delegate").execute("1", { tasks: [{ agent: "p1", task: "have a look" }] }),
    );
    expect(said).toContain("could not finish");
    expect(said).toContain("Could not connect over SSH");
  });

  it("two handed over at once run together, and both reports come back", async () => {
    const started: string[] = [];
    let running = 0;
    let together = 0;
    const { tool, say } = build({
      delegates: () => [
        { id: "p1", name: "disk survey" },
        { id: "p2", name: "network survey" },
      ],
      delegate: async (id) => {
        started.push(id);
        running += 1;
        together = Math.max(together, running);
        await new Promise((resolve) => setTimeout(resolve, 30));
        running -= 1;
        return { ok: true, summary: `what ${id} found` };
      },
    });

    const said = say(
      await tool("delegate").execute("1", {
        tasks: [
          { agent: "disk survey", task: "look at the free space" },
          { agent: "network survey", task: "see if it can reach out" },
        ],
      }),
    );
    expect(started).toEqual(["p1", "p2"]);
    expect(together).toBe(2);
    expect(said).toContain("what p1 found");
    expect(said).toContain("what p2 found");
  });

  it("the keep tool only appears where something can be run here", () => {
    /* Nothing is produced without a run here, so there would be nothing to keep. */
    expect(build().tool("save_local")).toBeUndefined();
    expect(build({ sandbox: "seatbelt" }).tool("save_local")).toBeDefined();
  });

  it("a kept file goes into the record with its name and its hash", async () => {
    const { tool, kept, recorded, say } = build({ sandbox: "seatbelt" });
    const said = say(await tool("save_local").execute("1", { path: "report.md", note: "a list of the configuration" }));

    expect(kept).toEqual(["report.md"]);
    expect(said).toContain("report.md");
    expect(recorded[0]).toMatchObject({
      tool: "save_local",
      ok: true,
      reason: "a list of the configuration",
      file: { name: "report.md", sha256: "abc123", bytes: 42 },
    });
  });

  it("nothing outside the working directory can be kept, and the failure is recorded too", async () => {
    const { tool, recorded, say } = build({ sandbox: "seatbelt" });
    const said = say(await tool("save_local").execute("1", { path: "../../secret" }));

    expect(said).toContain("Could not save it");
    expect(recorded[0]).toMatchObject({ tool: "save_local", ok: false });
    expect(recorded[0]).not.toHaveProperty("file");
  });

  it("with no isolation, the run-here tool does not appear", () => {
    expect(build().tool("run_local")).toBeUndefined();
    expect(build({ sandbox: "seatbelt" }).tool("run_local")).toBeDefined();
  });

  it("a run here goes into the same record, named with its isolation, and never stops the run", async () => {
    const { tool, local, recorded, say } = build({ sandbox: "seatbelt" });
    await tool("run_command").execute("1", { command: "ls /" });
    const said = say(await tool("run_local").execute("2", { command: "sort f.txt | uniq -c" }));

    expect(local).toEqual(["sort f.txt | uniq -c"]);
    expect(said).toContain("output from here");
    expect(recorded[1]).toMatchObject({ tool: "run_local", sandbox: "seatbelt", ok: true });

    /* The count only goes up. However many there are, this is never what ends the run. */
    const third = await tool("run_local").execute("3", { command: "echo x" });
    expect(third.terminate).toBeUndefined();
    expect(local).toHaveLength(2);
  });

  it("in plan mode nothing runs here either", async () => {
    const { tool, local, say } = build({ sandbox: "seatbelt", mode: "plan" });
    expect(say(await tool("run_local").execute("1", { command: "echo x" }))).toContain("This is a plan");
    expect(local).toEqual([]);
  });

  it("on a machine with no isolation, even automatic asks each time, and the record says so", async () => {
    const { tool, local, asked, recorded } = build({ sandbox: "none", mode: "auto" });
    await tool("run_local").execute("1", { command: "wc -l f.txt" });

    /* Automatic, and still asking: with no isolation, approval is the only gate left, so no mode
       switches it off. */
    expect(asked).toHaveLength(1);
    expect(asked[0].command).toContain("not isolated");
    expect(local).toEqual(["wc -l f.txt"]);
    expect(recorded[0]).toMatchObject({
      tool: "run_local",
      sandbox: "none",
      sandboxed: false,
      decision: "approved",
    });

    /* Refused means nothing runs. */
    const refused = build({ sandbox: "none", mode: "auto", approve: async () => false });
    await refused.tool("run_local").execute("1", { command: "wc -l f.txt" });
    expect(refused.local).toEqual([]);
    expect(refused.recorded[0]).toMatchObject({ sandboxed: false, decision: "rejected" });
  });

  it("where there is isolation, the record does not say there is none", async () => {
    const { tool, recorded } = build({ sandbox: "seatbelt", mode: "auto" });
    await tool("run_local").execute("1", { command: "echo x" });
    expect(recorded[0]).toMatchObject({ sandbox: "seatbelt", decision: "auto" });
    expect(recorded[0]).not.toHaveProperty("sandboxed");
  });

  it("step by step, a run here needs a person as well", async () => {
    const { tool, local, asked } = build({ sandbox: "seatbelt", mode: "step" });
    await tool("run_local").execute("1", { command: "wc -l f.txt" });
    expect(asked[0].command).toContain("[here]");
    expect(local).toEqual(["wc -l f.txt"]);

    const refused = build({ sandbox: "seatbelt", mode: "step", approve: async () => false });
    await refused.tool("run_local").execute("1", { command: "wc -l f.txt" });
    expect(refused.local).toEqual([]);
  });
});

describe("remoteToolNames", () => {
  it("a shell agent gets read_server_facts, and fetch_log too where there is isolation", () => {
    const shell = remoteToolNames({ control: "shell", reachesServer: true, canRunLocal: true });
    expect(shell).toContain("run_command");
    expect(shell).toContain("read_server_facts");
    expect(shell).toContain("fetch_log");
  });

  it("with no isolation there is no fetch_log", () => {
    const noWall = remoteToolNames({ control: "shell", reachesServer: true, canRunLocal: false });
    expect(noWall).toContain("read_server_facts");
    expect(noWall).not.toContain("fetch_log");
  });

  it("a screen agent gets neither read_server_facts nor fetch_log", () => {
    const screen = remoteToolNames({
      control: "screen",
      reachesServer: true,
      canRunLocal: true,
      canSeeImages: true,
    });
    expect(screen).not.toContain("read_server_facts");
    expect(screen).not.toContain("fetch_log");
    expect(screen).not.toContain("run_command");
  });

  it("with no server there is no read_server_facts either", () => {
    const local = remoteToolNames({ control: "shell", reachesServer: false, canRunLocal: true });
    expect(local).not.toContain("read_server_facts");
    expect(local).not.toContain("fetch_log");
  });
});
