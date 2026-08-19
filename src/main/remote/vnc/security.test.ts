import { describe, expect, it } from "vitest";
import { setLocale } from "../../../shared/i18n";
import { desEncryptCbc } from "./des";
import { ARD_CREDENTIALS_BYTES, ardCredentialsBlock } from "./ard";
import { MSLOGON_PASSWORD_BYTES, MSLOGON_USERNAME_BYTES, msLogonField, msLogonResponse } from "./mslogon";
import {
  SEC_ARD,
  SEC_MSLOGON_II,
  SEC_NONE,
  SEC_VENCRYPT,
  SEC_VNC_AUTH,
  SUB_PLAIN,
  SUB_TLS_PLAIN,
  SUB_TLS_VNC,
  SUB_X509_PLAIN,
  SUB_X509_VNC,
  type VncCredentials,
  chooseSecurity,
  chooseSubtype,
  innerOf,
  plainMessage,
  tlsOf,
} from "./security";

const creds = (over: Partial<VncCredentials> = {}): VncCredentials => ({
  username: "",
  password: "",
  allowPlaintext: false,
  ...over,
});

setLocale("en");

describe("choosing which authentication to use", () => {
  it("VeNCrypt first where it is offered; what is inside it is chosen next", () => {
    expect(chooseSecurity([SEC_VNC_AUTH, SEC_VENCRYPT], creds({ password: "x" }))).toEqual({
      pick: SEC_VENCRYPT,
    });
  });

  it("a password alone means VNC authentication; with a user name, Apple and UltraVNC are open too", () => {
    expect(chooseSecurity([SEC_VNC_AUTH, SEC_NONE], creds({ password: "x" }))).toEqual({
      pick: SEC_VNC_AUTH,
    });
    expect(chooseSecurity([SEC_ARD], creds({ username: "u", password: "p" }))).toEqual({
      pick: SEC_ARD,
    });
    expect(chooseSecurity([SEC_MSLOGON_II], creds({ username: "u", password: "p" }))).toEqual({
      pick: SEC_MSLOGON_II,
    });
  });

  it("a user name that is needed and not there stops, and says so", () => {
    const choice = chooseSecurity([SEC_ARD], creds({ password: "p" }));
    expect("refuse" in choice && choice.refuse).toContain("user name");
  });

  it("a server that asks for nothing is simply connected to", () => {
    expect(chooseSecurity([SEC_NONE], creds())).toEqual({ pick: SEC_NONE });
  });

  it("where every offer is unknown, it refuses and gives the number", () => {
    const choice = chooseSecurity([99], creds());
    expect("refuse" in choice && choice.refuse).toContain("99");
  });
});

describe("which VeNCrypt sub-type to take", () => {
  it("the certificated one (X509) comes first", () => {
    expect(chooseSubtype([SUB_PLAIN, SUB_X509_PLAIN], creds({ username: "u", allowPlaintext: true })))
      .toEqual({ pick: SUB_X509_PLAIN });
    expect(chooseSubtype([SUB_X509_VNC], creds({ password: "p" }))).toEqual({ pick: SUB_X509_VNC });
  });

  /*
   * Plain only where the operator has said so. It is meant for inside a jump server or a VPN;
   * sent without a word, the password goes onto the network as it stands.
   */
  it("Plain is refused without consent", () => {
    const choice = chooseSubtype([SUB_PLAIN], creds({ username: "u", password: "p" }));
    expect("refuse" in choice && choice.refuse).toContain("in the clear");
    expect(
      chooseSubtype([SUB_PLAIN], creds({ username: "u", password: "p", allowPlaintext: true })),
    ).toEqual({ pick: SUB_PLAIN });
  });

  /*
   * Anonymous TLS cannot be spoken at all: Node's OpenSSL has no cipher suite for it (measured).
   * Rather than fail without a word, say what is happening and what to do about it.
   */
  it("where anonymous TLS is all there is, it refuses with the reason and the remedy", () => {
    const choice = chooseSubtype([SUB_TLS_PLAIN, SUB_TLS_VNC], creds({ username: "u", password: "p" }));
    expect("refuse" in choice && choice.refuse).toContain("anonymous TLS");
    expect("refuse" in choice && choice.refuse).toContain("X509");
  });

  it("which ones are TLS, and what happens inside them", () => {
    expect(tlsOf(SUB_X509_PLAIN)).toEqual({ tls: true, x509: true });
    expect(tlsOf(SUB_TLS_PLAIN)).toEqual({ tls: true, x509: false });
    expect(tlsOf(SUB_PLAIN)).toEqual({ tls: false, x509: false });
    expect(innerOf(SUB_X509_PLAIN)).toBe("plain");
    expect(innerOf(SUB_X509_VNC)).toBe("vnc");
    expect(innerOf(SUB_PLAIN)).toBe("plain");
  });

  it("Plain's body is two lengths and two strings", () => {
    const message = plainMessage("root", "vncpass");
    expect(message.readUInt32BE(0)).toBe(4);
    expect(message.readUInt32BE(4)).toBe(7);
    expect(message.toString("utf8", 8, 12)).toBe("root");
    expect(message.toString("utf8", 12)).toBe("vncpass");
  });
});

describe("packing the credentials (Apple and UltraVNC)", () => {
  it("Apple takes 128 bytes, 64 each, NUL-terminated", () => {
    const block = ardCredentialsBlock("alice", "secret");
    expect(block.length).toBe(ARD_CREDENTIALS_BYTES);
    expect(block.toString("utf8", 0, 5)).toBe("alice");
    expect(block[5]).toBe(0);
    expect(block.toString("utf8", 64, 70)).toBe("secret");
    expect(block[70]).toBe(0);
  });

  it("Apple cuts a name that is too long, and the terminator always fits", () => {
    const block = ardCredentialsBlock("a".repeat(200), "b".repeat(200));
    expect(block.length).toBe(ARD_CREDENTIALS_BYTES);
    expect(block[63]).toBe(0);
    expect(block[127]).toBe(0);
  });

  it("UltraVNC takes 256 and 64, both NUL-terminated", () => {
    const user = msLogonField("administrator", MSLOGON_USERNAME_BYTES);
    const pass = msLogonField("pw", MSLOGON_PASSWORD_BYTES);
    expect(user.length).toBe(256);
    expect(pass.length).toBe(64);
    expect(user.toString("utf8", 0, 13)).toBe("administrator");
    expect(user[13]).toBe(0);
    expect(pass[2]).toBe(0);
  });

  it("UltraVNC's reply is 8+256+64 bytes, and the same key gives the same shape", () => {
    // Diffie-Hellman over a small prime. Not a real server's numbers: this checks the
    // arithmetic and the packing.
    const challenge = {
      generator: Buffer.from("0000000000000005", "hex"),
      modulus: Buffer.from("00000000fffffffb", "hex"),
      serverPublic: Buffer.from("0000000012345677", "hex"),
    };
    const out = msLogonResponse(challenge, "u", "p", 7n);
    expect(out.length).toBe(8 + MSLOGON_USERNAME_BYTES + MSLOGON_PASSWORD_BYTES);
    // 5^7 mod 0xfffffffb = 78125
    expect(out.readBigUInt64BE(0)).toBe(78125n);
    // The same private key gives the same public key (only the credential padding is random)
    expect(msLogonResponse(challenge, "u", "p", 7n).readBigUInt64BE(0)).toBe(78125n);
  });

  it("DES-CBC chains the previous block, so the same text does not encrypt the same way", () => {
    const key = Buffer.from("0123456789abcdef", "hex");
    const iv = Buffer.from("1122334455667788", "hex");
    const out = desEncryptCbc(key, iv, Buffer.alloc(16, 0));
    expect(out.length).toBe(16);
    expect(out.subarray(0, 8).toString("hex")).not.toBe(out.subarray(8).toString("hex"));
    // deterministic
    expect(desEncryptCbc(key, iv, Buffer.alloc(16, 0)).toString("hex")).toBe(out.toString("hex"));
  });
});
