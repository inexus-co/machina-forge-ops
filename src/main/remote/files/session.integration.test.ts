import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "ssh2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FileSession } from "./session";

/**
 * Files to and from a real server.
 *
 * SFTP against the test container, because the parts worth testing are the ones that touch it:
 * what `readdir` returns, whether a size survives the round trip, what happens to a path that is
 * not there. Start it with
 *
 *   docker compose -f native/rdp/test-server/compose.yaml up -d --build
 *
 * and this runs; without it every case skips.
 */

const SSH = { host: "127.0.0.1", port: 12222, username: "machina", password: "machina" };

async function serverIsUp() {
  return await new Promise<boolean>((resolve) => {
    const client = new Client();
    const done = (value: boolean) => {
      client.end();
      resolve(value);
    };
    client.on("ready", () => done(true));
    client.on("error", () => done(false));
    client.connect({ ...SSH, readyTimeout: 3000 });
  });
}

let up = false;
let local = "";
let session: FileSession;

beforeAll(async () => {
  up = await serverIsUp();
  local = await fs.mkdtemp(path.join(os.tmpdir(), "machina-files-"));
  session = new FileSession();
}, 20_000);

afterAll(async () => {
  session?.stop();
  if (local) await fs.rm(local, { recursive: true, force: true });
});

describe("moving files back and forth", () => {
  it("with no path, it opens the home directory", async ({ skip }) => {
    if (!up) skip();
    const listing = await session.list(SSH, "");
    expect(listing.path).toBe("/home/machina");
    // Directories before files, then by name: `readdir` returns the filesystem's own order,
    // which differs between two machines holding the same files.
    const kinds = listing.entries.map((each) => each.kind);
    expect(kinds.indexOf("file") === -1 || kinds.lastIndexOf("directory") < kinds.indexOf("file")).toBe(
      true,
    );
  }, 30_000);

  it("sent, listed, and brought back with the same contents", async ({ skip }) => {
    if (!up) skip();

    const name = `machina-roundtrip-${process.pid}.bin`;
    const source = path.join(local, name);
    // Big enough that progress is reported more than once.
    const content = Buffer.alloc(2 * 1024 * 1024, "machina");
    await fs.writeFile(source, content);

    const sent: number[] = [];
    await session.put(SSH, source, `/tmp/${name}`, (moved) => sent.push(moved));
    expect(sent.at(-1)).toBe(content.length);

    const listing = await session.list(SSH, "/tmp");
    const entry = listing.entries.find((each) => each.name === name);
    expect(entry).toMatchObject({ kind: "file", size: content.length });
    expect(entry?.path).toBe(`/tmp/${name}`);

    const back = path.join(local, `back-${name}`);
    await session.get(SSH, `/tmp/${name}`, back, () => {});
    expect(await fs.readFile(back)).toEqual(content);
  }, 60_000);

  it("a directory that is not there is refused, saying which one", async ({ skip }) => {
    if (!up) skip();
    await expect(session.list(SSH, "/no/such/place")).rejects.toThrow(/\/no\/such\/place/);
  }, 30_000);

  it("a file that is not there cannot be brought back", async ({ skip }) => {
    if (!up) skip();
    await expect(
      session.get(SSH, "/tmp/machina-not-here", path.join(local, "x"), () => {}),
    ).rejects.toThrow();
  }, 30_000);
});
