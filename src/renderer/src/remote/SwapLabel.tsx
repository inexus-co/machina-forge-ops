import type { ReactNode } from "react";

/**
 * A label with two states, on a control whose width must not change.
 *
 * Both labels are laid out in the same cell and the inactive one is only hidden, so the element is
 * always as wide as its longest label. A button that resizes when it is pressed moves whatever is
 * next to it, which is exactly when the operator is about to press that too.
 */
export function SwapLabel({
  active,
  on,
  off,
}: {
  active: boolean;
  on: ReactNode;
  off: ReactNode;
}) {
  return (
    <span className="swap-label">
      <span>{active ? on : off}</span>
      <span aria-hidden="true">{active ? off : on}</span>
    </span>
  );
}
