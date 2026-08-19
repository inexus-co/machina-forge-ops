import { describe, expect, it } from "vitest";
import { setLocale } from "../../../shared/i18n";
import type { RemoteRunDocument } from "../../../shared/remoteAgent";
import { buildReport } from "./report";

/**
 * The report follows the operator's language, so the tests pin one.
 *
 * English here because that is the source: a translation going missing shows up in the coverage
 * test, and this file is about what the document says, not which words it says it in.
 */
setLocale("en");

const run = (
  over: Partial<RemoteRunDocument> & { summary?: string },
): RemoteRunDocument & { summary?: string } => ({
  id: "r1",
  host: "web01",
  approvalMode: "step",
  startedAt: "2026-08-15T09:00:00Z",
  steps: [],
  ...over,
});

describe("buildReport", () => {
  it("gives the goal, the result and what was done, for each run", () => {
    const md = buildReport({
      hostName: "web01",
      now: "2026-08-16T00:00:00Z",
      docs: [
        run({
          goal: "look into the 502s",
          finish: "done",
          summary: "nginx had lost its upstream; a restart brought it back",
          steps: [
            { at: "t", command: "systemctl status nginx", code: 0 },
            { at: "t", command: "systemctl restart nginx", code: 0 },
          ],
        }),
      ],
    });
    expect(md).toContain("# web01 — work report");
    expect(md).toContain("look into the 502s");
    expect(md).toContain("Result：Finished — nginx had lost its upstream");
    expect(md).toContain("`systemctl restart nginx`");
  });

  it("no raw output — this goes to a customer", () => {
    const md = buildReport({
      hostName: "web01",
      now: "2026-08-16T00:00:00Z",
      docs: [
        run({
          goal: "a look round",
          finish: "done",
          steps: [{ at: "t", command: "cat /etc/passwd", code: 0, output: "root:x:0:0:..." }],
        }),
      ],
    });
    expect(md).toContain("cat /etc/passwd");
    expect(md).not.toContain("root:x:0:0");
  });

  it("a refused step says so, with the reason", () => {
    const md = buildReport({
      hostName: "web01",
      now: "2026-08-16T00:00:00Z",
      docs: [
        run({
          goal: "an inspection",
          steps: [{ at: "t", command: "rm -rf /", refused: "it was not approved" }],
        }),
      ],
    });
    expect(md).toContain("not carried out: it was not approved");
  });

  it("pseudo-steps are dropped or turned into a readable line", () => {
    const md = buildReport({
      hostName: "web01",
      now: "2026-08-16T00:00:00Z",
      docs: [
        run({
          goal: "an investigation",
          steps: [
            { at: "t", command: "[logbook] 8 lines of facts" },
            { at: "t", command: "[rule] wget → automatic" },
            { at: "t", command: "[log] /var/log/nginx/access.log 20000 lines → logs/access.log" },
            { at: "t", command: "ls /etc", code: 0 },
          ],
        }),
      ],
    });
    expect(md).not.toContain("[logbook]");
    expect(md).not.toContain("[rule]");
    expect(md).toContain("Fetched a log: /var/log/nginx/access.log");
    expect(md).toContain("`ls /etc`");
  });

  it("a record written before the source language changed is still readable", () => {
    // 記録はソースより長生きする。旧い目印（日本語）も同じ扱いで読めること
    const md = buildReport({
      hostName: "web01",
      now: "2026-08-16T00:00:00Z",
      docs: [
        run({
          goal: "an old run",
          steps: [
            { at: "t", command: "[台帳] 事実の要約8行" },
            { at: "t", command: "[取寄] /var/log/syslog 100行 → logs/syslog" },
          ],
        }),
      ],
    });
    expect(md).not.toContain("[台帳]");
    expect(md).toContain("Fetched a log: /var/log/syslog");
  });

  it("handovers go at the end", () => {
    const md = buildReport({
      hostName: "web01",
      now: "2026-08-16T00:00:00Z",
      docs: [],
      handovers: [
        { at: "2026-08-15T09:00:00Z", runId: "r1", goal: "an inspection", text: "nothing wrong" },
      ],
    });
    expect(md).toContain("## Handovers");
    expect(md).toContain("nothing wrong");
  });

  it("an empty period does not break, and says so", () => {
    const md = buildReport({ hostName: "web01", now: "2026-08-16T00:00:00Z", docs: [] });
    expect(md).toContain("There were no runs in this period.");
  });
});
