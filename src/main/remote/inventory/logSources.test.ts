import { describe, expect, it } from "vitest";
import { LOG_SOURCES_COMMAND, parseLogSources } from "./logSources";

/**
 * Output captured from a RHEL-family container and from the Ubuntu test server.
 *
 * The RHEL half is the point of this module: `httpd` writes `error_log`, not `error.log`, and it
 * writes it under `/var/log/httpd`, not `/var/log/apache2`. The list this replaced had neither
 * spelling, so Apache's log simply never appeared on half the servers in the world.
 */
const RHEL = `#journal
yes
#units
httpd.service
mariadb.service
php-fpm.service
sshd.service
#files
/var/log/httpd/access_log
/var/log/httpd/error_log
/var/log/mariadb/mariadb.log
/var/log/messages
/var/log/secure
/var/www/example.com/logs/error.log
#end`;

describe("finding the logs", () => {
  const sources = parseLogSources(RHEL);

  it("with a journal, the whole machine and each running unit are offered", () => {
    expect(sources[0]).toMatchObject({ kind: "journal", id: "journal" });
    const units = sources.filter((each) => each.unit);
    expect(units.map((each) => each.label)).toEqual(["httpd", "mariadb", "php-fpm", "sshd"]);
  });

  it("the RHEL spellings appear — the ones a fixed list never had", () => {
    const paths = sources.map((each) => each.path);
    expect(paths).toContain("/var/log/httpd/error_log");
    expect(paths).toContain("/var/log/mariadb/mariadb.log");
  });

  it("a per-site log appears too", () => {
    expect(sources.map((each) => each.path)).toContain("/var/www/example.com/logs/error.log");
  });

  it("no two names are the same: each grows leftwards until it is its own", () => {
    // With two sites, both are logs/error.log, and nobody can choose between them
    const twoSites = parseLogSources(
      [
        "#files",
        "/var/www/example.com/logs/error.log",
        "/var/www/shop.example/logs/error.log",
        "/var/log/nginx/error.log",
        "#end",
      ].join("\n"),
    );
    expect(twoSites.map((each) => each.label)).toEqual([
      "example.com/logs/error.log",
      "shop.example/logs/error.log",
      // What collides with nothing stays short
      "nginx/error.log",
    ]);
  });

  it("with no collision, the short name stays", () => {
    expect(new Set(sources.map((each) => each.label)).size).toBe(sources.length);
  });

  it("with no journal, only the files", () => {
    const sources = parseLogSources("#journal\n#units\nhttpd.service\n#files\n/var/log/messages\n#end");
    expect(sources.every((each) => each.kind === "file")).toBe(true);
    expect(sources).toHaveLength(1);
  });

  it("anything oddly shaped is dropped", () => {
    // `tail -F` is built from the far end's output, so nothing but an absolute path gets through
    const sources = parseLogSources(
      ["#files", "/var/log/ok.log", "; rm -rf /", "../etc/passwd", "/var/log/a b.log", "#end"].join("\n"),
    );
    expect(sources.map((each) => each.path)).toEqual(["/var/log/ok.log"]);
  });

  it("finding nothing comes back empty", () => {
    expect(parseLogSources("#journal\n#units\n#files\n#end")).toEqual([]);
  });
});

describe("the command that finds them", () => {
  it("it is built out of reads and nothing else", () => {
    for (const forbidden of ["rm ", "mv ", "chmod", "chown", "tee ", "truncate"]) {
      expect(LOG_SOURCES_COMMAND).not.toContain(forbidden);
    }
    // Nothing redirects towards a file: every destination is either the bin or standard output
    for (const redirect of LOG_SOURCES_COMMAND.match(/>\s*[^\s;|)]+/g) ?? []) {
      expect([">/dev/null", ">&1"]).toContain(redirect);
    }
  });

  it("what is found is narrowed to readable regular files before it comes back", () => {
    // /var/log/postgresql is a directory. It used to be offered, and tail failed when pressed
    expect(LOG_SOURCES_COMMAND).toContain('[ -f "$f" ] && [ -r "$f" ]');
  });
});
