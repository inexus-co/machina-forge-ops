/**
 * The keys, as the wire wants them.
 *
 * RDP carries keystrokes as PC/XT scan codes, not as characters, so anything that types has to
 * arrive here first. Two callers now: the screen the operator types into, which starts from a
 * browser `KeyboardEvent.code`, and the agent's `type_text`, which starts from a character.
 *
 * US layout. A key on a Japanese keyboard sits in the same place electrically, so the operator's
 * own typing is unaffected — but a scan code can only produce what a US layout would produce,
 * which is why the table below stops at ASCII rather than pretending about kana. Anything past
 * it does not travel as a key at all: `type_text` sends the character itself, on RDP's own
 * Unicode key event (`RemoteRdpSession.unicode`).
 */

/** Browser `KeyboardEvent.code` → scan code. What the operator's keyboard produces. */
export const SCANCODES: Record<string, number> = {
  Escape: 0x01, Digit1: 0x02, Digit2: 0x03, Digit3: 0x04, Digit4: 0x05, Digit5: 0x06,
  Digit6: 0x07, Digit7: 0x08, Digit8: 0x09, Digit9: 0x0a, Digit0: 0x0b, Minus: 0x0c,
  Equal: 0x0d, Backspace: 0x0e, Tab: 0x0f,
  KeyQ: 0x10, KeyW: 0x11, KeyE: 0x12, KeyR: 0x13, KeyT: 0x14, KeyY: 0x15, KeyU: 0x16,
  KeyI: 0x17, KeyO: 0x18, KeyP: 0x19, BracketLeft: 0x1a, BracketRight: 0x1b, Enter: 0x1c,
  ControlLeft: 0x1d,
  KeyA: 0x1e, KeyS: 0x1f, KeyD: 0x20, KeyF: 0x21, KeyG: 0x22, KeyH: 0x23, KeyJ: 0x24,
  KeyK: 0x25, KeyL: 0x26, Semicolon: 0x27, Quote: 0x28, Backquote: 0x29, ShiftLeft: 0x2a,
  Backslash: 0x2b,
  KeyZ: 0x2c, KeyX: 0x2d, KeyC: 0x2e, KeyV: 0x2f, KeyB: 0x30, KeyN: 0x31, KeyM: 0x32,
  Comma: 0x33, Period: 0x34, Slash: 0x35, ShiftRight: 0x36,
  AltLeft: 0x38, Space: 0x39, CapsLock: 0x3a,
  F1: 0x3b, F2: 0x3c, F3: 0x3d, F4: 0x3e, F5: 0x3f, F6: 0x40, F7: 0x41, F8: 0x42, F9: 0x43,
  F10: 0x44, F11: 0x57, F12: 0x58,
  Home: 0x47, ArrowUp: 0x48, PageUp: 0x49, ArrowLeft: 0x4b, ArrowRight: 0x4d, End: 0x4f,
  ArrowDown: 0x50, PageDown: 0x51, Insert: 0x52, Delete: 0x53,
};

export function scancodeOf(code: string): number | undefined {
  return SCANCODES[code];
}

/** The names an agent may use for a key, mapped to the same table. */
export const NAMED_KEYS: Record<string, string> = {
  enter: "Enter", return: "Enter", tab: "Tab", escape: "Escape", esc: "Escape",
  space: "Space", backspace: "Backspace", delete: "Delete", insert: "Insert",
  home: "Home", end: "End", pageup: "PageUp", pagedown: "PageDown",
  up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
  ctrl: "ControlLeft", control: "ControlLeft", alt: "AltLeft", shift: "ShiftLeft",
  f1: "F1", f2: "F2", f3: "F3", f4: "F4", f5: "F5", f6: "F6",
  f7: "F7", f8: "F8", f9: "F9", f10: "F10", f11: "F11", f12: "F12",
};

/**
 * One printable character → the key to press, and whether shift is held.
 *
 * ASCII only, and deliberately so: a key is a place on a keyboard, and no place on this one
 * produces a kana. Callers that meet a character with no key send it as a character instead — see
 * the note at the top.
 */
const UNSHIFTED = "abcdefghijklmnopqrstuvwxyz0123456789-=[]\\;',./`";
const SHIFTED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ)!@#$%^&*(_+{}|:"<>?~';

export function keyForCharacter(character: string): { code: string; shift: boolean } | undefined {
  if (character === " ") return { code: "Space", shift: false };
  if (character === "\n") return { code: "Enter", shift: false };
  if (character === "\t") return { code: "Tab", shift: false };

  const plain = UNSHIFTED.indexOf(character);
  const shifted = SHIFTED.indexOf(character);
  const index = plain >= 0 ? plain : shifted;
  if (index < 0) return undefined;

  const base = UNSHIFTED[index];
  const code =
    base >= "a" && base <= "z"
      ? `Key${base.toUpperCase()}`
      : base >= "0" && base <= "9"
        ? `Digit${base}`
        : ({
            "-": "Minus", "=": "Equal", "[": "BracketLeft", "]": "BracketRight",
            "\\": "Backslash", ";": "Semicolon", "'": "Quote", ",": "Comma",
            ".": "Period", "/": "Slash", "`": "Backquote",
          } as Record<string, string>)[base];

  return code ? { code, shift: shifted >= 0 } : undefined;
}

/**
 * What an agent wrote, as a scan code.
 *
 * Three things get written: a name (`ctrl`, `enter`), a single character (`c` in `ctrl c`), and
 * occasionally the browser's own code (`KeyC`). All three are meant, so all three are read.
 */
export function keyNameToScancode(name: string): number | undefined {
  const named = NAMED_KEYS[name.toLowerCase()];
  if (named) return scancodeOf(named);
  if (name.length === 1) {
    const key = keyForCharacter(name.toLowerCase());
    if (key) return scancodeOf(key.code);
  }
  return scancodeOf(name);
}
