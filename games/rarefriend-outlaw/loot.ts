// The keepsake roll for a cracked wallet, on the table generated from KEEPSAKES.md (keepsakes.ts).
import { KEEPSAKES, KEEPSAKE_ODDS, RARITIES, type Keepsake, type KeepsakePerk, type Rarity } from "./keepsakes";

/** Roll a keepsake for an outlaw's cracked wallet: a rarity by the odds (the jackpot column for a jackpot wallet), then one of that
 * rarity's items by weight. */
export function rollKeepsake(outlaw: string, jackpot: boolean, random: () => number = Math.random): (Keepsake & { rarity: Rarity }) | null {
  const table = KEEPSAKES[outlaw]; if (!table) return null;
  const odds = jackpot ? KEEPSAKE_ODDS.jackpot : KEEPSAKE_ODDS.normal;
  let roll = random() * 100, rarity: Rarity = RARITIES[0];
  for (const [index, chance] of odds.entries()) { if (roll < chance) { rarity = RARITIES[index]; break; } roll -= chance; }
  const items = table[rarity]; if (!items.length) return null;
  let pick = random() * items.reduce((sum, item) => sum + item.weight, 0);
  for (const item of items) { if (pick < item.weight) return { ...item, rarity }; pick -= item.weight; }
  return { ...items[items.length - 1], rarity };
}
export const PERK_TEXT: Readonly<Record<KeepsakePerk, string>> = { card: "open it for a program card", slot: "+1 program slot", programs: "2 program tiles shown", power: "+1 Power", trace: "+1 trace" };
