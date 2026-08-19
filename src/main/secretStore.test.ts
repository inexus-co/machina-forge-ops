import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { setLocale } from "../shared/i18n";
import {
  readSecrets,
  writeSecrets,
  secretsUnavailable,
  type SecretCipher,
} from "./secretStore";

/** Stands in for the Keychain: reversible, and obviously not encryption. */
const fakeCipher: SecretCipher = {
  available: true,
  encrypt: (plain) => Buffer.from(`sealed:${plain}`, "utf8"),
  decrypt: (data) => {
    const text = data.toString("utf8");
    if (!text.startsWith("sealed:")) throw new Error("not ours");
    return text.slice("sealed:".length);
  },
};

const unavailableCipher: SecretCipher = {
  available: false,
  encrypt: () => {
    throw new Error("encryption was called where it should not be available");
  },
  decrypt: () => {
    throw new Error("decryption was called where it should not be available");
  },
};

async function makeFile() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "machina-secrets-"));
  return path.join(root, "secrets.bin");
}

setLocale("en");

describe("secretStore", () => {
  it("it can be written and read back", async () => {
    const file = await makeFile();
    await writeSecrets(
      file,
      new Map([["wifi.password", "hunter2"]]),
      fakeCipher,
    );
    expect(await readSecrets(file, fakeCipher)).toEqual(
      new Map([["wifi.password", "hunter2"]]),
    );
  });

  it("what is written is the encrypted result itself", async () => {
    const file = await makeFile();
    await writeSecrets(file, new Map([["a", "hunter2"]]), fakeCipher);
    // The fake cipher does not really encrypt, so "the file has no plaintext" would only test
    // the fake. What the store owes us is that nothing bypasses the cipher on the way to disk.
    expect(await fs.readFile(file)).toEqual(
      fakeCipher.encrypt(JSON.stringify({ a: "hunter2" })),
    );
  });

  it("the permissions let only the owner read it", async () => {
    const file = await makeFile();
    await writeSecrets(file, new Map([["a", "b"]]), fakeCipher);
    const stat = await fs.stat(file);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("where nothing can be encrypted, it refuses to save", async () => {
    const file = await makeFile();
    await expect(
      writeSecrets(file, new Map([["a", "b"]]), unavailableCipher),
    ).rejects.toThrow(secretsUnavailable());
    // Refusing must leave nothing behind — a plaintext fallback is the failure we are avoiding.
    await expect(fs.stat(file)).rejects.toThrow();
  });

  it("emptied, the file is removed", async () => {
    const file = await makeFile();
    await writeSecrets(file, new Map([["a", "b"]]), fakeCipher);
    await writeSecrets(file, new Map(), fakeCipher);
    await expect(fs.stat(file)).rejects.toThrow();
  });

  it("with no secrets in it, it saves even where nothing can be encrypted", async () => {
    const file = await makeFile();
    await expect(
      writeSecrets(file, new Map(), unavailableCipher),
    ).resolves.toBeUndefined();
  });

  it("a file that is not there yet reads as empty", async () => {
    const file = await makeFile();
    expect(await readSecrets(file, fakeCipher)).toEqual(new Map());
  });

  it("a file somebody else encrypted comes back as unreadable", async () => {
    const file = await makeFile();
    await fs.writeFile(file, Buffer.from("someone elses bytes"));
    await expect(readSecrets(file, fakeCipher)).rejects.toThrow(/cannot be read/);
  });

  it("a file with a value that is not a string is refused", async () => {
    const file = await makeFile();
    await fs.writeFile(file, fakeCipher.encrypt(JSON.stringify({ a: 1 })));
    await expect(readSecrets(file, fakeCipher)).rejects.toThrow(/not in a shape/);
  });

  it("anything that is not an object is refused", async () => {
    const file = await makeFile();
    await fs.writeFile(file, fakeCipher.encrypt(JSON.stringify(["a"])));
    await expect(readSecrets(file, fakeCipher)).rejects.toThrow(/not in a shape/);
  });
});
