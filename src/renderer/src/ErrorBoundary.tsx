import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "../../shared/i18n";

/**
 * Last resort for a render or effect that throws.
 *
 * Without one, React unmounts the whole tree and the operator gets a white window — during a PC
 * setup that is the worst possible failure mode, because it hides both what broke and the button
 * that stops the agent. A boundary turns it into a message plus a way back.
 *
 * It is deliberately not a retry loop: if the cause is a missing bridge to the main process,
 * re-rendering fails the same way. Reloading is the honest offer.
 */

type Props = { children: ReactNode };
type State = { message?: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The stack is the only place the component path survives, so keep it in the console.
    /* Not translated on purpose: this line is for whoever opens the developer console. */
    console.error("the screen failed to render", error, info.componentStack);
  }

  render() {
    if (this.state.message === undefined) return this.props.children;
    return (
      <main className="boundary">
        <h2>{t("This screen could not be drawn")}</h2>
        <p className="setting-error">{this.state.message}</p>
        <p className="safety-note">
          {t("Nothing was sent to the machine you are working on. Reload, or look at the developer console for the cause.")}
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          {t("Reload")}
        </button>
      </main>
    );
  }
}
