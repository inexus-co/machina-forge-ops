import fs from "node:fs/promises";
import { t } from "../shared/i18n";

/**
 * Encrypted storage for the secret fields of a setting profile.
 *
 * Passwords are the reason this file exists, so the rules are strict:
 *
 * - if the platform cannot encrypt, saving is **refused**. Writing a plaintext fallback would
 *   put passwords in a file on disk, which is exactly what the operator was trying to avoid
 * - the decrypted values never leave the main process
 * - the file holds a flat `{ key: value }` object and nothing else, so a corrupted or foreign
 *   file is rejected rather than half-read
 *
 * The cipher is passed in rather than imported. Electron's `safeStorage` is only usable inside a
 * running Electron app, and keeping it at the boundary lets the store be tested — including the
 * case that matters most, an unavailable Keychain.
 */

export type SecretCipher = {
  /** Whether this machine has a working key store (macOS Keychain, and equivalents). */
  available: boolean;
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
};

/*
 * A function, not a constant: words read at import time would be the language the application
 * started in, and would keep saying it after the operator switched (`i18n.test.ts` checks this).
 */
export const secretsUnavailable = () =>
  t("Credentials cannot be encrypted on this machine. Rather than write a password out in the clear, nothing was saved.");

export async function readSecrets(
  file: string,
  cipher: SecretCipher,
): Promise<Map<string, string>> {
  let encrypted: Buffer;
  try {
    encrypted = await fs.readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw error;
  }
  if (encrypted.byteLength === 0) return new Map();
  if (!cipher.available) throw new Error(secretsUnavailable());

  let parsed: unknown;
  try {
    parsed = JSON.parse(cipher.decrypt(encrypted));
  } catch {
    throw new Error(
      t("The saved credentials cannot be read. They may have been encrypted by another user, or on another machine."),
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(t("The saved credentials are not in a shape this can read."));
  }

  const values = new Map<string, string>();
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") {
      throw new Error(t("The saved credentials are not in a shape this can read."));
    }
    values.set(key, value);
  }
  return values;
}

export async function writeSecrets(
  file: string,
  values: ReadonlyMap<string, string>,
  cipher: SecretCipher,
): Promise<void> {
  if (values.size === 0) {
    // No secrets left: remove the file rather than leaving an encrypted empty object behind.
    await fs.rm(file, { force: true });
    return;
  }
  if (!cipher.available) throw new Error(secretsUnavailable());
  const encrypted = cipher.encrypt(JSON.stringify(Object.fromEntries(values)));
  await fs.writeFile(file, encrypted, { mode: 0o600 });
}
