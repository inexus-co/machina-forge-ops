import { describe, expect, it } from "vitest";
import { parseRiskHint } from "./riskHint";

describe("parseRiskHint", () => {
  it("risky=true is read, with its note", () => {
    const hint = parseRiskHint('{"risky": true, "note": "system() can run any command"}');
    expect(hint).toEqual({ risky: true, note: "system() can run any command" });
  });

  it("JSON in a fence is recovered too", () => {
    const hint = parseRiskHint('```json\n{"risky": true, "note": "it deletes a file"}\n```');
    expect(hint?.risky).toBe(true);
    expect(hint?.note).toBe("it deletes a file");
  });

  it("risky=false comes back with no note", () => {
    expect(parseRiskHint('{"risky": false}')).toEqual({ risky: false, note: "" });
  });

  it("risky with an empty note is filled with the default line", () => {
    const hint = parseRiskHint('{"risky": true}');
    expect(hint?.risky).toBe(true);
    expect(hint?.note.length).toBeGreaterThan(0);
  });

  it("anything that is not JSON comes back undefined, which means no hint", () => {
    expect(parseRiskHint("I am not sure.")).toBeUndefined();
  });

  it("a note that is too long is cut", () => {
    const hint = parseRiskHint(`{"risky": true, "note": "${"x".repeat(200)}"}`);
    expect(hint?.note.length).toBeLessThanOrEqual(80);
  });
});
