import { useEffect, useRef, useState } from "react";
import type { Transfer } from "../../../shared/remoteFiles";
import type { PanelKind } from "../../../shared/remotePanels";
import { FilesPane } from "./FilesPane";
import { GlobalSettings } from "./GlobalSettings";
import { HostStatusPanel } from "./HostStatusPanel";
import { FleetPane } from "./FleetPane";
import { InventoryPane } from "./InventoryPane";
import { KartePane } from "./KartePane";
import { RunsPane } from "./RunsPane";
import { Toast } from "./Toast";

/**
 * The whole of one floating window.
 *
 * The same components as the main window used to hold, in a window the system keeps above
 * everything. One build and one stylesheet rather than three small applications: what is worth
 * knowing about a server does not change with which window it is in.
 *
 * Nothing here is passed down from the main window, because there is no main window to pass it —
 * each panel asks the main process for what it needs and is told when it changes. That is why the
 * transfer list is subscribed to here rather than handed in.
 */
export function PanelWindow({
  focus,
  kind,
  hostId,
}: {
  focus?: string;
  kind: PanelKind;
  hostId: string;
}) {
  const [error, setError] = useState<string>();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const body = useRef<HTMLDivElement>(null);

  /*
   * The status window takes the height of what is in it.
   *
   * It opens before the first reading arrives, so its height is a guess until then — and the
   * content has a definite height rather than filling what it is given, which is what makes
   * fitting the right answer here and the wrong one for the two lists. Watched rather than
   * measured once: folding the details away should leave a small window, not a large empty one.
   */
  useEffect(() => {
    if (kind !== "status" || !body.current) return;
    const observer = new ResizeObserver(() => {
      const inner = body.current?.firstElementChild;
      if (inner) void window.machina.remotePanels.fit(inner.scrollHeight + 24).catch(() => undefined);
    });
    observer.observe(body.current.firstElementChild ?? body.current);
    return () => observer.disconnect();
  }, [kind]);

  useEffect(() => {
    if (kind !== "files") return;
    return window.machina.remoteFiles.onTransfer((transfer) =>
      setTransfers((current) => [
        ...current.filter((each) => each.id !== transfer.id),
        transfer,
      ]),
    );
  }, [kind]);

  return (
    <div className={`panel-window panel-${kind}`} ref={body}>
      {/* Over the page, in the corner: an error must not push the panel's content around. */}
      {error && <Toast message={error} onDismiss={() => setError(undefined)} />}

      {kind === "status" && (
        <HostStatusPanel floating hasSsh hostId={hostId} onOpenSettings={() => window.close()} />
      )}

      {kind === "inventory" && (
        <InventoryPane
          hasSsh
          hostId={hostId}
          onError={setError}
          /* Into whichever terminal the main window has open — this one holds no tabs of its
             own, and the main process knows which they are. */
          onType={(command) => {
            void window.machina.remote
              .sshType(hostId, command)
              .catch((cause: Error) => setError(cause.message));
          }}
        />
      )}

      {kind === "karte" && <KartePane hostId={hostId} onError={setError} />}

      {kind === "fleet" && <FleetPane onError={setError} />}

      {kind === "settings" && (
        <GlobalSettings
          /* "Look at the plugins" from the conversation lands on the plugins, not on the first page. */
          focus={focus}
          onClose={() => window.close()}
          onError={setError}
          /* Saved is announced by the main process to every window that is listening, so the
             conversation in the other window re-reads without being told from here. */
          onSaved={() => undefined}
        />
      )}

      {kind === "runs" && (
        <RunsPane
          focus={focus}
          hostId={hostId}
          onError={setError}
          /* Into whichever session the main window has open, as the inventory's list did. */
          onType={(command) => {
            void window.machina.remote.sshType(hostId, command).catch((cause: Error) => setError(cause.message));
          }}
        />
      )}

      {kind === "files" && (
        <FilesPane
          hasSsh
          hostId={hostId}
          onError={setError}
          transfers={transfers.filter((each) => each.hostId === hostId)}
        />
      )}
    </div>
  );
}
