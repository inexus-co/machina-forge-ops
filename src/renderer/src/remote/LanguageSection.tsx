import { LOCALES, type Locale, type Translate } from "../../../shared/i18n";
import { changeLocale, useLocale, useT } from "../i18n";

/**
 * Which language the application speaks.
 *
 * Each one is named in itself, because an operator who arrived here by accident has to be able to
 * read their way out — "Japanese" is no help to somebody who reads only 日本語.
 *
 * It applies at once and it has no save button: this page writes as it goes, like the skills and the
 * keys, and a language you have to confirm is a language you cannot try.
 */
export function LanguageSection({ onError }: { onError: (message?: string) => void }) {
  const t = useT();
  const locale = useLocale();

  return (
    <div className="settings-body">
      <div className="settings-lede">
        <h2>{t("Language")}</h2>
        <p>
          {t(
            "This changes the words on screen, how dates and numbers are written, and the messages this application shows you. The agent answers you in the language you choose here as well.",
          )}
        </p>
      </div>

      <div className="settings-list">
        {LOCALES.map((entry) => (
          <div className="settings-row" key={entry.id}>
            <div className="settings-row-head">
              <label className="settings-row-mark" title={entry.name}>
                <input
                  checked={locale === entry.id}
                  name="locale"
                  type="radio"
                  onChange={() => {
                    onError(undefined);
                    void changeLocale(entry.id).catch(() => onError(t("The language could not be changed.")));
                  }}
                />
              </label>
              <button
                className="settings-row-body as-text"
                type="button"
                onClick={() => {
                  onError(undefined);
                  void changeLocale(entry.id).catch(() => onError(t("The language could not be changed.")));
                }}
              >
                {/* Its own name first: this row has to be readable before the switch, not after. */}
                <span>{entry.name}</span>
                <small>{note(t, entry.id)}</small>
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="settings-note">
        {t(
          "Anything not yet translated appears in Japanese. The agent's own instructions — what it may run, what it has to ask a person about — stay in Japanese in every language: four copies of the safety rules would mean one of them going stale.",
        )}
      </p>
    </div>
  );
}

/**
 * What each language is for, said in the language now in force.
 *
 * Written out rather than looked up in a table, so that `i18n.test.ts` can see all four sentences
 * where it scans for them — a table would hide them behind an index and the coverage check would
 * pass while these went untranslated.
 */
function note(t: Translate, id: Locale): string {
  if (id === "ja") return t("The language this application was written in.");
  if (id === "en") return t("Shows everything in English.");
  if (id === "zh-Hans") return t("Simplified characters, as used in mainland China.");
  return t("Traditional characters, as used in Taiwan and Hong Kong.");
}
