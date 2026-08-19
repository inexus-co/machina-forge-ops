import type { Locale } from "./i18n";

/**
 * The display language, across every window.
 *
 * `initial` is synchronous on purpose. There are four windows here and each one draws immediately;
 * asking over a promise would paint one language and replace it with another a frame later, which
 * is exactly the flicker an operator reads as a bug. The value is one short string read from a file
 * the main process already has open.
 */
export type MachinaI18nApi = {
  /** The stored language, before anything is drawn. */
  initial: () => Locale;
  /**
   * The same value, asked for again once the window is drawing.
   *
   * `initial` runs in the preload, before the page: if it comes back with nothing — the main
   * process was still starting up, and nothing was listening on that channel yet — the window has
   * no second chance and stays in the language its module was declared with, while its title bar,
   * which the main process draws, is in the language the operator chose. This is the second
   * chance.
   */
  current: () => Promise<Locale>;
  /** Change it: stored, applied in the main process, and announced to every window. */
  set: (locale: Locale) => Promise<void>;
  /** Another window changed it. */
  onChanged: (listener: (locale: Locale) => void) => () => void;
};
