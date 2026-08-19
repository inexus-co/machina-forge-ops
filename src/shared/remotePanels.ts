/**
 * The views that live in their own windows.
 *
 * Not the work: the work is the screen, the shell and the agent, and those stay in the main
 * window where they can be watched at once. These are what you consult — how the machine is
 * doing, what is installed on it, what is on its disk, and what the agent is allowed to be —
 * and consulting something should not cost you the thing you were watching.
 *
 * `settings` and `fleet` are the odd ones: they belong to no single host, so they open under
 * their own sentinel ids and there is one of each rather than one per server.
 */

export type PanelKind =
  | "status"
  | "inventory"
  | "karte"
  | "files"
  | "runs"
  | "settings"
  | "fleet";

/** The id the one settings window is filed under. Host ids are UUIDs, so nothing collides. */
export const SETTINGS_HOST = "__settings__";
/** The one fleet window: run one goal across many servers at once. */
export const FLEET_HOST = "__fleet__";

export type MachinaRemotePanelsApi = {
  /**
   * Open one, or bring it forward if it is already open.
   *
   * `focus` names what the window should be showing — a run id, for the record window. Passed on
   * every open because the window may already be up: the operator who presses "see the commands
   * that ran" on a second run wants that one, not the one they looked at an hour ago.
   */
  open(kind: PanelKind, hostId: string, focus?: string): Promise<PanelKind[]>;
  close(kind: PanelKind, hostId: string): Promise<PanelKind[]>;
  /** Which are open for this host. */
  list(hostId: string): Promise<PanelKind[]>;
  /** From inside a panel window: make it as tall as what is in it. */
  fit(contentHeight: number): Promise<void>;
  /** From inside a panel window: which run it was asked to show, after it was already open. */
  onFocus(listener: (focus: string) => void): () => void;
  /** Told when one is opened or closed — including by the operator closing the window itself. */
  onChange(listener: (hostId: string, open: PanelKind[]) => void): () => void;
};
