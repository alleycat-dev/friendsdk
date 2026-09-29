// Balance simulator for Hack the Hardware Wallet: plays many random boards per tier with a bot that sees only what a player
// sees (revealed tiles, pip readings, the readout) and reports how often it wins, and why it loses.
//
//   node games/rarefriend-outlaw/practice/simulate.mjs [boards per tier, default 400]
//
// The bot is a careful, average player, not an optimal one: it guesses where the Secure Chip is
// from the beacons (allowing for the lying ring around a Sybil fake), flips toward the best guess while the defender counts say it is probably
// safe, only fights
// a defender when its locks block a clearly shorter way (or the guess itself, as a vault ring does), keeps
// enough Integrity to break the chip, and saves the Flash Loan for the chip. It does not go out of its way for Gas Refunds. Real players who reason about
// lies and plan detours to Gas Refunds will do better; careless ones worse. Use the win rates to compare tiers, not as
// promises about human results.
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "wallet-sim-"));
const bundle = join(temp, "wallet.mjs");
await build({ entryPoints: [resolve(here, "../wallet.ts")], bundle: true, format: "esm", platform: "node", outfile: bundle, logLevel: "error" });
const W = await import(pathToFileURL(bundle).href);
await rm(temp, { recursive: true, force: true });

const boards = Number(process.argv[2] ?? 400);

/** One bot move for the current state, or null when it has nothing sensible left to do. On the Front-Running board it first sets
 * the gas: priority only for a move that earns something (a claim, a flip onto a program it has seen, or a flip that pays a block
 * reward), normal gas for the rest, since the fee is a trace a move. */
function botMove(s, memory = new Map()) {
  const move = botChoice(s, memory);
  if (move && s.tier.twist === "frontrun") {
    const { tier, tiles } = s;
    const flip = move.type === "flip" || (move.type === "act" && !s.targeting && !W.canClaim(s, move.index) && W.canFlip(s, move.index));
    const claiming = move.type === "act" && !s.targeting && W.canClaim(s, move.index);
    const onProgram = flip && s.explored.includes(move.index) && tiles[move.index].kind === "program";
    const paysChain = flip && Math.floor(W.longestChain({ ...s, tiles: tiles.map((t, i) => (i === move.index ? { ...t, revealed: true } : t)) }) / tier.chainStep) > s.chainPaid;
    const want = claiming || onProgram || paysChain;
    if (want !== s.priority) return { type: "gas" };
  }
  return move;
}
function botChoice(s, memory = new Map()) {
  const { tier, tiles } = s, n = tier.size, d = (a, b) => W.gridDistance(n, a, b);
  const chip = tiles.findIndex(t => t.kind === "chip");
  const power = W.effectivePower(s);
  const chipCost = hp => W.killCost(hp, tier.defenders.chip.atk, power);
  const has = id => s.slots.indexOf(id);
  const run = id => ({ type: "run", slot: has(id) });
  const near = s.viruses.length ? Math.min(...s.viruses.map(v => d(v.tile, s.probe))) : Infinity;
  // A program waiting for a tile: the bot only targets when it means to, so this is the tile it chose.
  if (s.targeting) return { type: "act", index: s.pendingTarget ?? s.cursor };
  // Emergencies first: a Virus closing in, the trace nearly full, Integrity low.
  if (near <= 3 && has("antivirus") >= 0) { s.pendingTarget = s.viruses.slice().sort((a, b) => d(a.tile, s.probe) - d(b.tile, s.probe))[0].tile; return run("antivirus"); }
  if (near <= 3 && has("airdrop") >= 0) {
    // Lure it onto a standing defender if one is near it (let it chew the defender), else far from the probe.
    const v = s.viruses.reduce((a, b) => (d(a.tile, s.probe) <= d(b.tile, s.probe) ? a : b));
    const prey = tiles.map((t, i) => i).filter(i => tiles[i].revealed && W.isDefender(tiles[i].kind) && tiles[i].kind !== "chip" && tiles[i].hp > 0 && d(i, v.tile) <= 4);
    const far = tiles.map((_, i) => i).sort((a, b) => d(b, s.probe) - d(a, s.probe))[0];
    s.pendingTarget = prey.length ? prey[0] : far; return run("airdrop");
  }
  if (!tiles[chip].revealed && s.trace >= tier.traceLimit - 3 && s.grit > W.ROLLBACK_COST + 2 && has("rollback") >= 0) return run("rollback");
  if (s.trace >= 2 && has("ico") >= 0) return run("ico"); // free trace back: run it as soon as it has 2 to give
  // Margin Call: with the call open and Equity at 50% or under, sell a program (the last slot) rather than hold it.
  if (W.marginCallOpen(s) && s.slots.length && s.grit * 2 <= tier.grit) return { type: "sell", slot: s.slots.length - 1 };
  if (has("staking") >= 0) return run("staking"); // +1 Power for the rest of the board: always worth running at once
  if (has("lowslippage") >= 0) return run("lowslippage"); // the bots run on real time, which the simulator does not model: run it and move on
  if (has("investors") >= 0) return run("investors"); // free support on the pyramid: always worth running at once
  if (has("halving") >= 0 && !tiles[chip].revealed) return run("halving"); // the chip's half of the board: worth knowing at once
  // The chip is in sight: soften it with a Low Entropy first.
  if (tiles[chip].revealed && has("lowentropy") >= 0 && tiles[chip].hp > 3) { s.pendingTarget = chip; return run("lowentropy"); }
  // The chip is in sight: soften it, shield up, then break it.
  if (tiles[chip].revealed) {
    if (has("multisig") >= 0 && !s.multisig) return run("multisig");
    if (has("flashloan") >= 0 && !s.flashloan) return run("flashloan");
    return { type: "attack", index: chip };
  }
  // A lit fuse: defuse it while that is affordable.
  const reserve = chipCost(tier.defenders.chip.hp) + 1;
  const fuse = tiles.map((t, i) => i).find(i => tiles[i].kind === "alarm" && tiles[i].revealed && tiles[i].hp > 0 && (tiles[i].fuse ?? -1) > 0);
  if (fuse !== undefined && s.grit - W.killCost(tiles[fuse].hp, tier.defenders.alarm.atk, power) > reserve) return { type: "attack", index: fuse };
  // Where is the chip? Score every face-down tile by how many readings agree with it (a disagreement costs more, lies are rare).
  // Readings on the board, plus any the bot remembers from before a Rug Pull turned them face down again.
  // Only beacons tell the chip's distance; the other readings count defenders (used below to steer clear of them).
  const readings = tiles.map((t, i) => ({ t, i })).filter(({ t, i }) => t.beacon && (t.revealed || memory.has(i)) && !W.isFrozen(s, i));
  let best = -Infinity, targets = [];
  tiles.forEach((t, c) => {
    if (t.revealed || t.kind === "void" || memory.has(c) || d(c, s.start) < tier.minChipDistance) return;
    // A Halving named the half of the board the chip is in: look nowhere else.
    if (s.halved && !W.halfHolds(n, c, s.halved.half)) return;
    // A Block Explorer showed this tile: trust it.
    if (s.explored.includes(c)) { if (t.kind === "chip") { best = 1e9; targets = [c]; } return; }
    let score = 0;
    for (const { t: r, i } of readings) {
      // Readings are true under every twist now (Pump and Dump moves Power, not the readings).
      const shown = W.displayReading(s, r);
      const dist = d(i, c), agrees = dist === shown;
      score += agrees ? 1 : -3;
    }
    if (score > best) { best = score; targets = [c]; } else if (score === best) targets.push(c);
  });
  const glint = i => tiles[i].kind === "honeypot" || (tier.twist === "honeyfarm" && tiles[i].kind === "program");
  const danger = i => s.viruses.some(v => d(v.tile, i) <= 1) || (s.liquidator !== null && d(s.liquidator, i) <= 1);
  let flips = tiles.map((_, i) => i).filter(i => W.canFlip(s, i));
  // Steer clear of the Virus's reach and of glinting bait (unless there is a free slot and time to spare) when there is a choice.
  const safe = flips.filter(i => !danger(i) && (!glint(i) || (s.slots.length < tier.slots && s.trace < tier.traceLimit / 2)));
  if (safe.length) flips = safe;
  // Defender counts: a face-down tile's risk is the highest share of unexplained defenders among the counts around it (0 when a
  // revealed count of 0 touches it). Prefer the flips least likely to land on a defender.
  const risk = i => {
    let worst = 0;
    for (const r of W.gridRing(n, i)) {
      const t = tiles[r];
      if (!t.revealed || t.beacon || !["empty", "program"].includes(t.kind) || r === s.start) continue;
      const ring = W.gridRing(n, r), known = ring.filter(j => tiles[j].revealed && W.isThreat(tiles[j].kind) && tiles[j].kind !== "chip").length;
      const hidden = ring.filter(j => !tiles[j].revealed).length, left = Math.max(0, W.displayReading(s, t) - known);
      if (left === 0) return 0;
      worst = Math.max(worst, hidden ? left / hidden : 0);
    }
    return worst;
  };
  const calm = flips.filter(i => risk(i) < 0.5);
  if (calm.length) flips = calm;
  // The Ponzi pyramid: flips that cost a single trace first, if there are any.
  const cheap = flips.filter(i => W.pyramidFlipCost(s, i) === 1);
  if (cheap.length) flips = cheap;
  const frontier = flips.length ? flips : tiles.map((_, i) => i).filter(i => !tiles[i].revealed && tiles[i].kind !== "void");
  const target = targets.reduce((a, b) => (Math.min(...frontier.map(f => d(f, b))) < Math.min(...frontier.map(f => d(f, a))) ? b : a), targets[0]);
  // Early on, a Block Explorer on the best guess saves flips.
  if (has("explorer") >= 0 && target !== undefined && !s.explored.includes(target)) { s.pendingTarget = target; return run("explorer"); }
  // A defender worth fighting: it locks the guess itself (a vault ring) or a tile clearly nearer it than any flip.
  const guards = tiles.map((t, i) => ({ t, i })).filter(({ t }) => t.revealed && W.isDefender(t.kind) && t.kind !== "chip" && t.hp > 0);
  const flipDist = flips.length ? Math.min(...flips.map(f => d(f, target))) : Infinity;
  let fight = null;
  for (const { t, i } of guards) {
    const locked = W.gridNeighbours(n, i).filter(j => !tiles[j].revealed);
    if (!locked.length) continue;
    const gain = locked.includes(target) ? 99 : flipDist - Math.min(...locked.map(j => d(j, target)));
    const cost = W.killCost(t.hp, tier.defenders[t.kind].atk, power) + (t.kind === "validator" ? 0 : 0);
    const priority = t.kind === "validator" ? 2 : 0;
    if (s.grit - cost > reserve && (gain >= 3 || !flips.length) && (!fight || gain - cost + priority > fight.score)) fight = { index: i, score: gain - cost + priority, cost, kind: t.kind };
  }
  if (fight) {
    if (fight.kind === "whale" && has("multisig") >= 0 && !s.multisig) return run("multisig");
    if (fight.cost >= 3 && has("lowentropy") >= 0) { s.pendingTarget = fight.index; return run("lowentropy"); }
    return { type: "attack", index: fight.index };
  }
  // Pick up programs left on their tiles when a slot is free.
  const claimable = tiles.map((_, i) => i).find(i => W.canClaim(s, i));
  if (claimable !== undefined) return { type: "act", index: claimable };
  if (!flips.length) return null;
  return { type: "flip", index: flips.reduce((a, b) => (d(b, target) < d(a, target) ? b : a)) };
}

function play(tier) {
  let s = W.newWallet(tier);
  const memory = new Map(); // what the bot has seen, as a player would remember it through a Rug Pull
  const stats = { runs: 0, fuses: 0, bites: 0, preyBites: 0, rug: false, exit: false, slaughter: false, collapse: false };
  for (let step = 0; step < 500 && s.phase === "open"; step++) {
    for (const [i, t] of s.tiles.entries()) if (t.revealed && t.beacon) memory.set(i, t.shown);
    const move = botMove(s, memory);
    if (!move) return { won: false, why: "stuck", ...stats };
    let next = W.walletReduce(s, move);
    // A targeted program waits for its tile: hand it the bot's chosen target at once.
    if (next !== s && next.targeting && s.pendingTarget !== undefined) { const t = s.pendingTarget; next = W.walletReduce(next, { type: "act", index: t }); }
    if (next === s || (next.targeting && next.slots.length === s.slots.length)) {
      // The program would not run (for example Halving on nothing): discard it and carry on.
      next = W.walletReduce(W.walletReduce(s, { type: "cancel" }), { type: "discard", slot: move.slot ?? 0 });
      if (next === s) return { won: false, why: "stuck", ...stats };
    }
    if (next.runs > s.runs) stats.runs++;
    if (next.bite) stats.bites++;
    stats.fuses += (next.text.match(/A Tamper Alarm sounds/g) ?? []).length;
    stats.preyBites += (next.text.match(/The Virus bites the/g) ?? []).length;
    if (next.pulled && !s.pulled) stats.rug = true;
    if (next.exited && !s.exited) stats.exit = true;
    if (next.slaughtered && !s.slaughtered) stats.slaughter = true;
    if (/Ponzi Scheme collapses/.test(next.text)) stats.collapse = true;
    s = next;
  }
  if (s.phase === "won") return { won: true, grit: s.grit, trace: s.trace, stars: W.walletStars(s), ...stats };
  return { won: false, why: s.lostBy === "virus" || s.lostBy === "grit" ? "grit" : s.lostBy === "trace" ? "trace" : "other", ...stats };
}

console.log(`${boards} boards per tier\n`);
const rows = [];
console.log("tier  name       twist            size   win%  lost: integrity/trace/stuck  stars 1/2/3   runs  fuses  bites  prey  twist fired");
for (const [index, tier] of W.WALLET.entries()) {
  const started = performance.now();
  const results = Array.from({ length: boards }, () => play(tier));
  const ms = (performance.now() - started) / boards;
  const wins = results.filter(r => r.won), lost = why => results.filter(r => !r.won && r.why === why).length;
  const avg = key => (results.reduce((sum, r) => sum + (r[key] ?? 0), 0) / boards).toFixed(1);
  const pct = list => `${Math.round(100 * list.length / boards)}%`;
  const fired = tier.twist === "rugpull" ? pct(results.filter(r => r.rug)) : tier.twist === "exitscam" ? pct(results.filter(r => r.exit)) : tier.twist === "butchering" ? pct(results.filter(r => r.slaughter)) : tier.twist === "ponzi" ? pct(results.filter(r => r.collapse)) : "-";
  const stars = [1, 2, 3].map(k => `${Math.round(100 * wins.filter(r => r.stars === k).length / (wins.length || 1))}`.padStart(3)).join("");
  console.log(`${String(index + 1).padStart(4)}  ${tier.name.padEnd(9)}  ${W.TWISTS[tier.twist].name.padEnd(15)}  ${String(tier.size).padStart(2)}x${String(tier.size).padEnd(2)} ${(100 * wins.length / boards).toFixed(0).padStart(4)}%  ${`${lost("grit")}/${lost("trace")}/${lost("stuck")}`.padStart(20)}  ${stars}   ${avg("runs").padStart(4)}  ${avg("fuses").padStart(5)}  ${avg("bites").padStart(5)}  ${avg("preyBites").padStart(4)}  ${fired.padStart(6)}   ${ms.toFixed(1)} ms`);
}
