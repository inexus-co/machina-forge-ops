import { LOG_SOURCE_LABELS, type LogSource } from "../../../shared/remoteInventory";

/**
 * The logs a server actually has, found rather than listed.
 *
 * This used to be ten hardcoded paths. They were the Debian ones, so on a RHEL machine neither
 * Apache (`/var/log/httpd/error_log` — different directory *and* `_log`, not `.log`) nor MySQL
 * (`/var/log/mysqld.log`) ever appeared, and a site with its own `ErrorLog` never appeared
 * anywhere. A maintenance tool whose log list is a guess about the distribution is a tool that
 * works on the machines somebody happened to test it on.
 *
 * Four sources, one round trip, none of them assuming a layout:
 *
 *  1. **`journalctl` per running unit.** The strongest one, because it needs no path at all —
 *     `nginx`, `httpd`, `mariadb` and `php-fpm` are all reachable the same way on any distro.
 *  2. **What is under `/var/log`**, by glob rather than by name, so `*_log` and subdirectories
 *     come along.
 *  3. **What the web server says its logs are** — `nginx -T` prints the effective configuration
 *     including every `access_log`/`error_log`, and Apache's `-S` prints its main `ErrorLog`.
 *     This is the only source that finds a per-site log, or one under `/usr/local`.
 *  4. **What daemons currently have open** (`/proc/<pid>/fd`), which needs privilege for other
 *     people's processes and contributes nothing when it is not there.
 *
 * Everything found is then put through `-f` and `-r` on the far end, so what is offered is a
 * regular file this account can read. That also removes an old wart: `/var/log/postgresql` is a
 * *directory*, it passed the old `test -r`, and clicking it produced `tail: Is a directory`.
 */

/** One command, read-only. Fixed text in this repository — no input reaches it. */
export const LOG_SOURCES_COMMAND = [
  'echo "#journal"',
  "command -v journalctl >/dev/null 2>&1 && echo yes || true",
  'echo "#units"',
  "systemctl list-units --type=service --state=running --no-legend --plain 2>/dev/null" +
    " | awk '{print $1}' | head -n 60 || true",
  'echo "#files"',
  /*
   * Collected, then filtered on the far end.
   *
   * The `while read` at the end is what makes the answer trustworthy: a path that came from a
   * configuration file may not exist, may be a directory, or may belong to root. Only what
   * survives `-f` and `-r` is offered, so nothing in the list can fail when it is clicked.
   */
  "{ ls -1d /var/log/*.log /var/log/*_log /var/log/*/*.log /var/log/*/*_log" +
    " /var/log/syslog /var/log/messages /var/log/secure 2>/dev/null;" +
    " { nginx -T 2>/dev/null; apache2ctl -S 2>/dev/null; apachectl -S 2>/dev/null;" +
    " httpd -S 2>/dev/null; } | grep -Eoh \"/[^ \\\"';)]*log[^ \\\"';)]*\" 2>/dev/null;" +
    " for f in /proc/[0-9]*/fd/*; do readlink \"$f\"; done 2>/dev/null | grep -E 'log' ; }" +
    " | sort -u | while read -r f; do [ -f \"$f\" ] && [ -r \"$f\" ] && echo \"$f\"; done" +
    " | head -n 80 || true",
  'echo "#end"',
].join("; ");

function sections(output: string): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  let current = "";
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (/^#[a-z]+$/.test(trimmed)) {
      current = trimmed.slice(1);
      found[current] = [];
      continue;
    }
    if (current && trimmed) found[current].push(trimmed);
  }
  return found;
}

/**
 * Names short enough for a list and different enough to choose between.
 *
 * Two sites both have `logs/error.log`, and a chooser with two identical entries is a chooser you
 * cannot use. Each path starts at two segments and grows leftwards until nothing else shares it —
 * so one site is `example.com/logs/error.log` and the other is `shop.example/logs/error.log`,
 * and neither carries `/var/www` that they have in common.
 */
function namesFor(paths: string[]): Map<string, string> {
  const names = new Map<string, string>();
  const parts = new Map(paths.map((path) => [path, path.split("/").filter(Boolean)]));
  for (const path of paths) {
    const own = parts.get(path)!;
    let depth = 2;
    let name = own.slice(-depth).join("/");
    while (
      depth < own.length &&
      paths.some((other) => other !== path && parts.get(other)!.slice(-depth).join("/") === name)
    ) {
      depth += 1;
      name = own.slice(-depth).join("/");
    }
    names.set(path, name);
  }
  return names;
}

/** A unit's name without the `.service`, which every one of them ends with. */
function unitName(unit: string): string {
  return unit.replace(/\.service$/, "");
}

export function parseLogSources(output: string): LogSource[] {
  const found = sections(output);
  const sources: LogSource[] = [];

  if ((found.journal ?? []).some((line) => line === "yes")) {
    sources.push({ id: "journal", label: LOG_SOURCE_LABELS.whole, kind: "journal" });
    for (const unit of found.units ?? []) {
      if (!/^[A-Za-z0-9@._\-\\:]+\.service$/.test(unit)) continue;
      sources.push({ id: `unit:${unit}`, label: unitName(unit), kind: "journal", unit });
    }
  }

  /* Absolute paths only, and nothing with a character a shell would read as punctuation: this
     list is what `tail -F` is built from, and it came from the far end. */
  const files = [...new Set(found.files ?? [])].filter((path) => /^\/[\w./@+-]+$/.test(path));
  const names = namesFor(files);
  for (const path of files) {
    sources.push({ id: path, label: names.get(path)!, kind: "file", path });
  }

  return sources;
}
