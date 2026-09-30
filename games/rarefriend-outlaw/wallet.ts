/**
 * Hack the Hardware Wallet: the puzzle that opens once a hacker's impounded wallet trips its kill switch. Pure rules, no rendering.
 *
 * A hidden square grid is the inside of the hacker's hardware wallet, drawn as an isometric board: the player starts on the
 * leftmost corner (the USB port) and the Secure Chip is somewhere at least a few steps away. You flip face-down tiles next to
 * revealed ones; readings count the defenders around a tile, or on a beacon give the chip's distance (always true, except the
 * beacons ringing a Sybil fake); a
 * block reward of Integrity comes each time your longest chain of uncovered tiles reaches another multiple of four. Defenders strike back when you hit them and lock the tiles around
 * them (a locked tile opens only once every defender locking it is down): Firewalls are tough, Tamper Alarms are fuses that sound after a few moves, Validators
 * heal the defenders next to them and Whales hit hard. Attackers go off as they are uncovered and are then spent: Difficulty
 * Bombs and Reentrancy Attacks cost Integrity, a Hard Fork costs some and spawns a Virus, a Gas Spike makes flips dearer for two moves. Programs are found face down (or in a glinting
 * Honeypot, which also pings the tracer and wakes the Virus) and held in a few slots until you run them. Every flip advances the
 * trace; when it completes before the chip cracks (found or not), the kill switch fires. A Virus that does not know where you are finds your
 * trail of revealed tiles and follows it to your probe (the last tile you acted on), biting once, hard, when it gets next to it; it
 * bites defenders it walks onto too. From the seventh tier on the chip sits in a vault ring of defenders. A Hard Fork tile, on every
 * board with a Virus, spawns a fresh one when uncovered. Every tier also has its outlaw's twist on the rules (TWISTS).
 * Every number lives in WALLET, one row per tier. Boards are random but regenerated until a full-knowledge search finds a win.
 */

/** Defenders have HP and an attack: they strike back when hit and lock the tiles around them while they stand. */
export type DefenderKind = "wall" | "alarm" | "validator" | "whale" | "chip";
/** Attackers have an instant effect as they are uncovered, then are spent: no HP, no strike back, no locks. */
export type AttackerKind = "bomb" | "fork" | "reentrancy" | "gasspike";
/** `void`: not part of the board at all (outside the Ponzi Scheme's pyramid): never drawn, flipped, walked or counted. */
/** Cold Storage is neither: it cannot be attacked and locks nothing, but it cannot be passed, freezes every reading within two
 * tiles while it stands, and thaws (into a program tile, its program yours) once three tiles around it are revealed. */
export type WalletTileKind = "empty" | DefenderKind | AttackerKind | "cold" | "honeypot" | "program" | "drainer" | "fakechip" | "void";
export type ProgramId = "rollback" | "flashloan" | "halving" | "lowentropy" | "multisig" | "staking" | "explorer" | "airdrop" | "antivirus" | "checksum" | "lowslippage"
  | "investors" | "ico";
/** `pips`: true steps to the Secure Chip; `shown`: what the tile displays (a beacon's distance, or the defenders around it), which a
 * only the beacons ringing a Sybil fake get wrong (`decoy`). `program`: what a program tile (or a Honeypot) holds. `fuse`: moves
 * left before a revealed Tamper Alarm sounds (-1 once it has sounded). */
export type WalletTile = { kind: WalletTileKind; revealed: boolean; hp: number; pips: number; shown: number; decoy: boolean; program?: ProgramId; fuse?: number;
  /** A lying sector a Checksum has caught (it stays caught, even after a Rug Pull turns it face down again). */
  exposed?: boolean;
  /** A revealed Firewall's line of locks (Firewall-line boards): along its column ("col") or its row ("row"). */
  beam?: "col" | "row";
  /** A beacon: its reading is the chip's distance. Every other tile with a reading counts the defenders around it instead. */
  beacon?: boolean;
  /** An empty sector whose reading is gone (the Exit Scam wipes them): it shows nothing, face down or up. */
  blank?: boolean };

/** The outlaws' twists, one per tier, named for the scam. */
export type TwistId = "rugpull" | "butchering" | "exitscam" | "drainer" | "pumpdump" | "honeyfarm" | "botnet" | "sybil" | "frontrun" | "sandwich" | "ponzi" | "margincall";
export const TWISTS: Readonly<Record<TwistId, { name: string; rule: string }>> = {
  rugpull: { name: "Rug Pull", rule: "Without warning, on move 7, 8, 9 or 10, the board is pulled out from under you: it comes back the same, but every tile except the one you stand on is face down again. Remember what you saw." },
  butchering: { name: "Pig Butchering", rule: "Fattened: eight programs on the board and three slots. Selecting a program while every slot is full butchers you: nothing runs, your whole hand is gone and you lose a slot. It can happen again with two slots full, never with one." },
  exitscam: { name: "Exit Scam", rule: "At two thirds of the trace the scammer exits with the data: every empty sector's reading is wiped (uncovered ones too) and every program and Honeypot still on the board vanishes. Defenders, the chip and the programs in your slots stay." },
  drainer: { name: "Wallet Drainer", rule: "Two drainer traps lie hidden on the board. Uncover one and the hardware wallet is drained of all its valuables, your program slots with it; the second finds it already empty." },
  pumpdump: { name: "Pump and Dump", rule: "Pumped from your first flip: your Power is 4. Dumped once the trace is 60% full: your Power drops to 1." },
  honeyfarm: { name: "Honeypot Farm", rule: "Every program on this board sits in a Honeypot: nine of them, every one a ping to the tracer and a lunge of the Virus." },
  botnet: { name: "Botnet", rule: "Three Viruses hunt you from the start. The board holds eight programs: three Antivirus, two Airdrops, and three others." },
  sybil: { name: "Sybil Attack", rule: "Two fake Red Chips hide on the board; half of the tiles around each are beacons that read as if the fake were the real chip." },
  frontrun: { name: "Front-Running", rule: "At normal gas the Front Runner takes any program or block reward a move would give you. Priority gas (G) keeps them, for +1 trace a move." },
  sandwich: { name: "Sandwich Attack", rule: "Two sandwich bots keep spawning at the ends of a random row or column within two of yours and run at each other, 2 tiles a second. Caught between them, you lose 3 Integrity. Low Slippage makes you safe for 15 seconds." },
  ponzi: { name: "Ponzi Scheme", rule: "The board is Dr. Ponzi's pyramid: rows of 11, 9, 7, 5, 3 and 1 tiles, the USB port mid-base. A row supports the rows above once more than half of it is uncovered (6, 5, 4, 3, 2, 1). A flip's trace doubles for every row below it without support, checked afresh each flip." },
  margincall: { name: "Margin Call", rule: "Integrity is Equity here, 100% to 0%. At 60% Equity you may sell a program (right-click it) for +10% Equity, three times. At 40% every program you hold is force-sold for +5% each; with none to sell, +3 trace for +10% Equity. Three times too. At 40% The Liquidator also appears four tiles from you and comes a tile a move; reach you and you are liquidated: Equity 10%, the board seized. Every eighth move the market flash-crashes for two moves: Power 1, strike-backs and bites doubled." },
};

export const PROGRAMS: Readonly<Record<ProgramId, { name: string; target: boolean; rule: string }>> = {
  rollback: { name: "Rollback", target: false, rule: "Reorg the chain: the trace goes back 3, for 2 Integrity (it needs more than 2)." },
  ico: { name: "ICO", target: false, rule: "Raise funds: the trace goes back 2, free." },
  flashloan: { name: "Flash Loan", target: false, rule: "Your next hit deals double and takes no strike back." },
  halving: { name: "Halving", target: false, rule: "Halve the search: the half of the board holding the Secure Chip (top, bottom, left or right) shines gold for five seconds." },
  lowentropy: { name: "Low Entropy", target: true, rule: "Pick a revealed defender, the Secure Chip included: its key weakens and its HP is halved." },
  multisig: { name: "Multisig", target: false, rule: "The next two strike-backs need more signatures: they are blocked." },
  staking: { name: "Staking", target: false, rule: "+1 Power for the rest of the board." },
  explorer: { name: "Block Explorer", target: true, rule: "Pick a face-down tile: it shows what it holds. Two picks on boards of 8 and 9, three from 10." },
  airdrop: { name: "Airdrop", target: true, rule: "Pick a tile: every Virus heads for the free tokens instead of you, and stops there to feed." },
  antivirus: { name: "Antivirus", target: true, rule: "Pick a Virus's tile: that Virus is wiped." },
  checksum: { name: "Checksum", target: false, rule: "Every lying beacon you have uncovered (the ring around a Sybil fake) is marked red. Later finds need another Checksum." },
  lowslippage: { name: "Low Slippage", target: false, rule: "The sandwich bots cannot hurt you for 15 seconds." },
  investors: { name: "Rob Peter to pay Paul", target: false, rule: "One empty sector is uncovered for free on the lowest required pyramid row." },
};

export type WalletTier = Readonly<{
  name: string; size: number; grit: number; draw: number; minChipDistance: number; twist: TwistId;
  /** Trace steps allowed before the kill switch fires; each flip is one step. */
  traceLimit: number;
  /** Pips read exactly up to this many steps; farther shows "far". */
  /** Defenders and specials on the board (the Secure Chip is always exactly one). */
  counts: Readonly<Record<DefenderKind | AttackerKind | "cold" | "program" | "honeypot", number>>;
  /** The board is a pyramid (the Ponzi Scheme): only the tiles pyramidLevel accepts exist; the rest are void. */
  pyramid?: boolean;
  defenders: Readonly<Record<DefenderKind, { hp: number; atk: number }>>;
  /** Program slots, and which programs can turn up on this board. */
  slots: number; programPool: readonly ProgramId[];
  /** Programs the board must hold: these fill the first program tiles placed, the rest are drawn from the pool. */
  guaranteed?: readonly ProgramId[];
  /** Programs the pool never draws on this board (the guaranteed ones are unaffected). */
  excluded?: readonly ProgramId[];
  /** Trace a revealed Tamper Alarm adds when its fuse runs out, and its fuse in moves; extra trace a Honeypot pings. */
  alarmTrace: number; fuse: number; honeypotTrace: number;
  /** Integrity paid for uncovering an empty sector the first time (up to the start value). */
  /** The block reward: Integrity paid each time your longest chain (`longestChain`) reaches another multiple of `chainStep`. */
  blockReward: number; chainStep: number;
  /** Firewall lines (every board): a Firewall you reveal raises a line of locks through itself, across the way you came
   * (reached from the side, the line runs along its column; from above or below, along its row), edge to edge while it stands. */
  firewallLine?: boolean;
  /** The Secure Chip sits in a vault ring: every tile next to it is a defender. */
  vault?: boolean;
  /** Viruses at the start, how often each steps (moves per step, 0 = none) and how much a bite takes. */
  viruses: number; virusEvery: number; virusBite: number;
}>;

// Damage runs heavier than Integrity (Integrity was raised by half, strike-backs doubled; bites were then halved back), so every hit is a bigger share
// of what you have and the block reward tops you up rather than healing you whole.
const DEFENDERS = (chip: number) => ({ wall: { hp: 6, atk: 2 }, alarm: { hp: 3, atk: 4 }, validator: { hp: 4, atk: 2 }, whale: { hp: 3, atk: 8 }, chip: { hp: chip, atk: 2 } });
/** The attackers' instant effects: what a Difficulty Bomb and a Reentrancy Attack take when uncovered, and how many moves a Gas
 * Spike makes flips cost GAS_COST trace. */
export const BOMB_DAMAGE = 3, REENTRANCY_DAMAGE = 2, FORK_DAMAGE = 2, GAS_MOVES = 2, GAS_COST = 2;
/** Cold Storage: how far its frost reaches (a square, in tiles), and how many revealed neighbours thaw it. */
export const COLD_REACH = 2, COLD_THAW = 3;
/** What a Rollback costs in Integrity, and how much trace an ICO gives back. */
export const ROLLBACK_COST = 2, ICO_REFUND = 2;
/** The Margin Call board, where Integrity is Equity (a share of the tier's full Integrity): the Equity at which you may sell a
 * program and what a sale pays, how many sales; the Equity at which forced selling strikes, what each program fetches, the trace
 * penalty and Equity gain when there is nothing to sell, how many times. */
export const EQUITY = { margin: 0.6, sale: 0.1, sales: 3, forced: 0.4, forcedEach: 0.05, penaltyTrace: 3, penaltyGain: 0.1, forcedTimes: 3, liquidated: 0.1, liquidatorFrom: 4 };
/** The Margin Call board's Flash Crash: every `every` moves the market crashes for the last `lasts` of them (Power 1, strike-backs
 * and bites doubled), announced the move before. */
export const FLASH = { every: 8, lasts: 2 };
const flashPhase = (s: WalletState) => s.moves % FLASH.every;
/** The market is crashed for the next move (moves counts the moves made so far). */
export const flashCrashing = (s: WalletState) => s.tier.twist === "margincall" && flashPhase(s) >= FLASH.every - FLASH.lasts;
/** The crash starts on the next move. */
export const flashLooming = (s: WalletState) => s.tier.twist === "margincall" && flashPhase(s) === FLASH.every - FLASH.lasts - 1;
/** Crashed moves left, counting the next one. */
export const flashLeft = (s: WalletState) => (flashCrashing(s) ? FLASH.every - flashPhase(s) : 0);
/** Integrity as a share of full, and a share of full as whole Integrity points. */
export const equityOf = (s: WalletState) => s.grit / s.tier.grit;
export const equityPoints = (tier: WalletTier, share: number) => Math.round(tier.grit * share);
/** A margin call is open: on the Margin Call board, at or under the margin, with sales left. Right-click a program to sell it. */
export const marginCallOpen = (s: WalletState) => s.phase === "open" && s.tier.twist === "margincall" && equityOf(s) <= EQUITY.margin && s.sales < EQUITY.sales;
const POOL: readonly ProgramId[] = ["rollback", "ico", "flashloan", "halving", "lowentropy", "multisig", "staking", "explorer", "airdrop", "antivirus", "checksum", "lowslippage", "investors"];
const BASE = { draw: 2, slots: 2, programPool: POOL, alarmTrace: 3, fuse: 3, honeypotTrace: 2, blockReward: 1, chainStep: 5, viruses: 1 };
const C = (wall: number, alarm: number, validator: number, whale: number, bomb: number, fork: number, reentrancy: number, gasspike: number, cold: number, program: number, honeypot: number) => ({ wall, alarm, validator, whale, chip: 1, bomb, fork, reentrancy, gasspike, cold, program, honeypot });
/** One row per outlaw on the wanted list (Pumper & Dumper share the fifth), each with that outlaw's twist. The board grows every two
 * outlaws, 7 x 7 to 11 x 11; defender roles, programs and Viruses build up along the list, and from the seventh board the chip sits in
 * a vault ring with a third program slot. The Integrity and trace were tuned with practice/simulate.mjs so the simulated player's win
 * rate falls from the first board to the last (the comment on each row). */
export const WALLET: readonly WalletTier[] = [
  { ...BASE, twist: "rugpull", firewallLine: true, name: "Rookie", size: 7, grit: 10, minChipDistance: 4, traceLimit: 17, viruses: 0, virusEvery: 2, virusBite: 4,
    counts: C(1, 1, 0, 0, 1, 0, 1, 0, 0, 4, 0), defenders: DEFENDERS(6) }, // 1: bot wins pending (rescaled)
  { ...BASE, twist: "butchering", firewallLine: true, slots: 3, name: "Novice", size: 7, grit: 12, minChipDistance: 4, traceLimit: 19, virusEvery: 2, virusBite: 4,
    counts: C(1, 1, 0, 1, 1, 0, 1, 0, 0, 8, 1), defenders: DEFENDERS(6) }, // 2: fattened (8 programs, 3 slots); bot wins pending (rescaled)
  { ...BASE, twist: "exitscam", firewallLine: true, name: "Seasoned", size: 7, grit: 13, minChipDistance: 5, traceLimit: 20, virusEvery: 2, virusBite: 5,
    counts: C(1, 1, 1, 0, 1, 1, 1, 0, 1, 5, 1), defenders: DEFENDERS(6) }, // 3: bot wins pending (rescaled)
  { ...BASE, twist: "drainer", firewallLine: true, name: "Hardened", size: 8, grit: 14, minChipDistance: 5, traceLimit: 21, virusEvery: 2, virusBite: 5,
    counts: C(1, 2, 1, 1, 1, 1, 1, 1, 1, 5, 1), defenders: DEFENDERS(6) }, // 4: bot wins pending (rescaled)
  { ...BASE, twist: "pumpdump", firewallLine: true, guaranteed: ["flashloan", "lowentropy", "staking"], name: "Veteran", size: 8, grit: 15, minChipDistance: 6, traceLimit: 25, virusEvery: 2, virusBite: 6,
    counts: C(2, 2, 1, 0, 2, 1, 1, 1, 1, 6, 1), defenders: DEFENDERS(8) }, // 5: bot wins pending (rescaled)
  { ...BASE, twist: "honeyfarm", firewallLine: true, name: "Expert", size: 8, grit: 15, minChipDistance: 6, traceLimit: 26, virusEvery: 2, virusBite: 6,
    counts: C(2, 2, 1, 1, 2, 1, 1, 1, 1, 0, 9), defenders: DEFENDERS(8) }, // 6: all nine specials are Honeypots; bot wins pending (rescaled)
  { ...BASE, twist: "botnet", firewallLine: true, vault: true, slots: 3, guaranteed: ["antivirus", "antivirus", "antivirus", "airdrop", "airdrop"], excluded: ["antivirus", "airdrop"], name: "Elite", size: 9, grit: 20, minChipDistance: 7, traceLimit: 26, viruses: 3, virusEvery: 2, virusBite: 6,
    counts: C(2, 2, 1, 1, 2, 1, 2, 2, 1, 8, 1), defenders: DEFENDERS(8) }, // 7: three Viruses, eight programs (3 Antivirus + 2 Airdrop + 3 others); bot wins pending (rescaled)
  { ...BASE, twist: "sybil", firewallLine: true, vault: true, slots: 3, guaranteed: ["halving", "halving"], name: "Master", size: 9, grit: 19, minChipDistance: 7, traceLimit: 26, virusEvery: 1, virusBite: 7,
    counts: C(2, 3, 1, 1, 2, 1, 2, 2, 1, 6, 1), defenders: DEFENDERS(8) }, // 8: bot wins pending (rescaled)
  { ...BASE, twist: "frontrun", firewallLine: true, vault: true, slots: 3, name: "Champion", size: 10, grit: 19, minChipDistance: 8, traceLimit: 26, virusEvery: 1, virusBite: 7,
    counts: C(3, 3, 2, 1, 2, 1, 3, 2, 2, 7, 1), defenders: DEFENDERS(10) }, // 9: bot wins pending (rescaled)
  { ...BASE, twist: "sandwich", firewallLine: true, vault: true, slots: 3, guaranteed: ["lowslippage", "lowslippage", "lowslippage"], name: "Legend", size: 10, grit: 19, minChipDistance: 8, traceLimit: 26, virusEvery: 1, virusBite: 8,
    counts: C(3, 3, 2, 2, 2, 1, 3, 2, 2, 7, 1), defenders: DEFENDERS(10) }, // 10: bot wins pending (rescaled)
  { ...BASE, twist: "ponzi", pyramid: true, firewallLine: true, vault: true, slots: 3, excluded: ["halving"], guaranteed: ["investors", "investors"], name: "Mythic", size: 11, grit: 17, minChipDistance: 3, traceLimit: 24, viruses: 0, virusEvery: 1, virusBite: 8,
    counts: C(2, 2, 1, 1, 1, 0, 2, 1, 1, 5, 1), defenders: DEFENDERS(10) }, // 11: a 36-tile pyramid (11/9/7/5/3/1); bot wins pending (rescaled)
  { ...BASE, twist: "margincall", firewallLine: true, vault: true, slots: 3, name: "Boss", size: 11, grit: 20, minChipDistance: 9, traceLimit: 27, virusEvery: 1, virusBite: 9,
    counts: C(3, 4, 2, 2, 3, 1, 4, 3, 2, 9, 1), defenders: DEFENDERS(10) }, // 12: ten programs (nine tiles and a Honeypot); Integrity is Equity, 20 points = 100% (so 5% is a point); bot wins pending (rescaled)
];
/** The tier for the outlaw at `level` (0-based position in the wanted list), the last tier beyond the list. */
export const walletTierFor = (level: number): WalletTier => WALLET[Math.max(0, Math.min(WALLET.length - 1, level))];

export const isDefender = (kind: WalletTileKind): kind is DefenderKind => kind === "wall" || kind === "alarm" || kind === "validator" || kind === "whale" || kind === "chip";
export const isAttacker = (kind: WalletTileKind): kind is AttackerKind => kind === "bomb" || kind === "fork" || kind === "reentrancy" || kind === "gasspike";
/** What the readings count around a tile: defenders, attackers and Cold Storage alike (the chip excepted). */
export const isThreat = (kind: WalletTileKind) => isDefender(kind) || isAttacker(kind) || kind === "cold";
/** A revealed Cold Storage still frozen (hp above 0; it thaws to 0). */
export const isFrozenCold = (tile: WalletTile) => tile.kind === "cold" && tile.revealed && tile.hp > 0;
/** A reading frozen by a Cold Storage within COLD_REACH (a square around it): shown as frost until it thaws. */
export function isFrozen(state: WalletState, index: number): boolean {
  const n = state.tier.size, col = index % n, row = Math.floor(index / n);
  return state.tiles.some((t, i) => isFrozenCold(t) && Math.abs(i % n - col) <= COLD_REACH && Math.abs(Math.floor(i / n) - row) <= COLD_REACH);
}
/** How many tiles around a Cold Storage are revealed (what thaws it at COLD_THAW). */
export const coldRevealed = (state: WalletState, index: number) => gridNeighbours(state.tier.size, index).filter(i => state.tiles[i].revealed).length;
/** How many tiles one Block Explorer shows: one on 7 x 7 (and smaller), two on 8 x 8 and 9 x 9, three on 10 x 10 and 11 x 11. */
export const explorerPicks = (size: number) => (size >= 10 ? 3 : size >= 8 ? 2 : 1);
/** The halves of the board a Halving can light up. On an odd-sized board the middle row (or column) belongs to both halves. */
export type BoardHalf = "top" | "bottom" | "left" | "right";
export function halfHolds(size: number, index: number, half: BoardHalf): boolean {
  const col = index % size, row = Math.floor(index / size), low = Math.ceil(size / 2), high = Math.floor(size / 2);
  return half === "top" ? row < low : half === "bottom" ? row >= high : half === "left" ? col < low : col >= high;
}
/** The Ponzi Scheme's pyramid on a `size`-wide grid: its base is the grid's last row (on screen, the edge from the board's left
 * point to its bottom point), every row above is one tile shorter at each end, the apex is a single tile in the middle. A tile's
 * level counts from the base (0), or -1 outside the pyramid. */
export function pyramidLevel(size: number, index: number): number {
  const col = index % size, row = Math.floor(index / size), k = size - 1 - row;
  return k <= (size - 1) / 2 && col >= k && col <= size - 1 - k ? k : -1;
}
export const pyramidLevels = (size: number) => Math.floor((size - 1) / 2) + 1;
export const pyramidWidth = (size: number, level: number) => size - 2 * level;
/** How many tiles a level needs uncovered to support the levels above it: more than half (6, 5, 4, 3, 2, 1 on 11 wide). */
export const pyramidQuota = (size: number, level: number) => Math.ceil(pyramidWidth(size, level) / 2);
export const pyramidRevealed = (state: WalletState, level: number) => state.tiles.filter((t, i) => t.revealed && pyramidLevel(state.tier.size, i) === level).length;
export const pyramidSupported = (state: WalletState, level: number) => pyramidRevealed(state, level) >= pyramidQuota(state.tier.size, level);
/** The trace a flip costs on the pyramid: 1, doubled for every level below the tile's that lacks its support right now. */
export function pyramidFlipCost(state: WalletState, index: number): number {
  if (!state.tier.pyramid) return 1;
  let cost = 1;
  for (let level = 0; level < pyramidLevel(state.tier.size, index); level++) if (!pyramidSupported(state, level)) cost *= 2;
  return cost;
}
/** Tiles about a board-width from `from` (the Virus's lairs), or, on a board too small for that, the farthest tiles there are. */
function farTiles(tiles: readonly WalletTile[], size: number, from: number): number[] {
  const on = tiles.map((_, index) => index).filter(index => tiles[index].kind !== "void" && tiles[index].kind !== "chip");
  const want = Math.min(size, Math.max(...on.map(index => gridDistance(size, from, index))));
  return on.filter(index => Math.abs(gridDistance(size, from, index) - want) <= 1);
}
/** How long the golden sheen of a Halving stays on the board, in milliseconds. */
export const HALVING_SHEEN_MS = 5000;
/** The Sandwich Attack's bots: how fast they run (tiles a second), how long after a pair is gone the next appears, what a sandwich
 * costs, and how long Low Slippage protects you. The board's clock only runs on that twist. */
export const BOT_SPEED = 2, BOT_RESPAWN_MS = 1000, SANDWICH_DAMAGE = 3, LOW_SLIPPAGE_MS = 15000, BOT_NEAR = 2;
/** A pair of sandwich bots on one row or column (`line`), each `a` and `b` tiles in from its own end (fractional: they glide). */
export type SandwichBots = { axis: "row" | "col"; line: number; a: number; b: number };
export const gridDistance = (size: number, a: number, b: number) => Math.abs((a % size) - (b % size)) + Math.abs(Math.floor(a / size) - Math.floor(b / size));
export function gridNeighbours(size: number, index: number): number[] {
  const col = index % size, row = Math.floor(index / size), out: number[] = [];
  if (col > 0) out.push(index - 1);
  if (col < size - 1) out.push(index + 1);
  if (row > 0) out.push(index - size);
  if (row < size - 1) out.push(index + size);
  return out;
}
/** Integrity lost killing a defender that strikes back after every hit it survives. */
export const killCost = (hp: number, atk: number, draw: number) => Math.max(0, Math.ceil(Math.max(0, hp) / Math.max(1, draw)) - 1) * atk;
/** The eight tiles around a tile (diagonals included), for a sector's defender count. */
export const gridRing = (size: number, index: number) => {
  const c = index % size, r = Math.floor(index / size), out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && c + dc >= 0 && c + dc < size && r + dr >= 0 && r + dr < size) out.push((r + dr) * size + c + dc);
  return out;
};
/** Where the beacons go: the board is cut into 3 x 3 blocks from the top-left corner and every block gets exactly two beacons,
 * placed at random among its tiles that carry a reading (a block with fewer than two such tiles gets what it has). Tiles in
 * the strips left over on the right and bottom edges (boards not a multiple of 3 wide) are beacons one time in five. */
export function beaconSpots(size: number, readable: (index: number) => boolean, random: () => number): Set<number> {
  const beacons = new Set<number>(), blocks = Math.floor(size / 3);
  for (let by = 0; by < blocks; by++) for (let bx = 0; bx < blocks; bx++) {
    const cells: number[] = [];
    for (let r = by * 3; r < by * 3 + 3; r++) for (let c = bx * 3; c < bx * 3 + 3; c++) if (readable(r * size + c)) cells.push(r * size + c);
    for (let picked = 0; picked < 2 && cells.length; picked++) beacons.add(cells.splice(Math.floor(random() * cells.length), 1)[0]);
  }
  for (let index = 0; index < size * size; index++) {
    const inStrip = index % size >= blocks * 3 || Math.floor(index / size) >= blocks * 3;
    if (inStrip && readable(index) && random() < 0.2) beacons.add(index);
  }
  return beacons;
}

/** `virusStarts`: where the Viruses appear, random tiles about a board-width from the USB port. */
export type WalletBoard = { tiles: WalletTile[]; start: number; virusStarts: number[] };

/** With full knowledge, is there a win inside both budgets? For every choice of guards to kill, the cheapest trace to the chip runs
 * through empty sectors, programs and those dead guards (Honeypots are avoided), and the Integrity cost is every killed guard plus
 * the chip. Programs, block rewards, locks and the Virus are left out, so the check is conservative about everything but the
 * Virus and the twists (which the simulator measures instead). Only the nearest guards are considered on big boards, to stay fast. */
export function walletSolvable(board: WalletBoard, tier: WalletTier): boolean {
  const { tiles, start } = board, size = tier.size, chip = tiles.findIndex(tile => tile.kind === "chip");
  if (chip < 0) return false;
  const guards = tiles.map((tile, index) => ({ tile, index })).filter(({ tile }) => isDefender(tile.kind) && tile.kind !== "chip")
    .sort((a, b) => gridDistance(size, a.index, chip) - gridDistance(size, b.index, chip)).slice(0, 11).map(({ index }) => index);
  const far = new Set(tiles.map((_, i) => i).filter(i => isDefender(tiles[i].kind) && tiles[i].kind !== "chip" && !guards.includes(i)));
  for (let mask = 0; mask < 1 << guards.length; mask++) {
    const dead = new Set(guards.filter((_, bit) => mask & (1 << bit)));
    const passable = (index: number) => {
      const kind = tiles[index].kind;
      return kind !== "chip" && kind !== "void" && kind !== "honeypot" && !far.has(index) && (!isDefender(kind) || dead.has(index));
    };
    const dist = new Array<number>(tiles.length).fill(Infinity); dist[start] = 0;
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const here = queue[head];
      for (const next of gridNeighbours(size, here)) if (dist[next] === Infinity && passable(next)) { dist[next] = dist[here] + 1; queue.push(next); }
    }
    const reach = Math.min(...gridNeighbours(size, chip).map(index => dist[index])) + 1;
    if (reach > tier.traceLimit) continue;
    const cost = [...dead].reduce((sum, index) => sum + killCost(tier.defenders[tiles[index].kind as DefenderKind].hp, tier.defenders[tiles[index].kind as DefenderKind].atk, tier.draw), 0)
      + killCost(tier.defenders.chip.hp, tier.defenders.chip.atk, tier.draw);
    if (tier.grit - cost > 0) return true;
  }
  return false;
}


/** A random board: start on the leftmost corner of the isometric board (column 0, last row), the Secure Chip at least
 * `minChipDistance` steps away (ringed by defenders on vault tiers), defenders, programs and Honeypots scattered, pip
 * readings on the empty tiles (true, apart from the beacons around a Sybil fake), regenerated until
 * walletSolvable passes. */
/** The programs a tier can deal: its pool less the ones that would do nothing there (Virus programs without a Virus, Checksum
 * off the Sybil board, Low Slippage off the Sandwich board) and the tier's own exclusions. */
export function programsDealt(tier: WalletTier): ProgramId[] {
  return tier.programPool.filter(id => ((id !== "airdrop" && id !== "antivirus") || tier.viruses > 0) && (id !== "checksum" || tier.twist === "sybil")
    && (id !== "lowslippage" || tier.twist === "sandwich") && (id !== "investors" || !!tier.pyramid) && !(tier.excluded ?? []).includes(id));
}

export function generateWallet(tier: WalletTier, random: () => number = Math.random): WalletBoard {
  const size = tier.size, n = size * size;
  let last: WalletBoard | null = null;
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  for (let attempt = 0; attempt < 2000; attempt++) {
    const tiles: WalletTile[] = Array.from({ length: n }, () => ({ kind: "empty", revealed: false, hp: 0, pips: 0, shown: 0, decoy: false }));
    // A pyramid board: everything outside the pyramid is void, and the USB port sits in the middle of the base.
    const inShape = (index: number) => !tier.pyramid || pyramidLevel(size, index) >= 0;
    if (tier.pyramid) tiles.forEach((tile, index) => { if (!inShape(index)) tile.kind = "void"; });
    const start = tier.pyramid ? (size - 1) * size + Math.floor(size / 2) : (size - 1) * size;
    const free = tiles.map((_, index) => index).filter(index => inShape(index) && index !== start && gridDistance(size, start, index) > 1).sort(() => random() - 0.5);
    // On a pyramid the chip is the apex (the climb is the point); its vault ring is whatever of its neighbours the pyramid holds.
    const chip = tier.pyramid ? (size - 1 - (pyramidLevels(size) - 1)) * size + Math.floor(size / 2)
      : pick(free.filter(index => gridDistance(size, start, index) >= tier.minChipDistance));
    tiles[chip] = { ...tiles[chip], kind: "chip", hp: tier.defenders.chip.hp };
    const c = tier.counts;
    const wanted: WalletTileKind[] = [
      ...Array<"wall">(c.wall).fill("wall"), ...Array<"alarm">(c.alarm).fill("alarm"), ...Array<"validator">(c.validator).fill("validator"),
      ...Array<"whale">(c.whale).fill("whale"),
      ...Array<"bomb">(c.bomb).fill("bomb"), ...Array<"fork">(c.fork).fill("fork"), ...Array<"reentrancy">(c.reentrancy).fill("reentrancy"), ...Array<"gasspike">(c.gasspike).fill("gasspike"),
      ...Array<"cold">(c.cold).fill("cold"),
      ...Array<"program">(c.program).fill("program"), ...Array<"honeypot">(c.honeypot).fill("honeypot"),
    ];
    const pool = programsDealt(tier);
    const must = [...(tier.guaranteed ?? [])];
    const place = (index: number, kind: WalletTileKind) => {
      tiles[index] = { ...tiles[index], kind, hp: isDefender(kind) ? tier.defenders[kind].hp : kind === "cold" ? 8 : 0, ...(kind === "program" ? { program: must.shift() ?? pick(pool) } : kind === "honeypot" ? { program: pick(pool) } : {}) };
    };
    const ring = tier.vault ? gridNeighbours(size, chip).filter(inShape) : [];
    // No Firewall stands on an edge tile (the outer rows and columns).
    const edge = (index: number) => tier.pyramid ? gridNeighbours(size, index).length < 4 || gridNeighbours(size, index).some(other => !inShape(other))
      : index % size === 0 || index % size === size - 1 || index < size || index >= n - size;
    // The vault ring: every tile next to the chip takes one of the board's defenders (Firewalls first, but never on an edge), extra
    // Firewalls if short (a Validator on an edge).
    // A Cold Storage, if the board has one, takes the first ring tile off the edge: a way in that must be thawed, not fought.
    let ringCold = false;
    for (const index of ring) {
      const cold = !ringCold && !edge(index) ? wanted.indexOf("cold") : -1;
      if (cold >= 0) ringCold = true;
      const at = cold >= 0 ? cold : !edge(index) && wanted.indexOf("wall") >= 0 ? wanted.indexOf("wall") : wanted.findIndex(kind => isDefender(kind) && (kind !== "wall" || !edge(index)));
      place(index, at >= 0 ? wanted.splice(at, 1)[0] : edge(index) ? "validator" : "wall");
    }
    // Firewalls go on inner tiles first, then everything else fills the tiles left.
    const rest = free.filter(index => index !== chip && !ring.includes(index)), inner = rest.filter(index => !edge(index));
    const walls = wanted.filter(kind => kind === "wall"), others = wanted.filter(kind => kind !== "wall");
    walls.forEach((kind, i) => place(inner[i], kind));
    const used = new Set(inner.slice(0, walls.length));
    // Cold Storage never sits on an edge tile (the outer rows and columns; on the pyramid, any tile at its outline, the whole base
    // row included); everything else fills the tiles left.
    const colds = others.filter(kind => kind === "cold"), plain = others.filter(kind => kind !== "cold");
    const coldSpots = rest.filter(index => !used.has(index) && !edge(index));
    colds.forEach((kind, i) => { place(coldSpots[i], kind); used.add(coldSpots[i]); });
    rest.filter(index => !used.has(index)).slice(0, plain.length).forEach((index, i) => place(index, plain[i]));
    // Wallet Drainer: two drainer traps on random free tiles.
    if (tier.twist === "drainer") rest.filter(index => tiles[index].kind === "empty").slice(0, 2).forEach(index => place(index, "drainer"));
    // Empty sectors, program tiles and Honeypots (the start excepted) carry a reading. Beacons (two per 3 x 3 block, beaconSpots)
    // read the chip's distance, exactly;
    // the rest count the defenders (the chip not included) in the eight tiles around them, like Minesweeper.
    const readsPips = (index: number) => ["empty", "program", "honeypot"].includes(tiles[index].kind) && index !== start;
    const beacons = beaconSpots(size, readsPips, random);
    for (let index = 0; index < n; index++) {
      const tile = tiles[index];
      tile.pips = gridDistance(size, index, chip);
      if (!readsPips(index)) continue;
      tile.beacon = beacons.has(index);
      tile.shown = tile.beacon ? tile.pips : gridRing(size, index).filter(j => isThreat(tiles[j].kind) && tiles[j].kind !== "chip").length;
    }
    // The Sybil Attack: two fake Red Chips well away from the real chip. Half of the tiles around each become beacons that read the
    // distance to the fake (so the ring says "the chip is here"; liars a Checksum can catch); the other half read defender counts,
    // so no true beacon next to a fake gives it away.
    if (tier.twist === "sybil") {
      const fakes: number[] = [];
      const spots = tiles.map((_, index) => index).filter(index => tiles[index].kind === "empty" && index !== start && gridDistance(size, index, chip) >= 4 && gridDistance(size, index, start) >= 3).sort(() => random() - 0.5);
      for (const index of spots) {
        if (fakes.length >= 2) break;
        if (fakes.some(other => gridDistance(size, other, index) < 4)) continue;
        fakes.push(index);
      }
      for (const fake of fakes) {
        tiles[fake] = { ...tiles[fake], kind: "fakechip", beacon: false, shown: 0, decoy: false };
        const ring = gridRing(size, fake).filter(readsPips).sort(() => random() - 0.5);
        ring.forEach((around, i) => {
          if (i < Math.ceil(ring.length / 2)) {
            const lie = gridDistance(size, around, fake);
            tiles[around] = { ...tiles[around], beacon: true, shown: lie, decoy: lie !== tiles[around].pips };
          } else {
            const count = gridRing(size, around).filter(j => isThreat(tiles[j].kind) && tiles[j].kind !== "chip").length;
            tiles[around] = { ...tiles[around], beacon: false, shown: count, decoy: false };
          }
        });
      }
    }
    tiles[start].revealed = true;
    const lairs = farTiles(tiles, size, start).sort(() => random() - 0.5);
    last = { tiles, start, virusStarts: lairs.slice(0, Math.max(1, tier.viruses)) };
    if (walletSolvable(last, tier)) return last;
  }
  return last!;
}

export type Virus = { tile: number; clock: number; from?: number };
export type WalletState = {
  phase: "open" | "won" | "lost"; tier: WalletTier; tiles: WalletTile[]; start: number;
  /** Integrity (the field keeps its old name) and the trace so far. */
  grit: number; trace: number; cursor: number; text: string;
  /** Damage per hit on this board. */
  power: number;
  /** Held programs (up to slotLimit: tier.slots, one fewer per butchering), the targeted program waiting for a tile, and ones already running. */
  slots: ProgramId[]; slotLimit: number; targeting: ProgramId | null;
  /** Block Explorer picks still owed after the program was spent (bigger boards give more than one). */
  explorerPicks: number;
  flashloan: boolean; multisig: number;
  /** Tiles a Block Explorer has shown (their content is drawn faintly while face down), and the Airdrop the Viruses head for. */
  explored: number[]; airdrop: number;
  /** Programs run so far (the Ponzi Scheme pays on it). */
  runs: number;
  /** Your probe: the last tile you acted on (the USB port at first). The Viruses hunt it. */
  probe: number;
  viruses: Virus[];
  /** Your trail: every revealed tile in the order you revealed it, the USB port first. A Virus follows it toward the newest. */
  trail: number[];
  /** The last move's Virus bite on you, if any: the tile and the Integrity it took (for the bite animation). */
  bite?: { tile: number; amount: number };
  /** Moves made (flips, attacks and program runs). Twist state: the move the rug will be pulled on (0 on other twists), whether
   * it has been, and the other one-off events. */
  moves: number; rugAt: number; pulled: boolean; butchered: boolean; exited: boolean;
  /** Wallet Drainer: a drainer trap has been uncovered and the wallet's valuables are gone. */
  drained: boolean;
  /** Front-Running: priority gas is on, so each flip, attack or claim costs +1 trace and nothing in it can be front-run. */
  priority: boolean;
  /** Margin Call: programs sold under a margin call so far, forced sellings so far, and whether Equity has been above the forced
   * line since the last one (forced selling strikes when it falls to the line, once per fall). */
  sales: number; forced: number; forcedArmed: boolean;
  /** Margin Call: The Liquidator's tile while he is on the board (he walks while Equity is at the forced line or under), and how
   * many times he has liquidated you (each seizure yanks the board like a Rug Pull). */
  liquidator: number | null; seizures: number;
  /** Sandwich Attack, on real time: the board's clock (ms, advanced by ticks), the bots on the board (none between pairs), when the
   * next pair is due, until when Low Slippage protects you, and the last sandwich that hurt (a new object each time). */
  clock: number; bots: SandwichBots | null; botsAt: number; slippageUntil: number; sandwiched?: { tile: number; amount: number };
  /** Your longest chain of uncovered tiles now, and how many multiples of the chain step have been paid (never paid twice, even
   * after a Rug Pull breaks the chain). */
  chain: number; chainPaid: number;
  /** The last block reward paid, for the floating text: the tile you acted on, the chain length and the Integrity it gave. */
  chainReward?: { tile: number; chain: number; amount: number };
  /** The revealed defenders a Validator healed on the last move, for the "+1" over their HP (a new object each time). */
  healed?: { tiles: number[] };
  /** The last Difficulty Bomb or Reentrancy Attack that went off under you: the tile and the Integrity it took (a new object
   * each time). */
  exploded?: { tile: number; amount: number };
  /** A Gas Spike: flips cost GAS_COST trace while `moves` is under this. */
  gasUntil: number;
  /** The last Halving: the half of the board holding the chip, lit gold for HALVING_SHEEN_MS on screen (a new object each run). */
  halved?: { half: BoardHalf };
  /** Twists are never announced beforehand: each moment one first bites fires an event, once (its key goes in `fired`), and the
   * latest event's lettering is shown over the board. A new object per event, so the screen can tell a fresh one. */
  fired: readonly string[]; twistEvent?: { label: string; detail?: string };
  lostBy?: WalletLoss;
};
/** Fire a twist event (once per key): big lettering over the board. `s` is a working copy. */
function fire(s: WalletState, key: string, label: string, detail?: string) {
  if (s.fired.includes(key)) return;
  s.fired = [...s.fired, key]; s.twistEvent = detail ? { label, detail } : { label };
}
export type WalletLoss = "grit" | "virus" | "trace" | "giveUp";
/** The reason for a loss, in words, for the message over the wiped board. */
export const lossReason = (loss: WalletLoss | undefined) =>
  loss === "virus" ? "The Virus found you and wiped out the last of your Integrity." : loss === "grit" ? "Your Integrity ran out." :
  loss === "trace" ? "The trace completed and the kill switch fired." : "You backed out of the wallet.";
export type WalletAction = { type: "flip"; index: number } | { type: "attack"; index: number } | { type: "act"; index: number }
  | { type: "run"; slot: number } | { type: "discard"; slot: number } | { type: "cancel" } | { type: "cursor"; index: number } | { type: "giveUp" }
  | { type: "gas" } | { type: "tick"; ms: number } | { type: "sell"; slot: number };

export function newWallet(tier: WalletTier, random: () => number = Math.random): WalletState {
  const board = generateWallet(tier, random);
  return { phase: "open", tier, tiles: board.tiles, start: board.start, grit: tier.grit, trace: 0, cursor: board.start, power: tier.draw,
    slots: [], slotLimit: tier.slots, targeting: null, explorerPicks: 0, flashloan: false, multisig: 0, explored: [], airdrop: -1, runs: 0,
    probe: board.start, viruses: tier.viruses > 0 ? board.virusStarts.map(tile => ({ tile, clock: 0 })) : [], trail: [board.start],
    moves: 0, gasUntil: 0, rugAt: tier.twist === "rugpull" ? 7 + Math.floor(random() * 4) : 0, pulled: false, butchered: false, exited: false, drained: false, priority: false, sales: 0, forced: 0, forcedArmed: true, liquidator: null, seizures: 0,
    clock: 0, bots: null, botsAt: BOT_RESPAWN_MS, slippageUntil: 0,
    // A Botnet's two Viruses are there from the start, so its lettering shows as the board opens.
    chain: 1, chainPaid: 0,
    fired: tier.twist === "botnet" ? ["botnet"] : [], twistEvent: tier.twist === "botnet" ? { label: "BOTNET!!!", detail: "More than one Virus is hunting you" } : undefined,
    text: `A ${tier.name.toLowerCase()} hardware wallet. Find the Secure Chip before the trace completes.` };
}

/** A face-down tile next to a revealed one, while the trace still allows a flip. */
const reachable = (state: WalletState, index: number) => state.phase === "open" && !state.tiles[index].revealed && state.tiles[index].kind !== "void" && state.trace < state.tier.traceLimit &&
  gridNeighbours(state.tier.size, index).some(other => state.tiles[other].revealed && !isFrozenCold(state.tiles[other]));
const active = (state: WalletState, other: number) => state.tiles[other].revealed && isDefender(state.tiles[other].kind) && state.tiles[other].hp > 0;
/** Revealed, active defenders locking a tile: those next to it, and any standing Firewall whose line runs through it. */
export const lockers = (state: WalletState, index: number) => {
  const n = state.tier.size, near = gridNeighbours(n, index).filter(other => active(state, other));
  const beams = state.tiles.map((tile, other) => other).filter(other => other !== index && !near.includes(other) && state.tiles[other].beam && active(state, other)
    && (state.tiles[other].beam === "col" ? other % n === index % n : Math.floor(other / n) === Math.floor(index / n)));
  return [...near, ...beams];
};
export const isLocked = (state: WalletState, index: number) => !state.tiles[index].revealed && lockers(state, index).length > 0;
/** A reachable tile that no revealed, active defender is guarding. */
export const canFlip = (state: WalletState, index: number) => reachable(state, index) && !isLocked(state, index);
export const canAttack = (state: WalletState, index: number) => state.phase === "open" && state.tiles[index].revealed && isDefender(state.tiles[index].kind) && state.tiles[index].hp > 0;
/** A revealed program lying unclaimed on its tile (your slots were full when you found it). */
export const canClaim = (state: WalletState, index: number) => state.phase === "open" && state.tiles[index].revealed && state.tiles[index].kind === "program" && !!state.tiles[index].program && state.slots.length < state.slotLimit;
/** Your Power right now: 1 in a Flash Crash, else the board's. */
export const effectivePower = (state: WalletState) => (flashCrashing(state) ? 1 : Math.max(1, state.power));
/** Moves left in a Gas Spike: while any are left, each flip costs GAS_COST trace. */
export const gasMovesLeft = (state: WalletState) => Math.max(0, state.gasUntil - state.moves);
/** What a defender's strike back costs right now: doubled in a Flash Crash. */
export const strikeBack = (state: WalletState, kind: DefenderKind) => state.tier.defenders[kind].atk * (flashCrashing(state) ? 2 : 1);
/** The reading a revealed empty tile shows now: its reading, pumped one high then dumped one low under Pump and Dump. */
export const displayReading = (_state: WalletState, tile: WalletTile) => tile.shown;
/** What a revealed empty tile's pips say, in words. */
export const readingText = (shown: number, beacon = false) => (beacon ? `the Secure Chip is ${shown} step${shown === 1 ? "" : "s"} away` : shown === 0 ? "no defender or attacker in the eight tiles around it" : `${shown} defender${shown === 1 ? "" : "s"} or attacker${shown === 1 ? "" : "s"} in the eight tiles around it`);
/** A cracked wallet's rating by the share of the trace left: three stars for 35% or more, two for 15% or more, else one. */
export const walletStars = (state: WalletState) => {
  if (state.phase !== "won") return 0;
  const left = Math.max(0, state.tier.traceLimit - state.trace) / state.tier.traceLimit;
  return left >= 0.35 ? 3 : left >= 0.15 ? 2 : 1;
};
export const starText = (stars: number) => "★".repeat(stars) + "☆".repeat(3 - stars);

const kindName: Record<WalletTileKind, string> = { empty: "an empty sector", wall: "Firewall", alarm: "Tamper Alarm", validator: "Validator", gasspike: "Gas Spike", whale: "Whale", bomb: "Difficulty Bomb", fork: "Hard Fork", reentrancy: "Reentrancy Attack", cold: "Cold Storage", void: "nothing", chip: "Secure Chip", honeypot: "Honeypot", program: "program", drainer: "Wallet Drainer", fakechip: "Red Chip" };
export const walletKindName = (kind: WalletTileKind) => kindName[kind];

/** A well-mixed hash of a few small integers (murmur-style finaliser), for the Virus's wandering steps and the rug pull. */
export function mixHash(...values: number[]): number {
  let h = 0x9e3779b9;
  for (const value of values) { h = Math.imul(h ^ (value >>> 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; }
  return h >>> 0;
}

/** How often a Virus with no scent drifts toward your trail rather than wandering at random: one step in this many (every other
 * step). Measured from the far corner with only the USB port revealed, it reaches you in about 1.3–1.6 x the straight-line distance;
 * a pure random walk took many times that and often never arrived. */
const VIRUS_DRIFT = 2;
/** One step of one Virus. Toward an Airdrop if there is one (it stops there to feed); otherwise it follows your trail to its
 * freshest tile (the probe counts as the freshest of all). With no scent it wanders, but with a push: every other step it drifts
 * toward the nearest tile of your trail, and it never turns straight back, so it crosses the board instead of milling about.
 * Stepping onto a revealed defender, it bites that instead and pauses. */
function virusStep(s: WalletState, v: Virus, salt: number): { virus: Virus; text: string } {
  const n = s.tier.size, around = gridNeighbours(n, v.tile).filter(tile => s.tiles[tile].kind !== "void");
  let to: number;
  if (s.airdrop >= 0) {
    to = around.reduce((best, tile) => (gridDistance(n, tile, s.airdrop) < gridDistance(n, best, s.airdrop) ? tile : best), around[0]);
  } else {
    const order = new Map(s.trail.map((tile, i) => [tile, i]));
    order.set(s.probe, s.trail.length);
    const here = order.get(v.tile) ?? -1;
    const scent = around.filter(tile => (order.get(tile) ?? -1) > here).sort((a, b) => order.get(b)! - order.get(a)!);
    if (scent.length) to = scent[0];
    else {
      const roll = mixHash(v.tile, s.trace, s.grit, s.trail.length, s.probe, salt);
      const nearest = [...s.trail, s.probe].reduce((best, tile) => (gridDistance(n, v.tile, tile) < gridDistance(n, v.tile, best) ? tile : best));
      const closer = around.filter(tile => gridDistance(n, tile, nearest) < gridDistance(n, v.tile, nearest));
      const onward = around.filter(tile => tile !== v.from);
      const drift = mixHash(roll, 17) % VIRUS_DRIFT === 0;
      const options = closer.length && drift ? closer : onward.length ? onward : around;
      to = options[roll % options.length];
    }
  }
  let text = "";
  const tile = s.tiles[to];
  if (tile.revealed && isDefender(tile.kind) && tile.hp > 0 && tile.kind !== "chip") {
    tile.hp = Math.max(0, tile.hp - s.tier.virusBite);
    text = ` The Virus bites the ${kindName[tile.kind]} for ${s.tier.virusBite}${tile.hp === 0 ? " and takes it down" : ""}.`;
    return { virus: { tile: to, clock: -1, from: v.tile }, text };
  }
  if (s.airdrop >= 0 && to === s.airdrop) text = " A Virus reaches the Airdrop and stops to feed.";
  return { virus: { tile: to, clock: s.airdrop >= 0 && to === s.airdrop ? -2 : 0, from: v.tile }, text };
}
/** Exposed for the practice tooling's measurements. */
export const stepVirusForTest = virusStep;

/** Your longest chain: the most uncovered tiles one route can pass through, one step at a time and never twice (the USB port,
 * empty sectors, programs and beaten defenders; a standing defender breaks it). One winding path, or a filled-in patch, scores
 * nearly every tile; side spurs that branch off and dead-end do not. Searched depth first from the chain's ends under a fixed
 * step budget, so it stays quick; on an awkward shape it may settle for a slightly shorter route than the very longest. */
export function longestChain(state: WalletState): number {
  const n = state.tier.size, tiles = state.tiles;
  const open = (i: number) => tiles[i].revealed && (!isDefender(tiles[i].kind) || tiles[i].hp <= 0) && !isFrozenCold(tiles[i]);
  const nodes = tiles.map((_, i) => i).filter(open);
  if (!nodes.length) return 0;
  const links = new Map(nodes.map(i => [i, gridNeighbours(n, i).filter(open)]));
  const seen = new Uint8Array(tiles.length);
  let best = 1, budget = 400000;
  const walk = (at: number, length: number) => {
    if (length > best) best = length;
    if (best === nodes.length || --budget <= 0) return;
    for (const next of links.get(at)!) if (!seen[next]) { seen[next] = 1; walk(next, length + 1); seen[next] = 0; if (budget <= 0 || best === nodes.length) return; }
  };
  // Ends of the chain first (tiles with one link), where the longest routes start.
  for (const start of [...nodes].sort((a, b) => links.get(a)!.length - links.get(b)!.length)) {
    seen[start] = 1; walk(start, 1); seen[start] = 0;
    if (budget <= 0 || best === nodes.length) break;
  }
  return best;
}

/** Everything that happens after one of your moves (a flip, an attack or a program run): fuses burn, Validators heal,
 * Staking pays, the twists fire, the Viruses move and may bite. `index` is the tile you acted on (the probe), or -1 to keep it. */
function afterMove(state: WalletState, index: number): WalletState {
  const { tier } = state, n = tier.size, crashed = flashCrashing(state);
  let s: WalletState = { ...state, tiles: state.tiles.map(tile => ({ ...tile })), probe: index >= 0 ? index : state.probe, bite: undefined };
  let text = s.text, trace = s.trace, grit = s.grit;
  // Fuses: a revealed, standing Tamper Alarm counts down, and sounds when it reaches zero.
  for (const tile of s.tiles) if (tile.kind === "alarm" && tile.revealed && tile.hp > 0 && (tile.fuse ?? -1) > 0) {
    tile.fuse! -= 1;
    if (tile.fuse === 0) { trace += tier.alarmTrace; tile.fuse = -1; text += ` A Tamper Alarm sounds: +${tier.alarmTrace} trace.`; }
  }
  // Validators re-validate: while any revealed Validator stands, every standing defender on the board (the chip and the Validators
  // included) heals 1 HP a move, up to its maximum. More Validators do not heal faster.
  if (s.tiles.some(v => v.kind === "validator" && v.revealed && v.hp > 0)) {
    const healed: number[] = [];
    s.tiles.forEach((t, i) => { if (isDefender(t.kind) && t.hp > 0 && t.hp < tier.defenders[t.kind as DefenderKind].hp) { t.hp += 1; if (t.revealed) healed.push(i); } });
    if (healed.length) s.healed = { tiles: healed };
  }
  // Cold Storage thaws once enough tiles around it are revealed: it becomes a program tile holding a program, yours if a slot is
  // free, and every reading it froze shows again.
  s.tiles.forEach((tile, i) => {
    if (!isFrozenCold(tile) || coldRevealed(s, i) < COLD_THAW) return;
    const pool = programsDealt(tier), id = pool[mixHash(i, s.moves, s.trace, 61) % pool.length];
    s.tiles[i] = { ...tile, kind: "program", hp: 0, program: id };
    text += ` COLD STORAGE THAWS: inside, a ${PROGRAMS[id].name}.${claim(s, i)}`;
  });
  // The block reward: each new multiple of the chain step your longest chain reaches pays Integrity.
  s.chain = longestChain(s);
  const due = Math.floor(s.chain / tier.chainStep) - s.chainPaid;
  if (due > 0) {
    s.chainPaid += due;
    const reward = due * tier.blockReward, gain = Math.min(reward, Math.max(0, tier.grit - grit));
    if (tier.twist === "frontrun" && !s.priority) {
      // Front-Running at normal gas: the block reward is taken before it reaches you (the chain still counts as paid).
      text += ` Your chain reaches ${s.chain} tiles. FRONT-RUN: the Front Runner took the +${reward} Integrity block reward.`;
      fire(s, "frontrun", "FRONT-RUN!!!", "The Front Runner took your block reward");
    } else {
      grit += gain;
      text += ` Your chain reaches ${s.chain} tiles. Block reward: +${gain} Integrity.`;
      s.chainReward = { tile: s.probe, chain: s.chain, amount: gain };
    }
  }
  // Twists that trigger on the trace.
  if (tier.twist === "pumpdump" && !s.fired.includes("dump") && trace * 5 >= tier.traceLimit * 3) { s.power = 1; text += " The dump: your Power drops to 1."; fire(s, "dump", "DUMPED!!!", "Your Power is dumped down to 1"); }
  if (tier.twist === "exitscam" && !s.exited && trace * 3 >= tier.traceLimit * 2) {
    s.exited = true;
    for (let i = 0; i < s.tiles.length; i++) {
      const t = s.tiles[i];
      if (t.kind === "program" || t.kind === "honeypot") s.tiles[i] = { ...t, kind: "empty", program: undefined };
      if (s.tiles[i].kind === "empty" && i !== s.start) s.tiles[i] = { ...s.tiles[i], blank: true, decoy: false, exposed: false, beacon: false };
    }
    text += " Exit scam: every sector reading is wiped and every program left on the board vanishes."; fire(s, "exitscam", "EXIT SCAM!!!", "Readings wiped, board programs gone");
  }
  // The Rug Pull: no warning; it lands on its secret move.
  s.moves += 1;
  if (tier.twist === "rugpull" && !s.pulled && s.moves >= s.rugAt) { s = rugPull(s); text += " RUGPULL! The board is pulled out from under you: everything but the tile you stand on is face down again."; fire(s, "rugpull", "RUGPULL!!!", "The board is face down again: remember it"); }
  s = { ...s, trace, grit, text };
  // The Viruses: each steps on its clock, then bites the probe if it is on or next to it.
  const steps = 1;
  const viruses: Virus[] = [];
  for (const [k, v0] of s.viruses.entries()) {
    let v = { ...v0 };
    if (gridDistance(n, v.tile, s.probe) > 1) {
      v.clock += 1;
      if (v.clock >= tier.virusEvery) {
        for (let step = 0; step < steps && gridDistance(n, v.tile, s.probe) > 1; step++) { const r = virusStep(s, v, k * 7 + step); v = r.virus; s.text += r.text; if (v.clock < 0) break; }
        if (v.clock > 0) v.clock = 0;
      }
    }
    if (s.airdrop >= 0 && v.tile === s.airdrop) s.airdrop = -1;
    if (gridDistance(n, v.tile, s.probe) <= 1) {
      const bite = tier.virusBite * (crashed ? 2 : 1);
      s.grit -= bite; s.bite = { tile: s.probe, amount: bite };
      s.text += ` The Virus got you: it bites for ${bite} Integrity${crashed ? " (doubled in the crash)" : ""} and vanishes.`;
      continue;
    }
    viruses.push(v);
  }
  s.viruses = viruses;
  // Margin Call: at the margin the call opens (sell programs by hand); at the forced line, once per fall to it, everything you
  // hold is sold for you, or, with nothing to sell, the trace pays for a top-up.
  if (tier.twist === "margincall" && s.grit > 0) {
    // The Flash Crash: the move just made has entered the crash (the lettering fires once), or ended it.
    if (flashCrashing(s) && flashLeft(s) === FLASH.lasts) { s.text += " FLASH CRASH: Power 1, strike-backs and bites doubled for two moves."; fire(s, "crash", "FLASH CRASH!!!", "Power 1, hits and bites doubled: 2 moves"); }
    else if (crashed && !flashCrashing(s)) s.text += " The market recovers.";
    if (equityOf(s) <= EQUITY.margin && s.sales < EQUITY.sales) fire(s, "margin", "MARGIN CALL!!!", "Right-click a program to sell it for Equity");
    if (equityOf(s) > EQUITY.forced) s.forcedArmed = true;
    else if (s.forcedArmed && s.forced < EQUITY.forcedTimes) {
      s.forcedArmed = false; s.forced += 1;
      if (s.slots.length) {
        const gain = Math.min(s.slots.length * equityPoints(tier, EQUITY.forcedEach), tier.grit - s.grit), sold = s.slots.length;
        s.slots = []; s.targeting = null; s.explorerPicks = 0; s.grit += gain;
        s.text += ` FORCED SELLING: ${sold} program${sold === 1 ? "" : "s"} sold for +${Math.round(gain / tier.grit * 100)}% Equity.`;
        fire(s, "forced", "FORCED SELLING!!!", "Programs sold off for Equity");
      } else {
        const gain = Math.min(equityPoints(tier, EQUITY.penaltyGain), tier.grit - s.grit);
        s.trace += EQUITY.penaltyTrace; s.grit += gain;
        s.text += ` FORCED SELLING: nothing to sell; +${EQUITY.penaltyTrace} trace for +${Math.round(gain / tier.grit * 100)}% Equity.`;
        fire(s, "forced", "FORCED SELLING!!!", `No programs: +${EQUITY.penaltyTrace} trace for Equity`);
      }
      if (equityOf(s) > EQUITY.forced) s.forcedArmed = true;
    }
    // The Liquidator: at the forced line or under he appears on a random tile four steps from you (the nearest ring beyond that
    // the board has, if none) and comes a tile a move, through anything; above it he stands where he is. On your tile, he
    // liquidates you: Equity to 10% and the board seized, like a Rug Pull.
    if (equityOf(s) <= EQUITY.forced) {
      if (s.liquidator === null) {
        const spots = s.tiles.map((_, i) => i).filter(i => s.tiles[i].kind !== "void" && i !== s.probe);
        const ring = (d: number) => spots.filter(i => gridDistance(n, i, s.probe) === d);
        let lairs = ring(EQUITY.liquidatorFrom);
        for (let d = EQUITY.liquidatorFrom + 1; !lairs.length && d <= 2 * n; d++) lairs = ring(d);
        s.liquidator = lairs[mixHash(s.moves, s.trace, s.grit, 71) % lairs.length];
        s.text += " The Liquidator steps onto the board.";
      } else if (s.liquidator !== s.probe) {
        // (Standing on his tile already, by walking onto him, is reaching you too: he does not step, he liquidates.)
        const options = gridNeighbours(n, s.liquidator).filter(i => s.tiles[i].kind !== "void");
        const near = Math.min(...options.map(i => gridDistance(n, i, s.probe))), best = options.filter(i => gridDistance(n, i, s.probe) === near);
        s.liquidator = best[mixHash(s.liquidator, s.moves, 73) % best.length];
      }
      if (s.liquidator === s.probe) {
        s = { ...rugPull(s), pulled: state.pulled, liquidator: null, seizures: s.seizures + 1, grit: Math.min(s.grit, equityPoints(tier, EQUITY.liquidated)) };
        s.text += ` LIQUIDATED: The Liquidator closes your position. Equity ${Math.round(EQUITY.liquidated * 100)}%, and every uncovered tile but yours is seized.`;
        fire(s, "liquidated", "LIQUIDATED!!!", `Equity ${Math.round(EQUITY.liquidated * 100)}%, your uncovered tiles seized`);
      }
    }
  }
  if (s.grit <= 0) return { ...s, grit: 0, phase: "lost", lostBy: s.bite ? "virus" : "grit", text: `${s.text} ${s.bite ? "It took the last of your Integrity;" : "Integrity gone."} the wallet wipes itself.` };
  // A full trace ends the board, even with the chip in view: only cracking it first wins.
  if (s.trace >= tier.traceLimit) return { ...s, phase: "lost", lostBy: "trace", text: `${s.text} Trace complete. The kill switch fires.` };
  return s;
}

/** The Rug Pull: the board is pulled out from under you and comes back the same, but every tile except the one your probe stands on
 * is face down again (the USB port too), Block Explorer views and your trail included. Nothing moves, so what you remember still
 * holds; defenders keep the damage you did, and an alarm that has sounded stays spent. Programs, the trace and
 * Integrity carry on, and you carry on from where you stand. */
function rugPull(s: WalletState): WalletState {
  const tiles = s.tiles.map((tile, i) => (i === s.probe ? { ...tile, revealed: true } : { ...tile, revealed: false }));
  return { ...s, tiles, trail: [s.probe], cursor: s.probe, explored: [], pulled: true };
}

/** Run a program from a slot (targeted ones wait for a tile). The Ponzi Scheme pays back on each run and collapses on the fourth. */
function runProgram(state: WalletState, slot: number, target: number): WalletState {
  const { tier } = state, id = state.slots[slot];
  if (!id) return state;
  // Pig Butchering: selecting a program while every slot is full butchers you. Nothing runs: the whole hand is gone and a slot with
  // it. The board is untouched. It can strike again once the smaller hand is full, but never with a single slot.
  if (tier.twist === "butchering" && state.slotLimit >= 2 && state.slots.length >= state.slotLimit) {
    const s: WalletState = { ...state, slots: [], slotLimit: state.slotLimit - 1, targeting: null, explorerPicks: 0, butchered: true,
      text: `BUTCHERED: ${PROGRAMS[id].name} never ran. Your hand is gone and you are down to ${state.slotLimit - 1} slot${state.slotLimit - 1 === 1 ? "" : "s"}.` };
    fire(s, `butchered-${state.slotLimit}`, "BUTCHERED!!!", "Your hand is gone, and one slot with it");
    return s;
  }
  // A Rollback costs 2 Integrity, and never the last of it.
  if (id === "rollback" && state.grit <= ROLLBACK_COST) return { ...state, text: `Rollback needs more than ${ROLLBACK_COST} Integrity.` };
  if (PROGRAMS[id].target && target < 0) {
    // Arming a targeted program: the Block Explorer says how many tiles it will show on this board.
    const picks = id === "explorer" ? explorerPicks(tier.size) : 1;
    return { ...state, targeting: state.targeting === id ? null : id, text: state.targeting === id ? `${PROGRAMS[id].name} put away.` : `${PROGRAMS[id].name}: pick ${picks > 1 ? `${picks} tiles` : "a tile"}.` };
  }
  let s: WalletState = { ...state, tiles: state.tiles.map(tile => ({ ...tile })), slots: state.slots.filter((_, i) => i !== slot), targeting: null, runs: state.runs + 1 };
  let text = `${PROGRAMS[id].name}: `;
  switch (id) {
    case "rollback": s.trace = Math.max(0, s.trace - 3); s.grit -= ROLLBACK_COST; text += `the trace goes back 3, for ${ROLLBACK_COST} Integrity.`; break;
    case "ico": s.trace = Math.max(0, s.trace - ICO_REFUND); text += `funds raised; the trace goes back ${ICO_REFUND}.`; break;
    case "flashloan": s.flashloan = true; text += "your next hit deals double, with no strike back."; break;
    case "halving": {
      // The half that holds the chip, along an axis picked by the move (both halves hold a chip on the middle line: pick one).
      const chip = s.tiles.findIndex(t => t.kind === "chip"), roll = mixHash(s.moves, s.trace, s.grit, s.runs, 31);
      const axis: BoardHalf[] = roll & 1 ? ["top", "bottom"] : ["left", "right"];
      const holding = axis.filter(half => halfHolds(tier.size, chip, half));
      const half = holding[(roll >>> 3) % holding.length];
      s.halved = { half }; text += `the Secure Chip is in the ${half} half of the board.`; break;
    }
    case "lowentropy": { const t = s.tiles[target]; if (!(t.revealed && isDefender(t.kind) && t.hp > 0)) return state; t.hp = Math.ceil(t.hp / 2); text += `the ${kindName[t.kind]}'s key weakens: halved to ${t.hp} HP.`; break; }
    case "multisig": s.multisig = 2; text += "the next two strike-backs are blocked."; break;
    case "lowslippage": s.slippageUntil = s.clock + LOW_SLIPPAGE_MS; text += `the sandwich bots cannot hurt you for ${LOW_SLIPPAGE_MS / 1000} seconds.`; break;
    case "investors": {
      // The lowest row without support that still has a face-down empty sector: one is uncovered for free, no trace, no move of
      // your own. Nothing to recruit: the program stays in its slot.
      const levels = pyramidLevels(tier.size);
      let level = 0, picks: number[] = [];
      for (; level < levels && !picks.length; level++) {
        if (pyramidSupported(s, level)) continue;
        picks = s.tiles.map((_, i) => i).filter(i => pyramidLevel(tier.size, i) === level && !s.tiles[i].revealed && s.tiles[i].kind === "empty");
      }
      if (!picks.length) return { ...state, text: "Rob Peter to pay Paul: every row is supported, or has no empty sector left to recruit." };
      const chosen = picks[mixHash(s.moves, s.trace, s.grit, s.runs, 53) % picks.length];
      s.tiles[chosen].revealed = true;
      s.trail = [...s.trail, chosen];
      text += `Paul gets paid on row ${level}: an empty sector uncovered for free.`;
      break;
    }
    case "staking": s.power += 1; text += `+1 Power, to ${s.power}.`; break;
    case "explorer": {
      if (s.tiles[target].revealed) return state;
      s.explored = [...new Set([...s.explored, target])];
      const more = explorerPicks(tier.size) - 1;
      s.explorerPicks = more; if (more > 0) s.targeting = "explorer";
      text += more ? `the block is on show; pick ${more} more.` : "the block is on show."; break;
    }
    case "airdrop": s.airdrop = target; text += "free tokens dropped; every Virus heads for them."; break;
    case "antivirus": { const hit = s.viruses.findIndex(v => v.tile === target); if (hit < 0) return state; s.viruses = s.viruses.filter((_, i) => i !== hit); text += `that Virus is wiped${s.viruses.length ? `; ${s.viruses.length} left` : ""}.`; break; }
    case "checksum": {
      // Only what is uncovered now is checked; sectors uncovered later are not.
      const caught = s.tiles.filter(t => t.revealed && t.decoy && !t.exposed);
      for (const t of caught) t.exposed = true;
      text += caught.length ? `${caught.length} lying sector${caught.length === 1 ? "" : "s"} marked red.` : "every uncovered sector checks out.";
      break;
    }
  }
  s.text = text;
  if (s.trace >= tier.traceLimit) return { ...s, phase: "lost", lostBy: "trace", text: `${text} Trace complete. The kill switch fires.` };
  return s;
}

/** Take a program into a free slot (from a program tile or a Honeypot); with no free slot it stays on its tile to claim later. */
function claim(s: WalletState, index: number): string {
  const t = s.tiles[index];
  if (!t.program) return "";
  const name = PROGRAMS[t.program].name;
  if (s.slots.length >= s.slotLimit) return ` ${name} found, but your slots are full: it waits here (discard one to take it).`;
  s.slots = [...s.slots, t.program]; t.program = undefined;
  return ` ${name} loaded into a slot.`;
}

/** The sandwich bots after `ms` more milliseconds, and whether they met each other or closed on you. With your probe on their line
 * and between them, each stops on the tile next to you and waits; when both are there you are sandwiched. Otherwise they run on
 * until they meet in the middle. Pure: the tick applies it, and the screen uses it to glide them between ticks. */
export function advanceBots(s: WalletState, ms: number): { bots: SandwichBots; met: boolean; hit: boolean } | null {
  const bots = s.bots;
  if (!bots) return null;
  const n = s.tier.size, step = BOT_SPEED * ms / 1000;
  const onLine = (bots.axis === "row" ? Math.floor(s.probe / n) : s.probe % n) === bots.line;
  const along = bots.axis === "row" ? s.probe % n : Math.floor(s.probe / n);
  const ta = Math.max(0, along - 1), tb = Math.max(0, n - 2 - along);
  if (onLine && bots.a <= ta && bots.b <= tb) {
    const a = Math.min(bots.a + step, ta), b = Math.min(bots.b + step, tb);
    return { bots: { ...bots, a, b }, met: false, hit: a >= ta && b >= tb };
  }
  const a = bots.a + step, b = bots.b + step;
  if (a + b >= n - 1) return { bots: { ...bots, a: (n - 1) / 2, b: (n - 1) / 2 }, met: true, hit: false };
  return { bots: { ...bots, a, b }, met: false, hit: false };
}

/** Front-Running, at normal gas: the Front Runner saw the move and took the program on this tile first. The text of the theft,
 * or null when nothing was taken (priority gas, another board, or no program there), in which case the caller claims as usual. */
function snipe(s: WalletState, index: number): string | null {
  const t = s.tiles[index];
  if (s.tier.twist !== "frontrun" || s.priority || !t.program) return null;
  const name = PROGRAMS[t.program].name; t.program = undefined;
  fire(s, "frontrun", "FRONT-RUN!!!", "The Front Runner took that program first");
  return ` FRONT-RUN: the Front Runner saw your move and took the ${name} first.`;
}
/** Front-Running, at priority gas: the fee on a flip, attack or claim. */
const priorityFee = (s: WalletState) => (s.tier.twist === "frontrun" && s.priority ? 1 : 0);

/** On the Margin Call board every readout speaks of Equity, as a share of full, where the rules speak of Integrity points. */
export function equityWording(s: WalletState): WalletState {
  if (s.tier.twist !== "margincall" || !s.text) return s;
  const text = s.text.replace(/(\d+) Integrity/g, (_, points) => `${Math.round(Number(points) / s.tier.grit * 100)}% Equity`).replace(/Integrity/g, "Equity");
  return text === s.text ? s : { ...s, text };
}

export function walletReduce(state: WalletState, action: WalletAction): WalletState {
  const next = walletReduceInner(state, action);
  return next === state ? state : equityWording(next);
}
function walletReduceInner(state: WalletState, action: WalletAction): WalletState {
  if (state.phase !== "open") return state;
  const { tier } = state, n = tier.size;
  // A tile outside the board (a stray click or key) does nothing.
  if ("index" in action && action.type !== "cursor" && !(action.index >= 0 && action.index < state.tiles.length)) return state;
  if ("index" in action && action.type !== "cursor" && state.tiles[action.index].kind === "void") return state;
  switch (action.type) {
    case "cursor": return { ...state, cursor: Math.max(0, Math.min(state.tiles.length - 1, action.index)) };
    case "giveUp": return { ...state, phase: "lost", lostBy: "giveUp", text: "You back out of the wallet." };
    case "tick": {
      // Real time, on the Sandwich Attack only: the clock runs, a pair of bots appears when due, and the bots run their line.
      if (tier.twist !== "sandwich" || !(action.ms > 0)) return state;
      const ms = Math.min(action.ms, 500);
      const s: WalletState = { ...state, clock: state.clock + ms };
      if (!s.bots) {
        if (s.clock >= s.botsAt) {
          // A random row or column within BOT_NEAR of your probe's, so the pair always runs close to you.
          const roll = mixHash(Math.floor(s.clock), s.moves, s.trace, s.grit, 41), axis = roll & 1 ? "row" : "col";
          const mine = axis === "row" ? Math.floor(s.probe / n) : s.probe % n, low = Math.max(0, mine - BOT_NEAR), high = Math.min(n - 1, mine + BOT_NEAR);
          s.bots = { axis, line: low + (roll >>> 1) % (high - low + 1), a: 0, b: 0 };
        }
        return s;
      }
      const moved = advanceBots(s, ms)!;
      s.bots = moved.bots;
      if (!moved.met && !moved.hit) return s;
      // The pair is spent, whether they met each other or closed on you; the next pair is due a second later.
      s.bots = null; s.botsAt = s.clock + BOT_RESPAWN_MS;
      if (moved.met) return s;
      if (s.clock < s.slippageUntil) { s.text = "Sandwiched, but Low Slippage holds: the bots take nothing."; return s; }
      s.grit -= SANDWICH_DAMAGE; s.sandwiched = { tile: s.probe, amount: SANDWICH_DAMAGE };
      s.text = `SANDWICHED: the bots close on you from both sides for ${SANDWICH_DAMAGE} Integrity.`;
      fire(s, "sandwich", "SANDWICHED!!!", `Caught between the bots: -${SANDWICH_DAMAGE} Integrity`);
      if (s.grit <= 0) return { ...s, grit: 0, phase: "lost", lostBy: "grit", text: `${s.text} Integrity gone; the wallet wipes itself.` };
      return s;
    }
    case "sell": {
      // A margin call: sell the program in this slot for Equity. Not a move.
      const id = state.slots[action.slot];
      if (!id || !marginCallOpen(state)) return state;
      const gain = Math.min(equityPoints(tier, EQUITY.sale), tier.grit - state.grit), left = EQUITY.sales - state.sales - 1;
      return { ...state, slots: state.slots.filter((_, i) => i !== action.slot), targeting: state.targeting === id ? null : state.targeting, grit: state.grit + gain, sales: state.sales + 1,
        text: `Margin call: ${PROGRAMS[id].name} sold for +${Math.round(gain / tier.grit * 100)}% Equity${left ? ` (${left} sale${left === 1 ? "" : "s"} left)` : " (no sales left)"}.` };
    }
    case "gas": return { ...state, priority: !state.priority, text: state.priority ? "Normal gas: cheaper, but the Front Runner can take what your moves earn." : "Priority gas: +1 trace on every flip, attack or claim, and nothing can be front-run." };
    case "cancel": return state.targeting ? { ...state, targeting: null, explorerPicks: 0, text: state.explorerPicks ? "Block Explorer: remaining picks given up." : `${PROGRAMS[state.targeting].name} put away.` } : state;
    case "discard": return state.slots[action.slot] ? { ...state, slots: state.slots.filter((_, i) => i !== action.slot), targeting: null, text: `${PROGRAMS[state.slots[action.slot]].name} discarded.` } : state;
    case "run": {
      const ran = runProgram(state, action.slot, -1);
      // Only a program that actually ran is a move (not one armed to wait for a tile, nor one refused with a message).
      return ran === state || ran.targeting || ran.phase !== "open" || ran.runs === state.runs ? ran : afterMove(ran, -1);
    }
    case "act": {
      // A program waiting for a tile takes this one; otherwise attack, claim or flip, whichever fits. A locked tile does nothing.
      if (state.targeting === "explorer" && state.explorerPicks > 0) {
        // A Block Explorer pick still owed: show just this tile (a revealed or already shown tile wastes the pick).
        const fresh = !state.tiles[action.index].revealed && !state.explored.includes(action.index), left = state.explorerPicks - 1;
        return { ...state, explored: fresh ? [...state.explored, action.index] : state.explored, explorerPicks: left, targeting: left > 0 ? "explorer" : null,
          text: `Block Explorer: ${fresh ? "the block is on show" : "nothing new there"}${left > 0 ? `; pick ${left} more.` : "."}` };
      }
      if (state.targeting) {
        const ran = runProgram(state, state.slots.indexOf(state.targeting), action.index);
        return ran === state || ran.phase !== "open" ? ran : afterMove(ran, -1);
      }
      if (canClaim(state, action.index)) {
        const s: WalletState = { ...state, tiles: state.tiles.map(t => ({ ...t })) };
        s.text = (snipe(s, action.index) ?? claim(s, action.index)).trim();
        // Front-Running: a claim at priority gas is a transaction too, and pays the fee.
        const fee = priorityFee(s);
        if (fee) { s.trace += fee; s.text += ` Priority gas: +${fee} trace.`; }
        if (s.trace >= tier.traceLimit) return { ...s, phase: "lost", lostBy: "trace", text: `${s.text} Trace complete. The kill switch fires.` };
        return s;
      }
      const next: WalletAction["type"] | null = canAttack(state, action.index) ? "attack" : canFlip(state, action.index) ? "flip" : null;
      return next ? walletReduceInner(state, { type: next, index: action.index } as WalletAction) : state;
    }
    case "flip": {
      if (!canFlip(state, action.index)) return state;
      const s: WalletState = { ...state, tiles: state.tiles.map(t => ({ ...t })), slots: [...state.slots] };
      const tile = s.tiles[action.index]; tile.revealed = true;
      // A Firewall raises its line across the way you came: from the probe if it is next door, else your latest revealed neighbour.
      if (tier.firewallLine && tile.kind === "wall") {
        const near = gridNeighbours(n, action.index), from = near.includes(state.probe) && state.tiles[state.probe].revealed ? state.probe
          : [...state.trail].reverse().find(t => near.includes(t)) ?? near.find(t => state.tiles[t].revealed) ?? action.index;
        tile.beam = Math.floor(from / n) === Math.floor(action.index / n) ? "col" : "row";
      }
      let grit = s.grit, text: string;
      const fee = priorityFee(s);
      // The Ponzi pyramid: a flip's trace doubles for every level below it that lacks support.
      const climb = pyramidFlipCost(state, action.index), gas = gasMovesLeft(state) > 0 ? GAS_COST - 1 : 0;
      let trace = s.trace + climb + fee + gas;
      // Pump and Dump: the pump comes with the first flip (Power 4); the dump comes at 60% of the trace (Power 1), in afterMove.
      if (tier.twist === "pumpdump" && !s.fired.includes("pump")) { s.power = 4; fire(s, "pump", "PUMPED!!!", "Your Power is pumped up to 4"); }
      switch (tile.kind) {
        case "empty": {
          text = `Empty sector. Its pips say ${readingText(displayReading(s, tile))}.`;
          break;
        }
        case "program": text = "A program." + (snipe(s, action.index) ?? claim(s, action.index)); break;
        case "fakechip":
          text = "A Red Chip: one of Sybil's fakes. The readings around it lied; the real chip is elsewhere.";
          fire(s, "sybil", "SYBIL ATTACK!!!", "A fake chip: the readings near it lied");
          break;
        case "drainer":
          if (!s.drained) {
            // The drain takes the wallet's valuables and every program you hold with them.
            s.drained = true; const held = s.slots.length; s.slots = []; s.targeting = null; s.explorerPicks = 0;
            text = `WALLET DRAINED: a drainer trap. The hardware wallet is drained of all its valuables${held ? `, and your ${held} program${held === 1 ? "" : "s"} with them` : ""}.`;
            fire(s, "drained", "DRAINED!!!", "Your programs went with the valuables");
          }
          else text = "Another drainer trap, but all the valuables were already taken by the previous drainer.";
          break;
        case "honeypot": {
          if (tier.twist === "honeyfarm") fire(s, "honeyfarm", "HONEYPOT!!!", "It pinged the tracer and stirred the Virus");
          trace += tier.honeypotTrace;
          text = `HONEYPOT!!! Trace + ${tier.honeypotTrace}.${s.viruses.length ? " Every Virus lunges toward you." : ""}` + (snipe(s, action.index) ?? claim(s, action.index));
          // Its program claimed, the Honeypot is an empty sector; unclaimed, it stays as a program tile to take later.
          if (tile.program) tile.kind = "program"; else tile.kind = "empty";
          // The lunge: every Virus takes two steps at once.
          s.probe = action.index;
          s.viruses = s.viruses.map((v, k) => { let w = v; for (let i = 0; i < 2 && gridDistance(n, w.tile, action.index) > 1; i++) w = virusStep(s, w, 90 + k * 3 + i).virus; return { ...w, clock: 0 }; });
          break;
        }
        case "chip":
          text = "The Secure Chip. Break it.";
          break;
        case "cold":
          text = `Cold Storage. It cannot be attacked or passed, and every reading within ${COLD_REACH} tiles is frozen while it stands. Reveal ${COLD_THAW} tiles around it to thaw it and take what is inside.`;
          break;
        case "fork": {
          // The chain splits as it is uncovered: a fresh Virus spawns about a board-width from you and the split costs Integrity.
          // Spent after that, like a bomb.
          tile.hp = 0; grit -= FORK_DAMAGE; s.exploded = { tile: action.index, amount: FORK_DAMAGE };
          const lairs = farTiles(s.tiles, n, action.index), lair = lairs.length ? lairs[mixHash(action.index, s.trace) % lairs.length] : undefined;
          if (lair !== undefined) s.viruses = [...s.viruses, { tile: lair, clock: 0 }];
          text = `HARD FORK! The chain splits: -${FORK_DAMAGE} Integrity, and a fresh Virus spawns about a board-width from you.`;
          break;
        }
        case "bomb":
          // It goes off as it is uncovered, and is spent: no HP, no strike back, no locks; it still counts in the readings around it.
          tile.hp = 0; grit -= BOMB_DAMAGE; s.exploded = { tile: action.index, amount: BOMB_DAMAGE };
          text = `DIFFICULTY BOMB! It explodes as you uncover it: -${BOMB_DAMAGE} Integrity.`;
          break;
        case "alarm":
          // Its fuse lights the first time it is revealed (after a Rug Pull it carries on where it was, or stays spent).
          if (tile.fuse === undefined) tile.fuse = tier.fuse;
          text = (tile.fuse ?? 0) > 0 ? `Tamper Alarm (HP ${tile.hp}, ATK ${tier.defenders.alarm.atk}): its fuse is lit, ${tile.fuse} moves until it sounds for +${tier.alarmTrace} trace.` : `Tamper Alarm (HP ${tile.hp}, ATK ${tier.defenders.alarm.atk}): it has already sounded.`;
          break;
        case "validator": text = `Validator (HP ${tile.hp}, ATK ${tier.defenders.validator.atk}): while it stands, every defender on the board heals 1 HP each move.`; break;
        case "gasspike":
          tile.hp = 0; s.gasUntil = state.moves + 1 + GAS_MOVES;
          text = `GAS SPIKE! Fees surge: every flip costs ${GAS_COST} trace for your next ${GAS_MOVES} moves.`;
          break;
        case "reentrancy":
          tile.hp = 0; grit -= REENTRANCY_DAMAGE; s.exploded = { tile: action.index, amount: REENTRANCY_DAMAGE };
          text = `REENTRANCY ATTACK! The contract calls back into you: -${REENTRANCY_DAMAGE} Integrity.`;
          break;
        case "whale": text = `Whale (HP ${tile.hp}, ATK ${tier.defenders.whale.atk}): it hits hard.`; break;
        default: text = `${kindName[tile.kind]} (HP ${tile.hp}, ATK ${tier.defenders[tile.kind as DefenderKind].atk}). It guards the tiles around it.`;
      }
      if (climb > 1) { const lacking = Math.log2(climb); text += ` Pyramid: ${lacking} row${lacking > 1 ? "s" : ""} below lack${lacking > 1 ? "" : "s"} support, ×${climb} trace.`; fire(s, "pyramid", "PYRAMID!!!", `Rows below lack support: ×${climb} trace`); }
      if (fee) text += ` Priority gas: +${fee} trace.`;
      if (gas) text += ` Gas Spike: this flip cost ${GAS_COST} trace.`;
      return afterMove({ ...s, grit, trace, text, cursor: action.index, trail: [...s.trail, action.index] }, action.index);
    }
    case "attack": {
      if (!canAttack(state, action.index)) return state;
      const s: WalletState = { ...state, tiles: state.tiles.map(t => ({ ...t })) };
      const tile = s.tiles[action.index], kind = tile.kind as DefenderKind, atk = strikeBack(state, kind), hit = effectivePower(state) * (s.flashloan ? 2 : 1);
      let grit = s.grit, text = s.flashloan ? `Flash Loan: you hit the ${kindName[kind]} for ${hit}.` : `You hit the ${kindName[kind]} for ${hit}.`;
      const free = s.flashloan; s.flashloan = false;
      tile.hp = Math.max(0, tile.hp - hit);
      if (tile.hp > 0 && !free) {
        if (s.multisig > 0) { s.multisig -= 1; text += " Multisig blocks its strike back."; }
        else {
          grit -= atk; text += ` It strikes back for ${atk}.`;
        }
      } else if (tile.hp === 0) text += kind === "chip" ? " The Secure Chip cracks." : ` The ${kindName[kind]} is down.`;
      // Front-Running: an attack at priority gas pays the fee (the winning hit is free: the block is yours).
      const fee = tile.hp === 0 && kind === "chip" ? 0 : priorityFee(s);
      if (fee) { s.trace += fee; text += ` Priority gas: +${fee} trace.`; }
      if (tile.hp === 0 && kind === "chip") {
        const won = { ...s, grit, cursor: action.index, phase: "won" as const, text };
        return { ...won, text: `${text} Rating: ${starText(walletStars(won))}.` };
      }
      return afterMove({ ...s, grit, text, cursor: action.index }, action.index);
    }
  }
}
