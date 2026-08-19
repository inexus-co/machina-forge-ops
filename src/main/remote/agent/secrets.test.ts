import { describe, expect, it } from "vitest";
import { maskSecrets } from "./secrets";

/**
 * What must not leave, and what must not be taken away.
 *
 * The second half is the harder one. Masking everything would be safe and useless: the agent is
 * investigating a machine it has never seen, and the names, hosts, ports and paths in a config
 * file are the whole point of reading it. Only the credential goes.
 */

describe("hiding a secret", () => {
  it("wp-config.php: the password goes and everything the investigation needs stays", () => {
    const { text, hidden } = maskSecrets(
      [
        "define( 'DB_NAME', 'wp_customer' );",
        "define( 'DB_USER', 'wpuser' );",
        "define( 'DB_PASSWORD', 'hunter2-very-secret' );",
        "define( 'DB_HOST', '10.0.0.5:3307' );",
        "$table_prefix = 'wp_';",
      ].join("\n"),
    );
    expect(text).not.toContain("hunter2-very-secret");
    expect(hidden).toBe(1);
    // The investigation goes on from here: which database, where, and with what prefix
    expect(text).toContain("wp_customer");
    expect(text).toContain("wpuser");
    expect(text).toContain("10.0.0.5:3307");
    expect(text).toContain("$table_prefix = 'wp_';");
  });

  it("the key stays, so it is visible that a value was hidden", () => {
    const { text } = maskSecrets("define( 'DB_PASSWORD', 'x' );");
    expect(text).toContain("DB_PASSWORD");
  });

  it("it works in env, in INI and in YAML alike", () => {
    const { text } = maskSecrets(
      ["DB_PASSWORD=hunter2", "password: hunter2", "  secret_key = hunter2"].join("\n"),
    );
    expect(text).not.toContain("hunter2");
  });

  it("a password inside a connection string", () => {
    const { text } = maskSecrets("DATABASE_URL=postgres://app:hunter2@db.internal:5432/appdb");
    expect(text).not.toContain("hunter2");
    // The far end stays: where it connects to is part of the investigation
    expect(text).toContain("db.internal:5432/appdb");
  });

  it("the body of a private key", () => {
    const { text, hidden } = maskSecrets(
      "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\nAAAA\n-----END OPENSSH PRIVATE KEY-----",
    );
    expect(text).not.toContain("b3BlbnNzaC1rZXktdjEAAAAA");
    expect(text).toContain("BEGIN OPENSSH PRIVATE KEY");
    expect(hidden).toBe(1);
  });

  it("a crypt hash (/etc/shadow, htpasswd)", () => {
    const { text } = maskSecrets("root:$6$rounds=5000$abcdefgh$XyZ012345678:19000:0:99999:7:::");
    expect(text).not.toContain("XyZ012345678");
    expect(text).toContain("root:");
  });
});

describe("what must not be taken out", () => {
  const untouched = (input: string) => expect(maskSecrets(input).text).toBe(input);

  it("what a decision rests on is left alone", () => {
    untouched("DocumentRoot /var/www/example.com/public");
    untouched("ServerName example.com:443");
    untouched("listen 8080;");
    untouched("PermitRootLogin no");
    untouched("max_connections = 200");
  });

  it("a log line is not touched", () => {
    untouched("Aug 18 10:22:01 web sshd[1234]: Failed password for invalid user admin from 1.2.3.4");
    untouched("[error] 1234#0: *5 upstream timed out while reading response header");
  });

  it("a passwd listing is not hidden — there is no hash in it in the first place", () => {
    untouched("root:x:0:0:root:/root:/bin/bash");
    untouched("www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin");
  });

  it("with nothing there, nothing is counted", () => {
    expect(maskSecrets("uptime 10 days").hidden).toBe(0);
  });
});
