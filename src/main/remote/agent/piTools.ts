import { Type } from "typebox";
import { maskNote, maskSecrets } from "./secrets";
import type { ProposalGate, RemoteApprovalMode, RulePolicy } from "../../../shared/remoteAgent";
import {
  keyForCharacter,
  keyNameToScancode,
  NAMED_KEYS,
  scancodeOf,
} from "../../../shared/scancodes";
import { countChanges, unifiedDiff } from "./diff";
import { fillSecrets, judgeCommand, usesSecret } from "./policy";

/**
 * The four tools, as Pi tools.
 *
 * The engine changed; the guarantee did not. Every command still passes the same three gates
 * before it leaves this process — the allowlist, the metacharacter rule, and a person for
 * anything destructive or elevated — and the ceiling on how many commands one run may attempt is
 * enforced here rather than by whoever is driving the loop. Pi calls `execute`; this file decides
 * whether anything happens.
 *
 * They are written against callbacks rather than against a session so that the gates can be
 * tested without a server, a model, or a window.
 */

/**
 * What this run's agent may touch.
 *
 * `shell` runs commands over SSH and only looks at the screen. `screen` works the desktop —
 * clicks, keys — and has no shell at all. **Never both**: an agent that can type into a terminal
 * window on the remote desktop has no allowlist, whatever the allowlist says.
 *
 * The second one exists because a customer's server may have no SSH at all. Refusing to work on
 * those was not an answer.
 */
export type Control = "shell" | "screen";

export type ToolRuntime = {
  /** Which half of the world this run can reach. */
  control: Control;
  /**
   * What this run may run, read fresh per command.
   *
   * A function rather than a value because the operator can remember a decision mid-run, and the
   * very next command must already obey it — a policy captured at start would be a step behind
   * the person for the rest of the conversation.
   */
  policy(): RulePolicy;
  mode: RemoteApprovalMode;
  /** How many commands this run may attempt, refusals included. */
  /**
   * Take one from the budget and say how many have gone.
   *
   * A function rather than a counter in here because a delegated agent spends from the same
   * budget as the one that called it. Three children with twenty steps each is sixty commands on
   * a customer's server, from a run the operator capped at twenty.
   */
  /** Counts a command. Nothing stops on the number — it is what the window shows. */
  spend(): number;
  /** Values the agent may name but never see. */
  secrets(): Promise<Map<string, string>>;
  /** Ask a person. Resolves true when they said yes. */
  approve(request: {
    command: string;
    reason?: string;
    why?: string;
    /** Judgement material for the card, and whether the answer may be remembered. */
    gate?: ProposalGate;
    /** What the agent is looking at, for an action nobody can judge from its words. */
    frame?: string;
    /** What would change, for an action whose words cannot be judged either. */
    diff?: string;
    proposed?: string;
    /** Where on the frame it would land. Drawn on the picture, not into it. */
    point?: { x: number; y: number; kind: "click" | "scroll" | "keys" };
  }): Promise<boolean>;
  /** Actually run it, on the server. */
  run(
    command: string,
    options?: { timeoutMs?: number },
  ): Promise<{ ok: boolean; code?: number; output: string; timedOut?: boolean }>;
  /** The desktop as a PNG, if a screen is open. */
  screenshot(): Promise<{ base64: string; mimeType: string } | undefined>;
  /** Move the pointer and hold or release buttons. Bit 1 is left, 2 is right, 4 is middle. */
  mouse(x: number, y: number, buttons: number): void;
  /** One key, down or up, as a PC/XT scan code. */
  key(code: number, down: boolean): void;
  /** One character, as a UTF-16 code unit, for what the US layout has no key for. */
  unicode(code: number): void;
  /** How big the desktop is, so a coordinate can be checked before it is sent. */
  screenSize(): { width: number; height: number } | undefined;
  /** One skill's text, by name. Only from the agent's own directory. */
  readSkill(name: string): Promise<string>;
  /** What skills there are, for the prompt and for refusing a name that is not one. */
  skills(): Array<{ name: string; description: string }>;
  /** Whether this run's model can read a picture. */
  canSeeImages: boolean;
  /**
   * The wall this machine can build for a local command, if any.
   *
   * No wall, no tool: `run_local` is not offered when this is undefined. The customer-facing
   * statement "the AI computes only on our side" is only sayable while "our side" cannot reach
   * the operator's keys or the network.
   */
  sandbox?: string;
  /** Run a command behind that wall, in this run's work directory. */
  localRun(
    command: string,
    options?: { timeoutMs?: number },
  ): Promise<{ ok: boolean; code?: number; output: string; timedOut?: boolean }>;
  /**
   * The server's facts, read now with the app's fixed probes. Supplied only for shell runs that
   * reach a server. Read-only; same commands the panels run.
   */
  serverFacts?(): Promise<{ at: string; summary: string; detail: string }>;
  /**
   * Copy a log into the work directory without passing it through the model's context. Supplied
   * only when there is both a server to read and a wall to analyse in. Returns where it landed
   * and how big it was.
   */
  fetchLog?(input: {
    path?: string;
    unit?: string;
    lines: number;
  }): Promise<{ savedAs: string; lines: number; bytes: number }>;
  /**
   * Files on the customer's server, over the transfer path rather than through a command.
   *
   * `echo … > file` is refused by the shape gate and would leave the record saying nothing about
   * what was written. ADR 0002 fixes the order instead: read the real thing, keep a copy on our
   * side, generate here, show the diff, write, verify, and be able to go back.
   */
  files?: {
    /** Fetch it as it is now, and keep a copy in the work directory. */
    read(path: string): Promise<{ content: string; sha256: string; savedAs: string }>;
    /** Write content that is already in the work directory. */
    write(path: string, content: string): Promise<void>;
  };
  /**
   * The named agents this run may hand a task to.
   *
   * Empty for most runs, and always empty inside a delegated one: one level, so a mistake
   * cannot recurse. No entries means no `delegate` tool at all.
   */
  delegates(): Array<{ id: string; name: string; purpose?: string }>;
  /** Hand a task to one of them and wait. What comes back is its summary, not its transcript. */
  delegate(id: string, task: string): Promise<{ ok: boolean; summary: string }>;
  /**
   * Keep a file the run produced, beside the record, for after the run.
   *
   * Absent where there is no local execution to produce anything. The path is relative to the
   * work directory and cannot leave it — see `session.ts`.
   */
  keep?(relativePath: string): Promise<{ savedAs: string; sha256: string; bytes: number }>;
  /**
   * Write down what was established, under a title, in this server's logbook.
   *
   * Absent for the local conversation (no server to know anything about) and for a delegated run
   * (it was given one corner of the work; the parent writes what it concludes).
   */
  saveNote?(title: string, body: string): Promise<void>;
  /**
   * Wait until nobody is being asked to approve something.
   *
   * A model can ask for several tools in one turn, and Pi runs them side by side. Without this,
   * a command that needed nobody carried on reaching the customer's server while the operator was
   * still reading a card about a different one — deciding about a machine that was moving under
   * them. Anything already approved is not held: its card is gone, and waiting for the next one
   * would be a command approved and then not run.
   */
  pause?(): Promise<void>;
  /** Told about everything that happened, for the transcript and the record. */
  record(event: {
    kind: "step" | "question" | "done";
    /** Which tool did it. Defaults to `run_command`; `run_local` marks the operator's side. */
    tool?:
      | "run_command"
      | "run_local"
      | "read_file"
      | "write_file"
      | "save_local"
      | "write_note"
      | "read_server_facts"
      | "fetch_log";
    /** Which wall a local command ran behind. */
    sandbox?: string;
    /** `false` when there was no wall at all — the exception in ADR 0002. Never `true`. */
    sandboxed?: false;
    /** A file this step kept on this machine, for the card that offers to open it. */
    file?: { name: string; savedAs: string; bytes: number; sha256: string };
    /** What changed, for a step that wrote a file. */
    diff?: string;
    command?: string;
    frameBefore?: string;
    frameAfter?: string;
    point?: { x: number; y: number; kind: "click" | "scroll" | "keys" };
    reason?: string;
    decision?: "auto" | "approved" | "rejected";
    ok?: boolean;
    code?: number;
    output?: string;
    detail?: string;
    usedSecret?: boolean;
    text?: string;
  }): void;
};

/** A Pi tool result: text, or a picture, and nothing else this path needs. */
type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
/** A snapshot as something an `<img>` can show. */
const asDataUrl = (shot?: { base64: string; mimeType: string }) =>
  shot ? `data:${shot.mimeType};base64,${shot.base64}` : undefined;

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }], details: {} });

/** What `defineTool` is, without importing Pi here. */
export type DefineTool = (spec: {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (
    toolCallId: string,
    args: Record<string, unknown>,
  ) => Promise<{ content: Content[]; details: unknown; terminate?: boolean }>;
}) => unknown;

const PLAN_REFUSAL =
  "This is a plan. Nothing is sent to the server. Do not run anything; write the steps through to the end.";

/**
 * How long a command may take.
 *
 * Two minutes suits a question about the machine and kills a `docker compose build`, which is
 * the work this mode is actually for. The default stays short — a command that hangs should not
 * hold the run for half an hour — and anything long says so, and says how long.
 */
const DEFAULT_WAIT_SECONDS = 120;
const MAX_WAIT_SECONDS = 1800;

/**
 * The output, as much of it as the model should read.
 *
 * A build prints thousands of lines and the interesting one is the last. Handing all of it to
 * the model fills the context window with layer hashes, and Pi then compacts the conversation to
 * make room — so the price of one build log is the rest of the conversation. The head says what
 * was being done, the tail says how it ended, and the middle is named rather than sent. The run
 * record keeps everything: this is what the model reads, not what we store.
 */
/** How many agents one call may set going. More than this is a plan, not a delegation. */
const MOST_AT_ONCE = 3;

const MODEL_HEAD_LINES = 40;
const MODEL_TAIL_LINES = 120;

export function forTheModel(output: string): string {
  const lines = output.split("\n");
  if (lines.length <= MODEL_HEAD_LINES + MODEL_TAIL_LINES) return output;
  const dropped = lines.length - MODEL_HEAD_LINES - MODEL_TAIL_LINES;
  return [
    ...lines.slice(0, MODEL_HEAD_LINES),
    `…(${dropped} lines left out; the whole of it is in the record)…`,
    ...lines.slice(-MODEL_TAIL_LINES),
  ].join("\n");
}

export function createRemoteTools(defineTool: DefineTool, runtime: ToolRuntime) {
  /** Spent through the runtime so that a refused command still costs a step, and so that a
      delegated agent takes from the same budget as the agent that called it. */

  /**
   * What happens before anything reaches the far end: the ceiling, the mode, and the person.
   *
   * Returns a result when the action must not happen, and nothing when it may. A pointer has no
   * allowlist — there is no way to read "click at (412, 380)" and know what it does — so in
   * `step` mode every one of them is somebody's decision, made while looking at the same picture
   * the model looked at.
   */
  const beforeAction = async (
    summary: string,
    reason?: string,
    frame?: string,
    point?: { x: number; y: number; kind: "click" | "scroll" | "keys" },
  ) => {
    if (runtime.mode === "plan") {
      runtime.record({ kind: "step", command: summary, decision: "rejected", ok: false, detail: PLAN_REFUSAL });
      return text(PLAN_REFUSAL);
    }
    if (runtime.mode === "step") {
      const said = await runtime.approve({ command: summary, reason, frame, point });
      if (!said) {
        runtime.record({
          kind: "step",
          command: summary,
          decision: "rejected",
          ok: false,
          detail: "A person did not approve it.",
        });
        return text("It was not approved. Find another way.");
      }
    }
    return undefined;
  };

  const runCommand = runtime.control === "shell" ? defineTool({
    name: "run_command",
    label: "Command",
    description:
      "Runs one command on the server. Only what is allowed gets through. No pipes, no redirection, " +
      "nothing chained — one command on one line. `cd` is not available either, so give the working " +
      "directory to the command itself, as in `git -C <dir>` or `docker compose -f <file>`." +
      ` It is cut off after ${DEFAULT_WAIT_SECONDS} seconds unless you say otherwise; for something ` +
      `long, such as a build, give wait_seconds (up to ${MAX_WAIT_SECONDS}).`,
    parameters: Type.Object({
      command: Type.String({ description: "the command to run", minLength: 1, maxLength: 2000 }),
      reason: Type.Optional(Type.String({ description: "why you are running it", maxLength: 300 })),
      wait_seconds: Type.Optional(
        Type.Integer({
          description: "seconds to wait for it to finish — only for long ones, such as a build or a package update",
          minimum: 1,
          maximum: MAX_WAIT_SECONDS,
        }),
      ),
    }),
    execute: async (_id, args) => {
      const command = String(args["command"] ?? "").trim();
      const reason = args["reason"] ? String(args["reason"]) : undefined;
      const waitSeconds = Math.min(
        MAX_WAIT_SECONDS,
        Math.max(1, Number(args["wait_seconds"] ?? DEFAULT_WAIT_SECONDS)),
      );

      if (runtime.mode === "plan") {
        runtime.record({ kind: "step", command, reason, decision: "rejected", ok: false, detail: PLAN_REFUSAL });
        return text(PLAN_REFUSAL);
      }


      const verdict = judgeCommand(command, runtime.policy());
      if (!verdict.allowed) {
        runtime.record({
          kind: "step",
          command,
          reason,
          decision: "rejected",
          ok: false,
          detail: verdict.reason,
        });
        return text(`Not run: ${verdict.reason}`);
      }

      /* A person, when the command asks for one or the mode does. */
      const needsPerson = verdict.approval === "required" || runtime.mode === "step";
      /* Nothing else moves while somebody is being asked about something. */
      if (!needsPerson) await runtime.pause?.();
      if (needsPerson) {
        const said = await runtime.approve({
          command,
          reason,
          why: verdict.why,
          gate: {
            program: verdict.program,
            verb: verdict.verb,
            /* Stopped only by the mode: still rememberable — it takes effect in automatic mode. */
            stop: verdict.stop ?? "mode",
            canRemember: verdict.canRemember,
            summary: verdict.summary,
          },
        });
        if (!said) {
          runtime.record({
            kind: "step",
            command,
            reason,
            decision: "rejected",
            ok: false,
            detail: "A person did not approve it.",
          });
          return text("It was not approved. Find another way.");
        }
      }

      let result;
      try {
        const secrets = await runtime.secrets();
        const secret2 = usesSecret(command);
        const sent = secret2 ? fillSecrets(command, secrets) : command;
        result = await runtime.run(sent, { timeoutMs: waitSeconds * 1000 });
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        runtime.record({ kind: "step", command, reason, decision: "rejected", ok: false, detail });
        return text(`Could not run it: ${detail}`);
      }
      const secret = usesSecret(command);

      /* Output from a command that carried a secret is not kept: the value is usually echoed. */
      runtime.record({
        kind: "step",
        command,
        reason,
        decision: needsPerson ? "approved" : "auto",
        ok: result.ok,
        code: result.code,
        output: secret ? undefined : result.output,
        usedSecret: secret,
      });
      const ended = result.timedOut
        ? `Cut off after ${waitSeconds} seconds. It may still be running`
        : `exit code ${result.code ?? "?"}`;
      return text(
        `${ended}\n${secret ? "(the output is not kept, because a secret was used)" : forTheModel(result.output)}`,
      );
    },
  }) : undefined;

  /**
   * The other half of ADR 0002: a real shell, on our machine, behind the wall.
   *
   * No allowlist here — pipes, redirects and scripts are the point, because analysis and file
   * generation need them. What makes that safe is the sandbox: writes only in this run's work
   * directory, no reads of the operator's home, and no network, so the only road to the
   * customer's server stays `run_command` with its gates. Spends from the same budget, obeys the
   * same approval mode, lands in the same record — with the wall's name on it.
   */
  const runLocal = runtime.sandbox ? defineTool({
    name: "run_local",
    label: "Run here",
    description:
      (runtime.sandbox === "none"
        ? "Runs a shell command on the operator's own machine. This machine has no way to isolate, so it " +
          "runs with the operator's own privileges. Every line needs a person's approval. Do not touch " +
          "files or the network you have no need to touch."
        : "Runs a shell command in an isolated working directory on the operator's own machine. Pipes, " +
          "redirection and scripts are available here. There is no network, nothing outside the working " +
          "directory can be written, and it does not touch the server at all.") +
      " Do your analysis, your counting and your file generation here, and send only the finished " +
      "line to the server with run_command." +
      ` It is cut off after ${DEFAULT_WAIT_SECONDS} seconds unless you say otherwise (wait_seconds, up to ${MAX_WAIT_SECONDS}).`,
    parameters: Type.Object({
      command: Type.String({ description: "the command to run", minLength: 1, maxLength: 4000 }),
      reason: Type.Optional(Type.String({ description: "why you are running it", maxLength: 300 })),
      wait_seconds: Type.Optional(
        Type.Integer({ description: "seconds to wait for it to finish", minimum: 1, maximum: MAX_WAIT_SECONDS }),
      ),
    }),
    execute: async (_id, args) => {
      const command = String(args["command"] ?? "").trim();
      const reason = args["reason"] ? String(args["reason"]) : undefined;
      const waitSeconds = Math.min(
        MAX_WAIT_SECONDS,
        Math.max(1, Number(args["wait_seconds"] ?? DEFAULT_WAIT_SECONDS)),
      );
      /*
       * `sandboxed: false` is written only when it is false.
       *
       * ADR 0002 asks for it so the runs that happened without a wall can be counted afterwards —
       * a consent dialog is a memory, the record is evidence. Absent means there was a wall, and
       * `sandbox` names which one.
       */
      const noWall = runtime.sandbox === "none";
      const mark = {
        tool: "run_local" as const,
        sandbox: runtime.sandbox,
        ...(noWall ? { sandboxed: false as const } : {}),
      };

      if (runtime.mode === "plan") {
        runtime.record({ kind: "step", ...mark, command, reason, decision: "rejected", ok: false, detail: PLAN_REFUSAL });
        return text(PLAN_REFUSAL);
      }
      /*
       * Without a wall, `auto` does not apply to this tool.
       *
       * The approval is the only gate left — the other two properties (nothing outside the work
       * directory, no network) are gone — so it is not something a mode can switch off.
       */
      if (runtime.mode === "step" || noWall) {
        const said = await runtime.approve({
          command: `[here${noWall ? " · not isolated" : ""}] ${command}`,
          reason,
          ...(noWall
            ? {
                why:
                  "This machine has no way to isolate. This command runs with your own privileges, on this " +
                  "machine, as it is.",
              }
            : {}),
        });
        if (!said) {
          runtime.record({ kind: "step", ...mark, command, reason, decision: "rejected", ok: false, detail: "A person did not approve it." });
          return text("It was not approved. Find another way.");
        }
      }

      const result = await runtime.localRun(command, { timeoutMs: waitSeconds * 1000 });
      runtime.record({
        kind: "step",
        ...mark,
        command,
        reason,
        decision: runtime.mode === "step" || noWall ? "approved" : "auto",
        ok: result.ok,
        ...(result.code === undefined ? {} : { code: result.code }),
        output: result.output,
      });
      const ended = result.timedOut
        ? `Cut off after ${waitSeconds} seconds. It may have still been running`
        : `exit code ${result.code ?? "?"}`;
      return text(`${ended}\n${forTheModel(result.output)}`);
    },
  }) : undefined;

  /**
   * The file, as it is now — and a copy kept on our side.
   *
   * The first of ADR 0002's seven steps, and the reason the rest can be honest: a diff against
   * a file the agent imagined is a lie, and a backup that lives only on the machine being
   * repaired dies with it. This does both in one fetch, because the fetch was needed anyway.
   */
  const readFile = runtime.files ? defineTool({
    name: "read_file",
    label: "Read a file",
    description:
      "Fetches a file from the server and gives you its contents. A copy is put in the workspace on " +
      "this side and its hash goes into the record. If you mean to change a file, always read the " +
      "real one with this first.",
    parameters: Type.Object({
      path: Type.String({ description: "an absolute path on the server", minLength: 1, maxLength: 1000 }),
      reason: Type.Optional(Type.String({ maxLength: 300 })),
    }),
    execute: async (_id, args) => {
      const target = String(args["path"] ?? "").trim();
      const reason = args["reason"] ? String(args["reason"]) : undefined;
      const mark = { tool: "read_file" as const };

      if (runtime.mode === "plan") {
        runtime.record({ kind: "step", ...mark, command: `read: ${target}`, reason, decision: "rejected", ok: false, detail: PLAN_REFUSAL });
        return text(PLAN_REFUSAL);
      }

      try {
        const file = await runtime.files!.read(target);
        runtime.record({
          kind: "step",
          ...mark,
          command: `read: ${target}`,
          reason,
          decision: "auto",
          ok: true,
          output: `${file.sha256}  ${target}\ncopy on this side: ${file.savedAs}`,
        });
        /*
         * The whole file goes to the model here — that is the point of the tool — so this is
         * where a config file's credentials would leave the building. The copy in the workspace
         * keeps the real thing; what crosses is the file with its passwords taken out.
         */
        const masked = maskSecrets(file.content);
        return text(
          `${target} (sha256 ${file.sha256}) is also on this side at ${file.savedAs}.\n\n` +
            forTheModel(masked.text) +
            maskNote(masked.hidden),
        );
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        runtime.record({ kind: "step", ...mark, command: `read: ${target}`, reason, decision: "rejected", ok: false, detail });
        return text(`Could not read it: ${detail}`);
      }
    },
  }) : undefined;

  /**
   * The new file, written after a person has seen what changes.
   *
   * Always asks, in every approval mode. A configuration file is the moment a customer's service
   * changes shape, and `auto` was agreed for reading logs, not for that. The content comes from
   * the work directory — generated on our side by `run_local` — because a file the model typed
   * into a tool argument is a script by another name.
   */
  const writeFile = runtime.files ? defineTool({
    name: "write_file",
    label: "Write a file",
    description:
      "Writes something made in the workspace on this side to a file on the server. Before writing, " +
      "the difference from the real file and the whole new text are shown to a person for approval. " +
      "Take a copy on the server first (for example cp /etc/x.conf /etc/x.conf.bak).",
    parameters: Type.Object({
      path: Type.String({ description: "an absolute path on the server", minLength: 1, maxLength: 1000 }),
      from: Type.String({
        description: "the name of the file in the workspace holding what to write (made with run_local)",
        minLength: 1,
        maxLength: 500,
      }),
      reason: Type.Optional(Type.String({ maxLength: 300 })),
    }),
    execute: async (_id, args) => {
      const target = String(args["path"] ?? "").trim();
      const from = String(args["from"] ?? "").trim();
      const reason = args["reason"] ? String(args["reason"]) : undefined;
      const mark = { tool: "write_file" as const };
      const summary = `write: ${target} ← ${from}`;

      if (runtime.mode === "plan") {
        runtime.record({ kind: "step", ...mark, command: summary, reason, decision: "rejected", ok: false, detail: PLAN_REFUSAL });
        return text(PLAN_REFUSAL);
      }

      /* What to write is read from the workspace on this side, never taken as a tool argument. */
      const made = await runtime.localRun(`cat -- ${JSON.stringify(from)}`);
      if (!made.ok) {
        const detail = `There is no ${from} in the workspace. Make it with run_local first.`;
        runtime.record({ kind: "step", ...mark, command: summary, reason, decision: "rejected", ok: false, detail });
        return text(detail);
      }

      let current = "";
      try {
        current = (await runtime.files!.read(target)).content;
      } catch {
        /* Creating a file that is not there is a write too — the difference is against nothing. */
      }
      const diff = unifiedDiff(current, made.output);
      if (!diff) {
        runtime.record({ kind: "step", ...mark, command: summary, reason, decision: "auto", ok: true, detail: "It was already the same." });
        return text("The contents already match, so nothing was written.");
      }

      const changed = countChanges(current, made.output);
      const said = await runtime.approve({
        command: `${summary}（+${changed.added} / -${changed.removed}）`,
        reason,
        why: "This changes a configuration file. Check the difference and the whole text.",
        diff,
        proposed: made.output,
      });
      if (!said) {
        runtime.record({ kind: "step", ...mark, command: summary, reason, decision: "rejected", ok: false, detail: "A person did not approve it.", diff });
        return text("It was not approved. Find another way.");
      }

      try {
        await runtime.files!.write(target, made.output);
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        runtime.record({ kind: "step", ...mark, command: summary, reason, decision: "approved", ok: false, detail, diff });
        return text(`Could not write it: ${detail}`);
      }

      runtime.record({ kind: "step", ...mark, command: summary, reason, decision: "approved", ok: true, diff });
      return text(
        `Wrote ${target} (+${changed.added} / -${changed.removed}).` +
          "If the software has a configuration check, run it with run_command, and restore from your copy if it fails.",
      );
    },
  }) : undefined;

  const readScreen = runtime.canSeeImages ? defineTool({
    name: "read_screen",
    label: "Look at the screen",
    description: "Takes one look at the server's desktop. Available only while the RDP screen is open.",
    parameters: Type.Object({}),
    execute: async () => {
      const shot = await runtime.screenshot();
      if (!shot) return text("No screen is open. Open the RDP screen and try again.");
      return {
        content: [{ type: "image" as const, data: shot.base64, mimeType: shot.mimeType }],
        details: {},
      };
    },
  }) : undefined;

  /*
   * Skills are read through here, and only from the agent's own directory.
   *
   * Pi's own way is for the model to `read` the SKILL.md — which would mean enabling a tool that
   * reads any file on the operator's laptop, next to their keys and their customers' notes. One
   * scoped reader gives the same progressive disclosure with none of that: names and
   * descriptions are always in front of the model, the body arrives when it asks by name.
   */
  const readSkill = defineTool({
    name: "read_skill",
    label: "Read a skill",
    description:
      "Reads the body of a skill. Only the names listed in the system prompt exist.",
    parameters: Type.Object({
      name: Type.String({ description: "the name of the skill", minLength: 1, maxLength: 64 }),
    }),
    execute: async (_id, args) => {
      const name = String(args["name"] ?? "").trim();
      const known = runtime.skills().some((skill) => skill.name === name);
      if (!known) {
        const list = runtime.skills().map((skill) => skill.name).join(" ") || "(none)";
        return text(`There is no skill called ${name}. There is: ${list}`);
      }
      try {
        return text(await runtime.readSkill(name));
      } catch (cause) {
        return text(`Could not read it: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    },
  });

  /*
   * The server's facts, on demand.
   *
   * The same fixed, read-only probes the logbook handed the model at start — re-run so the model
   * can refresh after it has changed something. No approval and allowed in plan mode, for the
   * same reason `read_skill`/`read_screen` are: the commands are constants in this repository,
   * not something the model invented. Full detail goes back; the record keeps what it saw.
   */
  const readServerFacts =
    runtime.control === "shell" && runtime.serverFacts
      ? defineTool({
          name: "read_server_facts",
          label: "The server's facts",
          description:
            "Reads the server's make-up and state again, now, with this application's own fixed set of " +
            "readings, and gives you the whole of it: OS, CPU, memory, disks, services, ports, containers, " +
            "firewall, updates. The commands are fixed and nothing on the server changes. Use it when you think the state has moved.",
          parameters: Type.Object({}),
          execute: async () => {
            try {
              const facts = await runtime.serverFacts!();
              runtime.record({
                kind: "step",
                tool: "read_server_facts",
                command: "[facts] read the make-up and state again",
                decision: "auto",
                ok: true,
                output: facts.detail,
              });
              return text(facts.detail);
            } catch (cause) {
              const detail = cause instanceof Error ? cause.message : String(cause);
              runtime.record({
                kind: "step",
                tool: "read_server_facts",
                command: "[facts] read the make-up and state again",
                decision: "auto",
                ok: false,
                detail,
              });
              return text(`Could not read it: ${detail}`);
            }
          },
        })
      : undefined;

  /*
   * Fetch a log into the work directory, past the context window.
   *
   * A big log analysed by reading it through the model is a big log paid for in tokens. This
   * copies it to our side (the wall) instead — the model gets one line saying where it landed,
   * then processes it with `run_local` (pipes and all). Read-only and fixed-form: `tail` or
   * `journalctl -n`, with the path/unit validated before it is interpolated. Only offered when
   * there is both a server to read and a wall to land it in.
   */
  const fetchLog =
    runtime.control === "shell" && runtime.fetchLog && runtime.sandbox
      ? defineTool({
          name: "fetch_log",
          label: "Fetch a log",
          description:
            "Copies a log from the server into the workspace, where run_local can reach it. The contents " +
            "do not come back here; they are put under files/logs/ for you to work on with run_local. " +
            "Give either a path or a unit name, and how many lines from the end.",
          parameters: Type.Object({
            path: Type.Optional(
              Type.String({ description: "an absolute path to a log file", maxLength: 500 }),
            ),
            unit: Type.Optional(
              Type.String({ description: "a systemd unit name (for journalctl -u)", maxLength: 120 }),
            ),
            lines: Type.Integer({ description: "how many lines from the end", minimum: 1, maximum: 20000 }),
          }),
          execute: async (_id, args) => {
            const path = args["path"] ? String(args["path"]) : undefined;
            const unit = args["unit"] ? String(args["unit"]) : undefined;
            const lines = Math.min(20000, Math.max(1, Number(args["lines"] ?? 1000)));
            if (!path && !unit) return text("Give either a path or a unit name.");
            if (path && (!path.startsWith("/") || path.includes("..") || /[;&|`$<>\n]/.test(path))) {
              return text("The path must be absolute and must not contain punctuation.");
            }
            if (unit && !/^[A-Za-z0-9@._-]+$/.test(unit)) {
              return text("That is not the shape of a unit name.");
            }
            try {
              const kept = await runtime.fetchLog!({ path, unit, lines });
              runtime.record({
                kind: "step",
                tool: "fetch_log",
                command: `[log] ${path ?? unit} ${kept.lines} lines → ${kept.savedAs}`,
                decision: "auto",
                ok: true,
              });
              return text(
                `Copied ${kept.lines} lines (${Math.round(kept.bytes / 1024)} KB) to ${kept.savedAs}.` +
                  "Work on it with run_local.",
              );
            } catch (cause) {
              const detail = cause instanceof Error ? cause.message : String(cause);
              runtime.record({
                kind: "step",
                tool: "fetch_log",
                command: `[log] ${path ?? unit}`,
                decision: "auto",
                ok: false,
                detail,
              });
              return text(`Could not fetch it: ${detail}`);
            }
          },
        })
      : undefined;

  /*
   * The desktop, worked rather than watched.
   *
   * Only for a `screen` run, where there is no `run_command` to bypass. Every action stops for a
   * person in `step` mode — that is the only gate a pointer can have, since there is no
   * allowlist for "click here" — and the ceiling counts these as it counts commands.
   */
  const screenTools =
    runtime.control === "screen"
      ? [
          defineTool({
            name: "click",
            label: "Click",
            description:
              "Clicks the screen. The coordinates are pixels of the image read_screen gave you, with (0, 0) at the top left.",
            parameters: Type.Object({
              x: Type.Integer({ description: "x in the image", minimum: 0 }),
              y: Type.Integer({ description: "y in the image", minimum: 0 }),
              button: Type.Optional(
                Type.Union([Type.Literal("left"), Type.Literal("right")], {
                  description: "left unless you say otherwise",
                }),
              ),
              count: Type.Optional(Type.Integer({ description: "2 for a double click", minimum: 1, maximum: 2 })),
              reason: Type.Optional(Type.String({ description: "why you are pressing here", maxLength: 300 })),
            }),
            execute: async (_id, args) => {
              const x = Number(args["x"] ?? 0);
              const y = Number(args["y"] ?? 0);
              const right = args["button"] === "right";
              const count = Number(args["count"] ?? 1) === 2 ? 2 : 1;
              const summary = `${count === 2 ? "double " : ""}${right ? "right " : ""}click (${x}, ${y})`;

              const size = runtime.screenSize();
              if (!size) return text("No screen is open. Open the RDP screen.");
              if (x >= size.width || y >= size.height) {
                return text(`(${x}, ${y}) is off the screen. The screen is ${size.width}×${size.height}.`);
              }

              const before = await runtime.screenshot();
              const point = { x, y, kind: "click" as const };
              const gate = await beforeAction(
                summary,
                args["reason"] ? String(args["reason"]) : undefined,
                asDataUrl(before),
                point,
              );
              if (gate) return gate;

              const button = right ? 2 : 1;
              for (let press = 0; press < count; press++) {
                runtime.mouse(x, y, button);
                runtime.mouse(x, y, 0);
              }
              /* A moment for the far end to redraw, so "after" is actually after. */
              await new Promise((resolve) => setTimeout(resolve, 400));
              runtime.record({
                kind: "step",
                command: summary,
                decision: "approved",
                ok: true,
                point,
                frameBefore: asDataUrl(before),
                frameAfter: asDataUrl(await runtime.screenshot()),
              });
              return text(`${summary}. Confirm the result with read_screen.`);
            },
          }),

          defineTool({
            name: "type_text",
            label: "Type",
            description:
              "Types into whatever field has focus. Text outside ASCII works too, but only where the far " +
              "end accepts Unicode input (Windows does). After typing, always confirm with read_screen that " +
              "it went in.",
            parameters: Type.Object({
              text: Type.String({ description: "the text to type", minLength: 1, maxLength: 500 }),
              reason: Type.Optional(Type.String({ maxLength: 300 })),
            }),
            execute: async (_id, args) => {
              const value = String(args["text"] ?? "");
              const keys = [...value].map((character) => ({ character, key: keyForCharacter(character) }));

              const before = await runtime.screenshot();
              const gate = await beforeAction(
                `type "${value}"`,
                args["reason"] ? String(args["reason"]) : undefined,
                asDataUrl(before),
              );
              if (gate) return gate;

              /*
               * Two ways across, chosen per character.
               *
               * A key press names a place on a US keyboard, which covers ASCII and nothing else.
               * Everything else goes as the character itself, in UTF-16 code units — the way a
               * client types text its layout has no key for, and the reason this tool no longer
               * refuses text outside ASCII. Characters outside the basic plane are two units; both are sent,
               * in order, because that is what the far end reassembles.
               */
              const shift = scancodeOf("ShiftLeft")!;
              for (const { character, key } of keys) {
                const code = key ? scancodeOf(key.code) : undefined;
                if (code === undefined) {
                  for (let unit = 0; unit < character.length; unit++) {
                    runtime.unicode(character.charCodeAt(unit));
                  }
                  continue;
                }
                if (key!.shift) runtime.key(shift, true);
                runtime.key(code, true);
                runtime.key(code, false);
                if (key!.shift) runtime.key(shift, false);
              }
              await new Promise((resolve) => setTimeout(resolve, 400));
              runtime.record({
                kind: "step",
                command: `typed: ${value}`,
                decision: "approved",
                ok: true,
                frameBefore: asDataUrl(before),
                frameAfter: asDataUrl(await runtime.screenshot()),
              });
              return text(
                keys.every((each) => each.key)
                  ? "Typed. Confirm the result with read_screen."
                  : "Typed. Anything outside ASCII was sent as the character itself. A server that does not accept " +
                    "that receives nothing, so confirm with read_screen.",
              );
            },
          }),

          defineTool({
            name: "press_keys",
            label: "Keys",
            description:
              "Presses keys. Several at once are pressed together (for example ctrl c). The names you can use: " +
              Object.keys(NAMED_KEYS).join(" "),
            parameters: Type.Object({
              keys: Type.Array(Type.String({ minLength: 1, maxLength: 20 }), {
                description: "the names of the keys to press",
                minItems: 1,
                maxItems: 4,
              }),
              reason: Type.Optional(Type.String({ maxLength: 300 })),
            }),
            execute: async (_id, args) => {
              const names = (args["keys"] as string[] | undefined) ?? [];
              const codes = names.map((name) => keyNameToScancode(name));
              if (codes.some((code) => code === undefined)) {
                return text(`Some of those keys are not known: ${names.join(" ")}`);
              }

              const summary = names.join(" + ");
              const before = await runtime.screenshot();
              const gate = await beforeAction(
                `keys ${summary}`,
                args["reason"] ? String(args["reason"]) : undefined,
                asDataUrl(before),
              );
              if (gate) return gate;

              /* Held in the order given and released backwards, which is what a chord is. */
              for (const code of codes) runtime.key(code!, true);
              for (const code of [...codes].reverse()) runtime.key(code!, false);
              await new Promise((resolve) => setTimeout(resolve, 400));
              runtime.record({
                kind: "step",
                command: `keys: ${summary}`,
                decision: "approved",
                ok: true,
                frameBefore: asDataUrl(before),
                frameAfter: asDataUrl(await runtime.screenshot()),
              });
              return text(`Pressed ${summary}. Confirm the result with read_screen.`);
            },
          }),

          defineTool({
            name: "wait",
            label: "Wait",
            description: "Waits for the screen to change. For after an installer or a restart.",
            parameters: Type.Object({
              seconds: Type.Integer({ description: "seconds to wait", minimum: 1, maximum: 60 }),
            }),
            execute: async (_id, args) => {
              const seconds = Math.min(60, Math.max(1, Number(args["seconds"] ?? 1)));
              await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
              return text(`Waited ${seconds} seconds.`);
            },
          }),
        ]
      : [];

  /**
   * Hand the work to another named agent.
   *
   * Present only when the operator named agents this one may call — and never inside a delegated
   * run, so there is exactly one level. What comes back is the child's summary: its commands are
   * in the same conversation and the same record as this one's, but its reasoning and its raw
   * output stay out of this agent's context, which is most of the point of asking someone else.
   */
  const available = runtime.delegates();
  const delegate = available.length > 0 ? defineTool({
    name: "delegate",
    label: "Hand over",
    description:
      "Hands an investigation or a piece of work to another agent and gives you back its summary. Available: " +
      available.map((each) => `${each.name}${each.purpose ? `（${each.purpose}）` : ""}`).join("、") +
      ". It works with its own list and its own model, and shares what is left of this run's time. " +
      `Two or more handed over together run at the same time (up to ${MOST_AT_ONCE}). ` +
      "Hand over investigations together rather than one at a time.",
    parameters: Type.Object({
      tasks: Type.Array(
        Type.Object({
          agent: Type.String({ description: "the name of the agent to hand this to", minLength: 1, maxLength: 80 }),
          task: Type.String({
            description: "what to look into or what to do. This sentence is all it receives",
            minLength: 1,
            maxLength: 2000,
          }),
        }),
        { description: "the work to hand over. Several run at the same time", minItems: 1, maxItems: MOST_AT_ONCE },
      ),
    }),
    execute: async (_id, args) => {
      const asked = (Array.isArray(args["tasks"]) ? args["tasks"] : []).slice(0, MOST_AT_ONCE) as
        Array<{ agent?: unknown; task?: unknown }>;
      if (asked.length === 0) return text("There is nothing here saying who to hand what to.");

      if (runtime.mode === "plan") {
        runtime.record({
          kind: "step",
          command: `handed over: ${asked.map((each) => String(each.agent ?? "")).join(", ")}`,
          decision: "rejected",
          ok: false,
          detail: PLAN_REFUSAL,
        });
        return text(PLAN_REFUSAL);
      }

      const named = (name: string) =>
        available.find((each) => each.id === name) ??
        available.find((each) => each.name === name) ??
        available.find((each) => each.name.toLowerCase() === name.toLowerCase());

      /*
       * All of them at once.
       *
       * Two children looking at different things have no reason to wait for each other, and the
       * one place they would collide — an approval card — is serialised by the session, so what
       * the operator sees is still one question at a time.
       */
      const reports = await Promise.all(
        asked.map(async (each) => {
          const name = String(each.agent ?? "").trim();
          const task = String(each.task ?? "").trim();
          const chosen = named(name);
          if (!chosen) {
            return `There is no agent called ${name}. There is: ${available
              .map((one) => one.name)
              .join("、")}`;
          }
          const result = await runtime.delegate(chosen.id, task);
          return result.ok
            ? `${chosen.name} reported back:\n${result.summary}`
            : `${chosen.name} could not finish: ${result.summary}`;
        }),
      );
      return text(reports.join("\n\n"));
    },
  }) : undefined;

  /**
   * Keeping something, on purpose, where the record is.
   *
   * The work directory is wiped when the run ends. Everything the agent computes lives there, so
   * without this the answer to "write up what this server is running" exists for as long as the
   * conversation and then does not. What is kept sits beside the run's record — the same folder
   * as the copies taken before a file was changed — and the operator can open it from the card.
   *
   * Not a general write: the file has to already exist, made by `run_local` inside the wall.
   */
  /*
   * What was established, kept for next time.
   *
   * The one thing that outlives a conversation. A summary in the chat is read once and scrolls
   * away; the record holds every command but nobody reads forty of those again. This is the
   * middle: a titled note about the machine — "WordPress on this host", "where the logs are" —
   * put in front of every later run, so the next conversation does not start by finding the
   * document root again.
   *
   * Titled and replaced rather than appended: a second look at the database corrects the note
   * about the database. It does not end the run, and it can be written several times.
   */
  const writeNote = runtime.saveNote ? defineTool({
    name: "write_note",
    label: "Write it down",
    description:
      "Writes down something you established about this server, under a title, in its logbook. " +
      "Every later run is given these, so this is how what you found survives the conversation. " +
      "Writing the same title again replaces it. Use it as you go, not only at the end.",
    parameters: Type.Object({
      title: Type.String({
        description:
          "What the note is about, in a few words — \"WordPress on this host\", \"Apache and its " +
          "vhosts\", \"where the logs are\". Reuse the exact title to correct a note that exists.",
        minLength: 1,
        maxLength: 120,
      }),
      body: Type.String({
        description:
          "What is true, in Markdown, in enough detail to act on: paths, hosts, versions, " +
          "settings, and what you could not read and why. Not what you did — the commands are in " +
          "the record. Never copy a credential: name the setting and say a value is set.",
        minLength: 1,
        maxLength: 2000,
      }),
    }),
    execute: async (_id, args) => {
      const title = String(args["title"] ?? "").trim();
      const body = String(args["body"] ?? "").trim();
      try {
        await runtime.saveNote!(title, body);
        runtime.record({
          kind: "step",
          tool: "write_note",
          command: `[note] ${title}`,
          decision: "auto",
          ok: true,
          output: body,
        });
        return text(`Written down as "${title}". Every later run on this server is given it.`);
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        runtime.record({
          kind: "step",
          tool: "write_note",
          command: `[note] ${title}`,
          decision: "auto",
          ok: false,
          detail,
        });
        return text(`Could not write it down: ${detail}`);
      }
    },
  }) : undefined;

  const saveLocal = runtime.keep ? defineTool({
    name: "save_local",
    label: "Keep on this side",
    description:
      "Saves a file from the working directory next to the run's record. The working directory goes " +
      "when the run ends, so keep anything worth reading later this way — a summary of what you found, " +
      "a configuration file you generated, a list you fetched. A person can open it from the window.",
    parameters: Type.Object({
      path: Type.String({
        description: "a path relative to the working directory (for example report.md)",
        minLength: 1,
        maxLength: 400,
      }),
      note: Type.Optional(
        Type.String({ description: "what it is, in one line", maxLength: 200 }),
      ),
    }),
    execute: async (_id, args) => {
      const relative = String(args["path"] ?? "").trim();
      const note = args["note"] ? String(args["note"]) : undefined;
      try {
        const kept = await runtime.keep!(relative);
        runtime.record({
          kind: "step",
          tool: "save_local",
          command: `[kept] ${kept.savedAs}`,
          reason: note,
          decision: "auto",
          ok: true,
          /* No `output`: the card and the record both read `file`, and printing the same hash
             twice in the transcript is noise standing where the next step should be. */
          file: { name: kept.savedAs, savedAs: kept.savedAs, bytes: kept.bytes, sha256: kept.sha256 },
        });
        return text(
          `Saved ${kept.savedAs} next to the run's record (sha256 ${kept.sha256}).` +
            "A person can open this from the window.",
        );
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        runtime.record({
          kind: "step",
          tool: "save_local",
          command: `[kept] ${relative}`,
          reason: note,
          decision: "auto",
          ok: false,
          detail,
        });
        return text(`Could not save it: ${detail}`);
      }
    },
  }) : undefined;

  const askHuman = defineTool({
    name: "ask_human",
    label: "Ask a person",
    description: "Asks a person about something that needs deciding. This run stops until they answer.",
    parameters: Type.Object({
      question: Type.String({ description: "what you want to ask", minLength: 1, maxLength: 1000 }),
    }),
    execute: async (_id, args) => {
      const question = String(args["question"] ?? "");
      runtime.record({ kind: "question", text: question });
      /* Stopped rather than answered here: the answer comes as the next thing the person says,
         which is a new turn, not a tool result. */
      return { ...text("Asked. Waiting for an answer."), terminate: true };
    },
  });

  const done = defineTool({
    name: "done",
    label: "Done",
    description: "Says that the work is finished, or that you cannot carry on.",
    parameters: Type.Object({
      summary: Type.String({ description: "what you did and what you found", minLength: 1, maxLength: 2000 }),
    }),
    execute: async (_id, args) => {
      const summary = String(args["summary"] ?? "");
      runtime.record({ kind: "done", text: summary });
      return { ...text("Finished."), terminate: true };
    },
  });

  /*
   * A model that cannot read a picture is not offered one.
   *
   * The setting exists on every registered model and has to mean something: handing
   * `read_screen` to a text-only model wastes a turn and produces an error the operator then
   * has to interpret.
   */
  /*
   * One set or the other, never both.
   *
   * `run_command` is absent from a screen run and the pointer is absent from a shell run. This
   * line is the guarantee; everything above it is detail.
   */
  return [
    runCommand,
    runLocal,
    saveLocal,
    writeNote,
    readFile,
    writeFile,
    readScreen,
    readServerFacts,
    fetchLog,
    ...screenTools,
    readSkill,
    delegate,
    askHuman,
    done,
  ].filter(Boolean);
}

/** The names, for the allowlist that disables every tool Pi ships. */
/** Every name this file can produce. The allowlist that disables everything Pi ships. */
export const REMOTE_TOOL_NAMES = [
  "run_command",
  "run_local",
  "save_local",
  "write_note",
  "read_file",
  "write_file",
  "read_screen",
  "read_server_facts",
  "fetch_log",
  "read_skill",
  "delegate",
  "ask_human",
  "done",
];

/** The pointer's tools. Only ever offered to a run that has no shell. */
export const SCREEN_TOOL_NAMES = ["click", "type_text", "press_keys", "wait"];

/**
 * The names actually offered for a run.
 *
 * A shell run gets `run_command` and no pointer; a screen run gets the pointer and no
 * `run_command`. Both need eyes, so a model that cannot read a picture cannot do a screen run at
 * all — there would be nothing to aim at.
 */
export function remoteToolNames(options: {
  /** Whether this run has a logbook to write what it establishes into. */
  canWriteNote?: boolean;
  canSeeImages?: boolean;
  control?: Control;
  canDelegate?: boolean;
  canRunLocal?: boolean;
  canTouchFiles?: boolean;
  /**
   * Whether this run has a server at all.
   *
   * Without one there is nothing to send a command to and no screen to read, and the honest
   * thing is to not offer those tools rather than to offer them and fail. What is left works on
   * this machine: the wall, what it produced, the skills, and asking.
   */
  reachesServer?: boolean;
}) {
  const {
    canWriteNote = false,
    canSeeImages = false,
    control = "shell",
    canDelegate = false,
    canRunLocal = false,
    canTouchFiles = false,
    reachesServer = true,
  } = options;

  const onTheServer = !reachesServer
    ? []
    : control === "screen"
      ? [...SCREEN_TOOL_NAMES]
      : // read_server_facts rides with the shell: fixed read-only probes, never on a screen run.
        ["run_command", "read_server_facts"];
  const names = [
    ...onTheServer,
    "read_skill",
    ...(canWriteNote ? ["write_note"] : []),
    "ask_human",
    "done",
  ];
  /* Reading and writing a file is the shell path's work: a screen run has no transfer route. */
  const withFiles =
    reachesServer && canTouchFiles && control === "shell"
      ? [...names, "read_file", "write_file"]
      : names;
  /* Ours, not the target's: a run that works the screen may still compute locally without
     gaining a shell anywhere near the customer's machine. */
  const withLocal = canRunLocal ? [...withFiles, "run_local", "save_local"] : withFiles;
  /* fetch_log needs both a server to read and a wall to land the log in. */
  const withFetch =
    reachesServer && control === "shell" && canRunLocal
      ? [...withLocal, "fetch_log"]
      : withLocal;
  const withDelegate = canDelegate ? [...withFetch, "delegate"] : withFetch;
  return canSeeImages && reachesServer ? ["read_screen", ...withDelegate] : withDelegate;
}
