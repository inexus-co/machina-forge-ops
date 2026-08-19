import { formatDate, formatDateTime, t } from "../../../shared/i18n";
import type { RemoteRunDocument, ServerDossier } from "../../../shared/remoteAgent";

/**
 * A customer-facing report of what was done to a server over a period.
 *
 * Built from the run records the app already keeps, plus the dossier's handovers. Pure and
 * testable — the controller reads the files and hands them here.
 *
 * What it deliberately leaves out: the raw command output. A report goes to a customer, and a
 * command's output can carry a password it printed, a fragment of someone else's data, pages of
 * a log. The record keeps all of that for an audit; the report says what was run and how it
 * ended, not what it printed. (Commands that used a secret already have no stored output.)
 */

/** A run document may carry a `summary` (written on finish) that the shared type doesn't list. */
type RunWithSummary = RemoteRunDocument & { summary?: string };

const finishWord = (finish: string): string =>
  ({
    done: t("Finished"),
    stopped: t("Stopped"),
    error: t("Error"),
    timeout: t("Timed out"),
    question: t("Waiting for an answer"),
    limit: t("Hit the limit"),
  })[finish] ?? finish;

/**
 * A pseudo-step in the record turned into a line a customer can read, or dropped.
 *
 * The markers are matched in both spellings. They were Japanese until this project's source
 * language became English, and a record written before that has to stay readable by a report
 * written after it — the files on disk outlive the wording in the source.
 */
const marker = (command: string, ...names: string[]) =>
  names.some((name) => command.startsWith(`[${name}]`));

function describeStep(step: RemoteRunDocument["steps"][number]): string | undefined {
  const command = step.command ?? "";
  if (step.refused) return `- ${command}（${t("not carried out: {reason}", { reason: step.refused })}）`;
  if (marker(command, "logbook", "台帳", "facts", "事実")) return undefined;
  if (marker(command, "log", "取寄")) {
    return `- ${t("Fetched a log: {what}", { what: command.replace(/^\[[^\]]+\]\s*/, "") })}`;
  }
  if (marker(command, "file", "写し")) {
    return `- ${t("Fetched a file: {what}", { what: command.replace(/^\[[^\]]+\]\s*/, "") })}`;
  }
  if (marker(command, "rule", "ルール")) return undefined;
  if (marker(command, "delegated", "委譲")) return `- ${t("Ran a supporting task")}`;
  if (command.startsWith("[")) return undefined;
  const status =
    step.error !== undefined
      ? t("failed: {reason}", { reason: step.error })
      : step.timedOut
        ? t("timed out")
        : step.code === 0 || step.code === undefined
          ? t("run")
          : t("exit code {code}", { code: step.code });
  return `- \`${command}\`（${status}）`;
}

function day(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : formatDateTime(d);
}

/** One run as a Markdown section. */
function runSection(doc: RunWithSummary): string {
  const lines: string[] = [];
  lines.push(`### ${day(doc.startedAt)}　${doc.goal ?? t("(no goal was written)")}`);
  const finish = doc.finish ? finishWord(doc.finish) : t("Not finished");
  lines.push(`- ${t("Result")}：${finish}${doc.summary ? ` — ${doc.summary}` : ""}`);
  const steps = (doc.steps ?? []).map(describeStep).filter((line): line is string => Boolean(line));
  if (steps.length) {
    lines.push("");
    lines.push(`${t("What was done")}:`);
    lines.push(...steps);
  }
  return lines.join("\n");
}

/**
 * The report. `docs` are the runs to include (the controller filters by date and sorts);
 * `handovers` are the dossier notes left over the same period, already filtered.
 */
export function buildReport(input: {
  hostName: string;
  from?: string;
  to?: string;
  docs: RunWithSummary[];
  handovers?: ServerDossier["handovers"];
  now: string;
}): string {
  const dayOnly = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : formatDate(d);
  };
  const period =
    input.from || input.to
      ? t("Period: {from} to {to}", {
          from: input.from ? dayOnly(input.from) : t("the beginning"),
          to: input.to ? dayOnly(input.to) : t("now"),
        })
      : "";
  const head = [
    `# ${t("{host} — work report", { host: input.hostName })}`,
    t("Written: {when}", { when: day(input.now) }),
    period,
    "",
    t("Runs: {count}", { count: input.docs.length }),
    "",
  ].filter((line) => line !== undefined);

  const body =
    input.docs.length === 0
      ? [t("There were no runs in this period.")]
      : input.docs.map(runSection);

  const handovers = (input.handovers ?? []).filter(Boolean);
  const tail =
    handovers.length > 0
      ? [
          "",
          `## ${t("Handovers")}`,
          ...handovers.map((h) => `- ${day(h.at)}「${h.goal ?? ""}」: ${h.text}`),
        ]
      : [];

  return [...head, ...body, ...tail].join("\n\n").replace(/\n{3,}/g, "\n\n") + "\n";
}
