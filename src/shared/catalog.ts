/**
 * The command catalog: what this application knows about commands before anyone runs one.
 *
 * The knowledge ships with the build. Nothing here is downloaded at runtime — Forge sits on an
 * operator's desk inside somebody's network, and a catalog that phones home is a catalog that
 * sometimes isn't there. `scripts/catalog/` regenerates the bulk data at development time.
 *
 * Two tiers, because two different claims are being made. Tier 1 says "we know what this command
 * *does*" — somebody read it, classified it, and wrote the verb table; only tier 1 `read` may run
 * unattended. Tier 2 says only "we know what this command *is*" — a name and a one-line
 * description harvested from the distributions' own manuals — and everything in it stops for a
 * person. The count on the settings screen is allowed to brag about both; the policy gate only
 * ever trusts the first.
 */

export type CatalogClass =
  /** Reads and nothing else, whatever it is given. May run unattended. */
  | "read"
  /** Changes the machine, or cannot be told apart from something that does. Always confirmed. */
  | "write"
  /** Read or write depending on the first argument — see `verbs`. */
  | "verbs"
  /**
   * Takes a program as an argument — awk, sed, perl one-liners. The danger is inside a script the
   * gate cannot read (awk is Turing-complete; `awk 'BEGIN{system(...)}'` runs anything), so the
   * target never receives it: refused there, with the model steered to fetch the data and run the
   * script in the sandbox (`run_local`) instead, where isolation contains it.
   */
  | "code"
  /**
   * Executes whatever it is handed — shells, and network tools like `nc`/`socat`. Allowing one
   * makes every other line of the guarantee decorative, so the default is refusal, not
   * confirmation. An operator can still grant one as an explicit exception.
   */
  | "shell";

export type CatalogEntry = {
  /** The first word of a command. `Get-Service` is one word; matching is case-insensitive. */
  name: string;
  os: "linux" | "windows" | "both";
  /** One line for the approval card and the catalog screen, in the operator's language. */
  summary: string;
  class: CatalogClass;
  /**
   * For `class: "verbs"`: what each first argument does. A verb not listed here is `write` —
   * the same default-deny direction as everything else in this design.
   */
  verbs?: Record<string, "read" | "write">;
  /** 1 = classified by a person. 2 = harvested name and description only. */
  tier: 1 | 2;
  /** Tier 2 only: the untranslated description, kept for the hover. */
  original?: string;
};
