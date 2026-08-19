# Skills and extensions (forge-ops)

A skill teaches the agent how something is done; an extension gives it another tool. This document
is the shape both have to take. It is written to be read by a person, and it is also **the
specification of the checker** — everything here that a machine can verify is what `yarn inspect`
actually verifies.

> This rests on ADR 0002 in machina-workspace, "run code on our side and send the target only
> input it can audit": **code runs on our side only, and what the customer's machine receives is
> input at a granularity somebody can audit.**

## Where they go, and what they are called

Pi's layout. Created from Forge's settings screen, they come out in this shape.

| | Where | What goes in it |
| --- | --- | --- |
| Skill | `skills/<name>/SKILL.md` | Knowledge of how to do something. It can only use the tools that already exist |
| Prompt | `prompts/<name>.md` | A reusable instruction |
| Extension | `extensions/<name>.ts` | Code that runs inside Forge's own process. It adds a tool |

`<name>` is letters, digits and `-` `_` `.` only, up to 63 characters. Pi looks for the file under
this name, so a space or a character outside ASCII will not do. The body can be in any language.

## The shape of a skill

```markdown
---
name: deploy-app
description: Update the source on the server, build it with docker and swap it in. Use this when asked to deploy
commands: [git, docker]
---

# What this does

…
```

- **`description` says when to use it.** The agent reads this line to choose. A description that
  says only what it does will not be picked when it should be.
- **`commands:` declares what the skill will have run.** With a declaration, the check stops
  guessing at the prose and starts comparing a list against the allowlist. Leave it out and the
  checker takes the first word of each code block instead — and a guess is wrong sooner or later.
- The body holds the steps, what to decide on, and how to check. **Write down how to check the
  result**: a step with no way of checking it carries on after it has failed.

## What to keep to

### 1. What reaches the server is one command on one line

Do not write anything that sends a script over to be run. `bash -c "…"`, a heredoc, `curl … | sh`,
`base64 -d | bash` — with any of them, the record can only say "a script ran". One line, one
record, one decision to approve is exactly what this product sells.

### 2. Declare the commands, and stay inside the allowlist

At run time, a command outside what is allowed is refused. A skill written around `systemctl`
stops halfway on an installation that does not allow it. **Run the checker with `--allow` and you
know before you install it.**

### 3. Do not rewrite a file with `echo`

A redirect collides with the shape gate, and nothing about what was written survives in the record
as structure. The steps are fixed (ADR 0002, "changing a file"):

1. Read it (`read_file`) — a diff against anything but the real thing is a lie
2. Back it up on the far end (`cp file file.bak.<when>`, one command on one line)
3. Keep a copy on this side too (in the run record, with its hash and when it was taken)
4. Produce the new contents here
5. Put the diff and the whole text on the approval card, for a person to read
6. Once approved, transfer it (`write_file`)
7. Run a syntax check on one line, and restore from the backup if it fails

A skill only has to say "change it by those steps". The agent's tools carry the rest.

### 4. Never write a credential, and never make one appear

No password, key or token in the body of a skill. No step like `cat ~/.ssh/id_rsa` that puts a
secret on standard output. **A secret is encrypted on the operator's machine and appears neither
on screen, nor in a request to a model, nor in the record** — that is what the customer is
promised, and a skill must not be able to break it.

### 5. Nothing goes outside

A skill is knowledge, not hands. "Post the result to Slack" is not something a skill can do —
there is no tool for it. Write an extension if you need that, and have the operator allow the tool
explicitly. A URL in the body is treated as a reference, so linking to a document is free.

### 6. A bundled script runs inside the isolation

A skill may bundle a `scripts/` directory. It runs **in the isolation on this side**, where three
things hold:

- It can write to the run's working directory and nowhere else (not the operator's home, not
  `/tmp`)
- It cannot read the operator's home
- It has no network

So a script that wants to `pip install` first, or to call an API, will not work. **Bundle what it
needs.** On a machine that can build no isolation, the `run_local` tool does not appear at all
(the exception being the clause in ADR 0002: only where the operator has explicitly taken it on).

## The shape of an extension

```ts
// @tools lookup_ticket

export function register(pi) {
  pi.registerTool({ name: "lookup_ticket", … })
}
```

- **Declare what it adds with `// @tools`.** The operator allows it by that name. An undeclared
  tool means a tool arriving without the operator knowing what they agreed to.
- **An extension is outside the isolation.** It runs inside Forge's process, so it reaches
  everything Node reaches. Using `child_process`, `fs`, `net`/`http`/`https` or `fetch`, and any
  URL in the code, appear on the installation card as they are. **None of it is forbidden** — the
  operator installs it knowing.
- Using a tool an extension added is recorded, with its name on it.

## The checker

```
yarn inspect <file> [--allow git,docker,ls,cat]
```

It reads with **the same code that makes the card at installation time**
(`src/main/remote/agent/inspect.ts`). What passes here is what Forge will show a card about.

Exit codes:

| | What it means |
| --- | --- |
| 0 | Nothing here for the mechanical check to stop on |
| 1 | Something needs a person: a command outside the allowlist, or an extension reaching outside |
| 2 | Used wrongly (the file could not be read, and the like) |

Without `--allow`, it does **not** compare against an allowlist — everything would count as
missing and the word would stop meaning anything. What you pass is the same list as the allowlist
on Forge's settings screen.

### What the check looks at

- A skill: the `commands:` declaration (or the first word of each code block), against the
  allowlist
- An extension: the `// @tools` declaration, imports of `child_process`, `fs` and the network, and
  any URL in the code
- Line numbers (a finding nobody can go and look at is no finding)

### What it does not look at

Obfuscation, a command assembled at run time, or what the prose actually means. **This check is
not what stops anything.** What stops things is what happens at run time — the catalog, the
approval and the record — and this is the reading beforehand. The model's reading on the
installation card (a summary of what it is, and what is worth noticing) is a help in the same way,
and it can be wrong.

## From writing one to installing it

1. Write it to this specification (hand `skills/write-skill/SKILL.md` to an outside AI tool if one
   is writing it)
2. Run `yarn inspect <file> --allow <the allowlist>` and fix until it comes back 0
3. Install it from Forge's settings screen, reading the card before you do
4. Edit it, and go back to 2
