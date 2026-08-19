import crypto from "node:crypto";
import { desEncryptCbc } from "./des";

/**
 * UltraVNC's MS-Logon II — the Windows account behind a VNC server.
 *
 * Security type 113. A Diffie-Hellman exchange in 64 bits (small by any modern standard, and not
 * ours to change: it is what the servers do), then the user name and the password encrypted with
 * DES under the shared secret, which serves as both the key and the initialisation vector.
 *
 * DES comes from `./des` rather than from Node: OpenSSL 3 moved single-DES to a provider Node does
 * not load, which is the same reason standard VNC authentication needed it.
 *
 * **Not verified against a real server.** UltraVNC runs on Windows and there was none to hand;
 * what is checked here is the arithmetic and the byte layout, against the protocol as noVNC
 * implements it.
 */

/** Every field in this exchange is 64 bits. */
const WORD = 8;
export const MSLOGON_USERNAME_BYTES = 256;
export const MSLOGON_PASSWORD_BYTES = 64;

/** The parameters the server sends: generator, modulus, and its public key — 8 bytes each. */
export type MsLogonChallenge = { generator: Buffer; modulus: Buffer; serverPublic: Buffer };

function toBig(bytes: Buffer): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function toBytes(value: bigint, length = WORD): Buffer {
  const out = Buffer.alloc(length);
  let rest = value;
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  if (modulus <= 1n) return 0n;
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
}

/** One field: the text, NUL-terminated, the rest random so a short one is not obvious by length. */
export function msLogonField(text: string, length: number): Buffer {
  const field = crypto.randomBytes(length);
  const bytes = Buffer.from(text, "utf8").subarray(0, length - 1);
  bytes.copy(field, 0);
  field[bytes.length] = 0;
  return field;
}

/**
 * The answer: our public key, then the encrypted user name, then the encrypted password.
 *
 * `secret` is deliberately used as the DES key *and* as the IV — that is the protocol, not an
 * oversight here.
 */
export function msLogonResponse(
  challenge: MsLogonChallenge,
  username: string,
  password: string,
  /** Injected by the test; otherwise a fresh private value each time. */
  privateKey = toBig(crypto.randomBytes(WORD)),
): Buffer {
  const modulus = toBig(challenge.modulus);
  const generator = toBig(challenge.generator);
  const exponent = modulus > 1n ? privateKey % (modulus - 1n) : 0n;

  const ours = toBytes(modPow(generator, exponent, modulus));
  const secret = toBytes(modPow(toBig(challenge.serverPublic), exponent, modulus));

  return Buffer.concat([
    ours,
    desEncryptCbc(secret, secret, msLogonField(username, MSLOGON_USERNAME_BYTES)),
    desEncryptCbc(secret, secret, msLogonField(password, MSLOGON_PASSWORD_BYTES)),
  ]);
}
