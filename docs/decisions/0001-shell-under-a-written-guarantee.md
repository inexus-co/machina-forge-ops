# ADR 0001: The agent may have a shell, under a guarantee written for this path alone

- Status: accepted
- Date: 2026-08-10
- Amended 2026-08-14, 2026-08-15, 2026-08-16 (below)
- Written first as a platform-level record and rewritten here in English when this application
  became its own repository. The decision, and the dates it was taken on, are unchanged.

## The problem

Remote maintenance means reaching a customer's server over RDP and SSH. A shell is not an
accessory to that work — it *is* the work. Restarting a unit, reading a log, checking a mount:
none of that happens by clicking.

The instinct in a tool that acts on somebody else's machine is to have no shell anywhere on the
path, and to say so. That instinct comes from a specific situation: an actuator whose only
feedback is a picture of a screen, where a wrong action is easy to take and hard to notice. It
does not carry over to a server that answers with an exit status and its own output.

So this path may run commands. What it may not do is run *arbitrary* commands.

## The decision

**The agent on this path may run commands. It cannot run any command it likes.**

### The guarantee

1. **Only commands from the allowlist.** The first word of the command has to be named in the
   list. No wildcards.
2. **Shell metacharacters do not get through.** `;` `&&` `||` `|` `` ` `` `$(` `>` `<` `&` and
   newlines are refused before anything is sent. An allowlist you can escape by appending
   `; rm -rf /` is not an allowlist.
3. **`sudo` only where it is allowed, and always with a person.** Elevation is never automatic,
   in any approval mode.
4. **Destructive commands always need a person.** Even when they are on the list, even in
   automatic mode: `rm` `dd` `mkfs` `shutdown` `reboot` `kill` `pkill`,
   `systemctl stop|disable|mask`, and anything writing to a device node.
5. **Everything is recorded** — the command as sent, the exit status, the output. Output from a
   command that used a stored secret is not kept.
6. **A stop button, and approval, are not optional** in either approval mode.
7. **Secret values never reach the model.** The model writes `{{key}}`; the substitution happens
   one step before the command leaves.

### What an operator gets from reading this

A refusal is not an error but a result: the model is told why and can try another way. And the
list of what may run is visible before a run, not discovered during one.

## Amendments

**2026-08-14 — the limits that count instead of judging are not used here.** Of the gates in
item 6, the numeric ones (a step ceiling, a time limit) were dropped on this path: a number said
nothing about the work. What remains is the stop button and per-command approval. What stops a
dangerous move is its kind, not its count — so this application does not claim that a ceiling
makes it safe.

**2026-08-15 — the catalog became the default.** Item 1 said there was no default list. There is
now: a catalog that ships with the application. Commands classified in it behave as classified
(reads run, writes stop, shells are refused), and **a command nobody has classified stops in front
of the operator rather than being refused**. The operator decides then and there — just this once,
automatic from now on (optionally per verb), or refused from now on — with the material for that
decision on screen: the command, what the catalog says about it, and what has happened with it on
this server. The decision is remembered per agent and per server; only "refused" answers without
asking. The direction is unchanged — only what is written down runs unattended — the authorship
just widened from the operator alone to a reviewed catalog. Unchanged: metacharacters (2), sudo
and destructive commands always needing a person (3, 4), the record (5), `{{name}}` (7), the stop
button. Implemented in `policy.ts` (`judgeCommand`) and `catalog/`.

**2026-08-16 — exceptions belong to the installation and the server, not to the agent.** The
sentence "the allowlist is per agent" is past tense from this date. A named agent is a *way of
working* (its model, its instructions, how it asks) and not a set of powers; an agent handed work
by another runs under the same one set of rules. The rules live in one place — the command
knowledge screen — and what is remembered lives per server. Wanting to separate powers is wanting
a separate installation.

## What it costs

**The guarantee is only as good as the list somebody writes.** A definition that allows `bash`
allows everything. Code cannot tell a wise list from a foolish one. What it can do is make the
list explicit and visible before a run.

**The agent dies with the application.** It runs inside the operator's window, not as a service
beside the target. Long work belongs in `tmux` or in a unit on the server, and the interface
should say so rather than imply the opposite.

## Alternatives considered

**Give the agent only screen control and drive the server through its desktop.** Rejected: that
is blind operation against a machine that can answer properly, and reading a log through
screenshots of a terminal is worse in every way.

> **2026-08-12:** for the case this rejection did not cover — a server with SSH closed and only a
> screen — a screen-driving agent was added later. It is exclusive with the shell: one run works
> either the screen or the shell, and never holds both sets of tools.

**No allowlist, approve every command by hand.** Rejected as the only control: an operator
approving their two-hundredth `ls` is no longer reading. Per-command approval stays, but as the
second gate, not the first.
