import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

/**
 * Which server is on the other end.
 *
 * Until now this application accepted any host key at all, which in a tool that holds customers'
 * passwords and private keys is not a missing feature but a hole: anything on the path — a
 * compromised VPN, a hostile network at a customer's site — could stand in the middle, and the
 * first thing it would be handed is the password.
 *
 * The rule is the one `ssh` has always had. A server is remembered by its address and its key.
 * The first time, somebody looks at the fingerprint and says yes. Every time after, a key that
 * does not match stops the connection, because the only two explanations are that the server was
 * rebuilt or that it is not the server.
 *
 * Kept beside the addresses rather than in the encrypted store: a public key is not a secret, and
 * a file somebody can read and edit is the point — this is the same thing `known_hosts` is.
 */

const recordSchema = z.object({
  /** `ssh-ed25519`, `rsa-sha2-512`, or for RDP the string `rdp`. */
  algorithm: z.string().max(64),
  /** SHA256 of the key or certificate, base64, as `ssh-keygen -l` prints it. */
  fingerprint: z.string().max(120),
  addedAt: z.string().max(40),
});

export type KnownHost = z.infer<typeof recordSchema>;

const fileSchema = z.record(z.string(), recordSchema);

export function knownHostsPath(userDataRoot: string) {
  return path.join(userDataRoot, "known-hosts.json");
}

/** One entry's key. The address, not the host id: two entries may point at one machine. */
export function addressKey(protocol: "ssh" | "rdp" | "vnc", host: string, port: number) {
  return `${protocol}://${host}:${port}`;
}

/**
 * The fingerprint of a key, in the form every other tool prints.
 *
 * `SHA256:` and base64 without padding — the same string `ssh-keygen -lf` gives, so an operator
 * can compare what is on screen with what the server says about itself without transcribing.
 */
export function fingerprintOf(key: Buffer) {
  return `SHA256:${createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;
}

export async function readKnownHosts(userDataRoot: string): Promise<Record<string, KnownHost>> {
  try {
    const raw = await fs.readFile(knownHostsPath(userDataRoot), "utf8");
    const parsed = fileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    // Nothing recorded yet. Every server is then a first meeting, which is handled above.
    return {};
  }
}

export async function rememberHost(
  userDataRoot: string,
  key: string,
  record: KnownHost,
): Promise<void> {
  const known = await readKnownHosts(userDataRoot);
  known[key] = record;
  await fs.writeFile(
    knownHostsPath(userDataRoot),
    `${JSON.stringify(known, null, 2)}\n`,
    "utf8",
  );
}

/** Forget one server's key, which is how an operator says "it really was rebuilt". */
export async function forgetHost(userDataRoot: string, key: string): Promise<void> {
  const known = await readKnownHosts(userDataRoot);
  delete known[key];
  await fs.writeFile(
    knownHostsPath(userDataRoot),
    `${JSON.stringify(known, null, 2)}\n`,
    "utf8",
  );
}
