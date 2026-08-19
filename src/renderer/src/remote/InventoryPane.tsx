import { useCallback, useEffect, useRef, useState } from "react";
import { t, type Translate } from "../../../shared/i18n";
import { useT } from "../i18n";
import type { TypedCommand } from "../../../shared/remoteHistory";
import { describeError } from "./Toast";
import type { Inventory, LogSource } from "../../../shared/remoteInventory";

/**
 * What this server runs, what it lets in, and what it is writing down.
 *
 * Nothing is installed on the far end to produce any of it — the kernel and the ordinary tools
 * already know, and sshd is already running. Cockpit answers many of the same questions and some
 * of them better; what it cannot do is answer them about a machine nobody installed it on, which
 * is every machine on the first day.
 *
 * Read-only throughout, deliberately. A button here that stopped a service would be a write with
 * none of the agent's allowlist or approval behind it — see
 * `docs/decisions/0001-shell-under-a-written-guarantee.md`.
 */

type Tab = "ports" | "services" | "cron" | "containers" | "firewall" | "logs";

/*
 * A function, not a constant: words read at import time would be the language the window opened
 * in, and would keep saying it after the operator switched.
 */
const tabsOf = (t: Translate): Array<{ id: Tab; label: string }> => [
  { id: "ports", label: t("Port") },
  { id: "services", label: t("Service") },
  { id: "cron", label: t("Scheduled jobs") },
  { id: "containers", label: t("Containers") },
  { id: "firewall", label: "Firewall" },
  { id: "logs", label: t("Logs") },
];

export function InventoryPane({
  hostId,
  hasSsh,
  onError,
  onType,
}: {
  hostId: string;
  hasSsh: boolean;
  onError: (message?: string) => void;
  /** Put a past command into the terminal, unrun. Absent when no terminal is open. */
  onType?: (command: string) => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("ports");
  const [inventory, setInventory] = useState<Inventory>();
  const [busy, setBusy] = useState(false);

  const read = useCallback(() => {
    setBusy(true);
    onError(undefined);
    void window.machina.remoteInventory
      .read(hostId)
      .then(setInventory)
      .catch((cause) => onError(describeError(cause)))
      .finally(() => setBusy(false));
  }, [hostId, onError]);

  useEffect(() => {
    if (hasSsh) read();
  }, [hasSsh, read]);

  if (!hasSsh) {
    return <div className="files-pane empty">{t("No SSH is set up for this server, so nothing can be read.")}</div>;
  }

  const failed = inventory?.services.filter((each) => each.active === "failed").length ?? 0;
  const exposed = inventory?.ports.filter((each) => each.exposed).length ?? 0;

  return (
    <div className="inventory-pane">
      <div className="files-bar">
        <div className="inventory-tabs" role="tablist">
          {tabsOf(t).map((each) => (
            <button
              aria-selected={tab === each.id}
              className={tab === each.id ? "active" : undefined}
              key={each.id}
              role="tab"
              type="button"
              onClick={() => setTab(each.id)}
            >
              {each.label}
              {/* Counts that mean "look here": a failed unit, a port facing the world. */}
              {each.id === "services" && failed > 0 && <small className="bad">{failed}</small>}
              {each.id === "ports" && exposed > 0 && <small>{exposed}</small>}
            </button>
          ))}
        </div>
        <span className="inventory-spacer" />
        {inventory?.updates && (
          <span className="inventory-updates">
            {t("{count} updates", { count: inventory.updates.count })}
            {inventory.updates.security ? t(" ({count} of them security)", { count: inventory.updates.security }) : ""}
            {inventory.updates.rebootRequired && <strong className="bad">　{t("A restart is needed")}</strong>}
          </span>
        )}
        <button className="quiet" disabled={busy} type="button" onClick={read}>
          {busy ? t("Loading…") : t("Reload")}
        </button>
      </div>

      <div className="inventory-body">
        {!inventory && !busy && <p className="files-empty">{t("Not read yet.")}</p>}
        {inventory && tab === "ports" && <Ports inventory={inventory} />}
        {inventory && tab === "services" && <Services inventory={inventory} />}
        {inventory && tab === "cron" && <Cron inventory={inventory} />}
        {inventory && tab === "containers" && <Containers inventory={inventory} />}
        {inventory && tab === "firewall" && <FirewallView inventory={inventory} />}
        {tab === "logs" && <Logs hostId={hostId} onError={onError} />}
      </div>

      {inventory && inventory.missing.length > 0 && tab !== "logs" && (
        <p className="inventory-missing">
          {/* Translated here, not where it was read: the language can change while this is open. */}
          {inventory.missing.map((line) => t(line)).join(" / ")}
        </p>
      )}
    </div>
  );
}

function Ports({ inventory }: { inventory: Inventory }) {
  const t = useT();
  /*
   * Naming the process needs privilege the account may not have.
   *
   * An empty column reads as "nothing is listening there", which is the opposite of true. Said
   * once under the table rather than as a dash on every row.
   */
  const anonymous =
    inventory.ports.length > 0 && inventory.ports.every((each) => !each.process);

  return (
    <>
    <table className="inventory-table">
      <thead>
        <tr>
          <th>{t("Port")}</th>
          <th>{t("Listening")}</th>
          <th>{t("Process")}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {inventory.ports.map((port) => (
          <tr key={`${port.protocol}-${port.address}-${port.port}`}>
            <th>
              {port.protocol} {port.port}
            </th>
            <td className="mono">{port.address}</td>
            <td>{port.process ?? "—"}</td>
            {/* The one fact that is hard to see in raw output and changes everything. */}
            <td>{port.exposed ? <span className="tag bad">{t("Reachable from outside")}</span> : <span className="tag">{t("This machine only")}</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
      {anonymous && (
        <p className="inventory-missing">
          {t("Process names are only visible to an account with the privilege.")}
        </p>
      )}
    </>
  );
}

function Services({ inventory }: { inventory: Inventory }) {
  const t = useT();
  const [all, setAll] = useState(false);
  // Two hundred units, of which four matter. The rest are one click away.
  const shown = all
    ? inventory.services
    : inventory.services.filter((each) => each.active === "failed" || each.active === "active");

  return (
    <>
      <table className="inventory-table">
        <tbody>
          {shown.map((unit) => (
            <tr key={unit.name}>
              <th>{unit.name.replace(/\.service$/, "")}</th>
              <td>
                <span className={unit.active === "failed" ? "tag bad" : unit.active === "active" ? "tag good" : "tag"}>
                  {unit.active}
                </span>
              </td>
              <td>{unit.sub}</td>
              <td className="inventory-description">{unit.description ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="quiet" type="button" onClick={() => setAll(!all)}>
        {all
          ? t("Only what is running")
          : t("Everything, stopped ones too ({count})", { count: inventory.services.length })}
      </button>
    </>
  );
}

function Cron({ inventory }: { inventory: Inventory }) {
  const t = useT();
  if (inventory.cron.length === 0) {
    return <p className="files-empty">{t("No scheduled jobs are set.")}</p>;
  }
  return (
    <table className="inventory-table">
      <tbody>
        {inventory.cron.map((job, index) => (
          <tr key={`${job.owner}-${index}`}>
            <th className="mono">{job.schedule}</th>
            <td>{job.owner}</td>
            <td className="mono inventory-description">{job.command}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Containers({ inventory }: { inventory: Inventory }) {
  const t = useT();
  if (inventory.containers.length === 0 && inventory.images.length === 0) {
    return <p className="files-empty">{t("Neither Docker nor Podman was found.")}</p>;
  }
  return (
    <>
      <table className="inventory-table">
        <tbody>
          {inventory.containers.map((container) => (
            <tr key={container.id}>
              <th>{container.name}</th>
              <td>
                <span className={/^Up/.test(container.status) ? "tag good" : "tag"}>
                  {container.status}
                </span>
              </td>
              <td className="mono inventory-description">{container.image}</td>
              <td className="mono">{container.ports ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {inventory.images.length > 0 && (
        <>
          <h4 className="inventory-heading">{t("Image")}</h4>
          <table className="inventory-table">
            <tbody>
              {inventory.images.map((image) => (
                <tr key={`${image.repository}:${image.tag}`}>
                  <th className="mono">
                    {image.repository}:{image.tag}
                  </th>
                  <td>{image.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

function FirewallView({ inventory }: { inventory: Inventory }) {
  const t = useT();
  const { firewall } = inventory;
  return (
    <>
      <p className="inventory-heading">
        {firewall.kind === "none" ? t("No firewall was found") : firewall.kind}
        {/* "Not found" and "not in effect" side by side said the same thing twice. */}
        {firewall.kind !== "none" && (
          <span className={firewall.active ? "tag good" : "tag bad"}>
            {firewall.active ? t("on") : t("not in force")}
          </span>
        )}
      </p>
      {firewall.rules.length > 0 && <pre className="remote-output">{firewall.rules.join("\n")}</pre>}
    </>
  );
}

/** How many lines to keep on screen. Beyond this the browser, not the server, is the bottleneck. */
const LOG_LIMIT = 2000;

function Logs({ hostId, onError }: { hostId: string; onError: (message?: string) => void }) {
  const t = useT();
  const [sources, setSources] = useState<LogSource[]>([]);
  const [chosen, setChosen] = useState<string>();
  const [filter, setFilter] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [following, setFollowing] = useState(false);
  const scroller = useRef<HTMLPreElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    void window.machina.remoteInventory
      .logSources(hostId)
      .then((found) => {
        setSources(found);
        setChosen((current) => current ?? found[0]?.id);
      })
      .catch((cause) => onError(describeError(cause)));
    return () => {
      void window.machina.remoteInventory.stopLog(hostId).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId]);

  useEffect(() => {
    const offLines = window.machina.remoteInventory.onLogLines((id, incoming) => {
      if (id !== hostId) return;
      setLines((current) => [...current, ...incoming].slice(-LOG_LIMIT));
    });
    const offClosed = window.machina.remoteInventory.onLogClosed((id) => {
      if (id === hostId) setFollowing(false);
    });
    return () => {
      offLines();
      offClosed();
    };
  }, [hostId]);

  // Follow the bottom, unless the reader has scrolled up to look at something.
  useEffect(() => {
    const node = scroller.current;
    if (node && stick.current) node.scrollTop = node.scrollHeight;
  }, [lines]);

  const start = () => {
    const source = sources.find((each) => each.id === chosen);
    if (!source) return;
    setLines([]);
    setFollowing(true);
    void window.machina.remoteInventory
      .followLog(hostId, source, filter.trim() || undefined)
      .catch((cause) => {
        setFollowing(false);
        onError(describeError(cause));
      });
  };

  return (
    <div className="log-view">
      <div className="files-bar">
        <select value={chosen ?? ""} onChange={(event) => setChosen(event.target.value)}>
          {sources.length === 0 && <option value="">{t("There is no log that can be read")}</option>}
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {/* Units and paths are data and come through unchanged; only the whole-machine
                  entry is a sentence, and `t` leaves everything else alone. */}
              {t(source.label)}
            </option>
          ))}
        </select>
        {/* Filtered on this side. A pattern sent to the far end would have to be quoted into a
            shell command, and what somebody typed is not a thing to build commands out of. */}
        <input
          className="files-path"
          placeholder={t("Only lines containing this text")}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) start();
          }}
        />
        {following ? (
          <button
            className="quiet"
            type="button"
            onClick={() => {
              setFollowing(false);
              void window.machina.remoteInventory.stopLog(hostId).catch(() => undefined);
            }}
          >
            {t("■ Stop")}
          </button>
        ) : (
          <button className="quiet" disabled={!chosen} type="button" onClick={start}>
            {t("▶ Follow")}
          </button>
        )}
      </div>
      <pre
        className="remote-output log-lines"
        ref={scroller}
        onScroll={(event) => {
          const node = event.currentTarget;
          stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 60;
        }}
      >
        {lines.length === 0
          ? following
            ? t("Waiting…")
            : t("Press Follow to show it. It starts with the last 300 lines and then keeps up with whatever arrives.")
          : lines.join("\n")}
      </pre>
    </div>
  );
}

