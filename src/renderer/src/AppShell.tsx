import { useEffect } from "react";
import { useLocale, useT } from "./i18n";
import { ErrorBoundary } from "./ErrorBoundary";
import { RemoteWorkspace } from "./remote/RemoteWorkspace";

/**
 * One workspace: the servers, their screens, their terminals, and the agent.
 *
 * There is no mode to choose. Everything here works one kind of machine — one that is already
 * running, and whose shell is the point.
 */
export function AppShell() {
  const t = useT();
  const locale = useLocale();
  /*
   * The window's name, from here rather than from the HTML or the main process.
   *
   * The `<title>` in the document is fixed and the main process sets its own at creation; neither
   * follows a language change while the window is open. This does.
   *
   * The dependency is the language, not `t`: `t` is one module-level function and its identity
   * never changes, so an effect watching it would run once and never again — which is exactly what
   * happened, and the title stayed in the language the window opened in.
   */
  useEffect(() => {
    document.title = t("Machina Forge Ops");
  }, [t, locale]);

  return (
    <ErrorBoundary>
      <RemoteWorkspace />
    </ErrorBoundary>
  );
}
