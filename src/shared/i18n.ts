/**
 * The display language.
 *
 * The key of a message *is* the English sentence. That is deliberate: inventing
 * `settings.hosts.empty` for a thousand sentences would move the wording out of the screen it
 * belongs to and make every review a lookup. Written this way the code reads as the screen reads,
 * English needs no table at all, and a missing translation degrades to a readable sentence rather
 * than to a key nobody can act on.
 *
 * English is the source although the operators are Japanese and the application was written in
 * Japanese first: it is the language a contributor to an open project can be expected to read, and
 * a key nobody on the outside can type is a key nobody on the outside will fix. Japanese is a
 * translation like the others, in `messages/ja.ts`, and it is the one most people see.
 *
 * What that costs: an edited English sentence is a new key. `i18n.test.ts` is the guard — it
 * collects every `t("…")` in the source and fails naming any that no locale file answers, so a
 * reworded button cannot quietly go untranslated.
 */

import { CATALOG_JA } from "./messages/catalog/ja";
import { CATALOG_ZH_HANS } from "./messages/catalog/zh-Hans";
import { CATALOG_ZH_HANT } from "./messages/catalog/zh-Hant";
import { JA } from "./messages/ja";
import { ZH_HANS } from "./messages/zh-Hans";
import { ZH_HANT } from "./messages/zh-Hant";

export type Locale = "ja" | "en" | "zh-Hans" | "zh-Hant";

/**
 * Every language, each named in itself.
 *
 * An operator who opened the wrong one has to find their way back, and "Japanese" is no help to
 * someone who reads only 日本語. The tag is what `Intl` wants; the id is what we store.
 */
export const LOCALES: ReadonlyArray<{ id: Locale; name: string; tag: string }> = [
  { id: "ja", name: "日本語", tag: "ja-JP" },
  { id: "en", name: "English", tag: "en-US" },
  { id: "zh-Hans", name: "简体中文", tag: "zh-Hans-CN" },
  { id: "zh-Hant", name: "繁體中文", tag: "zh-Hant-TW" },
];

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.some((entry) => entry.id === value);
}

/** What a locale file holds: the English sentence, and what to say instead. */
export type Messages = Readonly<Record<string, string>>;

const TABLES: Record<Locale, Messages | undefined> = {
  en: undefined, // The key is the message.
  ja: JA,
  "zh-Hans": ZH_HANS,
  "zh-Hant": ZH_HANT,
};

/*
 * One current language per process, not a value threaded through every call.
 *
 * There are four windows in this application and a main process that writes error text, and all of
 * them want the same answer. `useT` in the renderer subscribes components to changes; this is what
 * it reads.
 */
/*
 * English, until something says otherwise.
 *
 * The keys in this file's tables are English sentences, so English is what a missing translation
 * falls back to anyway — and a fallback that lands somewhere else is how one window ends up in a
 * language the rest of the application is not in. The operator's choice is read from the settings
 * before the first frame; this is only what holds until it arrives.
 */
let current: Locale = "en";

export function setLocale(next: Locale): void {
  current = next;
}

export function locale(): Locale {
  return current;
}

export function localeTag(): string {
  return LOCALES.find((entry) => entry.id === current)?.tag ?? "ja-JP";
}

/**
 * The message for the current language, with `{name}` filled in.
 *
 * A translation may hold two forms separated by `|` — English needs "1 file" and "2 files" where
 * Japanese needs neither. The choice is made on `count`, which is why that variable has a fixed
 * name rather than being whichever number happens to be passed.
 */
export function t(english: string, vars?: Readonly<Record<string, string | number>>): string {
  const table = TABLES[current];
  let message = table?.[english] ?? english;
  if (message.includes("|")) {
    const [one, many] = message.split("|");
    message = Number(vars?.count) === 1 ? one : many;
  }
  if (!vars) return message;
  return message.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name];
    return value === undefined ? whole : String(value);
  });
}

/**
 * The translator, as something that can be handed over.
 *
 * Helpers outside a component cannot hold a hook, so they take this instead of reaching for the
 * module-level function — which keeps the words visible in the call (`t("Automatic")`) where the
 * coverage test can see them, and keeps the component the one thing subscribed to the language.
 */
export type Translate = typeof t;

/*
 * The catalogue's own descriptions, in their own table.
 *
 * Not `t()`, because these are data: one line per command, ~250 of them, and they would swamp the
 * file where the screens' wording lives. Tier 2 — the fifty thousand harvested from the
 * distributions' manuals — is already English and falls through unchanged, which is the honest
 * outcome: an operator reading Chinese sees Chinese for the commands somebody wrote a line for,
 * and the manual's own English for the rest.
 */
const CATALOG: Record<Locale, Messages | undefined> = {
  en: undefined,
  ja: CATALOG_JA,
  "zh-Hans": CATALOG_ZH_HANS,
  "zh-Hant": CATALOG_ZH_HANT,
};

export function catalogText(description: string): string {
  return CATALOG[current]?.[description] ?? description;
}

/** Whether the catalogue's line for a command has been translated — for the coverage test. */
export function catalogTranslated(description: string, target: Locale): boolean {
  return target === "en" || Boolean(CATALOG[target]?.[description]);
}

/** Whether this language has a translation for a sentence — for the coverage test and tooling. */
export function translated(english: string, target: Locale): boolean {
  return target === "en" || Boolean(TABLES[target]?.[english]);
}

/*
 * Dates and numbers in the operator's own convention.
 *
 * `toLocaleString("ja-JP")` was written in a hundred places while there was one language. Going
 * through here means the language switch reaches timestamps too, which is where a half-translated
 * screen shows itself first.
 */
const isoToDate = (value: string | number | Date): Date =>
  value instanceof Date ? value : new Date(value);

export function formatDateTime(value: string | number | Date): string {
  const date = isoToDate(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(localeTag());
}

export function formatDate(value: string | number | Date): string {
  const date = isoToDate(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(localeTag());
}

export function formatTime(value: string | number | Date): string {
  const date = isoToDate(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString(localeTag());
}

export function formatNumber(value: number): string {
  return value.toLocaleString(localeTag());
}

/**
 * What to tell the agent about the language to answer in.
 *
 * Deliberately one line. The rest of the system prompt — what it may run, what it must ask about,
 * how it reports — stays in English in every language, because that text is the safety framing
 * and translating it would mean maintaining four copies of the one thing that must not drift.
 */
export function answerLanguageDirective(target: Locale = current): string {
  const answer: Record<Locale, string> = {
    en: "Write your answers to the operator in English.",
    ja: "操作者への回答は日本語で書くこと。",
    "zh-Hans": "给操作者的回答请用简体中文书写。",
    "zh-Hant": "給操作者的回答請用繁體中文書寫。",
  };
  return answer[target];
}
