import { type ReactNode, useEffect, useRef, useState } from "react";
import { useT } from "../i18n";

/**
 * The one drop-down in this app.
 *
 * A native `<select>` renders differently in Chrome and in Electron, cannot show a checkmark,
 * and cannot be styled to match anything else here. This is the same control the capture input
 * picker uses, so every choice in the app looks and behaves alike.
 */

export function CaretIcon() {
  return (
    <svg aria-hidden fill="none" height="14" viewBox="0 0 10 14" width="10">
      <path
        d="m2 6 3 3 3-3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
    </svg>
  );
}

/**
 * A button that opens a small menu.
 *
 * Written once because a menu that closes on an outside click, on Escape, and after a choice is
 * three easy things to forget.
 */
export function MenuButton({
  children,
  align,
  kind = "chip",
  label,
  onOpen,
  title,
  wide,
}: {
  children: (close: () => void) => ReactNode;
  /** Which edge the popup hangs from. Right, for a button near the right of the window. */
  align?: "right";
  /**
   * The shape of the thing you press.
   *
   * `chip` is the labelled control this menu was written for; `icon` is the 26px square the
   * title bar is made of, so a menu can sit in that row without being a head taller than it.
   */
  kind?: "chip" | "icon";
  label: ReactNode;
  /** Called as it opens, for a menu whose contents are read rather than held. */
  onOpen?: () => void;
  title?: string;
  /** Fill the width of the field, as a form control does. */
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div
      className={`menu-button${wide ? " wide" : ""}${align === "right" ? " to-right" : ""}`}
      ref={root}
    >
      <button
        aria-expanded={open}
        className={kind === "icon" ? "icon-button" : wide ? "chip wide" : "chip"}
        title={title}
        type="button"
        onClick={() => {
          if (!open) onOpen?.();
          setOpen(!open);
        }}
      >
        {label}
      </button>
      {open && (
        <div className="menu-popup" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Open on the current choice, not on the top of an alphabetical list. */
function scrollToChecked(list: HTMLDivElement | null) {
  const checked = list?.querySelector('[aria-checked="true"]');
  checked?.scrollIntoView({ block: "center" });
}

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  /**
   * What the button says when the label is longer than a chip in a toolbar can hold.
   *
   * The menu, the filter and the tooltip all keep `label`: this is the name at button size, not
   * a second name for the thing.
   */
  short?: string;
  /** Shown after the label in the menu only, for anything that would clutter the button. */
  note?: string;
  /** Extra text the filter should match, for names that are not on screen. */
  search?: string;
};

/**
 * Does this entry match what was typed?
 *
 * Every term has to appear, in any order: an identifier like
 * `amazon-bedrock / anthropic.claude-opus-4-8` is read as several words, and someone looking for
 * it types "bedrock opus", not the string as it is punctuated. So the separators in both the
 * entry and the query become spaces, and each term is matched on its own.
 */
export function matchesQuery(haystack: string, query: string) {
  const flatten = (text: string) =>
    text.toLowerCase().replace(/[\s/._:-]+/g, " ").trim();
  const terms = flatten(query).split(" ").filter(Boolean);
  if (terms.length === 0) return true;
  const target = flatten(haystack);
  return terms.every((term) => target.includes(term));
}

/** Above this many entries the list needs a way in of its own. */
const SEARCHABLE_FROM = 12;

export function SelectMenu<T extends string>({
  compact,
  disabled,
  disabledTitle,
  onChange,
  options,
  placeholder,
  value,
}: {
  /** Sized by its label instead of filling the field: for a chip in a toolbar, not a form row. */
  compact?: boolean;
  disabled?: boolean;
  /** Why it cannot be changed, on hover. A control that is off says nothing without one. */
  disabledTitle?: string;
  onChange: (value: T) => void;
  options: Array<SelectOption<T>>;
  placeholder?: string;
  value: T;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const current = options.find((option) => option.value === value);
  const text = current?.label ?? placeholder ?? t("Choose");
  /* The button is the only place the name is shortened; the tooltip beside it is the whole one. */
  const buttonText = current?.short ?? text;
  const searchable = options.length >= SEARCHABLE_FROM;
  const shown = options.filter((option) =>
    matchesQuery(`${option.label} ${option.search ?? ""}`, query),
  );

  if (disabled) {
    return (
      <div className={compact ? "menu-button" : "menu-button wide"} title={disabledTitle ?? text}>
        <button className={compact ? "chip" : "chip wide"} disabled type="button">
          <span className="menu-value">{buttonText}</span>
          <CaretIcon />
        </button>
      </div>
    );
  }

  return (
    <MenuButton
      label={
        <>
          <span className="menu-value">{buttonText}</span>
          <CaretIcon />
        </>
      }
      title={text}
      wide={!compact}
    >
      {(close) => (
        <>
          {searchable && (
            <input
              autoFocus
              className="menu-search"
              placeholder={t("Filter")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
          {/* The list scrolls inside the menu. A catalogue of a few hundred models must not
              turn into a page the size of the catalogue. */}
          <div className="menu-list" ref={scrollToChecked}>
            {shown.map((option) => (
              <button
                aria-checked={option.value === value}
                key={option.value}
                role="menuitemradio"
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setQuery("");
                  close();
                }}
              >
                <span className="menu-check">{option.value === value ? "✓" : ""}</span>
                {/* In its own element so a long identifier is cut with an ellipsis rather than
                    widening the menu until it needs a horizontal scrollbar. */}
                <span className="menu-label">{option.label}</span>
                {option.note && <span className="menu-note">{option.note}</span>}
              </button>
            ))}
            {shown.length === 0 && <p className="menu-empty">{t("Nothing found")}</p>}
          </div>
        </>
      )}
    </MenuButton>
  );
}
