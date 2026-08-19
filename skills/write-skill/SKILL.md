---
name: write-skill
description: Write a skill or an extension for forge-ops. Use this to teach the agent a way of working, or to fix a skill that exists
commands: [node]
---

# Writing a skill for forge-ops

This skill is **how to write another skill**. A person can follow it, and so can an outside AI
tool such as Claude Code. The specification is in
[`docs/skill-spec.md`](../../docs/skill-spec.md), and `yarn inspect` verifies the part of it a
machine can verify.

## The steps

### 1. Decide what the skill is for

If you cannot say **when to use it** in one sentence, do not write it yet. `description` is the
only thing the agent has to choose a skill by, and one that says only what it does will not be
picked when it is needed.

Bad: `builds with docker`
Good: `Update the source on the server, build it with docker and swap it in. Use this when asked
to deploy`

### 2. Write each step together with how to check it

For every step, write what it does and what would show that it worked. A step with no check
carries on to the next one after it has failed.

- Declare the commands it will use in the frontmatter's `commands:`
- What reaches the server is **one command on one line**. No `bash -c`, and nothing piped into a
  shell
- To rewrite a file, do not use `echo` or a redirect: leave it to read → back up → produce →
  approve the diff → transfer → verify
- Never write a secret (a password, a key, a token), and never write a step that prints one

The specification's "what to keep to" has the detail. **Do not write one without reading it.**

### 3. Run the checker

```bash
yarn inspect skills/<name>/SKILL.md --allow <the allowed commands, comma-separated>
```

Pass the allowlist exactly as it appears on Forge's settings screen (the allowlist for that
server). Fix until the exit code is 0. When it is 1, choose one of two things:

- Change the skill so it stays inside the commands that are allowed
- Ask for that command to be added to the allowlist. **Adding it is the operator's decision**, not
  the author's

### 4. Install it

From Forge's settings screen. The installation card shows what the checker showed. After editing
it, go back to step 3.

## When to write an extension instead

Only when a tool itself is missing. Teaching a way of working needs nothing but a skill.

- Declare what it adds with `// @tools <name>`
- An extension runs inside Forge's process. It is **outside the isolation**, and it reaches
  everything Node reaches. Imports of `child_process`, `fs` and the network, and any URL, appear
  on the installation card
- Reaching outside is not forbidden; **reaching outside quietly is**. Say what it is for, in a
  comment at the top of the extension

## What this check cannot do

It does not see an obfuscated command, a string assembled at run time, or what the prose actually
means. Passing the checker is not "this was found to be safe" — it is "nothing looked wrong in the
part a machine can read". What stops things is what happens at run time: the catalog, the approval
and the record. This is the reading beforehand.
