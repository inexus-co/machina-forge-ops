/**
 * A unified diff, computed here rather than on the far end.
 *
 * The customer's server is not asked to run `diff`: the current file is already on our side (a
 * config change starts by fetching it — ADR 0002), the proposed one was generated here, and
 * shelling out for something this size would be a command in the record that says nothing.
 *
 * Small on purpose. Configuration files are hundreds of lines, and what a person approves is the
 * shape of the change, not a minimal edit script.
 */

import { t } from "../../../shared/i18n";

/** Longest common subsequence of two line arrays, as a table walk. Fine for a config file. */
function commonLines(before: string[], after: string[]): number[][] {
  const table: number[][] = Array.from({ length: before.length + 1 }, () =>
    new Array<number>(after.length + 1).fill(0),
  );
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      table[i][j] =
        before[i] === after[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

export type DiffLine = { kind: " " | "-" | "+"; text: string };

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const table = commonLines(a, b);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: " ", text: a[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ kind: "-", text: a[i++] });
    } else {
      out.push({ kind: "+", text: b[j++] });
    }
  }
  while (i < a.length) out.push({ kind: "-", text: a[i++] });
  while (j < b.length) out.push({ kind: "+", text: b[j++] });
  return out;
}

/**
 * The diff as text, with a few lines of context around each change.
 *
 * Context, because a change with none is unreadable: `-listen 80;` `+listen 8080;` could be any
 * of six places in an nginx file. Unchanged runs longer than twice the context collapse to a
 * line saying how many were left out.
 */
export function unifiedDiff(before: string, after: string, context = 3): string {
  if (before === after) return "";
  const lines = diffLines(before, after);
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, index) => {
    if (line.kind === " ") return;
    for (let at = index - context; at <= index + context; at++) {
      if (at >= 0 && at < lines.length) keep[at] = true;
    }
  });

  const out: string[] = [];
  let skipped = 0;
  lines.forEach((line, index) => {
    if (!keep[index]) {
      skipped += 1;
      return;
    }
    if (skipped > 0) {
      out.push(t("@@ {count} unchanged lines @@", { count: skipped }));
      skipped = 0;
    }
    out.push(`${line.kind}${line.text}`);
  });
  if (skipped > 0) out.push(t("@@ {count} unchanged lines @@", { count: skipped }));
  return out.join("\n");
}

/** How much moved, for a one-line summary on the approval card. */
export function countChanges(before: string, after: string) {
  const lines = diffLines(before, after);
  return {
    added: lines.filter((line) => line.kind === "+").length,
    removed: lines.filter((line) => line.kind === "-").length,
  };
}
