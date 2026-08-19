import type {
  RemoteCommandRule,
  RemoteCommandSet,
  RemoteRuleSet,
  RulePolicy,
} from "../../../shared/remoteAgent";
import { catalogText, t } from "../../../shared/i18n";
import { findCommand } from "./catalog";

/**
 * The guarantee, as code.
 *
 * `docs/decisions/0001-shell-under-a-written-guarantee.md` states what an agent on this path may
 * do. This is the only place that decides it, it is pure, and it is tested — because everything
 * else in the loop is allowed to assume that a command which got past here is one somebody agreed
 * the agent could run.
 *
 * Two judges live here. `judgeCommand` is the one the run path uses since the 2026-08-15 note on
 * the ADR: the shape gates, then the shipped catalog's judgement, the operator's exceptions, and
 * floors that neither can soften. `judge` is its predecessor — exact allowlists, quiet tables —
 * kept because old tests pin the shared shape gates through it and because `BUILT_IN_SETS` below
 * is still what old settings files migrate from.
 *
 * A refusal is a sentence for the model to read, not an exception: it can try something else.
 */

export type Verdict =
  | { allowed: false; reason: string }
  /** `approval: "required"` overrides the run's mode. See gate 3. */
  | { allowed: true; approval: "required" | "optional"; why?: string };

/** Anything that turns one command into several, or redirects where its output goes. */
const METACHARACTERS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /[;&|]/, name: "; & |" },
  { pattern: /`/, name: "`" },
  { pattern: /\$\(/, name: "$(" },
  { pattern: /[<>]/, name: "< >" },
  { pattern: /[\n\r]/, name: "a line break" },
];

/**
 * Programs that stop for a person whatever the mode says.
 *
 * Not a judgement about whether the operator wants them run — they asked for an agent that can
 * restart a service — but about whether a wrong one is recoverable. `journalctl` misread wastes a
 * minute; `mkfs` misread does not.
 */
const DESTRUCTIVE = new Set([
  "rm", "rmdir", "dd", "mkfs", "fdisk", "parted", "shred", "truncate",
  "shutdown", "reboot", "halt", "poweroff", "init",
  "kill", "pkill", "killall",
  "chown", "chmod", "chgrp",
  "mount", "umount", "swapoff",
  "userdel", "usermod", "passwd", "groupdel",
  "iptables", "nft", "ufw",
  // Windows. `taskkill` and `shutdown` are the same act by another name.
  "taskkill", "del", "erase", "format", "diskpart", "reg", "rd", "rmdir",
]);

/** sudo options that stand alone. Anything not named here or below is refused. */
const SUDO_FLAGS = new Set(["-n", "-H", "-E", "-i", "-s", "--non-interactive", "--login"]);

/** sudo options whose value is the next word, which is therefore not the program. */
const SUDO_OPTIONS_WITH_VALUE = new Set(["-u", "-g", "-p", "-h", "-r", "-t", "-U", "-C"]);

/** As long as a command may be. Longer than any real one, short enough not to be a payload. */
const MAX_LENGTH = 500;

/**
 * Split on whitespace, keeping quoted runs together.
 *
 * Only needed to find the program and to look over the arguments. Metacharacters are refused
 * whether or not they are quoted, so nothing here has to reason about what a shell would do with
 * a quote — this is reading, not parsing.
 */
export function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let started = false;

  for (const character of command) {
    if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      started = true;
      continue;
    }
    if (/\s/.test(character)) {
      if (started || current) tokens.push(current);
      current = "";
      started = false;
      continue;
    }
    current += character;
  }
  if (started || current) tokens.push(current);
  return tokens;
}

/** What the shared front half of both judges hands back. */
type SplitOutcome =
  | { refused: string; kind: "shape" | "sudo" }
  | { program: string; rest: string[]; elevated: boolean };

/**
 * The shape gates and the sudo walk, shared by the old judge and the new.
 *
 * Step over sudo's own options to find what is really being run. Only options we know, and only
 * those — an unknown one is refused rather than skipped. Skipping anything starting with `-` was
 * wrong in a way worth remembering: `-u` takes a value, so `sudo -u postgres nc …` left
 * `postgres` as the program, which is in nobody's allowlist, and `nc` sailed past as an argument.
 * A parser that guesses which flags consume the next word is a parser that can be walked around,
 * so this one refuses to guess.
 */
function splitProgram(text: string, agentName: string, allowSudo: boolean): SplitOutcome {
  if (!text) return { refused: t("The command is empty."), kind: "shape" };
  if (text.length > MAX_LENGTH) {
    return { refused: t("The command is too long (up to {max} characters).", { max: MAX_LENGTH }), kind: "shape" };
  }
  for (const { pattern, name } of METACHARACTERS) {
    if (pattern.test(text)) {
      return {
        refused: t(
          "{what} cannot be used. Write one command on one line. Anything needing a pipe or a " +
            "redirect is run by a person.",
          { what: name },
        ),
        kind: "shape",
      };
    }
  }

  const tokens = tokenize(text);
  let program = tokens[0] ?? "";
  let rest = tokens.slice(1);
  let elevated = false;

  if (program === "sudo") {
    if (!allowSudo) {
      return { refused: t("This agent ({name}) is not allowed sudo.", { name: agentName }), kind: "sudo" };
    }
    elevated = true;
    while (rest.length > 0 && rest[0].startsWith("-")) {
      const option = rest[0];
      if (SUDO_FLAGS.has(option)) {
        rest = rest.slice(1);
        continue;
      }
      if (SUDO_OPTIONS_WITH_VALUE.has(option)) {
        if (rest.length < 2) return { refused: t("sudo {option} has no value.", { option }), kind: "shape" };
        rest = rest.slice(2);
        continue;
      }
      // `--user=postgres` and friends carry their value, so there is nothing to step over.
      if (/^--[a-z-]+=/.test(option)) {
        rest = rest.slice(1);
        continue;
      }
      return { refused: t("sudo {option} cannot be used.", { option }), kind: "shape" };
    }
    program = rest[0] ?? "";
    rest = rest.slice(1);
    if (!program) return { refused: t("There is no command after sudo."), kind: "shape" };
  }

  /*
   * A program is a name, not a path.
   *
   * `/usr/bin/ls` and `/tmp/ls` have the same last component, so matching on the basename would
   * let an allowlist for `ls` run anything somebody had put somewhere and called `ls`. The agent
   * can write the bare name; `PATH` is the far end's business.
   */
  if (program.includes("/")) {
    return {
      refused: t("Write the command by name rather than by path ({name}).", {
        name: program.split("/").pop() ?? "",
      }),
      kind: "shape",
    };
  }
  return { program, rest, elevated };
}

export function judge(command: string, set: RemoteCommandSet): Verdict {
  const split = splitProgram(command.trim(), set.name, set.allowSudo);
  if ("refused" in split) return { allowed: false, reason: split.refused };
  const { program, rest, elevated } = split;

  if (!set.allow.includes(program)) {
    return {
      allowed: false,
      reason: t("{program} is not on this agent's list ({name}). It may use: {allowed}", {
        program,
        name: set.name,
        allowed: set.allow.join(" "),
      }),
    };
  }

  if (elevated) {
    return { allowed: true, approval: "required", why: t("sudo is confirmed every time.") };
  }
  if (DESTRUCTIVE.has(program)) {
    return {
      allowed: true,
      approval: "required",
      why: t("{program} can be impossible to undo.", { program }),
    };
  }
  // A device node in the arguments, whatever the program: `tee /dev/sda` is not a read.
  if (rest.some((token) => token.startsWith("/dev/"))) {
    return { allowed: true, approval: "required", why: t("It points at a device.") };
  }

  /*
   * What this list says may run unattended — and nothing else.
   *
   * The source used to hold a table of dangerous verbs, and everything not in it went through.
   * That table could only ever contain the dangers somebody had already thought of: `apt install`
   * and `docker exec` were both missing from it, and both ran without asking. Turned round, what
   * is written down is what may be quiet, and anything nobody has written about stops for a
   * person. The list belongs to the operator, on the settings screen, because it is a judgement
   * about their customers' machines and not a fact about programs.
   */
  const quiet = set.quiet?.[program];
  if (quiet === "all") return { allowed: true, approval: "optional" };
  if (Array.isArray(quiet)) {
    /* The first argument is the verb. One rule, so the screen can state it in one line. */
    const verb = rest[0];
    if (verb !== undefined && quiet.includes(verb)) {
      return { allowed: true, approval: "optional" };
    }
    return {
      allowed: true,
      approval: "required",
      why: verb
        ? t("{name} may run {program} on its own only as: {verbs}", {
            name: set.name,
            program,
            verbs: quiet.join(" "),
          })
        : t("{program} with no arguments. This list names the verbs it may use.", { program }),
    };
  }
  return {
    allowed: true,
    approval: "required",
    why: t("{name} does not let {program} run on its own.", { name: set.name, program }),
  };
}

/**
 * The successor of `judge` above: rules and the shipped catalog instead of a hand-authored
 * allowlist. What replaced gate 2 ("named in the set, or refused") is a ladder:
 *
 * 1. **Shape** — unchanged, shared with the old judge.
 * 2. **Refusals** — the operator's `deny` rules, and the catalog's `shell` class by default.
 *    Answered to the model without a person being interrupted.
 * 3. **Floors** — sudo, destructive programs, destructive verbs, device nodes. Always a person,
 *    and never softened by a rule or a remembered decision: `canRemember: false` is what the
 *    approval card reads to say "this cannot be made automatic".
 * 4. **The operator's rules** — their exceptions beat the catalog.
 * 5. **The catalog** — tier 1 `read` runs unattended (unless the profile turned that off);
 *    everything else it knows stops with its description.
 * 6. **Unknown** — stops for a person, who may remember the decision. The old judge refused
 *    here; ADR 0001's 2026-08-15 note is where that changed.
 */
export type RuleVerdict =
  | { allowed: false; reason: string; kind: "shape" | "sudo" | "denied" }
  | {
      allowed: true;
      approval: "required" | "optional";
      why?: string;
      program: string;
      verb?: string;
      elevated: boolean;
      /** What stopped it, when something did. `floor` and sudo can never be remembered away. */
      stop?: "floor" | "unknown" | "catalog" | "rule" | "verb";
      canRemember: boolean;
      /** The catalog's one-line description, for the approval card. */
      summary?: string;
    };

/**
 * The destructive floor, case-insensitive. The old `DESTRUCTIVE` set plus the PowerShell names —
 * Windows spells its irreversibles in Verb-Noun, and Windows is case-blind, so the comparison is
 * lowercased on both sides.
 */
const DESTRUCTIVE_FLOOR = new Set([
  ...DESTRUCTIVE,
  "remove-item", "stop-service", "stop-process", "stop-computer",
  "restart-computer", "format-volume", "clear-content",
  // Disabling a service's startup is `systemctl disable` by another name.
  "set-service",
]);

/**
 * Program-and-first-argument pairs that stop for a person whatever any rule says.
 *
 * ADR 0001 guarantee 4 names `systemctl stop|disable|mask` — until now that held only because no
 * quiet list mentioned them. Once decisions can be remembered from a card, "nobody wrote it down"
 * stops being a floor, so the floor is written down here. `judgeCommand` checks this before it
 * reads any rule, which is what makes an `autoVerbs: ["stop"]` entry ineffective by construction.
 */
const DESTRUCTIVE_VERBS: Record<string, string[]> = {
  systemctl: ["stop", "disable", "mask"],
  sc: ["stop", "delete"],
  net: ["stop"],
  // BusyBox spells `rm` as a first argument, so the floor has to as well.
  busybox: [
    "rm", "rmdir", "dd", "reboot", "halt", "poweroff", "init",
    "kill", "killall", "chown", "chmod", "umount", "swapoff", "passwd", "mkswap",
  ],
};

/**
 * Flags that turn an otherwise-readable program dangerous, matched anywhere in the arguments.
 *
 * `find` is a read tool until it is given `-delete` or `-exec` — then it removes files or runs
 * arbitrary commands. The danger is a flag, not the first word, so it is scanned for across the
 * whole argument list and forces a person. (awk/sed, whose danger is the whole script rather than
 * a flag, are the `code` class instead — refused on the target entirely.)
 */
const DANGEROUS_FLAGS: Record<string, string[]> = {
  find: ["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprintf", "-fprint0"],
};

/**
 * Programs that read the whole tree below wherever they are pointed.
 *
 * Not dangerous in themselves — `find /etc` is a second. Pointed at `/` on a customer's machine
 * they are the one read that can hurt: an NFS mount hangs the walk, a data volume turns it into
 * an hour of I/O, and the operator finds out when the application on that server slows down.
 */
const WALKS_A_TREE = new Set(["find", "du", "tree", "ncdu"]);
const RECURSIVE = /^-{1,2}(r|R|recursive)$/;

/** Case-insensitive lookup in a rule set. Windows wrote `get-service`; the model wrote `Get-Service`. */
function ruleFor(rules: RemoteRuleSet, program: string): RemoteCommandRule | undefined {
  const direct = rules[program];
  if (direct) return direct;
  const lower = program.toLowerCase();
  for (const [name, rule] of Object.entries(rules)) {
    if (name.toLowerCase() === lower) return rule;
  }
  return undefined;
}

export function judgeCommand(command: string, policy: RulePolicy): RuleVerdict {
  const split = splitProgram(command.trim(), policy.name, policy.allowSudo);
  if ("refused" in split) return { allowed: false, reason: split.refused, kind: split.kind };
  const { program, rest, elevated } = split;
  const verb = rest[0];
  const entry = findCommand(program);
  const rule = ruleFor(policy.rules, program);
  const base = { program, verb, elevated, summary: entry?.summary };

  // The operator's refusal answers by itself; nobody is interrupted for a settled question.
  if (rule?.action === "deny") {
    return {
      allowed: false,
      kind: "denied",
      reason: t("{program} is refused by {name}. Find another way.", { program, name: policy.name }),
    };
  }
  // Shells are refused by default. Only an explicit exception opens one.
  if (!rule && entry?.class === "shell") {
    return {
      allowed: false,
      kind: "denied",
      reason: t("{program} is a kind of command that is never run — {summary}. Find another way.", {
        program,
        summary: catalogText(entry.summary),
      }),
    };
  }
  /*
   * A script-taking command (awk, sed, perl…) does not reach the target: its danger lives inside
   * a program the gate cannot read, and the safe place to run arbitrary code is the sandbox.
   * Refused here with the model steered to fetch the data and analyse it in `run_local`.
   */
  if (!rule && entry?.class === "code") {
    return {
      allowed: false,
      kind: "denied",
      reason:
        t(
          "{program} cannot be run on the server. Copy what you need across with fetch_log or " +
            "read_file and work on it in run_local, where it is isolated.",
          { program },
        ),
    };
  }

  if (elevated) {
    return {
      allowed: true, approval: "required", stop: "floor", canRemember: false,
      why: t("sudo is confirmed every time."), ...base,
    };
  }
  if (DESTRUCTIVE_FLOOR.has(program.toLowerCase())) {
    return {
      allowed: true, approval: "required", stop: "floor", canRemember: false,
      why: t("{program} can be impossible to undo.", { program }), ...base,
    };
  }
  const floorVerbs = DESTRUCTIVE_VERBS[program.toLowerCase()];
  if (verb && floorVerbs?.includes(verb.toLowerCase())) {
    return {
      allowed: true, approval: "required", stop: "floor", canRemember: false,
      why: t("{program} {verb} can be impossible to undo.", { program, verb }), ...base,
    };
  }
  const dangerousFlags = DANGEROUS_FLAGS[program.toLowerCase()];
  if (dangerousFlags) {
    const hit = rest.find((token) => dangerousFlags.includes(token.toLowerCase()));
    if (hit) {
      return {
        allowed: true, approval: "required", stop: "floor", canRemember: false,
        why: t("{program} {flag} can be impossible to undo.", { program, flag: hit }), ...base,
      };
    }
  }
  // A device node in the arguments, whatever the program: `tee /dev/sda` is not a read.
  if (rest.some((token) => token.startsWith("/dev/"))) {
    return {
      allowed: true, approval: "required", stop: "floor", canRemember: false,
      why: t("It points at a device."), ...base,
    };
  }
  /*
   * The whole machine, walked.
   *
   * `/` as an argument to something that descends is the read that costs: minutes to hours of
   * I/O, and a network mount can stop it answering at all. Bounded searches (`find /etc …`) are
   * untouched — it is the root, specifically, that is being asked about here.
   */
  if (
    rest.includes("/") &&
    (WALKS_A_TREE.has(program.toLowerCase()) || rest.some((token) => RECURSIVE.test(token)))
  ) {
    return {
      allowed: true, approval: "required", stop: "floor", canRemember: false,
      why: t(
        "This reads the whole machine, end to end. It takes time, and it can slow down whatever " +
          "that server is for.",
      ), ...base,
    };
  }

  if (rule) {
    if (rule.action === "auto") {
      return { allowed: true, approval: "optional", canRemember: true, ...base };
    }
    // "ask", possibly with first arguments the operator said may run by themselves.
    if (verb && rule.autoVerbs?.some((v) => v.toLowerCase() === verb.toLowerCase())) {
      return { allowed: true, approval: "optional", canRemember: true, ...base };
    }
    if (rule.autoVerbs?.length) {
      return {
        allowed: true, approval: "required", stop: "verb", canRemember: true,
        why: t("It may run on its own only as: {program} {verbs}", {
          program,
          verbs: rule.autoVerbs.join(" "),
        }), ...base,
      };
    }
    return {
      allowed: true, approval: "required", stop: "rule", canRemember: true,
      why: t("{program} is set to be confirmed every time.", { program }), ...base,
    };
  }

  if (entry && entry.tier === 1) {
    if (entry.class === "read") {
      if (policy.autoReads) return { allowed: true, approval: "optional", canRemember: true, ...base };
      return {
        allowed: true, approval: "required", stop: "catalog", canRemember: true,
        why: t("This agent is set to confirm reads as well."), ...base,
      };
    }
    if (entry.class === "verbs") {
      const readVerbs = Object.entries(entry.verbs ?? {})
        .filter(([, kind]) => kind === "read")
        .map(([name]) => name);
      if (verb && readVerbs.some((v) => v.toLowerCase() === verb.toLowerCase())) {
        if (policy.autoReads) return { allowed: true, approval: "optional", canRemember: true, ...base };
        return {
          allowed: true, approval: "required", stop: "catalog", canRemember: true,
          why: t("This agent is set to confirm reads as well."), ...base,
        };
      }
      return {
        allowed: true, approval: "required", stop: "catalog", canRemember: true,
        why: t("It may run on its own only as a read: {program} {verbs}", {
          program,
          verbs: readVerbs.join(" "),
        }), ...base,
      };
    }
    // Tier 1 write — described, understood, and still a person's call every time.
    return {
      allowed: true, approval: "required", stop: "catalog", canRemember: true,
      why: t("{program} can change the server.", { program }), ...base,
    };
  }
  if (entry) {
    // Tier 2: we know what it is, not what it may do unattended.
    return {
      allowed: true, approval: "required", stop: "catalog", canRemember: true,
      why: t("{program} is known here, but nobody has judged yet whether it reads or writes.", {
        program,
      }), ...base,
    };
  }
  return {
    allowed: true, approval: "required", stop: "unknown", canRemember: true,
    why: t("Nothing has been decided about {program} yet.", { program }), ...base,
  };
}

/**
 * The program a command would run, sudo unwrapped — for counting history, not for judging.
 * Undefined when the line would not have parsed as one command at all.
 */
export function programOf(command: string): string | undefined {
  const split = splitProgram(command.trim(), "", true);
  return "refused" in split ? undefined : split.program;
}

/**
 * Whether this command carries a `{{placeholder}}`.
 *
 * The model never sees a secret's value: it writes the name, and the real value is put in by the
 * last step before the command leaves. What that costs is the output — a command that was given a
 * password may print it back, so the record keeps the command and drops what it said.
 */
export function usesSecret(command: string) {
  return /\{\{[a-z0-9_.-]+\}\}/i.test(command);
}

/** Put the real values in. Anything unknown is left as it was, and the run fails loudly instead. */
export function fillSecrets(command: string, values: Map<string, string>) {
  return command.replace(/\{\{([a-z0-9_.-]+)\}\}/gi, (whole, key: string) =>
    values.get(key) ?? whole,
  );
}

/**
 * The categories as they were before the catalog — migration data now.
 *
 * Nothing runs against these any more: `withRules` in `store.ts` reads them (and any the
 * operator made) once, diffs them against the catalog, and keeps only the differences as the
 * profile's exceptions. They also seeded the catalog's tier 1, which is where their judgements
 * live on. Removing them would strand every settings file written before 2026-08-15.
 */
export const BUILT_IN_SETS: RemoteCommandSet[] = [
  {
    id: "files",
    name: "Read files",
    allow: ["ls", "cat", "head", "tail", "less", "stat", "file", "find", "grep", "wc", "diff"],
    allowSudo: false,
    quiet: {
      ls: "all", cat: "all", head: "all", tail: "all", less: "all", stat: "all", file: "all",
      find: "all", grep: "all", wc: "all", diff: "all",
    },
  },
  {
    id: "resource",
    name: "Performance and resources",
    allow: [
      "df", "du", "free", "uptime", "ps", "top", "vmstat", "iostat", "mpstat", "sar",
      "nproc", "lscpu", "lsmem", "lsof",
    ],
    allowSudo: false,
    quiet: {
      df: "all", du: "all", free: "all", uptime: "all", ps: "all", top: "all", vmstat: "all",
      iostat: "all", mpstat: "all", sar: "all",
      nproc: "all", lscpu: "all", lsmem: "all", lsof: "all",
    },
  },
  {
    id: "logs",
    name: "Logs",
    allow: ["journalctl", "dmesg", "tail", "grep", "zcat", "last"],
    allowSudo: false,
    quiet: { journalctl: "all", dmesg: "all", tail: "all", grep: "all", zcat: "all", last: "all" },
  },
  {
    id: "os",
    name: "OS and time",
    allow: [
      "uname", "hostname", "hostnamectl", "timedatectl", "date", "lsb_release", "env", "sysctl",
    ],
    allowSudo: false,
    quiet: {
      uname: "all", hostname: "all", hostnamectl: "all", timedatectl: "all", date: "all",
      lsb_release: "all", env: "all",
      /* `sysctl -a` reads every knob; `sysctl -w` turns one. */
      sysctl: ["-a", "-n"],
    },
  },
  {
    id: "network",
    name: "Network",
    allow: ["ip", "ss", "netstat", "ping", "dig", "nslookup", "traceroute", "curl", "arp", "route"],
    allowSudo: false,
    quiet: {
      ip: "all", ss: "all", netstat: "all", ping: "all", dig: "all", nslookup: "all",
      traceroute: "all", arp: "all", route: "all",
      /* `curl` reads a URL and can also send a file to one. These are the ways that only read. */
      curl: ["-I", "-s", "-sS", "-fsS"],
    },
  },
  {
    id: "storage",
    name: "Storage",
    allow: ["df", "du", "lsblk", "mount", "findmnt", "blkid", "smartctl", "lvs", "vgs", "pvs"],
    allowSudo: false,
    quiet: {
      df: "all", du: "all", lsblk: "all", findmnt: "all", blkid: "all",
      lvs: "all", vgs: "all", pvs: "all",
      /* `mount` with no arguments lists what is mounted; with them it mounts something. */
      mount: [],
      smartctl: ["-i", "-H", "-a", "--scan"],
    },
  },
  {
    id: "services",
    name: "Services and jobs",
    allow: ["systemctl", "service", "journalctl", "crontab", "systemd-analyze"],
    allowSudo: false,
    quiet: {
      journalctl: "all",
      "systemd-analyze": "all",
      systemctl: [
        "status", "show", "cat", "is-active", "is-enabled",
        "list-units", "list-unit-files", "list-timers",
      ],
      service: ["status"],
      crontab: ["-l"],
    },
  },
  {
    /*
     * The application, containers included.
     *
     * Not a category called Docker: an image and a compose file are how an application is
     * wrapped and started, and a shelf named after one product leaves podman — and applications
     * that use no containers at all — with nowhere to stand. See `docs/server-domain-model.md`.
     */
    id: "application",
    name: "Applications",
    allow: ["docker", "podman", "docker-compose", "git", "kubectl"],
    allowSudo: false,
    quiet: {
      docker: [
        "ps", "images", "logs", "inspect", "stats", "top", "port", "history", "version", "info",
      ],
      podman: ["ps", "images", "logs", "inspect", "stats", "top", "version", "info"],
      "docker-compose": ["ps", "logs", "config", "images", "top"],
      git: ["status", "log", "diff", "show", "branch", "remote"],
      kubectl: ["get", "describe", "logs", "top", "explain"],
    },
  },
  {
    id: "packages",
    name: "Packages and updates",
    allow: [
      "dpkg-query", "apt-cache", "rpmquery", "needs-restarting",
      "apt", "apt-get", "dpkg", "dnf", "yum", "rpm", "pip3", "npm", "snap",
    ],
    allowSudo: false,
    quiet: {
      /* The read-only halves, which cannot install whatever they are given. */
      "dpkg-query": "all", "apt-cache": "all", rpmquery: "all", "needs-restarting": "all",
      /* And the ones that do both, by the word that says which. */
      apt: ["list", "show", "search", "policy"],
      dpkg: ["-l", "-L", "-s", "-S", "--list", "--status"],
      dnf: ["list", "info", "search", "repoquery", "check-update"],
      yum: ["list", "info", "search", "check-update"],
      rpm: ["-qa", "-qi", "-ql", "-q", "-V"],
      pip3: ["list", "show", "freeze"],
      npm: ["ls", "view", "outdated"],
      snap: ["list", "info"],
    },
  },
  {
    id: "identity",
    name: "Identity and permissions",
    allow: ["id", "whoami", "getent", "groups", "last", "who", "w"],
    allowSudo: false,
    quiet: {
      id: "all", whoami: "all", getent: "all", groups: "all", last: "all", who: "all", w: "all",
    },
  },
  {
    /*
     * Windows, which is why RDP is in this product at all.
     *
     * `cmd` and `powershell` are absent for the same reason `bash` is: they are shells, and a
     * shell in the list makes every other line of the guarantee decorative. What is here reads.
     */
    id: "windows",
    name: "Windows: looking",
    allow: [
      "dir", "type", "findstr", "where", "tree",
      "tasklist", "sc", "systeminfo", "ver", "hostname", "whoami", "wmic",
      "ipconfig", "netstat", "nslookup", "ping", "route", "arp",
      "net", "query", "driverquery", "wevtutil",
    ],
    allowSudo: false,
    quiet: {
      dir: "all", type: "all", findstr: "all", where: "all", tree: "all",
      tasklist: "all", systeminfo: "all", ver: "all", hostname: "all", whoami: "all",
      ipconfig: "all", netstat: "all", nslookup: "all", ping: "all", route: "all", arp: "all",
      query: "all", driverquery: "all",
      sc: ["query", "queryex", "qc", "qdescription"],
      net: ["view"],
      wevtutil: ["qe", "el", "gli"],
      /* `wmic` lists and deletes under the same name, so nothing of it runs unattended. */
    },
  },
];


