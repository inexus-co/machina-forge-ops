import type { CatalogEntry } from "../../../../shared/catalog";
import { catalogText } from "../../../../shared/i18n";
import { TIER1 } from "./tier1";
import { TIER2 } from "./tier2";

/**
 * Lookup over the shipped catalog.
 *
 * Matching is case-insensitive everywhere: PowerShell itself is case-insensitive, and on Linux
 * two programs whose names differ only in case do not occur in practice. Where the same name
 * appears in both tiers, tier 1 wins — a judgement beats a harvested description.
 */

const index = new Map<string, CatalogEntry>();
for (const entry of TIER2) index.set(entry.name.toLowerCase(), entry);
for (const entry of TIER1) index.set(entry.name.toLowerCase(), entry);

export function findCommand(name: string): CatalogEntry | undefined {
  return index.get(name.toLowerCase());
}

/** The numbers the settings screen states. `both` counts on each side; `total` is distinct. */
export function catalogCounts(): {
  linux: number;
  windows: number;
  tier1: number;
  total: number;
} {
  let linux = 0;
  let windows = 0;
  let tier1 = 0;
  for (const entry of index.values()) {
    if (entry.os !== "windows") linux += 1;
    if (entry.os !== "linux") windows += 1;
    if (entry.tier === 1) tier1 += 1;
  }
  return { linux, windows, tier1, total: index.size };
}

/**
 * Every name the catalog would let past the gate at all — shells and script-takers excluded,
 * because those are refused on the target. What the skill checker compares a skill's commands
 * against.
 */
export function catalogAllowedNames(): string[] {
  const names: string[] = [];
  for (const entry of index.values()) {
    if (entry.class !== "shell" && entry.class !== "code") names.push(entry.name);
  }
  return names;
}

/** How many results a search hands back at most. The screen caps its own display below this. */
const SEARCH_LIMIT = 200;

/**
 * Search by name or description. Name prefix beats name substring beats description substring,
 * so typing `sys` puts `systemctl` above things that merely mention it — and inside each band
 * the classified tier comes first, so an empty search shows the judged commands rather than an
 * alphabet of harvested oddities (`_cvpcb.kiface` used to open the list).
 */
export function searchCatalog(query: string, os?: "linux" | "windows"): CatalogEntry[] {
  const needle = query.trim().toLowerCase();
  const scored: Array<{ entry: CatalogEntry; score: number }> = [];
  for (const entry of index.values()) {
    if (os && entry.os !== os && entry.os !== "both") continue;
    const name = entry.name.toLowerCase();
    let score: number;
    if (!needle) score = 0;
    else if (name.startsWith(needle)) score = 4;
    else if (name.includes(needle)) score = 2;
    /*
     * Searched in the language on screen, not in the language the catalogue is written in.
     *
     * The descriptions are English now (`tier1.ts`), and an operator reading a Japanese screen
     * types Japanese. Matching only the source would mean the search box answers nothing for the
     * words the same window just displayed.
     */
    else if (catalogText(entry.summary).toLowerCase().includes(needle)) score = 0;
    else if (entry.summary.toLowerCase().includes(needle)) score = 0;
    else continue;
    scored.push({ entry, score: score + (entry.tier === 1 ? 1 : 0) });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
  return scored.slice(0, SEARCH_LIMIT).map((item) => item.entry);
}
