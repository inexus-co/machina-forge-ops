import type { MachinaI18nApi } from "./i18nApi";
import type { MachinaRemoteApi } from "./remote";
import type { MachinaRemoteAgentApi } from "./remoteAgent";
import type { MachinaRemoteFilesApi } from "./remoteFiles";
import type { MachinaRemoteHistoryApi } from "./remoteHistory";
import type { MachinaRemoteInventoryApi } from "./remoteInventory";
import type { MachinaRemotePluginsApi } from "./remotePlugins";
import type { MachinaRemotePanelsApi } from "./remotePanels";
import type { MachinaRemoteRecordingApi } from "./remoteRecording";
import type { MachinaRemoteResourcesApi } from "./remoteResources";
import type { MachinaRemoteStatusApi } from "./remoteStatus";

/**
 * Everything the window may ask the main process for.
 *
 * One list, because it is the whole surface between the two processes: a renderer can reach
 * exactly what is named here and nothing else. Credentials are absent from all of it by
 * construction — a password goes in and never comes back out, and the agent's API keys are the
 * same. What crosses is state, screens, output and decisions.
 */
export type MachinaOpsApi = {
  /** Which language every window speaks, and how to change it. */
  i18n: MachinaI18nApi;
  /** The servers themselves: the list, the screen over RDP, the terminal over SSH. */
  remote: MachinaRemoteApi;
  /**
   * The agent that works on them.
   *
   * What it may run is an allowlist, every command is recorded and destructive ones stop for a
   * person. The guarantee is written down in ADR 0001 and enforced in
   * `src/main/remote/agent/policy.ts`.
   */
  remoteAgent: MachinaRemoteAgentApi;
  /**
   * What the server is and what it is doing.
   *
   * Read over the SSH connection that already exists. Nothing is installed on the far end — see
   * `remoteStatus.ts` for why that is worth saying.
   */
  remoteStatus: MachinaRemoteStatusApi;
  /**
   * What the server runs, what it lets in, and what it is writing down.
   *
   * Read-only. Changing any of it is the agent's path, where a command goes through an allowlist
   * and a person.
   */
  remoteInventory: MachinaRemoteInventoryApi;
  /** The commands typed into this application's terminals. */
  remoteHistory: MachinaRemoteHistoryApi;
  /**
   * Files to and from the server.
   *
   * The operator's, not the agent's — file transfer is not one of the agent's tools.
   */
  remoteFiles: MachinaRemoteFilesApi;
  /**
   * The screen, recorded by hand.
   *
   * The third record: a typed command writes itself down, an agent's command writes itself down,
   * and the picture wrote down nothing until this.
   */
  remoteRecording: MachinaRemoteRecordingApi;
  /** The three side views, each in a window that floats above the work. */
  remotePanels: MachinaRemotePanelsApi;
  /** The agent's own skills, prompts, extensions and instructions. */
  remoteResources: MachinaRemoteResourcesApi;
  /** Ready-made plugins for common stacks: knowledge and first sentences, installed in one click. */
  remotePlugins: MachinaRemotePluginsApi;
  platform: string;
  versions: {
    electron: string;
    chromium: string;
  };
};
