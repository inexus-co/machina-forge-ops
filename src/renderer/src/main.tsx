import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setLocale } from "../../shared/i18n";
import type { PanelKind } from "../../shared/remotePanels";
import { LocaleProvider } from "./i18n";
import { AppShell } from "./AppShell";
import { PanelWindow } from "./remote/PanelWindow";
import "./styles.css";

/* Before anything is drawn: the preload asked the main process for this synchronously. */
setLocale(window.machina.i18n.initial());


/*
 * One bundle, several windows.
 *
 * The floating panels load this same file with `#panel=<kind>:<hostId>`. A second entry point
 * would mean a second build, a second copy of the stylesheet, and two things to keep looking
 * alike; a hash is one line here and nothing anywhere else.
 */
const panel = /^#panel=(status|inventory|karte|files|runs|settings|fleet):([^:]+)(?::(.+))?$/.exec(window.location.hash);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider>
      {panel ? (
        <PanelWindow
          focus={panel[3] ? decodeURIComponent(panel[3]) : undefined}
          hostId={decodeURIComponent(panel[2])}
          kind={panel[1] as PanelKind}
        />
      ) : (
        <AppShell />
      )}
    </LocaleProvider>
  </StrictMode>,
);
