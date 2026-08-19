/**
 * Which way in to take, out of the ones a server offers.
 *
 * VNC's authentication is a family rather than a method: the plain challenge every server has,
 * VeNCrypt's sub-negotiation (with or without TLS around it) on Linux, Apple's own on a Mac, and
 * UltraVNC's on Windows. A server lists what it will accept and the client picks one — so the
 * order of preference *is* the security policy, and it lives here on its own where it can be read
 * and tested rather than buried in the parser.
 *
 * Two rules shape it:
 *
 *  - **Never send a password in the clear unless the operator said so.** VeNCrypt's `Plain` does
 *    exactly that. It is last, and only if the host was configured for it — through a bastion the
 *    SSH tunnel is the encryption, which is the case it exists for.
 *  - **Anonymous TLS cannot be spoken at all.** Node's OpenSSL exposes no anonymous cipher suites
 *    (`tls.getCiphers()` lists none), so a ClientHello offers nothing such a server accepts and it
 *    hangs up. Pretending otherwise would produce a timeout and a wrong explanation, so those
 *    sub-types are refused by name, with the two things that do work.
 */

import { t } from "../../../shared/i18n";

/** Top-level security types. */
export const SEC_NONE = 1;
export const SEC_VNC_AUTH = 2;
export const SEC_ARD = 30;
export const SEC_VENCRYPT = 19;
export const SEC_MSLOGON_II = 113;

/** VeNCrypt sub-types. */
export const SUB_PLAIN = 256;
export const SUB_TLS_NONE = 257;
export const SUB_TLS_VNC = 258;
export const SUB_TLS_PLAIN = 259;
export const SUB_X509_NONE = 260;
export const SUB_X509_VNC = 261;
export const SUB_X509_PLAIN = 262;

export type VncCredentials = {
  /** Empty unless the operator filled it in: standard VNC authentication has no user name. */
  username: string;
  password: string;
  /** The operator accepted that this host's password may cross the wire in the clear. */
  allowPlaintext: boolean;
};

export type Choice<T> = { pick: T } | { refuse: string };

/** The anonymous-TLS family, which this client cannot speak — see the note above. */
const ANONYMOUS_TLS = [SUB_TLS_NONE, SUB_TLS_VNC, SUB_TLS_PLAIN];

/* A function, so the sentence is in the language in force when the refusal happens. */
const noAnonymousTls = () =>
  t(
    "This server's VNC asks to connect over anonymous TLS, which is TigerVNC's default. That way is not supported. Either set up an X509 certificate on the server, or go through a jump server and allow sending in the clear in the settings.",
  );

/**
 * The top-level type to answer with.
 *
 * VeNCrypt is preferred when it is offered because everything better than cleartext lives inside
 * it; the sub-type decision happens once the server has said what it has (`chooseSubtype`).
 */
export function chooseSecurity(offered: readonly number[], credentials: VncCredentials): Choice<number> {
  const has = (type: number) => offered.includes(type);
  if (has(SEC_VENCRYPT)) return { pick: SEC_VENCRYPT };
  if (has(SEC_VNC_AUTH) && credentials.password) return { pick: SEC_VNC_AUTH };
  if (has(SEC_ARD) && credentials.username) return { pick: SEC_ARD };
  if (has(SEC_MSLOGON_II) && credentials.username) return { pick: SEC_MSLOGON_II };
  if (has(SEC_NONE)) return { pick: SEC_NONE };
  /* A password with no way to use it is worth saying plainly, and so is a user name with none. */
  if (has(SEC_VNC_AUTH)) return { pick: SEC_VNC_AUTH };
  if (has(SEC_ARD) || has(SEC_MSLOGON_II)) {
    return { refuse: t("This server wants a user name and a password. Fill them in under the connection settings.") };
  }
  return {
    refuse: t("This server asked for a way of signing in that is not supported ({types}).", {
      types: offered.join(", "),
    }),
  };
}

/**
 * The VeNCrypt sub-type to answer with: encrypted-and-identified first, cleartext only by consent.
 */
export function chooseSubtype(
  offered: readonly number[],
  credentials: VncCredentials,
): Choice<number> {
  const has = (type: number) => offered.includes(type);
  if (has(SUB_X509_PLAIN) && credentials.username) return { pick: SUB_X509_PLAIN };
  if (has(SUB_X509_VNC) && credentials.password) return { pick: SUB_X509_VNC };
  if (has(SUB_X509_NONE)) return { pick: SUB_X509_NONE };
  if (has(SUB_X509_PLAIN) || has(SUB_X509_VNC)) {
    return { refuse: t("This server wants a user name and a password. Fill them in under the connection settings.") };
  }
  if (has(SUB_PLAIN)) {
    if (!credentials.allowPlaintext) {
      return {
        refuse:
          t("This server accepts only Plain, which sends the password in the clear. If you are inside a jump server or a VPN, tick \"Allow the password to be sent in the clear\" in the connection settings."),
      };
    }
    if (!credentials.username) {
      return { refuse: t("This server wants a user name. Fill it in under the connection settings.") };
    }
    return { pick: SUB_PLAIN };
  }
  if (offered.some((type) => ANONYMOUS_TLS.includes(type))) return { refuse: noAnonymousTls() };
  return {
    refuse: t("This server asked for a way of signing in that is not supported ({types}).", {
      types: offered.join(", "),
    }),
  };
}

/** Whether a sub-type wraps the rest of the conversation in TLS, and whether it is certificated. */
export function tlsOf(subtype: number): { tls: boolean; x509: boolean } {
  const x509 = subtype >= SUB_X509_NONE && subtype <= SUB_X509_PLAIN;
  const anonymous = ANONYMOUS_TLS.includes(subtype);
  return { tls: x509 || anonymous, x509 };
}

/** What happens inside the TLS, once it is up (or immediately, for the bare sub-types). */
export function innerOf(subtype: number): "none" | "vnc" | "plain" {
  if (subtype === SUB_X509_VNC || subtype === SUB_TLS_VNC) return "vnc";
  if (subtype === SUB_X509_PLAIN || subtype === SUB_TLS_PLAIN || subtype === SUB_PLAIN) {
    return "plain";
  }
  return "none";
}

/** VeNCrypt's `Plain`: two lengths, then the two strings. */
export function plainMessage(username: string, password: string): Buffer {
  const user = Buffer.from(username, "utf8");
  const pass = Buffer.from(password, "utf8");
  const message = Buffer.alloc(8 + user.length + pass.length);
  message.writeUInt32BE(user.length, 0);
  message.writeUInt32BE(pass.length, 4);
  user.copy(message, 8);
  pass.copy(message, 8 + user.length);
  return message;
}
