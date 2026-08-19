/**
 * Moving files to and from a customer's server.
 *
 * SFTP over the SSH connection that already exists. Two things worth stating about where this
 * sits:
 *
 * **The operator does this, not the agent.** `docs/decisions/0001-shell-under-a-written-guarantee.md`
 * gives the agent commands from an allowlist and nothing else; file transfer is not one of its
 * tools and is not reachable from it. This is the human using their own hands, the same as the
 * terminal beside it.
 *
 * **Nothing is added to the far end to make it work.** A customer's server was running sshd
 * before this application existed, and SFTP comes with it.
 */

export type RemoteEntry = {
  name: string;
  /** Where it is, absolute, on the far end. */
  path: string;
  kind: "file" | "directory" | "link" | "other";
  size: number;
  /** Unix mtime in milliseconds. */
  modified: number;
  /** `rwxr-xr-x`, for the times when a permission is the answer. */
  mode: string;
};

export type RemoteListing = {
  /** The directory these entries are in, absolute and resolved. */
  path: string;
  entries: RemoteEntry[];
};

/** One transfer in progress or finished. */
export type Transfer = {
  id: string;
  hostId: string;
  direction: "upload" | "download";
  /** What it is called, for the row. */
  name: string;
  /** Bytes moved and bytes total. Total is 0 while it is still being established. */
  moved: number;
  total: number;
  state: "running" | "done" | "failed" | "cancelled";
  detail?: string;
};

export type MachinaRemoteFilesApi = {
  /** What is in a directory. An empty path means the account's home. */
  list(hostId: string, path?: string): Promise<RemoteListing>;
  /** Send local files into a remote directory. Returns the transfer ids, in order. */
  upload(hostId: string, remoteDirectory: string, localPaths: string[]): Promise<string[]>;
  /** Ask for local files with a dialog, then send them. */
  chooseAndUpload(hostId: string, remoteDirectory: string): Promise<string[]>;
  /** Bring remote files here, asking where to put them. */
  download(hostId: string, remotePaths: string[]): Promise<string[]>;
  cancel(transferId: string): Promise<void>;
  /** Show a finished download in the file manager. */
  reveal(transferId: string): Promise<void>;
  onTransfer(listener: (transfer: Transfer) => void): () => void;
};
