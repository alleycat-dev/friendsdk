// Turns KEEPSAKES.md (the editable drop table) into keepsakes.ts, which the game imports.
// Run after editing the Markdown:  node games/rarefriend-outlaw/tools/keepsakes.mjs
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const markdown = await readFile(join(here, "KEEPSAKES.md"), "utf8");
const RARITIES = ["Common", "Uncommon", "Rare", "Legendary"];
const cells = line => line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
const rows = markdown.split("\n").filter(line => line.trim().startsWith("|") && !/^\|\s*-/.test(line.trim()));

// Rarity odds: "| Common | 60% | 30% |".
const odds = { normal: [], jackpot: [] };
for (const rarity of RARITIES) {
  const row = rows.map(cells).find(row => row[0] === rarity);
  if (!row) throw new Error(`KEEPSAKES.md: no odds row for ${rarity}.`);
  odds.normal.push(Number.parseFloat(row[1])); odds.jackpot.push(Number.parseFloat(row[2]));
}
for (const [column, values] of Object.entries(odds)) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 100) > 0.001) throw new Error(`KEEPSAKES.md: the ${column} wallet odds add up to ${total}%, not 100%.`);
}

// One perk per keepsake, recognised from its description.
const perkOf = text => (/program card/i.test(text) ? "card" : /program slot/i.test(text) ? "slot" : /program tiles/i.test(text) ? "programs" : /\bpower\b/i.test(text) ? "power" : /\btrace\b/i.test(text) ? "trace" : null);
// A cell: items split by " / "; a trailing "(2)" is a weight; any other bracket is the item's description.
function items(cell) {
  return cell.split(" / ").map(entry => {
    let text = entry.trim(), weight = 1;
    const share = text.match(/\((\d+(?:\.\d+)?)\)\s*$/);
    if (share) { weight = Number(share[1]); text = text.slice(0, share.index).trim(); }
    const open = text.indexOf("(");
    const name = (open >= 0 ? text.slice(0, open) : text).replace(/,\s*$/, "").trim();
    const detail = open >= 0 ? text.slice(open + 1).replace(/\)+\s*$/, "").replace(/\*\*Perk\*\*:\s*/, "").trim() : "";
    const perk = /\*\*Perk\*\*/.test(text) ? perkOf(detail) : null;
    if (/\*\*Perk\*\*/.test(text) && !perk) console.warn(`KEEPSAKES.md: "${name}" is marked Perk, but its perk is not one the game knows (program card, program slot, program tiles, Power, Trace).`);
    return { name, detail, weight, ...(perk ? { perk } : {}) };
  }).filter(item => item.name);
}
const table = {};
for (const row of rows.map(cells)) {
  if (!/^\d+$/.test(row[0])) continue;
  const [, outlaw, ...columns] = row;
  table[outlaw] = Object.fromEntries(RARITIES.map((rarity, index) => [rarity, items(columns[index] ?? "")]));
}
if (!Object.keys(table).length) throw new Error("KEEPSAKES.md: no outlaw rows found.");

const source = `// Generated from KEEPSAKES.md by tools/keepsakes.mjs. Do not edit here: edit the Markdown, then run
//   node games/rarefriend-outlaw/tools/keepsakes.mjs
export type Rarity = "Common" | "Uncommon" | "Rare" | "Legendary";
export type KeepsakePerk = "card" | "slot" | "programs" | "power" | "trace";
export type Keepsake = { name: string; detail: string; weight: number; perk?: KeepsakePerk };
export const RARITIES: readonly Rarity[] = ${JSON.stringify(RARITIES)};
/** Chance of each rarity (in RARITIES order), in percent, for a normal and a jackpot wallet. */
export const KEEPSAKE_ODDS: Readonly<{ normal: readonly number[]; jackpot: readonly number[] }> = ${JSON.stringify(odds)};
/** Each outlaw's keepsakes by rarity (outlaws by their wanted-list name). */
export const KEEPSAKES: Readonly<Record<string, Readonly<Record<Rarity, readonly Keepsake[]>>>> = ${JSON.stringify(table, null, 2)};
`;
await writeFile(join(here, "keepsakes.ts"), source);
console.log(`keepsakes.ts written: ${Object.keys(table).length} outlaws, odds ${odds.normal.join("/")} (jackpot ${odds.jackpot.join("/")}).`);
