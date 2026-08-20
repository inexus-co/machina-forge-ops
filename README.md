<div align="center">

<img src="assets/icon.png" alt="" width="128" />

# Machina Forge Ops

**The agent never gets a shell on your customer's server**

A desktop application for maintaining somebody else's server: the screen (RDP or VNC),
the terminal (SSH), and an agent that can work both — in one window.
Nothing is installed on the machine being maintained.

[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)](#what-runs-where)
[![License](https://img.shields.io/badge/license-AGPL--3.0-green)](LICENSE)
[![No account](https://img.shields.io/badge/no%20account-no%20telemetry-brightgreen)](#safety)

[**Two minutes of a real run**](https://github.com/inexus-co/machina-forge-ops/releases/tag/demo) ·
[**Build it**](#development)

**English** · [日本語](README.ja.md) · [简体中文](README.zh-Hans.md) · [繁體中文](README.zh-Hant.md)

</div>

It exists instead of two habits: running a coding agent on the server itself, and keeping the
remote desktop, the terminal and the model's chat in three separate windows — each connected to
separately, each asked separately. This is the three of them in one place, and the agent works
them without ever being handed a shell there.

**Nothing is installed on the customer's server.** Everything is read over the connection that is
already there, and what cannot be read is said on screen rather than guessed at.

![The workspace: a server's desktop over RDP, its shell over SSH, and the agent, in one window](docs/media/workspace.gif)

*One window, one server: its desktop over RDP, its shell over SSH, and the agent beside them. The
alert was pasted in as it arrived.* **[Two minutes of the whole run, as video](https://github.com/inexus-co/machina-forge-ops/releases/tag/demo)**

## Contents

[What it does](#what-it-does) ·
[Safety](#safety) ·
[Why it is built this way](#why-it-is-built-this-way) ·
[What this does not protect you from](#what-this-does-not-protect-you-from) ·
[What runs where](#what-runs-where) ·
[Languages](#languages) ·
[Development](#development) ·
[Built with](#built-with) ·
[License](#license)

## What it does

- **Screen**: RDP through a helper of our own (`native/rdp`) that uses FreeRDP and sends only the
  rectangles that changed, over fd 3 — no window, no X11, no daemon. VNC is spoken directly, in
  TypeScript. **A server with no SSH is not a server this cannot work**: the agent reads the
  desktop and works it — clicks and keystrokes — with every action stopping for a person and each
  one recorded with the picture it was aimed at.
- **Terminal**: SSH (`ssh2` and `xterm.js`). With `tmux`, the work continues after the
  application is closed. Already looking at something? **Hand the session to the chat** and what
  is on it goes to the agent as your own words, fenced and named, and into the record.
- **Agent**: Pi (`@earendil-works/pi-coding-agent`). Several models can be registered and one
  chosen per run. Each named agent has its own model, its own way of asking for approval, and its
  own limit on how many commands a run may take.
- **Delegation**: one agent can hand work to another. The other runs on its own model, one level
  deep only, sharing the parent's command limit, with every approval and every record going to the
  parent.
- **State, inventory, files**: read over the SSH connection that is already open, and nothing is
  put on the far end.
- **The logbook**: what the operator wrote about a server, what past runs handed over, and what
  this machine has read — carried into the next run so nobody starts from nothing.
- **Plugins**: ready-made knowledge for a shape of server met again and again (LAMP, Nginx, Docker,
  PostgreSQL), and how to work out an unfamiliar one without guessing paths. A plugin is a set of
  skills; a skill with a goal in it is also a command in the chat's ＋ menu. One can be added from
  a folder on this machine — nothing is fetched.

![A server with no SSH: the agent right-clicks the desktop, and the approval card carries the picture it was aimed at](docs/media/screen-agent.gif)

*A server with **no SSH at all**. The agent reads the desktop and works it; every action stops for a
person, and the record keeps the before and after of each one.*

## Safety

Every command goes through four layers, in this order:

1. **Its shape.** No `;`, `&&`, `|`, `>`, backticks or newlines, and no command written as a path.
   One command on one line, or it does not run.
2. **The floor.** `sudo`, anything destructive, anything pointing at a device, and any reading
   that would walk the whole machine always stop for a person. No setting and nothing remembered
   softens this.
3. **The catalog.** Around six hundred commands classified as reads, writes, verbs, code or
   shells, plus every command the distributions describe. A read runs; a write stops; a shell is
   refused; anything nobody has judged stops and says so.
4. **The operator's own exceptions**, per installation and per server, made from the approval card
   as the work happens.

![An approval card: a command refused for containing a pipe, another approved, and a password taken out of the output](docs/media/approval.gif)

*A real run. A command with a pipe in it is refused outright; `sudo` is approved one at a time; and
what looked like a password never reached the model or the record.*

Every command and all of its output goes into the run record. Anything that looks like a
credential is taken out of a command's output before it reaches the model or the record — the key
is left, so the agent can see that a password is set without ever seeing it.

Credentials (a server's password, a key's passphrase, a model's API key) live in an encrypted
store in the main process and **never come back to the screen**. Saved empty, what is already
stored is used.

**There is no account and no telemetry.** Nothing is registered, nothing is counted, and the only
thing that leaves this machine is what the operator sends to the model they chose — which can be
an endpoint on their own network.

**Anything the model computes runs on your machine, not on the customer's.** The agent gets a real
shell — pipes, redirection, scripts — inside a sandbox that can write only to that run's working
directory, cannot read your home, and has no network. What reaches the server is still one line at
a time, through the four layers above.

![The approval card for a configuration change, showing the difference and the whole new text](docs/media/changing-a-file.gif)

**Changing a file is a fixed procedure**, and the last of it is what makes the rest honest: the
real file is fetched (a copy is kept on your machine, hashed, because a backup that lives only on
the machine being repaired dies with it), a copy is taken on the server too, the new version is
generated in the sandbox, and **the difference and the whole new text go on an approval card — in
every mode, including automatic**. Then it is written, and the software's own check
(`nginx -t` and its like) is run before anything is reloaded.

## Why it is built this way

The decisions, with what they cost and what was rejected:

- [ADR 0001 — the agent may have a shell, under a guarantee written for this path alone](docs/decisions/0001-shell-under-a-written-guarantee.md)
- [ADR 0002 — code runs on our side; the target receives only auditable input](docs/decisions/0002-code-runs-on-our-side.md)

Both are in English. They are the argument behind the four layers, the sandbox and the file
procedure above, and they say plainly where each of them stops working.

## What this does not protect you from

- **The screen agent has no allowlist.** A run that drives the desktop can type anything into a
  terminal window it finds there, and none of the four layers apply. That is why a run works either
  the screen or the shell and never both — and why the screen path exists only for servers with no
  SSH at all.
- **An allowlist is only as clever as whoever classified it.** `find -exec` and `-delete` are caught
  by scanning the arguments, and `awk` and `sed` are refused on the target as code rather than
  commands. A program with an escape hatch nobody has thought of yet gets through until somebody
  classifies it. Reports of one are welcome.
- **Nothing here stops prompt injection.** What the agent reads — a log line, a config file, a
  filename — reaches the model, and text in it can be an instruction. What limits the damage is the
  gates rather than the model's judgement: nothing unclassified runs, nothing elevated runs without
  a person. But a poisoned log can still get a plausible, approvable command proposed with a
  plausible reason, and then the last line of defence is a human reading the card.
- **Approval fatigue is real**, and automatic mode exists because of it. Turning it on is a trade
  the operator makes per server, with the floor (sudo, destructive, devices) still stopping.
- **The wall is only as good as the platform's.** On a machine with no way to isolate — Windows
  without WSL2 and without Docker — the local shell is not offered at all. There is an opt-in for
  that case: off by default, approved line by line, and recorded as having run without a wall.
- **It is not a monitoring system.** It reads a machine while somebody is working on it. Graphs
  over a week and alerts at three in the morning need something resident, and that is a different
  kind of product.

## What runs where

| | Screen (RDP) | Screen (VNC) | Terminal, files, agent | Signed |
|---|---|---|---|---|
| **macOS** | yes | yes | yes | no — right-click → Open, once |
| **Windows** | not yet <sup>1</sup> | yes | yes | no |
| **Linux** | yes <sup>2</sup> | yes | yes | n/a |

<sup>1</sup> The RDP screen is a helper of our own on top of FreeRDP, and the Windows one has not
been written yet.
<sup>2</sup> The Linux helper is built and packaged on Linux — a Mac cannot cross-build it — and
its FreeRDP libraries are the machine's own rather than bundled, so FreeRDP 3 has to be installed.
On macOS they travel inside the application.

**It is not signed.** An ad-hoc signature is applied, so it starts, but another Mac will say the
developer cannot be verified the first time. Right-click → Open once, or clear it with
`xattr -dr com.apple.security.quarantine <the app>`. Shipping it properly needs a Developer ID
certificate and notarisation.

The catalog's second tier is harvested from the distributions themselves — **Ubuntu 24.04,
Debian 12, RHEL UBI 9, Rocky Linux 9 and AlmaLinux 9** — and a server running something else still
works: what nobody has classified stops and says so.

## Languages

The screens are in English, Japanese, Simplified Chinese and Traditional Chinese, chosen in the
settings and applied without a restart. The source is English: every sentence is written in
English in the code and translated in `src/shared/messages/`, and a test fails the build when a
sentence has no translation. Only one line of the agent's prompt follows the operator's language —
the one telling it which language to answer in.

## Development

```bash
yarn install
yarn dev          # run it
yarn typecheck
yarn test         # unit and integration
yarn build
```

The RDP helper is built for the machine it runs on, and the screen needs it during development
(FreeRDP 3 is required: `brew install freerdp`).

```bash
native/rdp/build.sh
```

### Packaging

```bash
yarn dist:mac     # a dmg and a zip in dist/, arm64 and x64
yarn dist:win
yarn dist:linux
```

What goes in: the helper itself, and the FreeRDP libraries it needs (`bundle.sh` rewrites them to
`@loader_path`). They are rebuilt for every package, and nothing is bundled while it still points
at a library outside — shipping an application with no screen beats shipping one that dies the
moment somebody opens it.

The integration tests connect to a container for real, and skip in silence when there is not one.

```bash
docker compose -f native/rdp/test-server/compose.yaml up -d --build
```

## Built with

| | |
|---|---|
| Application | Electron, electron-vite |
| Screens | React, TypeScript, plain CSS |
| Screen (RDP) | FreeRDP, through a helper of our own (`native/rdp`) |
| Screen (VNC) | RFB, spoken directly in TypeScript |
| Terminal | ssh2, xterm.js |
| Agent | Pi coding agent, and any OpenAI-compatible endpoint |

## License

GNU Affero General Public License, version 3 or later. The whole text is in [LICENSE](LICENSE).

What that means in practice: using it, including for paid work on other people's servers, asks
nothing of you. Changing it and then letting other people use your changed version — as a program
or over a network — means those people have to be able to get your source.
