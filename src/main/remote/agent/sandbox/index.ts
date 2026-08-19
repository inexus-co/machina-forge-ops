import { dockerSandbox } from "./docker";
import { linuxSandbox } from "./linux";
import { seatbelt } from "./seatbelt";

/**
 * The wall around a command that runs on this machine.
 *
 * ADR 0002 puts code execution on our side and sends the customer's server single, auditable
 * commands. This is the "our side" half: the agent gets a real shell — pipes, redirects, scripts,
 * whatever the analysis needs — and the wall is what makes that acceptable, because the operator's
 * machine holds the customers' credentials.
 *
 * **Three properties, whatever the implementation:**
 *
 * 1. writes land only in the run's work directory,
 * 2. the operator's home is not readable,
 * 3. there is no network at all.
 *
 * The third is the one that is easy to forget and worst to miss: without it `run_local` is a back
 * door, because `ssh` and `curl` are right there. The only road to the customer's server stays
 * `run_command`, with its allowlist and its record.
 *
 * Every backend is measured against those three by attempting each of them and watching it fail —
 * see `sandbox.integration.test.ts`. A backend that cannot demonstrate all three is not offered,
 * and where no backend is available the tool does not exist.
 */
export type Sandbox = {
  /** Which wall this is, for the record and for the screen. */
  readonly name: "seatbelt" | "linux" | "docker" | "none";
  /** Whether this machine can actually build it right now. */
  available(): Promise<boolean>;
  run(
    workdir: string,
    command: string,
    options?: { timeoutMs?: number },
  ): Promise<SandboxResult>;
  /**
   * Let go of whatever this work directory was holding.
   *
   * Only the container backend has anything to release; the others are a process per command.
   * Called when the run ends, at the same moment the directory itself goes.
   */
  release?(workdir: string): Promise<void>;
};

export type SandboxResult = {
  ok: boolean;
  code?: number;
  output: string;
  timedOut?: boolean;
};

/**
 * In preference order.
 *
 * The operating system's own wall first — Seatbelt on macOS, bubblewrap on Linux: a process, not
 * a virtual machine, started in milliseconds. `docker` is behind them and can be named explicitly
 * — an operator who would rather have one story on every machine gets it there too. Only one of
 * the first two can ever be available, so the order between them decides nothing.
 */
const BACKENDS: Sandbox[] = [seatbelt, linuxSandbox, dockerSandbox];

/**
 * The wall this machine can build, or nothing.
 *
 * Nothing means the tool is not offered — with one exception, which is not decided here: see
 * `consent.ts`, where a person at a machine with no mechanism to build a wall out of can take the
 * responsibility on themselves. `none` is never returned from this function.
 */
export async function chooseSandbox(preferred?: string): Promise<Sandbox | undefined> {
  const wanted = preferred ? BACKENDS.filter((each) => each.name === preferred) : BACKENDS;
  for (const backend of wanted) {
    if (await backend.available()) return backend;
  }
  return undefined;
}
