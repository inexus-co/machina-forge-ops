#!/usr/bin/env node
/*
 * Tier 2 of the command catalog: names and one-line descriptions, harvested at development time.
 *
 *   node scripts/catalog/build-tier2.mjs            # needs Docker and the network
 *   node scripts/catalog/build-tier2.mjs --dry      # print counts, write nothing
 *
 * Two sources, because each answers a different half:
 *
 *   1. **The distributions' package indexes, over HTTP.** `Contents-amd64.gz` lists every file
 *      of every package in a release — that is where "every command that exists" comes from,
 *      tens of thousands of names, not the few hundred a minimal container happens to have
 *      installed. `Packages.gz` carries each package's one-line description, which becomes the
 *      command's description when nothing better is known.
 *   2. **Official containers, via Docker.** `whatis` inside ubuntu/debian/rocky/alma/ubi gives
 *      the *command's own* manual line for everything installed there — better than a package
 *      description, so it wins where both exist. `busybox --list` folds the applets in.
 *
 * The application itself never downloads anything at runtime (it lives on operators' desks
 * inside customers' networks) — this writes `tier2.ts` beside tier 1 and gets committed.
 *
 * The entries are English at this stage (`original`); the translation pass fills `summary` in
 * Japanese (`translate-tier2.mjs`, separate, needs an LLM key). Until then summary === original.
 *
 * Windows: PowerShell cmdlets classify themselves by verb and the useful ones are in tier 1. A
 * broader dump needs a Windows machine; drop it as `scripts/catalog/windows-commands.json`
 * ([{name, synopsis}]) and this script folds it in.
 *
 * Output shape: the data rides as one JSON string literal — `JSON.parse` of five megabytes is
 * milliseconds, while a 50,000-object TypeScript literal makes tsc crawl.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "../../src/main/remote/agent/catalog/tier2.ts");
const dry = process.argv.includes("--dry");
/** Reuse the committed Linux harvest and redo only the Windows half — indexes are 100MB. */
const windowsOnly = process.argv.includes("--windows-only");

const NAME = /^[a-z0-9._+-]{1,64}$/i;
/** name → { text, quality } — quality 2: whatis line, 1: package description, 0: name only. */
const linux = new Map();
const keep = (name, text, quality) => {
  if (!NAME.test(name)) return;
  const seen = linux.get(name);
  if (!seen || quality > seen.quality) linux.set(name, { text, quality });
};

// ---- 1. package indexes over HTTP ---------------------------------------------------------

/**
 * Stream a .gz URL line by line without holding the 700MB unpacked text in memory.
 *
 * A mirror dropping the socket mid-download is a Tuesday, not a failure of the run: the caller's
 * loop is idempotent (`keep` only upgrades), so the whole file is simply read again.
 */
async function* gunzipLines(url) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      const lines = readline.createInterface({
        input: Readable.fromWeb(response.body).pipe(zlib.createGunzip()),
        crlfDelay: Infinity,
      });
      yield* lines;
      return;
    } catch (cause) {
      if (attempt >= 3) throw cause;
      process.stderr.write(`  retrying ${url} (${attempt}/3): ${cause.message ?? cause}\n`);
      await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
    }
  }
}

const INDEXES = [
  {
    name: "ubuntu noble",
    contents: "http://archive.ubuntu.com/ubuntu/dists/noble/Contents-amd64.gz",
    packages: [
      "http://archive.ubuntu.com/ubuntu/dists/noble/main/binary-amd64/Packages.gz",
      "http://archive.ubuntu.com/ubuntu/dists/noble/universe/binary-amd64/Packages.gz",
    ],
  },
  {
    name: "debian bookworm",
    contents: "http://deb.debian.org/debian/dists/bookworm/main/Contents-amd64.gz",
    packages: ["http://deb.debian.org/debian/dists/bookworm/main/binary-amd64/Packages.gz"],
  },
];

/** `usr/bin/…` and friends. `usr/games` and libexec are not commands an operator asks for. */
const BIN_PATH = /^(?:usr\/(?:local\/)?)?s?bin\/([^/\s]+)$/;

if (windowsOnly) {
  const previous = fs.readFileSync(out, "utf8");
  const parsed = JSON.parse(JSON.parse(previous.match(/JSON\.parse\(\n  (".*"),\n\)/s)[1]));
  for (const entry of parsed) {
    if (entry.os === "linux") {
      linux.set(entry.name, { text: entry.original ?? "", quality: entry.original ? 2 : 0 });
    }
  }
  process.stderr.write(`reusing ${linux.size} linux entries from the committed file\n`);
}

for (const index of windowsOnly ? [] : INDEXES) {
  process.stderr.write(`${index.name}: descriptions...\n`);
  /** package → its one-line description, from the Packages stanzas. */
  const described = new Map();
  for (const url of index.packages) {
    let current = "";
    for await (const line of gunzipLines(url)) {
      if (line.startsWith("Package: ")) current = line.slice(9).trim();
      else if (line.startsWith("Description: ") && current) {
        if (!described.has(current)) described.set(current, line.slice(13).trim());
      }
    }
  }
  process.stderr.write(`${index.name}: contents...\n`);
  for await (const line of gunzipLines(index.contents)) {
    // `usr/bin/vim.basic    universe/editors/vim` — path, whitespace, section/package list.
    const at = line.search(/\s/);
    if (at < 0) continue;
    const file = BIN_PATH.exec(line.slice(0, at));
    if (!file) continue;
    const packageName = line.slice(at).trim().split(",")[0].split("/").pop();
    const description = described.get(packageName);
    keep(file[1], description ?? "", description ? 1 : 0);
  }
  process.stderr.write(`${index.name}: ${linux.size} names so far\n`);
}

// ---- 2. whatis inside official containers -------------------------------------------------

function docker(image, script) {
  return execFileSync("docker", ["run", "--rm", image, "sh", "-c", script], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 15 * 60 * 1000,
  });
}

const IMAGES = [
  { image: "ubuntu:24.04", setup: "apt-get update -qq && apt-get install -y -qq man-db manpages >/dev/null" },
  { image: "debian:12", setup: "apt-get update -qq && apt-get install -y -qq man-db manpages >/dev/null" },
  { image: "registry.access.redhat.com/ubi9/ubi", setup: "dnf install -y -q man-db >/dev/null" },
  { image: "rockylinux:9", setup: "dnf install -y -q man-db man-pages >/dev/null" },
  { image: "almalinux:9", setup: "dnf install -y -q man-db man-pages >/dev/null" },
];

const HARVEST =
  "mandb -q >/dev/null 2>&1; whatis -w '*' 2>/dev/null; " +
  "echo '--BINS--'; for d in /usr/bin /usr/sbin /bin /sbin; do [ -d $d ] && ls -1 $d; done";

for (const { image, setup } of windowsOnly ? [] : IMAGES) {
  process.stderr.write(`${image}...\n`);
  const output = docker(image, `{ ${setup}; } || true; ${HARVEST}`);
  const [whatis = "", bins = ""] = output.split("--BINS--");
  for (const line of whatis.split("\n")) {
    // `name (1) - description` — sections 1 and 8 are commands; the rest are not.
    const match = /^([A-Za-z0-9._+-]+)\s*\((1|8)[a-z]*\)\s+-\s+(.+)$/.exec(line.trim());
    if (match) keep(match[1], match[3].trim(), 2);
  }
  for (const line of bins.split("\n")) keep(line.trim(), "", 0);
}

if (!windowsOnly) {
  process.stderr.write("busybox...\n");
  for (const line of docker("busybox", "busybox --list").split("\n")) keep(line.trim(), "", 0);
}

// ---- 3. Windows ----------------------------------------------------------------------------

const windows = new Map();

/*
 * PowerShell Core ships an official Linux container, so the core cmdlets need no Windows
 * machine. Names only: `Update-Help` hangs in a container, and `Get-Help` per cmdlet takes
 * seconds each — both left runs stuck for an hour. Tier 2 is allowed to be names; the read
 * cmdlets that matter carry Japanese judgements in tier 1, and better synopses arrive with a
 * real machine's dump below (which wins over these).
 */
process.stderr.write("powershell...\n");
/* `latest` resolves to 32-bit arm on Apple Silicon and runs emulated at a crawl; the arm64
 * build only exists behind an explicit tag. */
const PWSH_IMAGE =
  process.arch === "arm64"
    ? "mcr.microsoft.com/powershell:7.4-azurelinux-3.0-arm64"
    : "mcr.microsoft.com/powershell:latest";
const pwsh = execFileSync(
  "docker",
  ["run", "--rm", "--network", "none", PWSH_IMAGE,
    "pwsh", "-NoLogo", "-Command",
    "Get-Command -CommandType Cmdlet,Function | Select-Object -ExpandProperty Name | Sort-Object -Unique"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 5 * 60 * 1000 },
);
for (const line of pwsh.split("\n")) {
  const name = line.trim();
  if (name && NAME.test(name) && !windows.has(name)) windows.set(name, "");
}

/** Windows-only modules, when a dump from a real machine is present. Wins over pwsh's. */
const windowsDump = path.join(here, "windows-commands.json");
if (fs.existsSync(windowsDump)) {
  for (const { name, synopsis } of JSON.parse(fs.readFileSync(windowsDump, "utf8"))) {
    if (NAME.test(name)) windows.set(name, (synopsis ?? "").trim());
  }
}

// ---- write ---------------------------------------------------------------------------------

const entries = [
  ...[...linux.entries()].sort().map(([name, { text }]) => ({
    name,
    os: "linux",
    summary: text || name,
    ...(text ? { original: text } : {}),
    class: "write",
    tier: 2,
  })),
  ...[...windows.entries()].sort().map(([name, text]) => ({
    name,
    os: "windows",
    summary: text || name,
    ...(text ? { original: text } : {}),
    class: "write",
    tier: 2,
  })),
];

process.stderr.write(`linux ${linux.size} / windows ${windows.size}\n`);
if (dry) process.exit(0);

fs.writeFileSync(
  out,
  `import type { CatalogEntry } from "../../../../shared/catalog";

/**
 * Tier 2: names and descriptions harvested from the distributions' own indexes and manuals.
 *
 * GENERATED by \`scripts/catalog/build-tier2.mjs\` — edit that, not this. Committed so the
 * application never downloads anything at runtime. Everything in this tier stops for a person:
 * a harvested description is knowledge about what a command *is*, not a judgement about what it
 * may do unattended. Where \`summary\` equals \`original\` the translation pass has not run yet.
 *
 * One JSON string rather than fifty thousand object literals: \`JSON.parse\` reads it in
 * milliseconds, and tsc does not have to type-check the data row by row.
 */
export const TIER2: CatalogEntry[] = JSON.parse(
  ${JSON.stringify(JSON.stringify(entries))},
);
`,
  "utf8",
);
process.stderr.write(`wrote ${out}\n`);
