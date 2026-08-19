import { useCallback, useEffect, useState } from "react";
import { formatDate } from "../../../shared/i18n";
import { useT } from "../i18n";
import type { RemoteEntry, RemoteListing, Transfer } from "../../../shared/remoteFiles";
import { describeError } from "./Toast";

/**
 * The server's files.
 *
 * One pane, one directory, one list — not two panes facing each other. A dual-pane file manager
 * is for moving things around between two places you are equally interested in; this is for
 * getting a config file off a machine and a patched one back on, and the local half of that is a
 * question the operating system's own file dialog answers better than a list ever will.
 *
 * The operator does this. It is not one of the agent's tools and cannot be reached from it —
 * `docs/decisions/0001-shell-under-a-written-guarantee.md` lists what the agent may do, and this
 * is not on it.
 */

export function FilesPane({
  hostId,
  hasSsh,
  onError,
  transfers,
}: {
  hostId: string;
  hasSsh: boolean;
  onError: (message?: string) => void;
  /**
   * Held above this pane, so closing it hides the progress without losing it.
   *
   * A transfer runs in the main process and keeps going whether or not anybody is looking; a
   * list that lived here would come back empty and make a running transfer look like it had
   * stopped.
   */
  transfers: Transfer[];
}) {
  const t = useT();
  const [listing, setListing] = useState<RemoteListing>();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [dropping, setDropping] = useState(false);

  const open = useCallback(
    (directory?: string) => {
      setBusy(true);
      onError(undefined);
      void window.machina.remoteFiles
        .list(hostId, directory)
        .then((next) => {
          setListing(next);
          setSelected([]);
        })
        .catch((cause) => onError(describeError(cause)))
        .finally(() => setBusy(false));
    },
    [hostId, onError],
  );

  useEffect(() => {
    if (hasSsh) open();
  }, [hasSsh, open]);

  // A finished upload changes what is in the directory being looked at.
  useEffect(() => {
    return window.machina.remoteFiles.onTransfer((transfer) => {
      if (transfer.hostId !== hostId) return;
      if (transfer.state === "done" && transfer.direction === "upload") open(listing?.path);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId, listing?.path]);

  /** The parent of the directory on screen, or nothing at the root. */
  const parent = listing && listing.path !== "/" ? parentOf(listing.path) : undefined;

  if (!hasSsh) {
    return (
      <div className="files-pane empty">{t("No SSH is set up for this server, so files cannot be handled.")}</div>
    );
  }

  return (
    <div
      className={dropping ? "files-pane dropping" : "files-pane"}
      onDragLeave={() => setDropping(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setDropping(true);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDropping(false);
        if (!listing) return;
        /*
         * Dropped files, by path.
         *
         * Electron adds `path` to `File`. The renderer never invents a local path — this one was
         * put here by the operator's own hand, which is the same permission a file dialog gives.
         */
        const paths = Array.from(event.dataTransfer.files)
          .map((file) => (file as File & { path?: string }).path)
          .filter((each): each is string => Boolean(each));
        if (paths.length === 0) return;
        void window.machina.remoteFiles
          .upload(hostId, listing.path, paths)
          .catch((cause) => onError(describeError(cause)));
      }}
    >
      <div className="files-bar">
        <button
          className="quiet"
          disabled={!parent || busy}
          type="button"
          onClick={() => parent && open(parent)}
        >
          {t("↑ Up")}
        </button>
        {/* The path is typeable: somewhere deep is faster reached by pasting it than by clicking
            down to it. */}
        <input
          className="files-path"
          spellCheck={false}
          value={listing?.path ?? ""}
          onChange={(event) => setListing((current) => current && { ...current, path: event.target.value })}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            open(listing?.path);
          }}
        />
        <button className="quiet" disabled={busy} type="button" onClick={() => open(listing?.path)}>
          {t("Reload")}
        </button>
        <button
          className="quiet"
          disabled={busy || !listing}
          type="button"
          onClick={() =>
            listing &&
            void window.machina.remoteFiles
              .chooseAndUpload(hostId, listing.path)
              .catch((cause) => onError(describeError(cause)))
          }
        >
          {t("+ Send")}
        </button>
        <button
          className="quiet"
          disabled={selected.length === 0}
          type="button"
          onClick={() =>
            void window.machina.remoteFiles
              .download(hostId, selected)
              .catch((cause) => onError(describeError(cause)))
          }
        >
          {selected.length > 1
            ? t("↓ Fetch ({count})", { count: selected.length })
            : t("↓ Fetch")}
        </button>
      </div>

      <div className="files-list">
        {listing?.entries.length === 0 && <p className="files-empty">{t("This directory is empty.")}</p>}
        {listing?.entries.map((entry) => (
          <Row
            entry={entry}
            key={entry.path}
            selected={selected.includes(entry.path)}
            onOpen={() => open(entry.path)}
            onToggle={() =>
              setSelected((current) =>
                current.includes(entry.path)
                  ? current.filter((each) => each !== entry.path)
                  : [...current, entry.path],
              )
            }
          />
        ))}
      </div>

      {transfers.length > 0 && (
        <div className="files-transfers">
          {transfers.map((transfer) => (
            <div className={`files-transfer ${transfer.state}`} key={transfer.id}>
              <span className="files-transfer-name">
                {transfer.direction === "upload" ? "↑" : "↓"} {transfer.name}
              </span>
              <span className="host-bar">
                <span
                  style={{
                    width: `${transfer.total ? Math.min(100, (transfer.moved / transfer.total) * 100) : 0}%`,
                  }}
                />
              </span>
              <span className="files-transfer-figure">
                {transfer.state === "running"
                  ? `${bytes(transfer.moved)} / ${transfer.total ? bytes(transfer.total) : "…"}`
                  : transfer.state === "done"
                    ? bytes(transfer.moved)
                    : (transfer.detail ?? transfer.state)}
              </span>
              {transfer.state === "running" ? (
                <button
                  className="quiet"
                  type="button"
                  onClick={() => void window.machina.remoteFiles.cancel(transfer.id)}
                >
                  {t("Abort")}
                </button>
              ) : transfer.state === "done" && transfer.direction === "download" ? (
                <button
                  className="quiet"
                  type="button"
                  onClick={() => void window.machina.remoteFiles.reveal(transfer.id)}
                >
                  {t("Open")}
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  entry,
  onOpen,
  onToggle,
  selected,
}: {
  entry: RemoteEntry;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const t = useT();
  const isDirectory = entry.kind === "directory";
  return (
    <div className={selected ? "files-row selected" : "files-row"}>
      {/* Only files can be fetched: a directory would be a recursive transfer, which is a
          different thing with different failure modes and is not what this does yet. */}
      <input
        checked={selected}
        disabled={isDirectory}
        type="checkbox"
        onChange={onToggle}
      />
      <button
        className="files-name"
        type="button"
        onClick={() => (isDirectory ? onOpen() : onToggle())}
      >
        <span aria-hidden className="files-kind">
          {isDirectory ? "📁" : entry.kind === "link" ? "↪" : "📄"}
        </span>
        {entry.name}
      </button>
      <span className="files-size">{isDirectory ? "" : bytes(entry.size)}</span>
      <span className="files-mode">{entry.mode}</span>
      <time>{entry.modified ? formatDate(entry.modified) : ""}</time>
    </div>
  );
}

function parentOf(directory: string) {
  const trimmed = directory.replace(/\/+$/, "");
  const cut = trimmed.lastIndexOf("/");
  return cut <= 0 ? "/" : trimmed.slice(0, cut);
}

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

