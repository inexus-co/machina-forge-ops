import { describe, expect, it } from "vitest";
import { setLocale } from "../../../shared/i18n";
import { countChanges, unifiedDiff } from "./diff";

/**
 * What a person is shown before a file on a customer's server is written.
 *
 * The thing being tested is legibility, not minimality: an approval card exists so somebody can
 * see the shape of the change, so the context lines and the "unchanged N lines" marker are the
 * behaviour that matters.
 */

const NGINX = `server {
  listen 80;
  server_name example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
  }
}`;

setLocale("en");

describe("the difference between two files", () => {
  it("the same on both sides is empty", () => {
    expect(unifiedDiff(NGINX, NGINX)).toBe("");
  });

  it("a changed line is shown with what is around it", () => {
    const after = NGINX.replace("listen 80;", "listen 8080;");
    const diff = unifiedDiff(after === NGINX ? "" : NGINX, after);
    expect(diff).toContain("-  listen 80;");
    expect(diff).toContain("+  listen 8080;");
    /* Enough of the surroundings to say which listen this is. */
    expect(diff).toContain(" server {");
    expect(diff).toContain("  server_name example.com;");
  });

  it("between two distant changes it folds, and says how many lines", () => {
    const before = ["a", ...Array.from({ length: 30 }, (_, i) => `line ${i}`), "z"].join("\n");
    const after = ["A", ...Array.from({ length: 30 }, (_, i) => `line ${i}`), "Z"].join("\n");
    const diff = unifiedDiff(before, after);
    expect(diff).toMatch(/@@ \d+ unchanged lines @@/);
    /* Folded, it is shorter than the original. */
    expect(diff.split("\n").length).toBeLessThan(before.split("\n").length);
  });

  it("it counts what was added and what was removed", () => {
    const after = `${NGINX}\n# added`;
    expect(countChanges(NGINX, after)).toEqual({ added: 1, removed: 0 });
    expect(countChanges(after, NGINX)).toEqual({ added: 0, removed: 1 });
  });
});
