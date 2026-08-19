import fs from "node:fs/promises";
import { formatDateTime, localeTag, t } from "../../../shared/i18n";
import path from "node:path";
import { BrowserWindow, dialog } from "electron";

/**
 * The command history, written out.
 *
 * What leaves is what was on the screen — the rows after the filter and the search, in the order
 * they were shown — because "download this" means the thing being looked at, not a fresh query
 * with different rules. The window sends the rows; this side only formats and writes.
 *
 * Four shapes, because four different people ask for it: a spreadsheet (CSV), a report to paste
 * into a ticket (Markdown), something to hand a customer (PDF), and the whole record for another
 * program to read (JSON).
 */

export type ExportRow = {
  at: string;
  command: string;
  by: "agent" | "hand";
  where?: string;
  note?: string;
  output?: string;
};

export type ExportFormat = "csv" | "markdown" | "json" | "pdf";

const EXTENSIONS: Record<ExportFormat, string> = {
  csv: "csv",
  markdown: "md",
  json: "json",
  pdf: "pdf",
};

/*
 * A function, not a constant: words read at import time would be the language the application
 * started in, and would keep saying it after the operator switched (`i18n.test.ts` checks this).
 */
const namesOf = (): Record<ExportFormat, string> => ({
  csv: t("CSV (spreadsheet)"),
  markdown: t("Markdown (report)"),
  json: "JSON",
  pdf: "PDF",
});

/** `2026-08-14_0930`, for a filename somebody can sort. */
function stamp(now: Date) {
  const two = (value: number) => String(value).padStart(2, "0");
  return (
    `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}` +
    `_${two(now.getHours())}${two(now.getMinutes())}`
  );
}

const when = (at: string) => formatDateTime(at);
const who = (row: ExportRow) => (row.by === "agent" ? "Agent" : (row.where ?? t("Session")));

/** RFC 4180: quotes doubled, and the field quoted whenever it holds one, a comma or a newline. */
function cell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function asCsv(rows: ExportRow[]) {
  const lines = [
    [t("When"), t("Who"), t("Command"), t("Result"), t("Output")].join(","),
  ];
  for (const row of rows) {
    lines.push(
      [when(row.at), who(row), row.command, row.note ?? "", row.output ?? ""].map(cell).join(","),
    );
  }
  /*
   * A byte-order mark, because this is opened in Excel.
   *
   * Without it Excel on Windows reads UTF-8 as the local code page and every Japanese column
   * arrives as mojibake — which is not a thing to explain to whoever asked for the file.
   */
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function asMarkdown(rows: ExportRow[], host: string, now: Date) {
  const head = [
    t("# Command history — {host}", { host }),
    "",
    t("Written out: {when}", { when: formatDateTime(now) }),
    "",
  ];
  const table = [
    `| ${t("When")} | ${t("Who")} | ${t("Command")} | ${t("Result")} |`,
    "| --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${when(row.at)} | ${who(row)} | \`${row.command.replace(/\|/g, "\\|")}\` | ${row.note ?? ""} |`,
    ),
  ];
  /* The outputs below the table rather than inside it: a cell with forty lines in it is not a table. */
  const outputs = rows.flatMap((row) =>
    row.output
      ? ["", `### ${when(row.at)} — \`${row.command}\``, "", "```", row.output, "```"]
      : [],
  );
  return [...head, ...table, ...(outputs.length > 0 ? ["", t("## Output"), ...outputs] : []), ""].join(
    "\n",
  );
}

const escape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** The same table as the window's, as a page that prints. */
function asHtml(rows: ExportRow[], host: string, now: Date) {
  return `<!doctype html>
<html lang="${localeTag()}"><head><meta charset="utf-8" /><title>${escape(
    t("Command history — {host}", { host }),
  )}</title>
<style>
  body { font-family: -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif; color: #1a2733; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p.when { color: #5c6b7d; font-size: 11px; margin: 0 0 16px; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; }
  th, td { border-bottom: 1px solid #dce6f4; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { color: #5c6b7d; font-weight: 600; }
  td.who { white-space: nowrap; }
  td.at { white-space: nowrap; color: #5c6b7d; }
  code { font-family: ui-monospace, Menlo, monospace; }
  span.note { color: #9b3e36; font-size: 10px; margin-left: 8px; white-space: nowrap; }
  pre { background: #f5f8fc; border-radius: 6px; padding: 8px; font-size: 10px; white-space: pre-wrap; margin: 6px 0 0; }
</style></head><body>
<h1>${escape(t("Command history — {host}", { host }))}</h1>
<p class="when">${escape(
    t("Written out: {when} · {count} rows", { when: formatDateTime(now), count: rows.length }),
  )}</p>
<!--
  Three columns, not four.

  A "result" column held a word on one row in twenty and an empty cell on the rest, and an empty column is
  still a column: its heading wrapped to two lines and it took width from the commands. Where
  there is something to say, it is said next to the command it belongs to.
-->
<table><thead><tr><th>${t("When")}</th><th>${t("Who")}</th><th>${t("Command")}</th></tr></thead><tbody>
${rows
  .map(
    (row) => `<tr>
  <td class="at">${escape(when(row.at))}</td>
  <td class="who">${escape(who(row))}</td>
  <td><code>${escape(row.command)}</code>${
    row.note ? `<span class="note">${escape(row.note)}</span>` : ""
  }${row.output ? `<pre>${escape(row.output)}</pre>` : ""}</td>
</tr>`,
  )
  .join("\n")}
</tbody></table></body></html>`;
}

/**
 * A page rendered to PDF in a window nobody sees.
 *
 * `printToPDF` needs a `webContents`, so there is a window — offscreen, loaded from a data URL so
 * nothing is written to disk before the operator has chosen where the file goes, and closed in a
 * `finally` so a failure does not leave one behind.
 */
async function asPdf(html: string): Promise<Buffer> {
  const printer = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, javascript: false },
  });
  try {
    await printer.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await printer.webContents.printToPDF({
      printBackground: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    });
  } finally {
    printer.destroy();
  }
}

/** Ask where it goes, write it there. Returns the path, or nothing if the operator cancelled. */
export async function exportHistory(
  rows: ExportRow[],
  format: ExportFormat,
  host: string,
  /**
   * The window that asked, so the chooser belongs to it.
   *
   * Without a parent the save dialog is its own window — and the record window is `alwaysOnTop`,
   * so the chooser opened *behind* it: the button said "exporting…" and nothing appeared to
   * happen. Attached, it is a sheet on the window that asked for it.
   */
  parent?: BrowserWindow,
): Promise<string | undefined> {
  const now = new Date();
  const suggested = `${t("command-history_{host}_{stamp}", { host, stamp: stamp(now) })}.${EXTENSIONS[format]}`;
  const options = {
    title: t("Write out the command history"),
    defaultPath: suggested,
    filters: [{ name: namesOf()[format], extensions: [EXTENSIONS[format]] }],
  };
  const chosen =
    parent && !parent.isDestroyed()
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options);
  if (chosen.canceled || !chosen.filePath) return undefined;

  const target = path.extname(chosen.filePath)
    ? chosen.filePath
    : `${chosen.filePath}.${EXTENSIONS[format]}`;

  if (format === "pdf") {
    await fs.writeFile(target, await asPdf(asHtml(rows, host, now)));
  } else if (format === "csv") {
    await fs.writeFile(target, asCsv(rows), "utf8");
  } else if (format === "markdown") {
    await fs.writeFile(target, asMarkdown(rows, host, now), "utf8");
  } else {
    await fs.writeFile(
      target,
      `${JSON.stringify({ host, exportedAt: now.toISOString(), rows }, null, 2)}\n`,
      "utf8",
    );
  }
  return target;
}
