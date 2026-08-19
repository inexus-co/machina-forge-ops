import { randomUUID } from "node:crypto";
import { t } from "../../shared/i18n";
import { ipcMain, type WebContents } from "electron";
import { z } from "zod";
import type { HostKeyQuestion } from "../../shared/remote";
import {
  addressKey,
  fingerprintOf,
  forgetHost,
  readKnownHosts,
  rememberHost,
} from "./knownHosts";

/**
 * Deciding whether the machine that answered is the machine we meant.
 *
 * Three outcomes, and only the first two happen without a person:
 *
 * - **Known and matching** — connect. Nothing is said, because nothing happened.
 * - **Known and different** — refuse, and say so in the strongest terms available. The two
 *   explanations are "it was rebuilt" and "it is not that server", and only one of them is
 *   something to shrug at. Forgetting the old key is a deliberate act on the settings page,
 *   not a button on the warning — a warning with a "yes, whatever" button beside it is a
 *   warning nobody reads.
 * - **Never seen** — ask. Once per server, showing the fingerprint in the form `ssh-keygen -l`
 *   prints so it can be compared against whatever the server's owner said it should be.
 */

let root = "";
let renderer: WebContents | undefined;

type Pending = { settle(trusted: boolean): void };
const pending = new Map<string, Pending>();

/** Why the last connection to this address was refused, for the message the operator sees. */
const refusals = new Map<string, string>();

/**
 * Decisions being made right now, by address.
 *
 * The terminal, the status panel, the agent and the file browser each open their own connection,
 * and on a first visit they arrive together. Asking four times would be absurd; asking once and
 * leaving three connections waiting on an answer that never comes is worse, and is what happened
 * — the screen shows one question, answering it settles one connection, and the rest hang for
 * ever. The decision belongs to the address, so it is made once and shared.
 */
const deciding = new Map<string, Promise<boolean>>();

export function setHostKeyTarget(contents: WebContents) {
  renderer = contents;
  contents.once("destroyed", () => {
    if (renderer === contents) renderer = undefined;
  });
}

/**
 * The verifier for one address.
 *
 * Shaped for `ssh2`, which hands over the raw key and a callback. The answer may take as long as
 * a person takes; nothing else about the connection proceeds until it comes.
 */
export function sshVerifier(host: string, port: number) {
  return (key: Buffer, accept: (trusted: boolean) => void) => {
    void decide("ssh", host, port, fingerprintOf(key), keyAlgorithm(key)).then(accept);
  };
}

/**
 * The same decision for RDP, made from a fingerprint the helper reported.
 *
 * Asked *before* the helper is started, because a certificate cannot be checked halfway through
 * a connection that has already sent the password. On a first connection there is nothing to
 * compare against and the helper is told to record whatever it finds.
 */
export async function rdpExpectation(host: string, port: number): Promise<string> {
  const known = await readKnownHosts(root);
  return known[addressKey("rdp", host, port)]?.fingerprint ?? "";
}

/** What the helper found, once it has connected with no expectation to check against. */
export async function rememberRdp(host: string, port: number, fingerprint: string) {
  const key = addressKey("rdp", host, port);
  const known = await readKnownHosts(root);
  if (known[key]) return;
  await rememberHost(root, key, {
    algorithm: "rdp",
    fingerprint,
    addedAt: new Date().toISOString(),
  });
}

/**
 * The same pair for VNC.
 *
 * Only VeNCrypt's X.509 sub-types have a certificate at all — plain RFB has no server identity to
 * remember. Where there is one it is treated as RDP's is: recorded on a first meeting, and any
 * change refuses the connection rather than asking, because there is nobody to ask in the middle
 * of a handshake.
 */
export async function vncExpectation(host: string, port: number): Promise<string> {
  const known = await readKnownHosts(root);
  return known[addressKey("vnc", host, port)]?.fingerprint ?? "";
}

export async function rememberVnc(host: string, port: number, fingerprint: string) {
  const key = addressKey("vnc", host, port);
  const known = await readKnownHosts(root);
  if (known[key]) return;
  await rememberHost(root, key, {
    algorithm: "vnc",
    fingerprint,
    addedAt: new Date().toISOString(),
  });
}

function decide(
  protocol: "ssh" | "rdp",
  host: string,
  port: number,
  fingerprint: string,
  algorithm: string,
): Promise<boolean> {
  const key = addressKey(protocol, host, port);
  const already = deciding.get(key);
  if (already) return already;
  const answer = decideOnce(key, protocol, host, port, fingerprint, algorithm);
  deciding.set(key, answer);
  void answer.finally(() => deciding.delete(key));
  return answer;
}

async function decideOnce(
  key: string,
  protocol: "ssh" | "rdp",
  host: string,
  port: number,
  fingerprint: string,
  algorithm: string,
): Promise<boolean> {
  const known = await readKnownHosts(root);
  const record = known[key];

  if (record?.fingerprint === fingerprint) {
    refusals.delete(key);
    return true;
  }

  if (record) {
    refusals.set(
      key,
      t(
        "This server's key is not the one recorded. Either {where} was rebuilt, or it is a different server. Recorded {expected} / now {found}. If you rebuilt it, forget this server's key in the settings and then connect.",
        { where: `${host}:${port}`, expected: record.fingerprint, found: fingerprint },
      ),
    );
    // Told separately as well: the connection error appears where the operator was working, and
    // this is the one message that must not be mistaken for a network problem.
    send("remote:host-key-changed", { host, port, protocol, expected: record.fingerprint, found: fingerprint });
    return false;
  }

  const trusted = await ask({ id: randomUUID(), protocol, host, port, fingerprint, algorithm });
  if (!trusted) {
    refusals.set(key, t("The key at {where} was not trusted.", { where: `${host}:${port}` }));
    return false;
  }
  await rememberHost(root, key, { algorithm, fingerprint, addedAt: new Date().toISOString() });
  refusals.delete(key);
  return true;
}

function ask(question: HostKeyQuestion): Promise<boolean> {
  if (!renderer || renderer.isDestroyed()) return Promise.resolve(false);
  return new Promise((resolve) => {
    pending.set(question.id, {
      settle: (trusted) => {
        pending.delete(question.id);
        resolve(trusted);
      },
    });
    send("remote:host-key-question", question);
  });
}

function send(channel: string, payload: unknown) {
  if (renderer && !renderer.isDestroyed()) renderer.send(channel, payload);
}

/** The reason a connection to this address was refused, if it was refused by us. */
export function refusalFor(protocol: "ssh" | "rdp", host: string, port: number) {
  return refusals.get(addressKey(protocol, host, port));
}

/**
 * The key's algorithm, from the wire format.
 *
 * An SSH public key begins with a four-byte length and then its own type as text — the same
 * string that appears at the start of a line in `authorized_keys`.
 */
function keyAlgorithm(key: Buffer) {
  try {
    const length = key.readUInt32BE(0);
    if (length > 0 && length < 64) return key.subarray(4, 4 + length).toString("ascii");
  } catch {
    /* not a key we can read a name out of; the fingerprint is the part that matters */
  }
  return "unknown";
}

export function registerHostKeyController(userDataRoot: string) {
  root = userDataRoot;

  ipcMain.handle("remote:host-key-answer", (event, rawId: unknown, rawTrusted: unknown) => {
    setHostKeyTarget(event.sender);
    pending.get(z.string().min(1).max(64).parse(rawId))?.settle(
      z.boolean().parse(rawTrusted),
    );
  });

  ipcMain.handle("remote:list-known-hosts", async () => readKnownHosts(root));

  /*
   * Forgetting is how an operator says "it really was rebuilt".
   *
   * On the settings page rather than on the warning, so it is a thing somebody goes and does
   * rather than the second button under an alarm.
   */
  ipcMain.handle("remote:forget-host-key", async (_event, rawKey: unknown) => {
    const key = z.string().min(1).max(200).parse(rawKey);
    await forgetHost(root, key);
    refusals.delete(key);
  });
}
