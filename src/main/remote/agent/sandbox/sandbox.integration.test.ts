import fs from "node:fs/promises";
import { connect } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dockerSandbox } from "./docker";
import { linuxSandbox } from "./linux";
import { seatbelt } from "./seatbelt";
import type { Sandbox } from "./index";

/**
 * The wall, measured rather than configured — every backend, the same three properties.
 *
 * ADR 0002 states them and says a backend is only offered once it has demonstrated all three.
 * This is that demonstration: the forbidden things are attempted and the test passes when they
 * fail. A backend this machine cannot build skips, so the file is honest about what it proved
 * here rather than asserting about configuration objects.
 */

const BACKENDS: Sandbox[] = [seatbelt, linuxSandbox, dockerSandbox];

let root = "";

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "machina-sandbox-"));
});

afterAll(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
});

for (const sandbox of BACKENDS) {
  describe(`isolation: ${sandbox.name}`, () => {
    let available = false;
    let workdir = "";
    let outside = "";

    beforeAll(async () => {
      available = await sandbox.available();
      if (!available) return;
      workdir = path.join(root, sandbox.name, "work");
      outside = path.join(root, sandbox.name, "outside-secret.txt");
      await fs.mkdir(workdir, { recursive: true });
      /* One level up from the work directory: the nearest thing an escape would reach for. */
      await fs.writeFile(outside, "a secret", "utf8");
    }, 120_000);

    afterAll(async () => {
      if (available) await sandbox.release?.(workdir);
    }, 30_000);

    it("inside the working directory, a real shell is available", async ({ skip }) => {
      if (!available) skip();
      const made = await sandbox.run(
        workdir,
        "printf 'b\\na\\nb\\n' > f.txt && sort f.txt | uniq -c | tr -s ' '",
      );
      expect(made.ok).toBe(true);
      expect(made.output).toContain("2 b");

      /* It survives from one call to the next: read, produce, transfer, in that order. */
      const again = await sandbox.run(workdir, "wc -l < f.txt");
      expect(again.output.trim()).toBe("3");

      /* And it is there when the host looks. */
      expect(await fs.readFile(path.join(workdir, "f.txt"), "utf8")).toContain("a");
    }, 120_000);

    it("first property: nothing can be written outside the working directory", async ({ skip }) => {
      if (!available) skip();
      const escape = path.join(path.dirname(workdir), "escape.txt");
      const result = await sandbox.run(workdir, `echo x > ${escape}`);
      expect(result.ok).toBe(false);
      await expect(fs.access(escape)).rejects.toThrow();
    }, 60_000);

    it("second property: neither the file beside it nor the operator's home can be read", async ({ skip }) => {
      if (!available) skip();
      const neighbour = await sandbox.run(workdir, `cat ${outside}`);
      expect(neighbour.ok).toBe(false);
      expect(neighbour.output).not.toContain("a secret");

      const real = os.homedir();
      const probe = await sandbox.run(workdir, `ls ${real}/.ssh 2>&1; cat ${real}/.gitconfig 2>&1`);
      expect(probe.output).not.toContain("BEGIN OPENSSH PRIVATE KEY");
      expect(probe.output).toMatch(/Operation not permitted|No such file|Permission denied/);
    }, 60_000);

    it("third property: over the network, it reaches nobody", async ({ skip }) => {
      if (!available) skip();

      /*
       * Measured as "reaches nobody", not as "cannot make a socket".
       *
       * Seatbelt cuts the socket itself. A `--network none` container has a loopback of its own,
       * so a bind succeeds — but there is nobody else in that space. What has to be impossible is
       * the back door: getting out of the operator's machine to the internet, the LAN or the
       * server. So what is measured is reachability.
       */
      for (const target of ["('127.0.0.1',22)", "('8.8.8.8',53)", "('127.0.0.1',12222)"]) {
        const out = await sandbox.run(
          workdir,
          `python3 -c "import socket; socket.create_connection(${target},2); print('CONNECTED')"`,
          { timeoutMs: 30_000 },
        );
        expect(out.output).not.toContain("CONNECTED");
      }

      /* Listening inside it is invisible from the host. */
      const port = 8099;
      void sandbox.run(
        workdir,
        `python3 -c "import socket; s=socket.socket(); s.setsockopt(1,2,1); s.bind(('0.0.0.0',${port})); s.listen(1); s.accept()"`,
        { timeoutMs: 8000 },
      );
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const reachable = await new Promise<boolean>((resolve) => {
        const socket = connect({ host: "127.0.0.1", port, timeout: 1500 });
        socket.on("connect", () => {
          socket.destroy();
          resolve(true);
        });
        socket.on("error", () => resolve(false));
        socket.on("timeout", () => {
          socket.destroy();
          resolve(false);
        });
      });
      expect(reachable).toBe(false);
    }, 120_000);

    it("a timeout stops what is running", async ({ skip }) => {
      if (!available) skip();
      const result = await sandbox.run(workdir, "sleep 30", { timeoutMs: 1500 });
      expect(result.timedOut).toBe(true);
      expect(result.ok).toBe(false);

      /* And the next line still runs afterwards. */
      const after = await sandbox.run(workdir, "echo alive");
      expect(after.output.trim()).toBe("alive");
    }, 120_000);
  });
}

describe("choosing the isolation", () => {
  it("what this machine can actually build is what gets chosen", async () => {
    const { chooseSandbox } = await import("./index");
    const chosen = await chooseSandbox();
    /* On macOS, Seatbelt comes first: one process, and an order of magnitude faster than a
       container. */
    if (process.platform === "darwin") expect(chosen?.name).toBe("seatbelt");
    /* It can be named, too: with Docker there, even macOS can be pushed to Docker. */
    if (await dockerSandbox.available()) {
      expect((await chooseSandbox("docker"))?.name).toBe("docker");
    }
    /* Name one this machine cannot build and there is no tool. macOS has no bubblewrap. */
    if (process.platform !== "linux") expect(await chooseSandbox("linux")).toBeUndefined();
  }, 60_000);
});
