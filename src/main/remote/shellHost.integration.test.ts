import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { setLocale } from "../../shared/i18n";
import { ShellRunner, reasonFor } from "./shellHost";

/**
 * A real command that ends in a real shell.
 *
 * The point of this path is that nothing is SSH — so nothing about it can be established by
 * mocking `ssh2`. What it needs is a program on this machine that hands back a shell on another
 * machine, which is exactly what `aws ssm start-session` is and exactly what `docker exec -i` is.
 * The container stands in for the instance: same shape, no account, no key, no port.
 *
 * Skipped in silence when there is no container, like the other integration tests here.
 *
 * ```
 * docker compose -f native/rdp/test-server/compose.yaml up -d --build
 * ```
 */

setLocale("en");

/** Any running container will do: what is being tested is the shape, not the image. */
function aContainer(): string | undefined {
  try {
    const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], {
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return names[0];
  } catch {
    return undefined;
  }
}

const container = aContainer();
const runner = container
  ? new ShellRunner({ argv: ["docker", "exec", "-i", container, "sh"] })
  : undefined;

afterAll(() => runner?.stop());

describe.skipIf(!runner)("a shell handed over by a command", () => {
  it("runs a command and gives back what it printed, and nothing else", async () => {
    const result = await runner!.run("echo hello");
    /* Nothing else: no prompt, no echo of what was typed, no marker. */
    expect(result.output).toBe("hello");
    expect(result.code).toBe(0);
  });

  /*
   * The half SSH gives for free.
   *
   * A shell has no exit statuses in it — `echo $?` on a line of its own is where this one comes
   * from. Anything reading this result (the agent, the status panel) treats it as `exec` would.
   */
  it("brings the exit status back with it", async () => {
    expect((await runner!.run("true")).code).toBe(0);
    expect((await runner!.run("false")).code).toBe(1);
    /* In a child, because `exit` in the shell itself is the shell leaving, which is the case
       below rather than this one. */
    expect((await runner!.run("sh -c 'exit 7'")).code).toBe(7);
  });

  it("the shell survives a command that ended badly", async () => {
    await runner!.run("this-is-not-a-command");
    expect((await runner!.run("echo still here")).output).toBe("still here");
  });

  /*
   * And survives the shell itself going away.
   *
   * `exit` is a command an operator will run, and a session the provider drops is the same thing
   * from here. The next command opens another shell rather than reporting a dead machine.
   */
  it("a shell that left is replaced by the next command", async () => {
    await runner!.run("exit 7").catch(() => undefined);
    expect((await runner!.run("echo back")).output).toBe("back");
  }, 40_000);

  /*
   * What a command printed on stderr belongs to that command.
   *
   * It used to arrive on a pipe of its own, with no order against stdout, and a `not found`
   * printed a moment late landed in the middle of the *next* command's output. The far shell
   * merges the two now (`exec 2>&1`), and this is the assertion that says so.
   */
  it("what went to stderr stays with the command it came from", async () => {
    const failed = await runner!.run("this-is-not-a-command");
    expect(failed.output).toContain("not found");
    expect(failed.code).not.toBe(0);
    expect((await runner!.run("echo clean")).output).toBe("clean");
  });

  it("keeps several lines of output in order", async () => {
    const result = await runner!.run("printf 'one\\ntwo\\nthree\\n'");
    expect(result.output.split("\n")).toEqual(["one", "two", "three"]);
  });

  /* One stream, so two commands at once would interleave into nonsense. They queue instead. */
  it("two commands at once come back as two answers", async () => {
    const [first, second, third] = await Promise.all([
      runner!.run("echo first"),
      runner!.run("echo second"),
      runner!.run("echo third"),
    ]);
    expect([first.output, second.output, third.output]).toEqual(["first", "second", "third"]);
  });

  it("a command that will not finish is given up on, and the shell is still usable", async () => {
    const slow = await runner!.run("sleep 5", { timeoutMs: 1_000 });
    expect(slow.timedOut).toBe(true);
    expect(slow.code).toBe(-1);
    expect((await runner!.run("echo after")).output).toBe("after");
  }, 20_000);

  it("output past the cap is cut rather than kept", async () => {
    const big = await runner!.run("yes 0123456789 | head -400", { maxOutputBytes: 200 });
    expect(big.truncated).toBe(true);
    expect(big.output.length).toBeLessThanOrEqual(200);
  });

  /*
   * What the file panel will have to use, measured rather than assumed.
   *
   * There is no SFTP down a shell, so a file comes back as base64 on stdout. This is the shape of
   * that, and the assertion that the bytes survive the trip unchanged.
   */
  it("a file can be read out as base64 and put back together here", async () => {
    const written = await runner!.run("printf 'ninety nine\\n' > /tmp/machina-probe");
    expect(written.code).toBe(0);
    const read = await runner!.run("base64 /tmp/machina-probe");
    const text = Buffer.from(read.output.replace(/\s+/g, ""), "base64").toString("utf8");
    expect(text).toBe("ninety nine\n");
    await runner!.run("rm -f /tmp/machina-probe");
  });

  /*
   * And the other direction, which is the one with a ceiling on it.
   *
   * Writing means base64 going *up* the same stream, and a shell reading its input line by line
   * will only take so much on one line — 4096 bytes where the far end is a terminal, which a
   * provider's session is and a pipe is not. So it goes in slices, appended, and the hash at the
   * end is what says the file arrived whole rather than nearly.
   */
  it("a file can be written back in slices, and checked", async () => {
    const content = Buffer.from(
      Array.from({ length: 300 }, (_, at) => `line ${at} of a configuration file\n`).join(""),
    );
    const slices = (Buffer.from(content).toString("base64").match(/.{1,2000}/g) ?? []);
    expect(slices.length).toBeGreaterThan(1);

    await runner!.run("rm -f /tmp/machina-write /tmp/machina-write.b64");
    for (const slice of slices) {
      const appended = await runner!.run(`printf %s ${slice} >> /tmp/machina-write.b64`);
      expect(appended.code).toBe(0);
    }
    expect((await runner!.run("base64 -d /tmp/machina-write.b64 > /tmp/machina-write")).code).toBe(0);

    const sum = await runner!.run("sha256sum /tmp/machina-write");
    const here = createHash("sha256").update(content).digest("hex");
    expect(sum.output.split(/\s+/)[0]).toBe(here);
    await runner!.run("rm -f /tmp/machina-write /tmp/machina-write.b64");
  }, 60_000);
});

describe("what an operator is told when it will not start", () => {
  it("names a program that is not installed", () => {
    const missing = Object.assign(new Error("spawn aws ENOENT"), { code: "ENOENT" });
    expect(reasonFor("aws", "", missing)).toContain("aws is not installed");
  });

  /*
   * Everything else is the provider's own words, marked as theirs.
   *
   * They know what happened — an expired login, an instance with no agent, a role that says no —
   * and this does not. A sentence invented here would rot the first time they reworded theirs.
   */
  it("repeats their complaint rather than inventing one", () => {
    const said = reasonFor("aws", "An error occurred (TargetNotConnected) when calling StartSession");
    expect(said).toContain("aws said:");
    expect(said).toContain("TargetNotConnected");
  });

  it("says silence is silence", () => {
    expect(reasonFor("aws", "   ")).toContain("without saying why");
  });

  it("a command that never opens a shell is given up on", async () => {
    /* `true` exits at once: nothing to talk to, and the operator has to be told that. */
    const dead = new ShellRunner({ argv: ["true"] });
    await expect(dead.run("echo hello")).rejects.toThrow();
    dead.stop();
  }, 40_000);
});
