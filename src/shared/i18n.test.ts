import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TIER1 } from "../main/remote/agent/catalog/tier1";
import { PLUGINS } from "../main/remote/agent/plugins/catalog";
import { INVENTORY_NOTES, LOG_SOURCE_LABELS } from "./remoteInventory";
import { INSPECTION_NOTES } from "./remoteResources";
import {
  answerLanguageDirective,
  catalogText,
  catalogTranslated,
  formatDateTime,
  isLocale,
  LOCALES,
  locale,
  setLocale,
  t,
  translated,
} from "./i18n";

/**
 * The translator, and the guard that keeps the translation honest.
 *
 * The second half is the one that matters. Nothing about a missing translation is visible while
 * developing — the screen looks right, because the key *is* the English. So the whole source is
 * read here, every `t("…")` collected, and each locale asked whether it can answer. A button
 * reworded and left untranslated fails this, which is the only moment anyone would notice.
 */

const SOURCE = path.join(__dirname, "..");

/** Every file the screens and the main process are written in. */
function sources(directory: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      sources(full, found);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/**
 * The code with its comments taken out.
 *
 * Needed because this file's own documentation contains the example `t("…")`, and the first run of
 * the scanner dutifully demanded a translation for an ellipsis. Walking the text rather than
 * matching a pattern is what keeps `"https://…"` from being read as the start of a comment.
 */
export function withoutComments(code: string): string {
  let out = "";
  let at = 0;
  while (at < code.length) {
    const two = code.slice(at, at + 2);
    if (two === "//") {
      while (at < code.length && code[at] !== "\n") at += 1;
      continue;
    }
    if (two === "/*") {
      at += 2;
      while (at < code.length && code.slice(at, at + 2) !== "*/") at += 1;
      at += 2;
      continue;
    }
    const quote = code[at];
    if (quote === '"' || quote === "'" || quote === "`") {
      out += quote;
      at += 1;
      while (at < code.length && code[at] !== quote) {
        if (code[at] === "\\") {
          out += code.slice(at, at + 2);
          at += 2;
          continue;
        }
        out += code[at];
        at += 1;
      }
      out += quote;
      at += 1;
      continue;
    }
    out += code[at];
    at += 1;
  }
  return out;
}

/**
 * Every sentence handed to `t`, including the ones written as several literals joined with `+`.
 *
 * A long Japanese sentence cannot be broken across lines inside JSX — the line break becomes a
 * space — so concatenation is how they are written here, and a scanner that only understood a
 * single literal would silently pass over exactly the longest and most translatable text.
 */
export function keysIn(source: string): string[] {
  const code = withoutComments(source);
  const keys: string[] = [];
  const call = /(?<![\w.$])t\(\s*/g;
  let match: RegExpExecArray | null;
  while ((match = call.exec(code))) {
    let at = match.index + match[0].length;
    let key = "";
    for (;;) {
      if (code[at] !== '"') break;
      at += 1;
      let literal = "";
      while (at < code.length && code[at] !== '"') {
        if (code[at] === "\\") {
          literal += code[at] === "\\" && code[at + 1] === "n" ? "\n" : code[at + 1];
          at += 2;
          continue;
        }
        literal += code[at];
        at += 1;
      }
      at += 1; // the closing quote
      key += literal;
      const rest = /^\s*\+\s*/.exec(code.slice(at));
      if (!rest) break;
      at += rest[0].length;
    }
    if (key) keys.push(key);
  }
  return keys;
}

describe("looking a sentence up", () => {
  it("in English, the key is the answer", () => {
    setLocale("en");
    expect(t("Connect")).toBe("Connect");
    expect(locale()).toBe("en");
    setLocale("ja");
  });

  it("a translation when there is one, the English when there is not", () => {
    setLocale("ja");
    expect(t("Connect")).toBe("接続する");
    expect(t("Nothing anywhere translates this")).toBe("Nothing anywhere translates this");
    setLocale("en");
  });

  it("{name} takes a value; what was not passed is left alone", () => {
    expect(t("{count} of them", { count: 3 })).toBe("3 of them");
    expect(t("{a} and {b}", { a: "left" })).toBe("left and {b}");
  });

  it("singular and plural are chosen on count", () => {
    // Japanese has no plural, so the two forms live in the translation rather than in the key
    expect(t("one|several", { count: 1 })).toBe("one");
    expect(t("one|several", { count: 2 })).toBe("several");
  });

  it("dates follow the language that is chosen", () => {
    const at = "2026-08-15T01:02:03Z";
    setLocale("ja");
    const japanese = formatDateTime(at);
    setLocale("en");
    expect(formatDateTime(at)).not.toBe(japanese);
    // Something that is not a date comes back as it went in — no "Invalid Date" on screen
    expect(formatDateTime("not a date")).toBe("not a date");
  });

  it("a language can be recognised", () => {
    expect(isLocale("zh-Hant")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("every language has one sentence telling the agent which to answer in", () => {
    for (const entry of LOCALES) expect(answerLanguageDirective(entry.id).length).toBeGreaterThan(0);
  });
});

describe("reading the sentences back out of the source", () => {
  it("one string", () => {
    expect(keysIn('t("Close")')).toEqual(["Close"]);
  });

  it("joined with +, the joined form is one key", () => {
    expect(keysIn('t(\n  "first half " +\n    "second half",\n)')).toEqual([
      "first half second half",
    ]);
  });

  it("variables are passed, the sentence alone is taken", () => {
    expect(keysIn('t("{count} item|{count} items", { count: 2 })')).toEqual([
      "{count} item|{count} items",
    ]);
  });

  it("another name ending in t is not picked up", () => {
    expect(keysIn("format(x)")).toEqual([]);
    expect(keysIn('await(t)("a")')).toEqual([]);
  });

  it("an argument that is not a string is not a key", () => {
    expect(keysIn("t(label)")).toEqual([]);
  });

  it("an example written in a comment is not picked up", () => {
    expect(keysIn('/* e.g. t("in a comment") */ t("on the screen")')).toEqual(["on the screen"]);
    expect(keysIn('// t("also a comment")\nt("the real one")')).toEqual(["the real one"]);
  });

  it("// inside a string is not the start of a comment", () => {
    expect(keysIn('t("go to https://example.com")')).toEqual(["go to https://example.com"]);
  });
});

/**
 * A word read at import time is the language the window opened in, for ever.
 *
 * This one is invisible while developing: the table is built once, and what it was built in is
 * what the first screen wanted. Switch the language and those particular labels stay behind —
 * which is exactly what happened to the approval modes and the tab strip. Anything holding a
 * sentence has to be a function called where it is drawn.
 */
describe("nothing decides its wording at import time", () => {
  const declaration = /^(?:export\s+)?(const|function|class|let)\s+([A-Za-z_$][\w$]*)/;

  it("no module-level constant calls t()", () => {
    const frozen: string[] = [];
    for (const file of sources(SOURCE)) {
      const lines = withoutComments(fs.readFileSync(file, "utf8")).split("\n");
      lines.forEach((line, at) => {
        if (!/(?<![\w.$])t\(/.test(line)) return;
        for (let back = at; back >= 0; back--) {
          const found = declaration.exec(lines[back]);
          if (!found) continue;
          const between = lines.slice(back, at + 1).join("\n");
          /* An arrow or a `function` in between means the call happens when something calls it. */
          if ((found[1] === "const" || found[1] === "let") && !/=>|function/.test(between)) {
            frozen.push(`${path.basename(file)}:${at + 1} ${found[2]}`);
          }
          return;
        }
      });
    }
    expect(frozen, `these freeze the language — make them functions:\n${frozen.join("\n")}`).toEqual([]);
  });
});

describe("untranslated sentences", () => {
  const keys = new Set<string>();
  for (const file of sources(SOURCE)) keysIn(fs.readFileSync(file, "utf8")).forEach((k) => keys.add(k));

  it("the sentences the screens use were all collected", () => {
    /* If this drops to nothing the scanner broke, and every other assertion here would pass. */
    expect(keys.size).toBeGreaterThan(10);
  });

  for (const target of LOCALES.filter((entry) => entry.id !== "en")) {
    it(`${target.name} has a translation`, () => {
      const missing = [...keys].filter((key) => !translated(key, target.id));
      expect(missing, `no ${target.name} for:\n${missing.join("\n")}`).toEqual([]);
    });
  }
});

/**
 * Sentences the main process hands over as data.
 *
 * Two lists cross the bridge as text rather than as codes — what a reading could not get at, and
 * what the reader noticed in a file about to be installed. The window translates them as it draws
 * them, so nothing in the source says `t("…")` for the test to find; the lists themselves are the
 * only place that knows.
 */
describe("sentences the main process hands over as data", () => {
  const sentences = [
    ...Object.values(INVENTORY_NOTES),
    ...Object.values(INSPECTION_NOTES),
    ...Object.values(LOG_SOURCE_LABELS),
  ];

  for (const target of LOCALES.filter((entry) => entry.id !== "en")) {
    it(`${target.name} has a translation`, () => {
      const missing = sentences.filter((line) => !translated(line, target.id));
      expect(missing, `no ${target.name} for:\n${missing.join("\n")}`).toEqual([]);
    });
  }
});

/**
 * The plugins' own words, which the operator reads.
 *
 * A plugin is data too, and it has two audiences: the skill bodies are the model's and stay in
 * English, while the plugin's name and summary, and every skill's description and goal, are the
 * operator's. The goal counts — it lands in the message box to be read and edited before it is
 * sent. Adding a plugin without translations fails here rather than on a Japanese screen.
 */
describe("the words the plugins show the operator", () => {
  const sentences = PLUGINS.flatMap((plugin) => [
    plugin.name,
    plugin.summary,
    ...plugin.skills.flatMap((skill) => [skill.description, ...(skill.goal ? [skill.goal] : [])]),
  ]);

  it("every plugin was read", () => {
    expect(PLUGINS.length).toBeGreaterThan(1);
    expect(sentences.length).toBeGreaterThan(20);
  });

  for (const target of LOCALES.filter((entry) => entry.id !== "en")) {
    it(`${target.name} has a translation`, () => {
      const missing = sentences.filter((line) => !translated(line, target.id));
      expect(missing, `no ${target.name} for:\n${missing.join("\n")}`).toEqual([]);
    });
  }
});

/**
 * The catalogue's own lines, checked against the catalogue itself rather than against the source.
 *
 * These are data, so there is no `t("…")` to scan for: the guarantee has to come from walking the
 * commands. Tier 2 is left out on purpose — its descriptions are the distributions' own English,
 * and demanding a translation for fifty thousand of them would fail for ever.
 */
describe("untranslated command descriptions", () => {
  const described = TIER1.map((entry) => entry.summary).filter(Boolean);

  it("tier 1's descriptions were read", () => {
    expect(described.length).toBeGreaterThan(100);
  });

  for (const target of LOCALES.filter((entry) => entry.id !== "en")) {
    it(`${target.name} has a translation`, () => {
      const missing = [...new Set(described)].filter((line) => !catalogTranslated(line, target.id));
      expect(missing, `no ${target.name} for:\n${missing.join("\n")}`).toEqual([]);
    });
  }

  it("tier 2's English passes straight through", () => {
    setLocale("ja");
    expect(catalogText("cross-distribution packaging system (non-GUI parts)")).toBe(
      "cross-distribution packaging system (non-GUI parts)",
    );
    setLocale("ja");
  });
});
