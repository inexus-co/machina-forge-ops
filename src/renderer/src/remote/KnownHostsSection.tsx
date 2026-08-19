import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "../../../shared/i18n";
import { useT } from "../i18n";
import type { KnownHostEntry } from "../../../shared/remote";

/**
 * The servers this application has met.
 *
 * Here rather than on the warning that sends people here. A server whose key changed is either a
 * machine that was rebuilt or a machine that is not the one you think, and a warning with a
 * "yes, whatever" button next to it is a warning nobody reads. Forgetting a key has to be a thing
 * somebody goes and does, having decided which of the two it was.
 */

export function KnownHostsSection({
  onChanged,
  onError,
}: {
  onError: (message?: string) => void;
  /** Told when a key is forgotten, so the count beside the category follows. */
  onChanged?: () => void;
}) {
  const t = useT();
  const [hosts, setHosts] = useState<KnownHostEntry[]>([]);

  const load = useCallback(() => {
    void window.machina.remote
      .listKnownHosts()
      .then((list) =>
        setHosts([...list].sort((a, b) => a.key.localeCompare(b.key))),
      )
      .catch((cause) => onError(cause instanceof Error ? cause.message : String(cause)));
  }, [onError]);

  useEffect(load, [load]);

  return (
    <div className="settings-body">
      <div className="settings-lede">
        <h2>{t("Server keys")}</h2>
        <p>
          {t("The fingerprint recorded the first time you connected. From then on this application refuses any server that presents a different key. Forget one here only when you have rebuilt that server.")}
        </p>
      </div>

      <div className="settings-toolbar">
        <h3>{t("Recorded keys")}</h3>
        <span className="count">{hosts.length}</span>
      </div>

      <div className="settings-list">
        {hosts.length === 0 && <p className="settings-empty">{t("Nothing recorded yet.")}</p>}

        {hosts.map((entry) => (
          <div className="settings-row" key={entry.key}>
            <div className="settings-row-head">
              <div className="settings-row-body as-text">
                <span>{entry.key}</span>
                <small>
                  <code>{entry.fingerprint}</code>
                </small>
                <small>
                  {entry.algorithm}・{formatDateTime(entry.addedAt)}
                </small>
              </div>
              <button
                className="settings-row-remove"
                type="button"
                onClick={() =>
                  void window.machina.remote
                    .forgetHostKey(entry.key)
                    .then(() => {
                      load();
                      onChanged?.();
                    })
                    .catch((cause) =>
                      onError(cause instanceof Error ? cause.message : String(cause)),
                    )
                }
              >
                {t("Forget")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
