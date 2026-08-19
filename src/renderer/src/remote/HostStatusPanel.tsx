import { useEffect, useState } from "react";
import { formatTime, t } from "../../../shared/i18n";
import { useT } from "../i18n";
import type { HostStatus, HostStatusError } from "../../../shared/remoteStatus";

/**
 * What this server is, and what it is doing right now.
 *
 * A strip above the work, not a dashboard: it is read while doing something else, so what matters
 * is that a number out of place catches the eye without being looked for. Bars rather than
 * figures alone, because "83%" and "8%" look alike at a glance and a bar does not.
 *
 * Nothing is installed on the far end to produce any of this — see `shared/remoteStatus.ts`.
 * It stops polling when it closes: a client quietly asking a customer's server for numbers
 * nobody is reading is one that should not have been left running overnight.
 */

export function HostStatusPanel({
  hostId,
  hasSsh,
  onOpenSettings,
  onPopOut,
  column,
  floating,
}: {
  hostId: string;
  hasSsh: boolean;
  onOpenSettings: () => void;
  /** Move this panel into a floating window. Absent when it is already in one. */
  onPopOut?: () => void;
  /**
   * Standing beside the screen rather than above it.
   *
   * The gauges stack and the figures go under their bars: the column is as wide as the black
   * bars beside a 16:10 desktop, which is not wide enough for a label, a bar and a number in a
   * row.
   */
  column?: boolean;
  /** Whether this instance is the one inside the floating window. */
  floating?: boolean;
}) {
  const t = useT();
  const [status, setStatus] = useState<HostStatus>();
  const [error, setError] = useState<HostStatusError>();
  /*
   * Open by default wherever there is room for it.
   *
   * In the floating window and in the column beside the work, the space is already spoken for —
   * leaving it as white under a five-line summary is worse than filling it with the machine's
   * name, its kernel and its disks. As a strip above the panes it stays folded, because there
   * every line it adds is a line off the picture.
   */
  const [open, setOpen] = useState(Boolean(floating || column));

  /*
   * The fold follows the shape, not the last click.
   *
   * A column has room for the detail and a strip does not, so opening one and then narrowing the
   * window left a five-row block above the picture, taking a third of it. When the shape changes
   * the panel goes back to what that shape wants.
   */
  useEffect(() => {
    setOpen(Boolean(floating || column));
  }, [column, floating]);

  useEffect(() => {
    if (!hasSsh) return;
    const off = window.machina.remoteStatus.onStatus((id, next, failure) => {
      if (id !== hostId) return;
      // A failed reading does not erase the last good one: a momentary drop should not blank the
      // panel, and the reading that is there is still the last thing that was true.
      if (next) setStatus(next);
      setError(failure);
    });
    void window.machina.remoteStatus.watch(hostId).catch(() => undefined);
    return () => {
      off();
      void window.machina.remoteStatus.stop(hostId).catch(() => undefined);
    };
  }, [hostId, hasSsh]);

  if (!hasSsh) {
    return (
      <div className={column ? "host-status empty column" : "host-status empty"}>
        <span>{t("Without SSH the state cannot be read.")}</span>
        <button className="quiet" type="button" onClick={onOpenSettings}>
          {t("Settings")}
        </button>
      </div>
    );
  }

  if (!status) {
    return (
      <div className={column ? "host-status empty column" : "host-status empty"}>
        <span>{error ? error.detail : t("Reading the state…")}</span>
      </div>
    );
  }

  const memory = status.memory;
  const disk = status.filesystems[0];
  /* Load against cores is the comparison that means something; the raw figure alone does not. */
  const loadRatio =
    status.load && status.cpuCores ? status.load[0] / status.cpuCores : undefined;

  return (
    <div
      className={[
        "host-status",
        open ? "open" : "",
        floating ? "floating" : "",
        column ? "column" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="host-status-row">
        <Gauge
          label="CPU"
          value={status.cpuBusy}
          text={status.cpuBusy === undefined ? t("Measuring") : `${Math.round(status.cpuBusy)}%`}
        />
        <Gauge
          label={t("Memory")}
          value={memory ? (memory.used / memory.total) * 100 : undefined}
          text={memory ? `${bytes(memory.used)} / ${bytes(memory.total)}` : "—"}
        />
        <Gauge
          label={disk ? t("Disk {mount}", { mount: disk.mount }) : t("Disk")}
          value={disk ? (disk.used / disk.total) * 100 : undefined}
          text={disk ? `${bytes(disk.used)} / ${bytes(disk.total)}` : "—"}
        />
        <div className="host-status-facts">
          <span title={t("1 min / 5 min / 15 min")}>
            {t("Load {load}", {
              load: status.load ? status.load.map((each) => each.toFixed(2)).join(" ") : "—",
            })}
            {loadRatio !== undefined && loadRatio >= 1 && (
              <strong className="over"> {t("Above the core count")}</strong>
            )}
          </span>
          <span>{t("Up {uptime}", { uptime: duration(status.uptimeSeconds) })}</span>
        </div>
        <span className="host-status-buttons">
          <button
            aria-expanded={open}
            className="quiet host-status-more"
            type="button"
            onClick={() => setOpen(!open)}
          >
            {open ? t("Collapse") : t("Details")}
          </button>
          {/* The point of the floating window: watch the machine from another application. */}
          {onPopOut && (
            <button className="quiet host-status-more" type="button" onClick={onPopOut}>
              {t("Own window")}
            </button>
          )}
        </span>
      </div>

      {open && (
        <div className="host-status-detail">
          <dl>
            <dt>{t("Host name")}</dt>
            <dd>{status.hostname ?? "—"}</dd>
            <dt>OS</dt>
            <dd>{status.os ?? "—"}</dd>
            <dt>{t("Kernel")}</dt>
            <dd>
              {status.kernel ?? "—"}
              {status.architecture ? `（${status.architecture}）` : ""}
            </dd>
            <dt>CPU</dt>
            {/* A machine whose model nobody can name still has a core count worth knowing, and
                "— × 18" reads as a missing value rather than as eighteen cores. */}
            <dd>
              {status.cpuModel
                ? `${status.cpuModel}${status.cpuCores ? ` × ${status.cpuCores}` : ""}`
                : status.cpuCores
                  ? t("{cores} cores", { cores: status.cpuCores })
                  : "—"}
            </dd>
            <dt>{t("Memory")}</dt>
            <dd>
              {memory ? bytes(memory.total) : "—"}
              {memory?.swapTotal
                ? t(" (swap {used} / {total})", {
                    used: bytes(memory.swapUsed ?? 0),
                    total: bytes(memory.swapTotal),
                  })
                : ""}
            </dd>
          </dl>

          {/* Every filesystem, not only the biggest: the one that fills up is often the small
              one somebody mounted for logs. */}
          <table className="host-status-disks">
            <tbody>
              {status.filesystems.map((each) => (
                <tr key={each.mount}>
                  <th>{each.mount}</th>
                  <td>
                    <Bar value={(each.used / each.total) * 100} />
                  </td>
                  <td className="host-status-figure">
                    {bytes(each.used)} / {bytes(each.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="host-status-note">
            {t("As of {when}, read over SSH — nothing is installed on the server.", {
              when: formatTime(status.at),
            })}
            {error && <span className="over">　{error.detail}</span>}
          </p>
        </div>
      )}
    </div>
  );
}

function Gauge({
  label,
  text,
  value,
}: {
  label: string;
  text: string;
  value?: number;
}) {
  return (
    <div className="host-gauge">
      <span className="host-gauge-label">{label}</span>
      <Bar value={value} />
      <span className="host-gauge-figure">{text}</span>
    </div>
  );
}

/**
 * One bar.
 *
 * Coloured only past the thresholds where somebody would act: amber where it is worth noticing,
 * red where it is worth stopping for. A gradient from green to red makes every machine look like
 * it is halfway to a problem.
 */
function Bar({ value }: { value?: number }) {
  const level = value === undefined ? "" : value >= 90 ? " high" : value >= 75 ? " warn" : "";
  return (
    <span className={`host-bar${level}`}>
      <span style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }} />
    </span>
  );
}

/** Binary units, which is what `free` and `df` report and what an operator compares against. */
function bytes(value: number) {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 100 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
}

function duration(seconds?: number) {
  if (seconds === undefined) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return t("{days}d {hours}h", { days, hours });
  if (hours > 0) return t("{hours}h {minutes}m", { hours, minutes });
  return t("{minutes}m", { minutes });
}
