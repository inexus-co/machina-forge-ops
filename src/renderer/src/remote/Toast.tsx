import { useEffect } from "react";
import { useT } from "../i18n";

/**
 * Where every failure is said: the top right, over the page, never inside it.
 *
 * An error printed into the content pushes whatever was there down — a list moves under the
 * pointer, a form's buttons walk off the bottom — and each surface had grown its own way of
 * doing it, so the same failure looked different depending on which window it happened in.
 * One shape, one place, and the page underneath does not move.
 */
export function Toast({
  kind = "bad",
  message,
  onDismiss,
}: {
  /** Whether this is something that went wrong, or something that went right. */
  kind?: "bad" | "good";
  message: string;
  onDismiss: () => void;
}) {
  const t = useT();
  /* Gone on its own, because a message nobody dismissed should not sit there all afternoon. */
  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div className={kind === "good" ? "toast good" : "toast"} role="alert">
      <span>{message}</span>
      <button aria-label={t("Close")} className="quiet" type="button" onClick={onDismiss}>
        ✕
      </button>
    </div>
  );
}

/**
 * The sentence, without the plumbing around it.
 *
 * Electron wraps everything a main-process handler throws:「Error invoking remote method
 * 'remote:ssh-type': Error: no session is open for this server" — the operator's half is the
 * last clause. The channel name is for whoever is debugging, and the console still has it.
 */
export function describeError(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message
      .replace(/^Error invoking remote method '[^']*':\s*/, "")
      .replace(/^Error:\s*/, "");
  }
  return String(cause);
}
