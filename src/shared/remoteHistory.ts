/**
 * What was run through this application's terminals.
 *
 * Only that. A shell's own history was read for a while and taken out again: it answers a
 * different question badly. Its file holds nothing until the shell ends, its `history` shows only
 * that one terminal's commands, another account's file is not readable without being root, and
 * when it does arrive there is no time on it unless somebody configured one. Making it complete
 * would mean editing a customer's shell configuration, which is not a maintenance tool's place.
 *
 * What is here instead is small and true: every byte typed into a terminal in this window passes
 * through the main process, so each command is written down as it is entered — with the time and
 * which terminal, neither of which bash records by default. Commands typed on the server's own
 * desktop are not here, and are not claimed to be.
 */

/** One command typed into one of this application's terminals. */
export type TypedCommand = {
  at: string;
  hostId: string;
  sessionId: string;
  /**
   * What the tab was called: "Session 2".
   *
   * Written down with the command rather than looked up later. The id is a UUID that dies with
   * the session, so a record read tomorrow could say *that* a command was typed but not where —
   * and "which session was I in" is most of what somebody asks a history for.
   */
  session?: string;
  command: string;
};

/** How the history leaves this application. */
export type HistoryFormat = "csv" | "markdown" | "json" | "pdf";

/** One row as it was on the screen, which is what gets written out. */
export type HistoryExportRow = {
  at: string;
  command: string;
  by: "agent" | "hand";
  where?: string;
  note?: string;
  output?: string;
};

export type MachinaRemoteHistoryApi = {
  read(hostId: string): Promise<TypedCommand[]>;
  /**
   * Write the rows the window is showing to a file the operator picks.
   *
   * Returns where it went, or nothing if they cancelled. The rows travel from the window because
   * the file should hold what was on screen — the same filter, the same search, the same order.
   */
  export(
    hostId: string,
    format: HistoryFormat,
    rows: HistoryExportRow[],
  ): Promise<string | undefined>;
};
