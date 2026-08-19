import { createServer, type Server } from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Type } from "typebox";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  agentDirectory,
  loadPi,
  chooseAuthPath,
  ensureAgentDirectory,
  operatorAuthPath,
  startPiSession,
  subscriptionStatus,
  writeModelsFile,
} from "./pi";

/**
 * Pi, actually running.
 *
 * A stub endpoint rather than a real model — what is being tested is the join: that Pi resolves
 * the model Forge wrote into `models.json`, that it calls a tool Forge defined and no tool it
 * ships itself, and that a skill dropped into Forge's agent directory is discovered without any
 * code here reading it. Those are the four claims the engine swap rests on.
 */

/**
 * An OpenAI-compatible endpoint that asks for our tool once and then says it is done.
 *
 * Streamed, because that is how Pi asks: a single JSON body makes it retry three times and give
 * up with "Stream ended without finish_reason" — which is what the first version of this test
 * measured, and it was the test that was wrong, not the join.
 */
function stubModel(): Promise<{ server: Server; url: string; seen: unknown[] }> {
  const seen: unknown[] = [];
  let turn = 0;
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      seen.push(JSON.parse(body));
      const first = turn++ === 0;
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const chunk = (delta: unknown, finish: string | null) =>
        `data: ${JSON.stringify({
          id: "stub",
          object: "chat.completion.chunk",
          created: 0,
          model: "stub-1",
          choices: [{ index: 0, delta, finish_reason: finish }],
        })}\n\n`;

      if (first) {
        response.write(chunk({ role: "assistant" }, null));
        response.write(
          chunk(
            {
              tool_calls: [
                {
                  index: 0,
                  id: "call-1",
                  type: "function",
                  function: { name: "run_command", arguments: '{"command":"ls /etc"}' },
                },
              ],
            },
            null,
          ),
        );
        response.write(chunk({}, "tool_calls"));
      } else {
        response.write(chunk({ role: "assistant", content: "I had a look." }, null));
        response.write(chunk({}, "stop"));
      }
      response.write("data: [DONE]\n\n");
      response.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, seen, url: `http://127.0.0.1:${port}/v1` });
    });
  });
}

const MODEL = {
  id: "test",
  name: "Stub",
  provider: "endpoint" as const,
  baseUrl: "",
  modelId: "stub-1",
  supportsImages: false,
};

let root = "";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "machina-pi-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("Pi as the runtime", () => {
  it("the directories are laid out the way Pi expects", async () => {
    const dir = await ensureAgentDirectory(root);
    expect(dir).toBe(agentDirectory(root));
    for (const name of ["skills", "prompts", "extensions", "sessions"]) {
      expect((await fs.stat(path.join(dir, name))).isDirectory()).toBe(true);
    }
  });

  it("the chosen model is written in the form Pi reads", async () => {
    const dir = await ensureAgentDirectory(root);
    const { providerId, path: file } = await writeModelsFile(
      dir,
      { ...MODEL, baseUrl: "http://example/v1" },
      "k",
    );
    const written = JSON.parse(await fs.readFile(file, "utf8"));
    expect(written.providers[providerId]).toMatchObject({
      baseUrl: "http://example/v1",
      api: "openai-completions",
      models: [{ id: "stub-1" }],
    });
  });

  it("where the operator has signed in to Pi, those credentials are used", async () => {
    const chosen = await chooseAuthPath(root);
    const theirs = operatorAuthPath();
    let exists = true;
    try {
      await fs.access(theirs);
    } catch {
      exists = false;
    }
    /* Whichever this machine is, the rule is the same: theirs when it is there, ours when not. */
    expect(chosen.path).toBe(exists ? theirs : path.join(agentDirectory(root), "auth.json"));
    expect(chosen.from).toBe(exists ? "operator" : "forge");
    expect(chosen.path.startsWith(os.homedir()) || chosen.path.startsWith(root)).toBe(true);
  });

  it("whether a subscription is signed in is answered without reading the key itself", async () => {
    const dir = await ensureAgentDirectory(root);
    /* A file of Forge's own, so the assertion does not depend on the operator's real login. */
    await fs.writeFile(
      path.join(dir, "auth.json"),
      JSON.stringify({ "openai-codex": { type: "oauth", refresh: "…" } }),
      "utf8",
    );
    const status = await subscriptionStatus(root);
    if (status.from === "forge") {
      expect(status.signedIn).toBe(true);
      expect(JSON.stringify(status)).not.toContain("…");
    }
  });

  it("Pi runs the loop, and calls nothing but the tools given to it", async () => {
    const stub = await stubModel();
    const dir = await ensureAgentDirectory(root);
    // A skill in Pi's own layout. Nothing in this repository reads it; Pi has to find it.
    await fs.mkdir(path.join(dir, "skills", "disk-full"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "skills", "disk-full", "SKILL.md"),
      "---\nname: disk-full\ndescription: what to look at when a disk is filling up\n---\n\n# Steps\n\n1. df -h\n",
      "utf8",
    );

    const ran: string[] = [];
    let session;
    try {
      session = await startPiSession({
        userDataRoot: root,
        systemPrompt: () => "This is a test.",
        model: { ...MODEL, baseUrl: stub.url },
        apiKey: "test-key",
        /* Defined with Pi's own `defineTool`, as the real caller does. */
        tools: [
          (await loadPi()).defineTool({
            name: "run_command",
            label: "Command",
            description: "run one command on the server",
            parameters: Type.Object({
              command: Type.String({ description: "the command to run", minLength: 1 }),
            }),
            execute: async (_toolCallId: string, args: Record<string, unknown>) => {
              ran.push(String(args["command"]));
              return { content: [{ type: "text", text: "what is in etc" }], details: {} };
            },
          }),
        ],
        toolNames: ["run_command"],
        onEvent: () => undefined,
      });

      await session.prompt("have a look at /etc");

      // 1. Pi called the tool we defined, with the arguments the model asked for.
      expect(ran).toEqual(["ls /etc"]);
      // 2. It reached the endpoint Forge wrote into models.json.
      expect(stub.seen.length).toBeGreaterThan(0);
      // 3. Only our tool was offered — none of Pi's own, which act on this machine.
      const request = stub.seen[0] as { tools?: Array<{ function?: { name?: string } }> };
      const offered = (request.tools ?? []).map((tool) => tool.function?.name);
      expect(offered).toEqual(["run_command"]);
      // 4. The skill was discovered by Pi from Forge's directory.
      expect(session.resources.skills.map((skill) => skill.name)).toContain("disk-full");
    } finally {
      session?.dispose();
      stub.server.close();
    }
  }, 60_000);
});
