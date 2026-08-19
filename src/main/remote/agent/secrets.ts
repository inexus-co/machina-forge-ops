import { t } from "../../../shared/i18n";

/**
 * The customer's secrets, kept out of what leaves this machine.
 *
 * `cat wp-config.php` is a read. It runs without stopping, and it prints the database password —
 * which then goes to whichever model the operator configured, and into the run record on disk.
 * Neither is a place a customer's credentials belong, and neither is undone by deleting them
 * later: the model provider already has it.
 *
 * So the value is taken out here, at the one point every command's output passes through on its
 * way to the model. Three things are deliberate:
 *
 *  - **The key survives, the value goes.** `DB_PASSWORD` masked still tells the agent this is a
 *    WordPress config and that a password is set. `DB_NAME` and `DB_HOST` are untouched, so the
 *    investigation continues — what the agent loses is exactly the part it never needed.
 *  - **Content, not file names.** A list of "files with secrets in them" is a list somebody has to
 *    maintain, and it is wrong the first time a customer names something differently. What is
 *    recognised here is the shape of a credential, wherever it turns up — including in an
 *    `nginx.conf` nobody would have put on the list.
 *  - **Over-masking is the safe side.** `PASSWORD_MIN_LENGTH=8` losing its `8` costs a question.
 *    A database password reaching a third party costs a customer.
 *
 * The operator is not locked out: their own terminal in this application is untouched, and the
 * `{{name}}` mechanism (`policy.ts`) is the sanctioned way to give a value back to a command
 * without the model ever seeing it.
 */

const HIDDEN = "••••••";

/**
 * A key whose value is a credential.
 *
 * Matched on the key alone, so it holds across `.env`, INI, YAML, JSON, PHP `define()` and shell
 * exports without a parser for each.
 */
const SECRET_KEY =
  /(pass|passwd|password|secret|token|api[-_]?key|access[-_]?key|private[-_]?key|credential|auth[-_]?(key|token)|client[-_]?secret|dsn)/i;

/** `KEY = value`, `KEY: value`, `"KEY" => "value"` — the value is whatever follows, to end of line. */
const ASSIGNMENT = /^(\s*['"]?[\w.\-[\]]*?['"]?\s*)([:=]|=>)(\s*)(.+)$/;

/** A key and its value inside one line: `define('DB_PASSWORD', 'x')`, `--password=x`, `?token=x`. */
const INLINE =
  /(['"]?[\w.\-]*(?:pass|passwd|password|secret|token|api[-_]?key|private[-_]?key|credential)[\w.\-]*['"]?\s*(?:,|=>|=|:)\s*)(['"][^'"\n]{1,}['"]|[^\s,)\];&]+)/gi;

/** `scheme://user:password@host` — the password is the part between the colon and the at-sign. */
const URI_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@/]+)(@)/gi;

/** A crypt(3) hash, wherever it sits — `/etc/shadow`, a database dump, an htpasswd file. */
const CRYPT_HASH = /\$[0-9aby]\$[^\s:'"]{8,}/g;

/** Everything between the BEGIN and END lines of a PEM block. */
const PEM = /(-----BEGIN [^-\n]*PRIVATE KEY-----)[\s\S]*?(-----END [^-\n]*PRIVATE KEY-----)/g;

export type Masked = { text: string; hidden: number };

/**
 * Take the credentials out of a command's output.
 *
 * Returns how many were found as well as the text, because the operator has to be told that the
 * thing they are reading is not what the far end printed.
 */
export function maskSecrets(output: string): Masked {
  let hidden = 0;
  const count = <T>(value: T): T => {
    hidden += 1;
    return value;
  };

  let text = output.replace(PEM, (_all, begin: string, end: string) =>
    count(`${begin}\n${HIDDEN}\n${end}`),
  );
  text = text.replace(URI_CREDENTIALS, (_all, head: string, _pass: string, at: string) =>
    count(`${head}${HIDDEN}${at}`),
  );
  text = text.replace(INLINE, (_all, head: string, value: string) => {
    /* Quoted values keep their quotes: the shape of the file stays readable. */
    const quote = /^['"]/.test(value) ? value[0] : "";
    return count(`${head}${quote}${HIDDEN}${quote}`);
  });
  text = text.replace(CRYPT_HASH, () => count(HIDDEN));

  /*
   * Line-oriented last, for the assignments the inline pattern cannot see — an INI or YAML line
   * whose key is on its own and whose value runs to the end of it.
   */
  text = text
    .split("\n")
    .map((line) => {
      if (line.includes(HIDDEN)) return line;
      const parts = ASSIGNMENT.exec(line);
      if (!parts) return line;
      const [, key, separator, space, value] = parts;
      if (!SECRET_KEY.test(key) || !value.trim()) return line;
      return count(`${key}${separator}${space}${HIDDEN}`);
    })
    .join("\n");

  return { text, hidden };
}

/** What to add to the output so the operator knows it is not verbatim. */
export function maskNote(hidden: number): string {
  return hidden === 0
    ? ""
    : `\n${t(
        "({count} value that looked like a secret was hidden. The value itself went neither to the model nor into the record — open a session if you need to see it.)|({count} values that looked like secrets were hidden. The values themselves went neither to the model nor into the record — open a session if you need to see them.)",
        { count: hidden },
      )}`;
}
