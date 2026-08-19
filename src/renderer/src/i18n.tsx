/**
 * The language, in React's terms.
 *
 * `t` itself is a plain function over one module-level language, because helpers that format a size
 * or a duration are not components and cannot hold a hook. What React needs is a reason to draw
 * again when the language changes, and that is all this context carries: a component calls `useT`,
 * gets the same `t` everyone else has, and re-renders when the language moves under it.
 *
 * The change always comes from the main process, even when this window asked for it — one path, so
 * four windows cannot end up disagreeing about which language they are in.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { locale as storedLocale, setLocale, t, type Locale } from "../../shared/i18n";

const LocaleContext = createContext<Locale>("ja");

/** The translator, plus a subscription to language changes. */
export function useT(): typeof t {
  useContext(LocaleContext);
  return t;
}

/** Which language is in force — for a `<select>`, and for anything that formats by hand. */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** Ask for another language. Every window hears the answer, this one included. */
export function changeLocale(locale: Locale): Promise<void> {
  return window.machina.i18n.set(locale);
}

/*
 * Development only: put the language back after a hot reload.
 *
 * Editing a message file makes the dev server re-evaluate `shared/i18n`, and its one module-level
 * variable goes back to what it was declared as. Nothing re-runs the startup call, so the window
 * carries on drawing in Japanese. Here rather than in `main.tsx` because this is the module the
 * components draw through. It cannot happen in a packaged build.
 */
if (import.meta.hot) {
  import.meta.hot.on("vite:afterUpdate", () => setLocale(window.machina.i18n.initial()));
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setValue] = useState<Locale>(storedLocale);
  /*
   * Ask again, from here.
   *
   * The language is set once at startup, in `main.tsx`, out of a synchronous call in the preload.
   * Two things can leave that behind: the call happens before the page exists, so a window that
   * loads while the main process is still starting gets nothing back; and the dev server
   * re-evaluates this module when a message file is edited, which puts the variable back to what
   * it was declared as. Both end the same way — one window in Japanese while the rest of the
   * application is in English.
   *
   * This runs in the module that draws, so whatever instance of it the components are using is
   * the one that gets put right.
   */
  useEffect(() => {
    void window.machina.i18n.current().then((next) => {
      if (next === locale) return;
      setLocale(next);
      setValue(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(
    () =>
      window.machina.i18n.onChanged((next) => {
        setLocale(next);
        setValue(next);
      }),
    [],
  );
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}
