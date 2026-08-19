import { execFileSync } from "node:child_process";
import { Socket } from "node:net";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { setLocale } from "../../../shared/i18n";
import type { RemoteScreenEvent } from "../../../shared/remote";
import { keyForCharacter, scancodeOf } from "../../../shared/scancodes";
import { VncSession, type VncTarget } from "../vncSession";

/**
 * The VNC client against a real VNC server.
 *
 * The unit tests drive the protocol from two buffers, which proves the parsing and nothing about
 * whether a real server agrees with us — the pixel format we ask for, the DES challenge we answer
 * (hand-rolled, because OpenSSL 3 will not do single-DES), and whether a keystroke we send is a
 * keystroke the machine receives. Start the fixture with
 *
 *   docker compose -f native/rdp/test-server/compose.yaml --profile vnc up -d --build vnc
 *
 * and this runs; without it every case skips.
 *
 *   127.0.0.1:15900  password `secret`      127.0.0.1:15901  no password at all
 */

const HOST = "127.0.0.1";
const AUTH_PORT = 15900;
const OPEN_PORT = 15901;
/** The same desktop behind the 3.3 handshake — one 4-byte security type, no reason strings. */
const OLD_PORT = 15902;
const CONTAINER = "machina-test-vnc";
/** TigerVNC, which speaks VeNCrypt: 15911 offers Plain (and anonymous TLS), 15912 offers X509. */
const TIGER_PLAIN_PORT = 15911;
const TIGER_X509_PORT = 15912;
const TIGER_USER = "root";
const TIGER_PASSWORD = "vncpass";

function portIsOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const done = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(2000);
    socket.on("connect", () => done(true));
    socket.on("error", () => done(false));
    socket.on("timeout", () => done(false));
    socket.connect(port, HOST);
  });
}

/** A session, and everything it said, so a test can wait for one of them. */
function open(port: number, password: string, more: Partial<VncTarget> = {}) {
  const events: RemoteScreenEvent[] = [];
  const certificates: string[] = [];
  const session = new VncSession({
    onScreen: (event) => events.push(event),
    onCertificate: (fingerprint) => certificates.push(fingerprint),
  });
  session.start({ host: HOST, port, password, ...more });
  return { session, events, certificates };
}

const until = async (predicate: () => boolean, ms = 15_000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
};

let up = false;
let running: VncSession | undefined;

beforeAll(async () => {
  up = await portIsOpen(AUTH_PORT);
}, 20_000);

afterEach(() => {
  running?.stop();
  running = undefined;
});

setLocale("en");

describe("VNC: talking to a real server", () => {
  it("it gets through password authentication (DES), and the size and a picture arrive", async ({ skip }) => {
    if (!up) skip();
    const { session, events } = open(AUTH_PORT, "secret");
    running = session;

    expect(await until(() => events.some((e) => e.kind === "size"))).toBe(true);
    const size = events.find((e) => e.kind === "size");
    expect(size).toEqual({ kind: "size", width: 1024, height: 768 });

    // A real framebuffer, not just a handshake: the first update covers the whole desktop.
    expect(await until(() => events.some((e) => e.kind === "paint"))).toBe(true);
    const paint = events.find((e) => e.kind === "paint");
    if (paint?.kind === "paint") {
      expect(paint.rect.width).toBeGreaterThan(0);
      expect(paint.pixels.byteLength).toBe(paint.rect.width * paint.rect.height * 4);
    }

    // What `read_screen` hands the agent: the whole desktop, opaque, and not a blank sheet.
    const shot = session.snapshot();
    expect(shot?.width).toBe(1024);
    expect(shot?.height).toBe(768);
    expect(shot?.data.length).toBe(1024 * 768 * 4);
    expect(shot?.data[3]).toBe(255);
    const distinct = new Set<number>();
    for (let i = 0; i < shot!.data.length; i += 4 * 997) distinct.add(shot!.data.readUInt32LE(i));
    expect(distinct.size).toBeGreaterThan(1);
  }, 40_000);

  it("a server with no password (no authentication) connects too", async ({ skip }) => {
    if (!up || !(await portIsOpen(OPEN_PORT))) skip();
    const { session, events } = open(OPEN_PORT, "");
    running = session;
    expect(await until(() => events.some((e) => e.kind === "size"))).toBe(true);
    expect(events.some((e) => e.kind === "closed")).toBe(false);
  }, 40_000);

  /**
   * The old handshake, which appliance consoles still speak.
   *
   * Claiming 3.8 at one of these had the client waiting for a reason string that was never coming
   * and blaming the network fifteen seconds later — with the password correct and the server
   * willing. Worth a real server rather than a fixture: the difference is entirely in what the
   * far side chooses to send.
   */
  it("an older server (RFB 3.3) connects as well", async ({ skip }) => {
    if (!up || !(await portIsOpen(OLD_PORT))) skip();
    const { session, events } = open(OLD_PORT, "secret");
    running = session;
    expect(await until(() => events.some((e) => e.kind === "size"))).toBe(true);
    expect(await until(() => events.some((e) => e.kind === "paint"))).toBe(true);
    expect(events.some((e) => e.kind === "closed")).toBe(false);
    expect(session.snapshot()?.width).toBe(1024);
  }, 40_000);

  it("a wrong password closes the connection, with the reason", async ({ skip }) => {
    if (!up) skip();
    const { session, events } = open(AUTH_PORT, "wrong-one");
    running = session;
    expect(await until(() => events.some((e) => e.kind === "closed"))).toBe(true);
    const closed = events.find((e) => e.kind === "closed");
    if (closed?.kind === "closed") expect(closed.detail?.length ?? 0).toBeGreaterThan(0);
    expect(events.some((e) => e.kind === "paint")).toBe(false);
  }, 40_000);

  /**
   * The whole promise of the screen mode: what the agent types is typed on that machine.
   *
   * Proven on the server rather than in the pixels — a file that only exists if the shell in the
   * remote terminal received every character, in the right case, and the newline.
   *
   * The name is deliberately mixed case. The agent types through scan codes with a held Shift
   * (`keyForCharacter` → `press_keys`), and this family of server resolves a keysym by *finding*
   * a key that produces it — so an unshifted keysym sent while Shift is down makes it let go of
   * Shift and type the lower case. `Passw0rd!` arrived as `passw0rd1` until the client started
   * sending the shifted keysym itself.
   */
  it("a key sent as a capital arrives on the far machine as one", async ({ skip }) => {
    if (!up) skip();
    const name = "/tmp/VncTyped-OK";
    try {
      execFileSync("docker", ["exec", CONTAINER, "rm", "-f", name], { stdio: "ignore" });
    } catch {
      skip(); // No docker, or a fixture started some other way: this proof is not available.
    }
    const { session, events } = open(AUTH_PORT, "secret");
    running = session;
    expect(await until(() => events.some((e) => e.kind === "paint"))).toBe(true);

    // Click into the terminal, then type. Click-to-focus is fluxbox's default.
    session.mouse(200, 120, 1);
    session.mouse(200, 120, 0);
    await new Promise((resolve) => setTimeout(resolve, 400));
    /* The desktop is shared and outlives the test: flush whatever half-typed line is on it, or
       this command is appended to somebody else's. */
    session.key(0x1c, true);
    session.key(0x1c, false);
    await new Promise((resolve) => setTimeout(resolve, 300));

    /* The agent's own path: a character becomes a key and possibly a held Shift. */
    for (const character of `touch ${name}`) {
      const key = keyForCharacter(character);
      const scancode = key && scancodeOf(key.code);
      if (scancode === undefined) continue;
      if (key?.shift) session.key(0x2a, true);
      session.key(scancode, true);
      session.key(scancode, false);
      if (key?.shift) session.key(0x2a, false);
    }
    session.key(0x1c, true); // Enter, as a PC/XT scan code — the app's own keyboard currency
    session.key(0x1c, false);

    const landed = await until(() => {
      try {
        execFileSync("docker", ["exec", CONTAINER, "test", "-f", name], { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    }, 10_000);
    expect(landed).toBe(true);
  }, 60_000);
});

/**
 * TigerVNC, which is what a Linux server actually runs — and it authenticates by account.
 *
 * VeNCrypt is a negotiation inside the negotiation, and the shape of it was taken from a real
 * server rather than from a document: the sub-type is answered with no acknowledgement for the
 * bare kinds, and with a single `0x01` before the TLS handshake for the others. Getting that one
 * byte wrong is a TLS error about record headers, which says nothing about what happened.
 *
 *   docker compose -f native/rdp/test-server/compose.yaml --profile vnc up -d --build tigervnc
 */
describe("VNC：VeNCrypt（TigerVNC）", () => {
  it("with consent, a user name and password (Plain) connect", async ({ skip }) => {
    if (!(await portIsOpen(TIGER_PLAIN_PORT))) skip();
    const { session, events } = open(TIGER_PLAIN_PORT, TIGER_PASSWORD, {
      username: TIGER_USER,
      allowPlaintext: true,
    });
    running = session;
    expect(await until(() => events.some((e) => e.kind === "size"))).toBe(true);
    expect(await until(() => events.some((e) => e.kind === "paint"))).toBe(true);
    expect(session.snapshot()?.width).toBe(1024);
  }, 40_000);

  /* Unless sending in the clear was allowed, the password never leaves. */
  it("without consent it avoids the clear text, stops, and says why", async ({ skip }) => {
    if (!(await portIsOpen(TIGER_PLAIN_PORT))) skip();
    const { session, events } = open(TIGER_PLAIN_PORT, TIGER_PASSWORD, { username: TIGER_USER });
    running = session;
    expect(await until(() => events.some((e) => e.kind === "closed"))).toBe(true);
    const closed = events.find((e) => e.kind === "closed");
    if (closed?.kind === "closed") {
      // Only anonymous TLS is left, so it is either that reason or the clear-text one
      expect(closed.detail).toMatch(/in the clear|anonymous TLS/);
    }
    expect(events.some((e) => e.kind === "paint")).toBe(false);
  }, 40_000);

  it("X509 connects inside TLS, and the certificate's fingerprint comes back to check next time", async ({ skip }) => {
    if (!(await portIsOpen(TIGER_X509_PORT))) skip();
    const { session, events, certificates } = open(TIGER_X509_PORT, TIGER_PASSWORD, {
      username: TIGER_USER,
    });
    running = session;
    expect(await until(() => events.some((e) => e.kind === "size"))).toBe(true);
    expect(await until(() => events.some((e) => e.kind === "paint"))).toBe(true);
    expect(certificates.length).toBe(1);
    expect(certificates[0]).toMatch(/^[0-9A-F]{2}(:[0-9A-F]{2})+$/);
  }, 40_000);

  /* A certificate that differs from last time is never accepted quietly — as with RDP. */
  it("a certificate that differs from last time does not connect, and says why", async ({ skip }) => {
    if (!(await portIsOpen(TIGER_X509_PORT))) skip();
    const { session, events } = open(TIGER_X509_PORT, TIGER_PASSWORD, {
      username: TIGER_USER,
      expectedFingerprint: "AA:BB:CC:DD",
    });
    running = session;
    expect(await until(() => events.some((e) => e.kind === "closed"))).toBe(true);
    const closed = events.find((e) => e.kind === "closed");
    if (closed?.kind === "closed") expect(closed.detail).toContain("certificate is not the one");
    expect(events.some((e) => e.kind === "paint")).toBe(false);
  }, 40_000);
});
