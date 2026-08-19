# ADR 0002: Code runs on our side; the target receives only auditable input

- Status: accepted
- Date: 2026-08-12
- Does not change the guarantee in [ADR 0001](0001-shell-under-a-written-guarantee.md). It adds a
  second face to it: execution on this side.
- Written first as a platform-level record and rewritten here in English when this application
  became its own repository. The decision, and the date it was taken on, are unchanged.

## The problem

The point of the product is to look after other people's machines without installing anything on
them. Safety comes first, but a tool so constrained that it cannot deploy or patch anything is
worth nothing.

The danger is not that the agent has skills or extensions. It is **code the agent wrote running on
the customer's machine**. So the line is drawn at the place execution happens, not at how capable
the agent is.

## The decision

### Where things run

**Code runs on our side only. What the target receives is input at a grain a person can audit.**

- What reaches the server is **one line of shell**. No script is sent over, no `bash -c`, nothing
  piped in.
- What reaches a desktop is **a keystroke or a click**.
- Analysis, counting and file generation happen here, and their result is what decides the *next
  single line* to send. Look at what came back; decide again.

One line stays one record and one approval. None of ADR 0001's gates (shape, allowlist, person)
is relaxed by this.

### What we want to be able to tell a customer

The design target is being able to say these six lines and point at the implementation of each,
one for one. Being able to explain it comes before adding to it.

> 1. Nothing is installed on your machines. What reaches them is the standard path — a USB
>    keyboard and mouse, or RDP and SSH.
> 2. Your machines receive input at a grain a person can read: keystrokes and clicks, or one line
>    of shell. No program or script is sent to them to run.
> 3. Only commands named in advance can run. Destructive ones are approved by a person, in every
>    mode.
> 4. Every action is recorded with the screen, the command and the result of that moment, and can
>    be checked afterwards.
> 5. Your credentials are encrypted on the operator's machine and appear neither on screen, nor in
>    a request to a model, nor in the record.
> 6. Anything the model computes, analyses or executes happens inside our own environment.

### Execution on this side (`run_local`), and its wall

Here the agent gets a real shell — pipes, redirection, scripts — because analysis and file
generation need one. What makes that acceptable is the wall around it.

**The wall has three properties. Whatever implements it is measured against these three.**

1. **It can write only to this run's working directory.** Not the operator's home, not the
   application's own storage, not `/tmp`.
2. **It cannot read the operator's home.** If it could, a key in `~/.ssh` would enter the agent's
   context and leave in a request to a model provider. That road is cut.
3. **There is no network.** Without this, `run_local` is a back door: `ssh` and `curl` fired from
   the operator's machine. The only road to the server stays `run_command`.

**All three are verified against each implementation by trying them.** The tests attempt to write
outside, read the home, bind and connect, and watch those attempts fail — assertions about the
wall itself, not about a configuration object.

Everything run here lands in the same record, obeys the same approval mode, and spends from the
same budget as everything else.

### The wall is replaceable; it lives where the loop runs

| backend | when | how |
| --- | --- | --- |
| `seatbelt` | macOS | a policy handed to `sandbox-exec` |
| `linux` | Linux, and inside WSL2 on Windows | bubblewrap, or Landlock where there is none |
| `docker` | any OS, when asked for | `--network none`, only the working directory bind-mounted, `--read-only` plus tmpfs, non-root, `--memory` `--cpus` `--pids-limit` |

The default is `auto`: `seatbelt` on macOS, `linux` on Linux and WSL2, otherwise `docker` if
Docker is there. It can also be named explicitly, so a site that wants everything in Docker can
have that on macOS too.

About Docker: the image is pinned by digest; the container is kept warm for the length of a run
(`docker run` costs 300–800ms each time) and killed when the run ends; and **if the image is not
already here, the tool is not offered.** It is never pulled behind the operator's back — quietly
reaching for the network on an offline site is the worst thing it could do.

**The working directory is copied into the record and then deleted at the end of the run.** Left
alone, customer data would accumulate on the operator's machine by default.

### Machines where no wall can be built

**Where no wall can be built, the tool is not offered.** That is not a limit a setting can relax.

There is one exception, and only where **the operator of that machine takes the responsibility
explicitly**. Then the tool appears with four things attached:

- **Off by default.** Not enable-able from synced settings or from a skill. Only by hand, on that
  machine.
- **Approval every time.** Even in automatic mode, `run_local` is read line by line by a person.
  That is the only gate standing in for the wall.
- **`sandboxed: false` in the record.** A consent dialog is a memory; the record is evidence. It
  has to be possible to count afterwards which runs happened without a wall.
- **Said on screen the whole time.** A consent pressed once must not become invisible.

Consent restores none of the technical properties, so the wording names what is lost:

> This machine has no way to isolate. Turn this on and commands the agent writes will run **on
> this machine, with your privileges** — which includes reach over stored customer credentials and
> model API keys. Install WSL2 or Docker to get the wall back.

The clause is not written against an operating system. It is written against "no means of building
a wall exists on this machine", which today is Windows without WSL2 and without Docker. A native
Windows wall would add a row to the table above and leave this clause alone.

### Changing a file

Configuration files are not rewritten with `echo` and a redirect: that breaks the shape gate and
leaves no diff. The procedure is fixed.

1. **Read** — fetch the real file. A diff against a file the model imagined is a lie.
2. **Back up on the target** — `cp file file.bak.<when>`, as a one-line command in the record.
3. **Back up on this side** — the fetched original goes into the run record
   (`remote-runs/<host>/<run>/files/<original path>`) **with its hash and the time it was taken**,
   so "this is what to restore" can be proven later. A backup that lives only on the machine being
   repaired dies with it — during a disk fault, it is on that disk. Both sides, and the fetch was
   needed for the diff anyway.
4. **Generate** — the new contents are made on this side.
5. **Show** — the diff and the whole new file go on an approval card, and a person approves.
6. **Transfer** — once approved, written through the file-transfer path.
7. **Verify, and restore if needed** — run the software's own syntax check on the target where
   there is one (`nginx -t`, one line). If it fails, restore from the backup. Steps 2 and 3 exist
   for this.

Because the record holds file contents, **the record directory is customer data** and is not
shared casually.

### Recording screen actions

A click is a coordinate; its meaning is only in the picture. So:

- **Record the coordinate and the kind (`{x, y, kind}`), and draw the marker at display time.**
  The evidence image stays unaltered. Burning a marker in turns evidence into a composite, and the
  marker hides what was under the cursor.
- Click is a box and a cross, scroll is an arrow, `type_text` has no coordinate and gets a label.
  The chat and the record view draw from the same coordinates.
- Reading a button's label to stop "delete, send, confirm" even in automatic mode can be added as
  a help, but it passes straight through when the reading is wrong. The barriers stay approval,
  the stop button and the record; classification is an eye above them.

### Skills and extensions

**A skill is knowledge; an extension is a capability.**

| | skill | extension |
| --- | --- | --- |
| what it is | a document (a bundled script is allowed) | code, running inside this application's process |
| what it changes | the agent's skill at something | the agent's hands: another tool |
| how far it reaches | no further than the existing tools | as far as code reaches |
| the guard | a person reads it when installing; a bundled script runs inside the wall, hashed | the operator allows each tool by name, and its use is labelled in the record |

Inspection at install time has two layers. The mechanical one is certain: for an extension, the
declared tool list and detection of `child_process` and network imports; for a skill, the command
names in the text, differenced against the allowlist. The model's reading — what is this for, does
it ask for anything dangerous or send anything outside — is a help, and can be wrong.

The card an operator sees before installing looks like: *this skill uses `docker`, `git`,
`systemctl`; it mentions `rm` (line 7); it sends nothing to an external URL.* Edited afterwards,
it is inspected again.

This inspection **helps** a judgement of trust; it is not a barrier. A malicious author can hide,
and a model can miss. The barriers are the three at run time — allowlist, approval, record.

## Rejected

- **Letting scripts run on the target** — the record would say only "ran a script". One line, one
  record is the thing this product sells.
- **Execution on this side without a wall** — the operator's machine holds customer credentials. A
  maintenance tool becoming the leak is backwards.
- **Writing files with `echo` and redirection** — it collides with the shape gate, and what was
  written leaves no structure in the record.
