import path from "node:path";
import { Client, type SFTPWrapper } from "ssh2";
import { t } from "../../../shared/i18n";
import type { RemoteEntry, RemoteListing } from "../../../shared/remoteFiles";
import { type SshTarget, connectionOf, describe } from "../sshSession";

/**
 * One SFTP connection to one server.
 *
 * Its own connection, like everything else on this path: the operator's terminal is theirs, and a
 * transfer that took ten minutes would otherwise be ten minutes of a shell nobody could type in.
 *
 * Held open between operations rather than dialled per request. Browsing a directory tree is a
 * request per directory, and an SSH handshake each time is most of the time.
 */

const READY_TIMEOUT_MS = 20_000;

export class FileSession {
  private client?: Client;
  private sftp?: SFTPWrapper;
  private target?: SshTarget;

  private async connect(target: SshTarget): Promise<SFTPWrapper> {
    if (this.sftp && this.target && sameTarget(this.target, target)) return this.sftp;
    this.stop();

    const client = new Client();
    const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      client.on("ready", () => {
        client.sftp((error, wrapper) => {
          if (error) reject(new Error(describeSftp(error)));
          else resolve(wrapper);
        });
      });
      client.on("error", (cause: Error) => reject(new Error(describe(cause))));
      client.connect({ ...connectionOf(target), readyTimeout: READY_TIMEOUT_MS });
    });

    client.on("close", () => {
      if (this.client === client) {
        this.client = undefined;
        this.sftp = undefined;
      }
    });
    this.client = client;
    this.sftp = sftp;
    this.target = target;
    return sftp;
  }

  /** What is in a directory. An empty path means the account's home. */
  async list(target: SshTarget, directory: string): Promise<RemoteListing> {
    const sftp = await this.connect(target);
    const resolved = await new Promise<string>((resolve, reject) => {
      // `realpath` on "." is how SFTP says "where does this account start".
      sftp.realpath(directory || ".", (error, value) =>
        error
          ? reject(
              new Error(
                t("{path} cannot be opened: {reason}", {
                  path: directory || t("the home directory"),
                  reason: error.message,
                }),
              ),
            )
          : resolve(value),
      );
    });

    const entries = await new Promise<RemoteEntry[]>((resolve, reject) => {
      sftp.readdir(resolved, (error, list) => {
        if (error) {
          reject(new Error(t("{path} cannot be read: {reason}", { path: resolved, reason: error.message })));
          return;
        }
        resolve(
          list.map((item) => {
            const attrs = item.attrs;
            return {
              name: item.filename,
              path: posixJoin(resolved, item.filename),
              kind: kindOf(item.longname),
              size: attrs.size ?? 0,
              modified: (attrs.mtime ?? 0) * 1000,
              mode: item.longname.slice(0, 10),
            };
          }),
        );
      });
    });

    /*
     * Directories first, then by name.
     *
     * The order `readdir` returns is the filesystem's, which is arbitrary and differs between
     * two machines holding the same files. Somewhere to click has to be somewhere it was last
     * time.
     */
    entries.sort((a, b) => {
      const byKind = Number(b.kind === "directory") - Number(a.kind === "directory");
      return byKind !== 0 ? byKind : a.name.localeCompare(b.name);
    });
    return { path: resolved, entries };
  }

  /**
   * Move one file, reporting as it goes.
   *
   * `fastPut`/`fastGet` rather than a stream pair: they run several reads in parallel over the
   * one connection, which is the difference between a transfer limited by the link and one
   * limited by the round trip. Both report progress, which is the other thing a person needs.
   */
  async put(
    target: SshTarget,
    localPath: string,
    remotePath: string,
    onProgress: (moved: number, total: number) => void,
  ) {
    const sftp = await this.connect(target);
    await new Promise<void>((resolve, reject) => {
      sftp.fastPut(
        localPath,
        remotePath,
        { step: (moved, _chunk, total) => onProgress(moved, total) },
        (error) => (error ? reject(new Error(error.message)) : resolve()),
      );
    });
  }

  async get(
    target: SshTarget,
    remotePath: string,
    localPath: string,
    onProgress: (moved: number, total: number) => void,
  ) {
    const sftp = await this.connect(target);
    await new Promise<void>((resolve, reject) => {
      sftp.fastGet(
        remotePath,
        localPath,
        { step: (moved, _chunk, total) => onProgress(moved, total) },
        (error) => (error ? reject(new Error(error.message)) : resolve()),
      );
    });
  }

  stop() {
    this.client?.end();
    this.client = undefined;
    this.sftp = undefined;
    this.target = undefined;
  }
}

/**
 * Why SFTP would not open on a connection that works.
 *
 * Not a port. SFTP is a subsystem *inside* the SSH connection — the same port 22, the same
 * single connection, nothing extra through a firewall. It shares three letters with FTP and
 * nothing else. The one thing that genuinely stops it is a server whose sshd has had the
 * subsystem taken out, which is rare and deliberate and worth saying precisely.
 */
function describeSftp(error: Error) {
  if (/subsystem|channel open failure|administratively prohibited/i.test(error.message)) {
    return t(
      "SFTP is switched off on this server (the sshd Subsystem sftp line). SSH itself is working.",
    );
  }
  return t("SFTP will not open: {reason}", { reason: error.message });
}

function sameTarget(a: SshTarget, b: SshTarget) {
  return a.host === b.host && a.port === b.port && a.username === b.username;
}

/** The far end is POSIX whatever this machine is, so paths are joined its way. */
export function posixJoin(directory: string, name: string) {
  return path.posix.join(directory, name);
}

/** From `ls -l`'s first character, which is the only place SFTP puts the type reliably. */
function kindOf(longname: string): RemoteEntry["kind"] {
  switch (longname[0]) {
    case "d":
      return "directory";
    case "-":
      return "file";
    case "l":
      return "link";
    default:
      return "other";
  }
}
