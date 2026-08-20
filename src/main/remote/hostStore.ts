import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { StoredRemoteHost } from "../../shared/remote";
import { type SecretCipher, readSecrets, writeSecrets } from "../secretStore";

/**
 * Where the list of customer servers is kept between launches.
 *
 * The same split the target list uses: `remote-hosts.json` holds addresses, which are plain
 * preferences, and `remote-secrets.bin` holds the passwords, which are credentials for somebody
 * else's machine. One encrypted file keyed by `<hostId>.<protocol>`, because a host can have a
 * different account for its desktop and its shell.
 */

const endpointSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().max(255),
});

const sshEndpointSchema = endpointSchema.extend({
  /* Empty where the machine is reached by a command: the instance id in `wayIn` names it. */
  host: z.string().max(255),
  /* Older files predate the choice and were all passwords. */
  auth: z.enum(["password", "key"]).default("password"),
  keyPath: z.string().max(1024).optional(),
  tmux: z.boolean().optional(),
  keepLocal: z.boolean().optional(),
});

/** VNC needs only an address: standard RFB authenticates with a password, no username. */
const vncEndpointSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  /* Only the dialects use it (VeNCrypt, Apple, UltraVNC); standard VNC has no user name. */
  username: z.string().max(255).optional(),
  allowPlaintext: z.boolean().optional(),
});

/**
 * The way in, bounded rather than judged.
 *
 * Which provider it is and which fields it has is `shared/wayIn.ts`; an unknown row read back from
 * an older or newer installation is simply a host with no way in, which is a host that says it
 * cannot be reached rather than one that will not open.
 */
const wayInSchema = z.object({
  provider: z.string().min(1).max(32),
  values: z.record(z.string().max(64), z.string().max(2000)),
});

/** Where the big files go, when they do not fit down the connection. See `shared/fileTransfer.ts`. */
const fileTransferSchema = z.object({
  via: z.string().min(1).max(32),
  values: z.record(z.string().max(64), z.string().max(2000)),
});

const storedHostSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  jumpHostId: z.string().min(1).max(64).optional(),
  wayIn: wayInSchema.optional(),
  fileTransfer: fileTransferSchema.optional(),
  rdp: endpointSchema.optional(),
  vnc: vncEndpointSchema.optional(),
  ssh: sshEndpointSchema.optional(),
});

export type Protocol = "rdp" | "ssh" | "vnc";

export function hostsPath(userDataRoot: string) {
  return path.join(userDataRoot, "remote-hosts.json");
}

export function secretsPath(userDataRoot: string) {
  return path.join(userDataRoot, "remote-secrets.bin");
}

/** One password's key in the encrypted store. A host may hold a different one per protocol. */
export const secretKey = (id: string, protocol: Protocol) => `${id}.${protocol}`;

/**
 * Where a private key's passphrase is kept.
 *
 * Separate from the password: a host configured for key authentication may still have had a
 * password stored from before the change, and one must not be handed over as the other.
 */
export const passphraseKey = (id: string) => `${id}.ssh-passphrase`;

export async function readHosts(userDataRoot: string): Promise<StoredRemoteHost[]> {
  try {
    const raw = await fs.readFile(hostsPath(userDataRoot), "utf8");
    const parsed = z.array(storedHostSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    // Nothing stored yet, or a file we cannot read. The screen asks for a host.
    return [];
  }
}

export async function writeHosts(
  userDataRoot: string,
  hosts: readonly StoredRemoteHost[],
): Promise<void> {
  await fs.writeFile(
    hostsPath(userDataRoot),
    `${JSON.stringify(hosts, null, 2)}\n`,
    "utf8",
  );
}

export async function readSecretMap(
  userDataRoot: string,
  cipher: SecretCipher,
): Promise<Map<string, string>> {
  try {
    return await readSecrets(secretsPath(userDataRoot), cipher);
  } catch {
    // An unreadable store is the same as none: the operator types the password again.
    return new Map();
  }
}

/**
 * Store one password, or forget it when `password` is undefined.
 *
 * Read-modify-write on one file. The list is a handful of entries and only changes while somebody
 * is typing into the connection form.
 */
export async function writeSecret(
  userDataRoot: string,
  cipher: SecretCipher,
  key: string,
  password: string | undefined,
): Promise<void> {
  const secrets = await readSecretMap(userDataRoot, cipher);
  if (password === undefined) secrets.delete(key);
  else secrets.set(key, password);
  await writeSecrets(secretsPath(userDataRoot), secrets, cipher);
}

/** Forget everything belonging to a host that is being removed. */
export async function forgetHostSecrets(
  userDataRoot: string,
  cipher: SecretCipher,
  id: string,
): Promise<void> {
  const secrets = await readSecretMap(userDataRoot, cipher);
  secrets.delete(secretKey(id, "rdp"));
  secrets.delete(secretKey(id, "vnc"));
  secrets.delete(secretKey(id, "ssh"));
  secrets.delete(passphraseKey(id));
  await writeSecrets(secretsPath(userDataRoot), secrets, cipher);
}

/**
 * What to connect with.
 *
 * An empty typed field means "keep the stored one" — the password never travels back to the
 * renderer, so the box on screen starts empty on every launch and treating that as "clear it"
 * would log the operator out of a machine whenever they corrected a port.
 */
export function resolvePassword(typed: string, stored: string | undefined) {
  return typed || stored || "";
}
