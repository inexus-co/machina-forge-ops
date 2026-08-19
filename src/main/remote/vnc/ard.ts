import crypto from "node:crypto";

/**
 * Apple Remote Desktop authentication — what macOS's own Screen Sharing asks for.
 *
 * Security type 30. Unlike standard VNC authentication this one has a user name, because it is
 * the Mac's own account: the server offers Diffie-Hellman parameters, both sides agree a secret,
 * and the credentials cross inside AES under a key derived from it. So the password is encrypted
 * rather than answered as a challenge — which is why this is preferred over cleartext Plain
 * wherever a server offers both.
 *
 * Everything here is arithmetic on what the server sent; the protocol steps around it are in
 * `rfb.ts`.
 */

/** The parameters the server sends: `u16 generator, u16 keyLength, prime[], serverPublic[]`. */
export type ArdChallenge = {
  generator: Buffer;
  keyLength: number;
  prime: Buffer;
  serverPublic: Buffer;
};

/** Each half of the credentials block, including the byte that terminates it. */
const HALF = 64;
export const ARD_CREDENTIALS_BYTES = HALF * 2;

/**
 * A big-endian number in exactly `length` bytes.
 *
 * Node drops leading zeros from a shared secret and from a public key, and the far side counts
 * bytes rather than reading a length — one secret in 256 starts with a zero, so this is the
 * difference between "works" and "fails about one time in two hundred and fifty six".
 */
function padded(value: Buffer, length: number): Buffer {
  if (value.length === length) return value;
  if (value.length > length) return value.subarray(value.length - length);
  const out = Buffer.alloc(length);
  value.copy(out, length - value.length);
  return out;
}

/**
 * The 128 bytes that carry the credentials: user name and password, each NUL-terminated in its
 * own 64, with random filling the rest so the ciphertext of a short password is not a giveaway.
 */
export function ardCredentialsBlock(username: string, password: string): Buffer {
  const block = crypto.randomBytes(ARD_CREDENTIALS_BYTES);
  const write = (text: string, at: number) => {
    const bytes = Buffer.from(text, "utf8").subarray(0, HALF - 1);
    bytes.copy(block, at);
    block[at + bytes.length] = 0;
  };
  write(username, 0);
  write(password, HALF);
  return block;
}

/**
 * The answer to the server's challenge: the encrypted credentials, then our public key.
 *
 * That order is the protocol's, and it is the opposite of what the field order suggests.
 */
export function ardResponse(
  challenge: ArdChallenge,
  username: string,
  password: string,
  /** Injected by the test, so a case can be checked against a known key rather than a random one. */
  block = ardCredentialsBlock(username, password),
): Buffer {
  const dh = crypto.createDiffieHellman(challenge.prime, challenge.generator);
  dh.generateKeys();
  const secret = padded(dh.computeSecret(challenge.serverPublic), challenge.keyLength);
  const key = crypto.createHash("md5").update(secret).digest();

  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  cipher.setAutoPadding(false);
  const sealed = Buffer.concat([cipher.update(block), cipher.final()]);

  return Buffer.concat([sealed, padded(dh.getPublicKey(), challenge.keyLength)]);
}
