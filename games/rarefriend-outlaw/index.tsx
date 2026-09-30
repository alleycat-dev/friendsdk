"use client";

import { useEffect, useRef, useState } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import {
  getWorldPreset, validateWorld, project, unproject, isWorldWalkable, renderProp, renderWorldLayers,
  type WorldConfig, type WorldPoint, type WorldProp, type WorldPropType,
} from "@rarefriends/friendsdk/world";
import { loadSvg } from "@rarefriends/friendsdk/assets";
import { createFriendReader, spriteFrame, type GenerationSprites, type SpriteFacing } from "@rarefriends/friendsdk/sprites";
import { KEEPSAKES, RARITIES, type KeepsakePerk, type Rarity } from "./keepsakes";
import { rollKeepsake, PERK_TEXT } from "./loot";
import { RewardsFrame, RARITY_COLOUR, type LootRarity, type RewardItem } from "./rewards";
import { TROPHIES, drawTrophy } from "./trophies";
import { PLAYTEST } from "./playtest";
import { createOutlawAudio, type MusicMood, type SoundId } from "./audio";
import { COSMETICS, COSMETIC_IDS, SLOT_ACTION, cosmeticForKeepsake, drawGearBehind, drawGearFront, drawLiquidatorGun, drawDiamondCleaver, drawPet, diplomaBitmap, type CosmeticId, type Gear } from "./cosmetics";
import { GameMenu } from "@rarefriends/friendsdk/frame";
import { RF, maximumPrize, type GameSnapshot } from "@rarefriends/friendsdk/game";
import { formatGameAmount } from "@rarefriends/friendsdk/ui";
import "@rarefriends/friendsdk/frame.css";
import "./style.css";
import { TWISTS, PROGRAMS, walletTierFor, newWallet, walletReduce, canFlip, canAttack, lockers, canClaim, isLocked, effectivePower, displayReading, walletKindName, walletStars, starText, lossReason, isDefender, gridNeighbours, readingText, halfHolds, HALVING_SHEEN_MS, advanceBots, BOMB_DAMAGE, REENTRANCY_DAMAGE, FORK_DAMAGE, COLD_REACH, COLD_THAW, isFrozen, isFrozenCold, coldRevealed, GAS_MOVES, GAS_COST, gasMovesLeft, isAttacker, programsDealt, explorerPicks, marginCallOpen, equityOf, EQUITY, gridDistance, flashCrashing, flashLooming, flashLeft, strikeBack, pyramidLevel, pyramidLevels, pyramidQuota, pyramidRevealed, pyramidSupported, pyramidFlipCost, type BoardHalf, type TwistId, type WalletState, type WalletAction, type WalletTileKind, type DefenderKind, type ProgramId } from "./wallet";
import { drawWalletIcon, drawVirusIcon, type WalletIconId } from "./wallet-icons";

/**
 * Rarefriend Outlaw — a Gun Fright-inspired prototype on the SDK's standard
 * isometric terrain, extended into a 6 x 6 grid of SDK world tiles (the
 * garden preset near the middle, generated garden-style country around it;
 * terrain streams in around the player so only nine tiles are decoded)
 * scrolled at 2x around a 1x Rare Friend, with a Centralised Exchange, inventory/
 * equipment, and wandering NPCs: hacker outlaws whose hardware wallets you crack and
 * animals that a net can capture.
 *
 * Economy: the SDK bridge exposes one consumable at one price (game.json: the
 * "Bounty Hunter licence", 20 RF for now). A licence is bought and used to start a
 * run (the runtime's confirmations); the run's RF payout is its play, settled when
 * the run ends. Inside the run nothing prompts: the Laser Gun comes with the licence
 * and reloads for OP. A hacker drops after its tier's hits, a message box offers its
 * hardware wallet, and the "Hack the Hardware Wallet" puzzle decides
 * the loot (see wallet.ts); the
 * settled SDK reward stays in the Friend's inventory until redeemed. With all
 * twenty charges spent the gun is depleted until another is bought. The bridge
 * has no API for durable items at other prices or for flat rewards, so the
 * net and captured animals are simulated inside this
 * component against the same displayed balance and documented as a
 * custom-integration gap.
 */

// ---------------------------------------------------------------------------
// World: a grid of SDK world tiles sharing one global coordinate space
// ---------------------------------------------------------------------------

const SCALE = 2; // world magnification; the Friend keeps its native 5x pixel size
const VIEW = { width: 960, height: 640 };
const PLANE = { w: 576, h: 384 }; // the SDK world plane; every tile is one plane
const GRID = { cols: 9, rows: 9 }; // 1.5x the original 6 x 6 country
const WORLD_SIZE = { width: PLANE.w * GRID.cols, height: PLANE.h * GRID.rows };
const CENTER = { i: 4, j: 4 }; // the garden tile
const LOAD_RING = 1; // tiles this far (Chebyshev) from the player's tile keep terrain loaded
const EVICT_RING = 2;
/** Whether a convex screen polygon (a terrain tile's diamond) overlaps the view, with a little margin for its cliff edge: separating
 * axes, the view's two and the polygon's edge normals. */
function diamondOnScreen(points: readonly { x: number; y: number }[], margin = 24) {
  const view = [{ x: -margin, y: -margin }, { x: VIEW.width + margin, y: -margin }, { x: VIEW.width + margin, y: VIEW.height + margin }, { x: -margin, y: VIEW.height + margin }];
  const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }, ...points.map((p, k) => { const q = points[(k + 1) % points.length]; return { x: q.y - p.y, y: p.x - q.x }; })];
  return axes.every(axis => {
    const a = points.map(p => p.x * axis.x + p.y * axis.y), b = view.map(p => p.x * axis.x + p.y * axis.y);
    return Math.max(...a) >= Math.min(...b) && Math.max(...b) >= Math.min(...a);
  });
}
/** The part of a terrain tile's SVG (in its image px) that holds anything: the projected plane plus its cliff edge below. Only this
 * band is rasterized. */
const TERRAIN_CROP = (() => {
  const corners = [project(0, 0), project(PLANE.w, 0), project(0, PLANE.h), project(PLANE.w, PLANE.h)];
  const x = Math.floor(Math.min(...corners.map(c => c[0]))) - 4, y = Math.floor(Math.min(...corners.map(c => c[1]))) - 4;
  return { x, y, w: Math.ceil(Math.max(...corners.map(c => c[0]))) + 4 - x, h: Math.ceil(Math.max(...corners.map(c => c[1]))) + 24 - y };
})();
const garden = getWorldPreset("01-garden-oval-complete");
const fullPlane: readonly WorldPoint[] = [[0, 0], [PLANE.w, 0], [PLANE.w, PLANE.h], [0, PLANE.h]];
const TRUNK = { y: 184, x: 288 }; // where the east-west and north-south roads cross tile edges
/** One connected road grid: east-west roads on these rows, north-south on these columns (the garden sits on both). */
const ROAD_ROWS = [CENTER.j - 2, CENTER.j, CENTER.j + 2], ROAD_COLS = [CENTER.i - 2, CENTER.i, CENTER.i + 2];

/** Deterministic per-tile randomness so the extended terrain is stable across reloads. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

type Tile = { i: number; j: number; offset: WorldPoint; world: WorldConfig; terrain: WorldConfig };

type BuildingKind = "datacenter" | "charging" | "coldstorage" | "miningfarm";
const BUILDING_KINDS: readonly BuildingKind[] = ["datacenter", "charging", "coldstorage", "miningfarm"];
const BUILDING_NAMES: Readonly<Record<BuildingKind, string>> = { datacenter: "Data Center", charging: "Charging Station", coldstorage: "Cold Storage", miningfarm: "Mining Farm" };
type Building = { kind: BuildingKind; i: number; j: number; local: WorldPoint };
/** One Data Center, Charging Station, Cold Storage and Mining Farm at seeded empty spots in different quarters of the country, clear of the roads. */
const BUILDINGS: readonly Building[] = (() => {
  const rand = seeded(4242), between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const place = (kind: BuildingKind, cols: [number, number], rows: [number, number]): Building => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const i = between(...cols), j = between(...rows);
      if (i === CENTER.i && j === CENTER.j) continue;
      const local: WorldPoint = [150 + rand() * 276, 120 + rand() * 170];
      if (ROAD_ROWS.includes(j) && Math.abs(local[1] - TRUNK.y) < 110) continue;
      if (ROAD_COLS.includes(i) && Math.abs(local[0] - TRUNK.x) < 130) continue;
      return { kind, i, j, local };
    }
    return { kind, i: cols[0], j: rows[0], local: [288, 300] };
  };
  return [place("datacenter", [0, 2], [0, 2]), place("charging", [6, 8], [0, 3]), place("coldstorage", [0, 3], [6, 8]), place("miningfarm", [5, 8], [6, 8])];
})();
/** Every building (and the exchange) is drawn and collides at this multiple of its 8 px-cell art: 1.25 makes each cell exactly
 * 10 px, so the fronts are rendered straight at whole 10 px cells with no resampling. */
const BUILDING_SCALE = 1.25;
/** Where each building's friendly local stands, relative to the building: just off its right front corner, beside the steps and
 * in line with the (sheared) front, clear of the door and the way up to it, of the footprint and of the parked horse (left of the door). */
const GUIDE_OFFSET: WorldPoint = [96 * BUILDING_SCALE, 28 * BUILDING_SCALE];
// Sized to the drawn base, reaching back (world -y, where the blocks' side and roof recede) as deep as the blocks: no invisible
// walls, and no walking into a building's side.
const BUILDING_FOOTPRINT = { x: -36, y: -33, w: 72, h: 45 };
const BUILDING_PROP_SCALE = 1.5 * BUILDING_SCALE; // the footprint's terminal prop scale, grown with the art

/** Benches and planters are drawn (and collide) at half the SDK's size; the footprint scales with the prop. */
const SHRUNK_PROPS: Readonly<Partial<Record<WorldPropType, number>>> = { bench: 0.5, planter: 0.5 };
const shrinkProp = (prop: WorldProp): WorldProp => { const factor = SHRUNK_PROPS[prop.type]; return factor ? { ...prop, scale: (prop.scale ?? 1) * factor } : prop; };

/** The farmyard by the Mining Farm: the pigs' mud puddle (30 x 22 world units, about a fifth of the screen wide) at the first offset
 * around the building that is inside the world and clear of its footprint, door, guide and the roads. Tiles leave the yard free of
 * props and patches so nothing overlaps it; roosters and hens roam around it. */
const PUDDLE = (() => {
  const farm = BUILDINGS.find(building => building.kind === "miningfarm")!, rx = 42, ry = 31; // twice the old 30 x 22 area
  const base: WorldPoint = [farm.i * PLANE.w + farm.local[0], farm.j * PLANE.h + farm.local[1]];
  const offsets = ([[-20, 100], [-130, 40], [120, 70], [20, -115], [-140, -50]] as const).map(([dx, dy]) => [dx * BUILDING_SCALE, dy * BUILDING_SCALE] as WorldPoint);
  for (const [dx, dy] of offsets) {
    const centre: WorldPoint = [base[0] + dx, base[1] + dy];
    const i = Math.floor(centre[0] / PLANE.w), j = Math.floor(centre[1] / PLANE.h), local = [centre[0] - i * PLANE.w, centre[1] - j * PLANE.h];
    if (centre[0] < rx + 40 || centre[1] < ry + 40 || centre[0] > WORLD_SIZE.width - rx - 40 || centre[1] > WORLD_SIZE.height - ry - 40) continue;
    if (ROAD_ROWS.includes(j) && Math.abs(local[1] - TRUNK.y) < ry + 60) continue;
    if (ROAD_COLS.includes(i) && Math.abs(local[0] - TRUNK.x) < rx + 60) continue;
    if (i === CENTER.i && j === CENTER.j) continue;
    return { centre, rx, ry };
  }
  return { centre: [base[0] - 20, base[1] + 100] as WorldPoint, rx, ry };
})();
/** The puddle's outline is not a clean ellipse: the radius wobbles around it (in units of rx/ry), and a few separate blots lie nearby. */
const puddleRadius = (angle: number) => 1 + 0.16 * Math.sin(3 * angle + 0.8) + 0.1 * Math.sin(5 * angle + 2.1) + 0.06 * Math.sin(7 * angle);
const PUDDLE_BLOTS: readonly { dx: number; dy: number; rx: number; ry: number }[] = [
  { dx: 0.95, dy: 0.75, rx: 0.22, ry: 0.2 }, { dx: -1.05, dy: 0.55, rx: 0.16, ry: 0.14 }, { dx: 0.6, dy: -1.05, rx: 0.18, ry: 0.15 }, { dx: -0.75, dy: -0.95, rx: 0.12, ry: 0.11 },
].map(blot => ({ dx: blot.dx, dy: blot.dy, rx: blot.rx, ry: blot.ry }));
const PIG_RANGE = 170; // world units from the puddle's centre that pigs may wander before turning back
/** The chickens' side of the farmyard: the puddle's mirror image across the Mining Farm, kept inside the world. Roosters and hens
 * live here and only occasionally cross to the pigs' side for a visit. */
const YARD = (() => {
  const farm = BUILDINGS.find(building => building.kind === "miningfarm")!;
  const base: WorldPoint = [farm.i * PLANE.w + farm.local[0], farm.j * PLANE.h + farm.local[1]];
  const centre: WorldPoint = [
    Math.max(80, Math.min(WORLD_SIZE.width - 80, base[0] + (base[0] - PUDDLE.centre[0]))),
    Math.max(80, Math.min(WORLD_SIZE.height - 80, base[1] + (base[1] - PUDDLE.centre[1]))),
  ];
  return { centre, range: 160 };
})();
const nearPuddle = (x: number, y: number, margin: number) => ((x - PUDDLE.centre[0]) / (PUDDLE.rx + margin)) ** 2 + ((y - PUDDLE.centre[1]) / (PUDDLE.ry + margin)) ** 2 <= 1;

/** The Mining Pool: one water patch eight times a normal patch's area (normal patches are 90-170 x 40-70 units; this one is
 * 360 x 160), placed on a seeded tile with no building, clear of the roads and the farmyard. Its tile keeps other patches and
 * props out of the pool and a margin around it, a wooden sign stands at its front corner, and the frogs live in and around it. */
const POOL = (() => {
  const w = 360, h = 160, rand = seeded(4711);
  for (let attempt = 0; attempt < 400; attempt++) {
    const i = Math.floor(rand() * GRID.cols), j = Math.floor(rand() * GRID.rows);
    if ((i === CENTER.i && j === CENTER.j) || BUILDINGS.some(building => building.i === i && building.j === j)) continue;
    const x = 60 + rand() * (PLANE.w - w - 120), y = 50 + rand() * (PLANE.h - h - 100);
    if (ROAD_ROWS.includes(j) && !(y > TRUNK.y + 70 || y + h < TRUNK.y - 70)) continue;
    if (ROAD_COLS.includes(i) && !(x > TRUNK.x + 80 || x + w < TRUNK.x - 80)) continue;
    const rect = { x: i * PLANE.w + x, y: j * PLANE.h + y, w, h };
    if (Math.hypot(rect.x + w / 2 - PUDDLE.centre[0], rect.y + h / 2 - PUDDLE.centre[1]) < 500) continue;
    return { ...rect, tile: { i, j }, centre: [rect.x + w / 2, rect.y + h / 2] as WorldPoint, sign: [rect.x + w - 24, rect.y + h + 14] as WorldPoint };
  }
  const rect = { x: CENTER.i * PLANE.w + PLANE.w + 100, y: CENTER.j * PLANE.h + 100, w, h };
  return { ...rect, tile: { i: CENTER.i + 1, j: CENTER.j }, centre: [rect.x + w / 2, rect.y + h / 2] as WorldPoint, sign: [rect.x + w - 24, rect.y + h + 14] as WorldPoint };
})();
const inRect = (point: WorldPoint, rect: { x: number; y: number; w: number; h: number }, margin = 0) =>
  point[0] >= rect.x - margin && point[0] <= rect.x + rect.w + margin && point[1] >= rect.y - margin && point[1] <= rect.y + rect.h + margin;
const inPool = (point: WorldPoint, margin = 0) => inRect(point, POOL, margin);

/** Every terrain feature placed so far, in world units, so new ones never overlap old ones, across tile edges too. Seeded with the
 * central garden's own props and patches because the tiles around it are generated first. */
const PROP_RADIUS: Readonly<Partial<Record<WorldPropType, number>>> = { tree: 52, rock: 28, reeds: 24, bench: 22, planter: 18, flower: 14 };
const propRadius = (prop: WorldProp) => (PROP_RADIUS[prop.type] ?? 24) * (prop.scale ?? 1);
const PLACED_PROPS: { x: number; y: number; r: number }[] = garden.props.map(shrinkProp).map(prop => ({ x: CENTER.i * PLANE.w + prop.x, y: CENTER.j * PLANE.h + prop.y, r: propRadius(prop) }));
const PLACED_PATCHES: Rect[] = garden.patches.map(patch => ({ x: CENTER.i * PLANE.w + patch.x, y: CENTER.j * PLANE.h + patch.y, w: patch.w, h: patch.h }));
const PATCH_GAP = 16; // world units kept clear between any two patches
const rectsOverlap = (a: Rect, b: Rect, gap: number) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
const circleHitsRect = (x: number, y: number, r: number, rect: Rect) => Math.hypot(x - Math.max(rect.x, Math.min(rect.x + rect.w, x)), y - Math.max(rect.y, Math.min(rect.y + rect.h, y))) < r;

function makeTile(i: number, j: number): Tile {
  const base = {
    id: `outlaw-${i}-${j}`, name: `Outlaw country ${i},${j}`, family: garden.family, setting: garden.setting,
    shape: "plane", summary: "Open country around the garden.", variant: "complete" as const,
    geometry: { polygons: [fullPlane], holes: [], depth: 18 }, actors: [], signals: [], missingChunks: [],
  };
  let source: Record<string, unknown>;
  if (i === CENTER.i && j === CENTER.j) {
    // The garden's path stops short of its edges; connectors join it to the neighbours' trunk paths.
    const connectors = [
      { points: [[0, TRUNK.y], [64, TRUNK.y]], width: 22 },
      { points: [[464, 232], [520, 232], [520, TRUNK.y], [PLANE.w, TRUNK.y]], width: 22 },
      { points: [[TRUNK.x, 0], [TRUNK.x, 144], [320, 144]], width: 22 },
      { points: [[320, 232], [320, 300], [TRUNK.x, 300], [TRUNK.x, PLANE.h]], width: 22 },
    ];
    // The Centralised Exchange keeps a terminal prop for its collision footprint only; the storefront sprite is drawn in its place.
    source = { ...base, props: [...garden.props.map(shrinkProp), { type: "terminal", x: 220, y: 155, scale: BUILDING_PROP_SCALE, footprint: BUILDING_FOOTPRINT }], paths: [...garden.paths, ...connectors], patches: garden.patches };
  } else {
    const rand = seeded(1000 + i * 31 + j * 7), pick = (min: number, max: number) => min + rand() * (max - min);
    const paths: { points: WorldPoint[]; width: number }[] = [];
    const roadRow = ROAD_ROWS.includes(j), roadCol = ROAD_COLS.includes(i);
    const building = BUILDINGS.find(entry => entry.i === i && entry.j === j);
    const nearBuilding = (x: number, y: number, margin: number) => Boolean(building) &&
      (Math.hypot(x - building!.local[0], y - building!.local[1]) < margin * BUILDING_SCALE || Math.hypot(x - building!.local[0] - GUIDE_OFFSET[0], y - building!.local[1] - GUIDE_OFFSET[1]) < margin * 0.8);
    // The way up to a building's door (the strip straight below it on screen, where the world's x and y grow together) stays open.
    const beforeDoor = (x: number, y: number) => Boolean(building) &&
      Math.abs((x - building!.local[0]) - (y - building!.local[1])) < 80 && (x - building!.local[0]) + (y - building!.local[1]) > 0 && (x - building!.local[0]) + (y - building!.local[1]) < 380;
    if (roadRow) {
      // Intersection tiles keep the road straight so the crossing reads cleanly; others get an elbow.
      const x1 = pick(150, 250), x2 = pick(330, 430), y1 = roadCol ? TRUNK.y : TRUNK.y + pick(-90, 90);
      paths.push({ points: [[0, TRUNK.y], [x1, TRUNK.y], [x1, y1], [x2, y1], [x2, TRUNK.y], [PLANE.w, TRUNK.y]], width: 22 });
    }
    if (roadCol) {
      const y1 = pick(90, 160), y2 = pick(220, 300), x1 = roadRow ? TRUNK.x : TRUNK.x + pick(-110, 110);
      paths.push({ points: [[TRUNK.x, 0], [TRUNK.x, y1], [x1, y1], [x1, y2], [TRUNK.x, y2], [TRUNK.x, PLANE.h]], width: 22 });
    }
    const onPath = (x: number, y: number, margin: number) =>
      (roadRow && Math.abs(y - TRUNK.y) < margin) || (roadCol && Math.abs(x - TRUNK.x) < margin);
    const patches: { x: number; y: number; w: number; h: number; pattern: "dither" | "dense" | "grid" | "water" }[] = [];
    const poolHere = POOL.tile.i === i && POOL.tile.j === j;
    if (poolHere) { patches.push({ x: POOL.x - i * PLANE.w, y: POOL.y - j * PLANE.h, w: POOL.w, h: POOL.h, pattern: "water" }); PLACED_PATCHES.push({ x: POOL.x, y: POOL.y, w: POOL.w, h: POOL.h }); }
    const inPoolLocal = (x: number, y: number, margin: number) => poolHere && inPool([i * PLANE.w + x, j * PLANE.h + y], margin);
    for (let attempt = 0; attempt < 40 && patches.length < (poolHere ? 3 : 3); attempt++) {
      const w = pick(90, 170), h = pick(40, 70), x = pick(20, PLANE.w - w - 20), y = pick(20, PLANE.h - h - 20);
      if ([[x, y], [x + w, y], [x, y + h], [x + w, y + h]].some(([cx, cy]) => inPoolLocal(cx, cy, 40))) continue;
      if (onPath(x, y, 60) || onPath(x + w, y + h, 60) || onPath(x, y + h, 60) || onPath(x + w, y, 60)) continue;
      // No road runs through a patch (water above all): test the whole patch against every segment of the tile's roads, bends included.
      if (paths.some(path => path.points.slice(1).some(([bx, by], index) => {
        const [ax, ay] = path.points[index], reach = path.width / 2 + 16;
        return rectsOverlap({ x, y, w, h }, { x: Math.min(ax, bx) - reach, y: Math.min(ay, by) - reach, w: Math.abs(bx - ax) + reach * 2, h: Math.abs(by - ay) + reach * 2 }, 0);
      }))) continue;
      if (nearBuilding(x + w / 2, y + h / 2, 150) || beforeDoor(x + w / 2, y + h / 2)) continue;
      if ([[x, y], [x + w, y], [x, y + h], [x + w, y + h], [x + w / 2, y + h / 2]].some(([cx, cy]) => nearPuddle(i * PLANE.w + cx, j * PLANE.h + cy, 50))) continue;
      // Patches never overlap each other, here or on a neighbouring tile.
      const world: Rect = { x: i * PLANE.w + x, y: j * PLANE.h + y, w, h };
      if (PLACED_PATCHES.some(other => rectsOverlap(world, other, PATCH_GAP))) continue;
      const roll = rand();
      patches.push({ x, y, w, h, pattern: roll < 0.45 ? "dither" : roll < 0.7 ? "dense" : roll < 0.85 ? "grid" : "water" });
      PLACED_PATCHES.push(world);
    }
    const types: WorldPropType[] = ["tree", "tree", "tree", "flower", "flower", "flower", "reeds", "bench", "rock", "planter"];
    const props: WorldProp[] = [];
    for (let attempt = 0; attempt < 60 && props.length < 8; attempt++) {
      const x = pick(40, PLANE.w - 40), y = pick(40, PLANE.h - 40);
      if (onPath(x, y, 44) || nearBuilding(x, y, 110) || beforeDoor(x, y) || nearPuddle(i * PLANE.w + x, j * PLANE.h + y, 80)) continue;
      // Nothing stands in water: skip any spot inside a water patch (plus a margin) or near the Mining Pool.
      if (patches.some(patch => patch.pattern === "water" && x >= patch.x - 30 && x <= patch.x + patch.w + 30 && y >= patch.y - 30 && y <= patch.y + patch.h + 30)) continue;
      if (inPoolLocal(x, y, 130)) continue; // keeps the signpost and banks clear of tall props
      const type = types[Math.floor(rand() * types.length)];
      const prop = shrinkProp({ type, x, y, scale: type === "flower" ? pick(0.75, 0.95) : pick(0.85, 1.15) });
      // Props keep clear of every other prop (by both their sizes) and of every patch, across tile edges too.
      const wx = i * PLANE.w + x, wy = j * PLANE.h + y, r = propRadius(prop);
      if (PLACED_PROPS.some(other => Math.hypot(wx - other.x, wy - other.y) < r + other.r)) continue;
      if (PLACED_PATCHES.some(patch => circleHitsRect(wx, wy, r * 0.6, patch))) continue;
      props.push(prop);
      PLACED_PROPS.push({ x: wx, y: wy, r });
    }
    // A building keeps a terminal prop for its collision footprint only; its sprite is drawn in its place.
    if (building) props.push({ type: "terminal", x: building.local[0], y: building.local[1], scale: BUILDING_PROP_SCALE, footprint: BUILDING_FOOTPRINT });
    source = { ...base, props, paths, patches };
  }
  const world = validateWorld(source);
  return { i, j, offset: [i * PLANE.w, j * PLANE.h], world, terrain: validateWorld({ ...source, props: [] }) };
}

const TILES: readonly Tile[] = Array.from({ length: GRID.rows }, (_, j) => Array.from({ length: GRID.cols }, (_, i) => makeTile(i, j))).flat();
const PROP_TYPES_USED = [...new Set(TILES.flatMap(tile => tile.world.props.map(prop => prop.type)))];
const PROPS = TILES.flatMap(tile => tile.world.props.map(prop => ({ ...prop, x: prop.x + tile.offset[0], y: prop.y + tile.offset[1] })));
const centerOffset = TILES.find(tile => tile.i === CENTER.i && tile.j === CENTER.j)!.offset;
const spawn: WorldPoint = [centerOffset[0] + 288, centerOffset[1] + 192];
const store = { position: [centerOffset[0] + 220, centerOffset[1] + 155] as WorldPoint };
/** The bees' tree: the first tree more than 900 units from the start, so the swarm is a find rather than a welcome. The Honeypot
 * arrives next to it and the bees leave the tree to follow him. */
const HIVE: WorldPoint = (() => {
  const trees = PROPS.filter(prop => prop.type === "tree").map(prop => [prop.x, prop.y] as WorldPoint);
  const [sx, sy] = [centerOffset[0] + 288, centerOffset[1] + 192];
  return trees.sort((a, b) => Math.hypot(a[0] - sx, a[1] - sy) - Math.hypot(b[0] - sx, b[1] - sy)).find(tree => Math.hypot(tree[0] - sx, tree[1] - sy) > 900) ?? trees[0] ?? [sx + 600, sy];
})();
const SWARM_RADIUS = 45; // world units: how far a bee buzzes from the tree or the Honeypot before turning back
const PLACED_BUILDINGS = BUILDINGS.map(building => ({ kind: building.kind, position: [building.i * PLANE.w + building.local[0], building.j * PLANE.h + building.local[1]] as WorldPoint }));
/** A friendly local stands beside each building; an arrow above their head shows the way to the wanted outlaw. */
const GUIDES = PLACED_BUILDINGS.map(building => ({ position: [building.position[0] + GUIDE_OFFSET[0], building.position[1] + GUIDE_OFFSET[1]] as WorldPoint }));

function tileIndexAt(point: WorldPoint) {
  const i = Math.min(GRID.cols - 1, Math.max(0, Math.floor(point[0] / PLANE.w)));
  const j = Math.min(GRID.rows - 1, Math.max(0, Math.floor(point[1] / PLANE.h)));
  return j * GRID.cols + i;
}
const tileAt = (point: WorldPoint): Tile => TILES[tileIndexAt(point)];
const tileRing = (index: number, other: number) => Math.max(Math.abs(TILES[index].i - TILES[other].i), Math.abs(TILES[index].j - TILES[other].j));

/** Global walkability: inside the world, and clear of props and water on whichever tile each sample point falls in. */
function walkable(point: WorldPoint, radius: number) {
  const [x, y] = point;
  if (x < radius || y < radius || x > WORLD_SIZE.width - radius || y > WORLD_SIZE.height - radius) return false;
  const samples: WorldPoint[] = radius ? [[x, y], [x - radius, y], [x + radius, y], [x, y - radius], [x, y + radius]] : [[x, y]];
  return samples.every(sample => {
    const tile = tileAt(sample);
    const local: WorldPoint = [
      Math.min(PLANE.w - 0.01, Math.max(0.01, sample[0] - tile.offset[0])),
      Math.min(PLANE.h - 0.01, Math.max(0.01, sample[1] - tile.offset[1])),
    ];
    return isWorldWalkable(tile.world, local, 0);
  });
}

// Native (unscaled) projected px per second: 240 px/s on screen, exactly 4 px a frame at 60 fps (2 at 120), so walking steps evenly;
// the horse's 2x makes 480 px/s, 8 px a frame at 60 fps (4 at 120).
const SPEED = 120;
const RADIUS = 5; // collision disk, world units
const keysForMovement = new Set(["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"]);
const directions: Readonly<Record<string, SpriteFacing>> = { arrowup: "up", arrowdown: "down", arrowleft: "left", arrowright: "right", w: "up", s: "down", a: "left", d: "right" };
const vectors: Readonly<Record<SpriteFacing, WorldPoint>> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** Cross-tile player movement in projected screen space, like the SDK's movement utility, with axis sliding. */
function createMovement(start: WorldPoint, canWalk: (point: WorldPoint, radius: number) => boolean) {
  let position: WorldPoint = [...start], facing: SpriteFacing = "down", walking = false, destination: WorldPoint | null = null, factor = 1;
  const held = new Map<string, SpriteFacing>();
  const stop = () => { held.clear(); destination = null; walking = false; };
  return {
    get state() { return { position: [...position] as WorldPoint, facing, walking, pushing: held.size > 0 }; },
    /** Where a tap sent the Friend, until they arrive or are stopped (null while walking by keys). */
    get destination() { return destination ? [...destination] as WorldPoint : null; },
    setKey(key: string, pressed: boolean) {
      const direction = directions[key.toLowerCase()];
      if (!direction) return false;
      if (pressed) { destination = null; held.set(key.toLowerCase(), direction); } else held.delete(key.toLowerCase());
      return true;
    },
    moveTo(point: WorldPoint) { held.clear(); destination = point; },
    stop,
    setSpeed(next: number) { factor = next; },
    update(deltaMs: number) {
      walking = false;
      const [sx, sy] = project(...position);
      let dx = 0, dy = 0, step = Math.min(40, deltaMs) * SPEED * factor / 1000;
      const inputs = [...new Set(held.values())];
      if (inputs.length) {
        for (const direction of inputs) { dx += vectors[direction][0]; dy += vectors[direction][1]; }
        const magnitude = Math.hypot(dx, dy);
        if (magnitude) { dx /= magnitude; dy /= magnitude; facing = [...inputs].reverse().find(direction => vectors[direction][0] * dx + vectors[direction][1] * dy > 0)!; }
      } else if (destination) {
        const [tx, ty] = project(...destination), far = Math.hypot(tx - sx, ty - sy);
        if (far < 1.5) destination = null;
        else { dx = (tx - sx) / far; dy = (ty - sy) / far; step = Math.min(step, far); facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down"); }
      }
      if (step > 0 && (dx || dy)) {
        const next = unproject(sx + dx * step, sy + dy * step);
        if (canWalk(next, RADIUS)) { position = next; walking = true; }
        else if (destination) destination = null;
        else if (dx && dy) {
          const slide = [unproject(sx + dx * step, sy), unproject(sx, sy + dy * step)].find(point => canWalk(point, RADIUS));
          if (slide) { position = slide; walking = true; }
        }
      }
      // pushing: a direction key is held, even when the step was blocked (pressed against a building's front).
      return { position: [...position] as WorldPoint, facing, walking, pushing: held.size > 0 };
    },
  };
}

// ---------------------------------------------------------------------------
// Interiors: each building (except the exchange) is 2 x 2 rooms behind its door
// ---------------------------------------------------------------------------

type Scene = "outside" | BuildingKind;
type Rect = { x: number; y: number; w: number; h: number; kind?: "asic" | "terminal" | "charger" | "mint" | "cryo" | "vault" | "hatch" | "settlement" | "pedestal"; slot?: number };
type Interior = { kind: BuildingKind; label: string; width: number; height: number; walls: Rect[]; furniture: Rect[]; entrance: WorldPoint; spawn: WorldPoint };
const ROOM = { w: 200, h: 140 }, WALL = 12, DOOR = 44, WALL_LIFT = 40, FURNITURE_LIFT = 14, DOOR_COOLDOWN = 1200;
const SCENES: readonly BuildingKind[] = BUILDING_KINDS;

/** A wall of thickness WALL along one axis with DOOR-wide gaps centred at `gaps`, split into short pieces so they depth-sort well. */
function wallRun(axis: "x" | "y", at: number, from: number, to: number, gaps: number[]): Rect[] {
  const openings = gaps.map(gap => [gap - DOOR / 2, gap + DOOR / 2] as const).sort((a, b) => a[0] - b[0]);
  const spans: [number, number][] = [];
  let cursor = from;
  for (const [a, b] of openings) { if (a > cursor) spans.push([cursor, a]); cursor = Math.max(cursor, b); }
  if (cursor < to) spans.push([cursor, to]);
  return spans.map(([a, b]) => (axis === "x" ? { x: a, y: at, w: b - a, h: WALL } : { x: at, y: a, w: WALL, h: b - a }));
}
function makeInterior(kind: BuildingKind): Interior {
  const width = ROOM.w * 2 + WALL * 3, height = ROOM.h * 2 + WALL * 3;
  const midX = WALL + ROOM.w, midY = WALL + ROOM.h;
  const col = (i: number) => WALL + i * (ROOM.w + WALL) + ROOM.w / 2, row = (j: number) => WALL + j * (ROOM.h + WALL) + ROOM.h / 2;
  const entranceX = col(0);
  const walls = [
    // Walls meet instead of overlapping, so their boxes never fight over depth: the outer top and bottom walls run the full width,
    // the outer side walls fit between them, and the middle cross wall stops either side of the middle wall that runs through it.
    ...wallRun("x", 0, 0, width, []), ...wallRun("x", height - WALL, 0, width, [entranceX]),
    ...wallRun("y", 0, WALL, height - WALL, []), ...wallRun("y", width - WALL, WALL, height - WALL, []),
    ...wallRun("y", midX, WALL, height - WALL, [row(0), row(1)]),
    ...wallRun("x", midY, WALL, midX, [col(0)]), ...wallRun("x", midY, midX + WALL, width - WALL, [col(1)]),
  ];
  const furniture: Rect[] = kind === "datacenter" ? [
    // Top left: the achievements terminal alone. Top right: the Licence Settlement terminal alone. Bottom left: a bench. Bottom
    // right: the trophy hall, twelve pedestals in three rows of four with walkways between (26 and 22 units) and round them.
    { x: col(0) - 14, y: row(0) - 10, w: 28, h: 20, kind: "terminal" as const },
    { x: col(1) - 14, y: row(0) - 10, w: 28, h: 20, kind: "settlement" as const },
    { x: col(0) - 20, y: row(1) - 7, w: 40, h: 14 },
    ...[0, 1, 2].flatMap(r => [0, 1, 2, 3].map(c => ({ x: midX + WALL + 29 + c * 42, y: midY + WALL + 24 + r * 38, w: 16, h: 16, kind: "pedestal" as const, slot: r * 4 + c }))),
  ] : kind === "charging" ? [
    // The top-left room holds only the charging terminal (the Laser Gun reloads there); then a service counter and a battery bank.
    { x: col(0) - 14, y: row(0) - 10, w: 28, h: 20, kind: "charger" as const },
    { x: col(1) - 50, y: WALL + 14, w: 100, h: 16 }, { x: col(0) - 50, y: row(1) - 20, w: 100, h: 40 },
    { x: col(1) - 40, y: row(1) + 10, w: 14, h: 14 }, { x: col(1) + 26, y: row(1) + 10, w: 14, h: 14 },
  ] : kind === "coldstorage" ? [
    // Top left: the mint terminal alone. Top right: a row of three glass cylinders of liquid nitrogen, a Friend frozen in each.
    // Bottom left: a pallet stack. Bottom right: The Vault's terminal alone, and an open hatch with stairs down in the room's back
    // corner (for show: it cannot be walked into, and leads nowhere).
    { x: col(0) - 14, y: row(0) - 10, w: 28, h: 20, kind: "mint" as const },
    ...[-1, 0, 1].map((k, slot) => ({ x: col(1) + k * 52 - 13, y: row(0) - 13, w: 26, h: 26, kind: "cryo" as const, slot })),
    { x: col(1) - 14, y: row(1) - 10, w: 28, h: 20, kind: "vault" as const },
    { x: midX + WALL + 6, y: midY + WALL + 6, w: 36, h: 36, kind: "hatch" as const },
    { x: col(0) - 30, y: row(1) + 10, w: 60, h: 24 },
  ] : [
    // The Mining Farm's ASIC racks stand as one tight block of five rows in the middle of each room (4-unit gaps, too narrow to
    // walk into), spanning x 57-143 and y 40-100 of the room: 57 units clear either side and 40 above and below, so you can walk
    // all the way round the block, and the doorways, entrance and spawn spot stay clear.
    ...[0, 1].flatMap(i => [0, 1].flatMap(j => [57, 75, 93, 111, 129].map(dx => ({ x: WALL + i * (ROOM.w + WALL) + dx, y: WALL + j * (ROOM.h + WALL) + 40, w: 14, h: 60, kind: "asic" as const })))),
  ];
  return { kind, label: `the ${BUILDING_NAMES[kind]}`, width, height, walls, furniture,
    entrance: [entranceX, height - WALL / 2], spawn: [entranceX, height - WALL - 26] };
}
/** In front of the Data Center's door: where the guides point while a licence waits to be settled there. Worked out on first use,
 * after every building constant exists. */
let dataCenterDoorSpot: WorldPoint | null = null;
const dataCenterDoor = (): WorldPoint => (dataCenterDoorSpot ??= doorExit("datacenter", PLACED_BUILDINGS.find(entry => entry.kind === "datacenter")!.position));
/** The light ground patches in Western range colours instead of white: sparse dots on sand, the dense checkerboard on dry red clay
 * and the grid of crosses on sage scrub (the unused hatch on sand). Water patches, paths and the plain ground keep the SDK's
 * one-bit look. The SDK's terrain drawing is changed before it is loaded: each light pattern gets a coloured copy, and only the
 * patch rectangles switch to it (paths use the same dotted pattern as a stroke, and keep the white one). */
const GROUND_COLOURS: Readonly<Record<"dither" | "dense" | "grid" | "hatch", string>> = { dither: "#ead7a4", dense: "#d9a98c", grid: "#c8d3b0", hatch: "#ead7a4" };
/** Add a copy of one of the SDK drawing's patterns (`dither`, `dense`, `water` ...) with its background replaced by `colour`, as
 * `${id}-${base}-${suffix}`; its black dots and lines stay black. The drawing is returned unchanged if the pattern is not there. */
function tintedPattern(svg: string, id: string, base: string, suffix: string, colour: string): string {
  const pattern = new RegExp(`<pattern id="${id}-${base}"[^>]*>[\\s\\S]*?</pattern>`).exec(svg)?.[0]; if (!pattern) return svg;
  const size = /width="(\d+)"/.exec(pattern)?.[1] ?? "4";
  const opening = pattern.slice(0, pattern.indexOf(">") + 1).replace(`id="${id}-${base}"`, `id="${id}-${base}-${suffix}"`);
  const inner = pattern.slice(pattern.indexOf(">") + 1).replace(/^<rect width="\d+" height="\d+" fill="#[0-9a-fA-F]{3,6}"\/>/, "");
  return svg.replace(pattern, `${pattern}${opening}<rect width="${size}" height="${size}" fill="${colour}"/>${inner}`);
}
/** The SDK outlines each tile's ground in black. Tiles are laid side by side, so on an edge shared with the next tile that outline
 * shows as a black strip across any road running over it. Those outlines are left out; the world's own border keeps its. */
function seamless(svg: string, i: number, j: number): string {
  const inner = { west: i > 0, east: i < GRID.cols - 1, north: j > 0, south: j < GRID.rows - 1 }, near = (a: number, b: number) => Math.abs(a - b) < 0.5;
  return svg.replace(/<polyline points="([^"]+)" fill="none" stroke="#000" stroke-width="2"\/>/g, (match, list: string) => {
    const ends = list.trim().split(/\s+/).map(pair => { const [x, y] = pair.split(",").map(Number); return unproject(x, y); });
    const on = (test: (point: WorldPoint) => boolean) => ends.every(test);
    const seam = (inner.west && on(p => near(p[0], 0))) || (inner.east && on(p => near(p[0], PLANE.w))) || (inner.north && on(p => near(p[1], 0))) || (inner.south && on(p => near(p[1], PLANE.h)));
    return seam ? "" : match;
  });
}
/** The dusty wagon-trail brown of the dotted paths (the black roads with white dashes are separate). */
const PATH_COLOUR = "#cdb593";
/** The dark blue of the water patches and the Mining Pool. */
const WATER_COLOUR = "#1f3b63";
function sandyPatches(svg: string): string {
  const id = /id="(rf-[^"]*?)-dither"/.exec(svg)?.[1]; if (!id) return svg;
  let out = svg;
  // The dotted trails: the same dotted pattern, as a stroke, on wagon-trail brown.
  out = tintedPattern(out, id, "dither", "trail", PATH_COLOUR).split(`stroke="url(#${id}-dither)"`).join(`stroke="url(#${id}-dither-trail)"`);
  // Water patches (the Mining Pool included): dark blue behind the white ripples instead of black.
  out = tintedPattern(out, id, "water", "blue", WATER_COLOUR).split(`fill="url(#${id}-water)" stroke="#000" stroke-width="1"/>`).join(`fill="url(#${id}-water-blue)" stroke="#000" stroke-width="1"/>`);
  for (const name of ["dither", "dense", "grid", "hatch"] as const) {
    out = tintedPattern(out, id, name, "ground", GROUND_COLOURS[name]);
    out = out.split(`fill="url(#${id}-${name})" stroke="#000" stroke-width="1"/>`).join(`fill="url(#${id}-${name}-ground)" stroke="#000" stroke-width="1"/>`);
  }
  return out;
}
const BENCH_WOOD = "#c4a482", BENCH_WOOD_SIDE = "#a8865f", BENCH_WOOD_DARK = "#6f5136";
const ROCK_COLOUR = "#bab2a5", REED_STEM = "#a9b27c", REED_HEAD = "#9c7a58", POT_COLOUR = "#d38d70", POT_SOIL = "#8c6a4c", POT_BLOOM = "#ef9a8a", POT_LEAF = "#b9c79c";
/** The planter's plants, redrawn: the SDK's are misdrawn (square leaves off their branch tips, a tiny flower tangled into one stem).
 * Half the planters hold a small saguaro with a pink bloom, the other half three exotic flowers on clean stems with leaves. */
const POT_FRONT = "#9a5c45";
const CACTUS = "#8fb07a", CACTUS_RIB = "#6f8f5c", POT_PINK = "#f2a7bf", POT_ORCHID = "#dd96d0", POT_YELLOW = "#efd97a";
type PlanterPlant = "cactus" | "flowers";
const PLANTER_PLANTS: Readonly<Record<PlanterPlant, string>> = {
  cactus: `<path d="M-4-29H-9a4 4 0 0 1-4-4V-41a2.5 2.5 0 0 1 5 0V-34H-4" fill="${CACTUS}" stroke="#000" stroke-width="2" stroke-linejoin="round"/><path d="M4-33H9a4 4 0 0 0 4-4V-44a2.5 2.5 0 0 0-5 0V-38H4" fill="${CACTUS}" stroke="#000" stroke-width="2" stroke-linejoin="round"/><path d="M-4.5-19V-48a4.5 4.5 0 0 1 9 0V-19Z" fill="${CACTUS}" stroke="#000" stroke-width="2" stroke-linejoin="round"/><path d="M0-21V-49M-10.5-34V-41M10.5-38V-44" stroke="${CACTUS_RIB}" stroke-width="1.2"/><circle cx="0" cy="-53.5" r="2.6" fill="${POT_PINK}" stroke="#000" stroke-width="1"/>`,
  flowers: `<path d="M-7-20Q-9-30-10-39M0-18V-48M7-21Q9-31 11-40" stroke="#000" stroke-width="2.5" fill="none"/><ellipse cx="-12" cy="-29" rx="4.2" ry="1.9" transform="rotate(-35 -12 -29)" fill="${POT_LEAF}" stroke="#000" stroke-width="1.3"/><ellipse cx="4" cy="-30" rx="4.2" ry="1.9" transform="rotate(30 4 -30)" fill="${POT_LEAF}" stroke="#000" stroke-width="1.3"/><ellipse cx="-4" cy="-37" rx="4.2" ry="1.9" transform="rotate(-30 -4 -37)" fill="${POT_LEAF}" stroke="#000" stroke-width="1.3"/><ellipse cx="13" cy="-33" rx="4.2" ry="1.9" transform="rotate(-30 13 -33)" fill="${POT_LEAF}" stroke="#000" stroke-width="1.3"/><circle cx="-10.0" cy="-43.9" r="2.3" fill="${POT_BLOOM}" stroke="#000" stroke-width="1"/><circle cx="-7.24" cy="-41.9" r="2.3" fill="${POT_BLOOM}" stroke="#000" stroke-width="1"/><circle cx="-8.3" cy="-38.65" r="2.3" fill="${POT_BLOOM}" stroke="#000" stroke-width="1"/><circle cx="-11.7" cy="-38.65" r="2.3" fill="${POT_BLOOM}" stroke="#000" stroke-width="1"/><circle cx="-12.76" cy="-41.9" r="2.3" fill="${POT_BLOOM}" stroke="#000" stroke-width="1"/><circle cx="-10" cy="-41" r="1.7" fill="#5b3a1e" stroke="#000" stroke-width="0.8"/><circle cx="0.0" cy="-53.9" r="2.3" fill="${POT_ORCHID}" stroke="#000" stroke-width="1"/><circle cx="2.76" cy="-51.9" r="2.3" fill="${POT_ORCHID}" stroke="#000" stroke-width="1"/><circle cx="1.7" cy="-48.65" r="2.3" fill="${POT_ORCHID}" stroke="#000" stroke-width="1"/><circle cx="-1.7" cy="-48.65" r="2.3" fill="${POT_ORCHID}" stroke="#000" stroke-width="1"/><circle cx="-2.76" cy="-51.9" r="2.3" fill="${POT_ORCHID}" stroke="#000" stroke-width="1"/><circle cx="0" cy="-51" r="1.7" fill="#5b3a1e" stroke="#000" stroke-width="0.8"/><circle cx="11.0" cy="-45.9" r="2.3" fill="${POT_YELLOW}" stroke="#000" stroke-width="1"/><circle cx="13.76" cy="-43.9" r="2.3" fill="${POT_YELLOW}" stroke="#000" stroke-width="1"/><circle cx="12.7" cy="-40.65" r="2.3" fill="${POT_YELLOW}" stroke="#000" stroke-width="1"/><circle cx="9.3" cy="-40.65" r="2.3" fill="${POT_YELLOW}" stroke="#000" stroke-width="1"/><circle cx="8.24" cy="-43.9" r="2.3" fill="${POT_YELLOW}" stroke="#000" stroke-width="1"/><circle cx="11" cy="-43" r="1.7" fill="#5b3a1e" stroke="#000" stroke-width="0.8"/>`,
};
/** Benches, rocks, reeds and planters in the Western palette; their black outlines and dots stay black. Rocks: weathered desert stone behind
 * the dots. Reeds: faded olive under the black stems and cattail-brown heads. Planters: terracotta sides and dark soil on top, with
 * a redrawn plant (`PLANTER_PLANTS`). Like the trees, the SDK drawing is changed before it is loaded, and
 * left as it is if its shapes ever change. */
function westernProp(type: WorldPropType, svg: string, plant: PlanterPlant = "flowers"): string {
  const id = /id="(rf-[^"]*?)-dither"/.exec(svg)?.[1]; if (!id) return svg;
  const swap = (text: string, from: string, to: string) => (text.includes(from) ? text.replace(from, to) : null);
  if (type === "rock") {
    return swap(tintedPattern(svg, id, "dither", "stone", ROCK_COLOUR), `fill="url(#${id}-dither)" stroke="#000" stroke-width="2"/>`, `fill="url(#${id}-dither-stone)" stroke="#000" stroke-width="2"/>`) ?? svg;
  }
  if (type === "reeds") {
    const stems = swap(svg, `stroke="#fff" stroke-width="4.5"`, `stroke="${REED_STEM}" stroke-width="4.5"`);
    return (stems && swap(stems, `fill="#fff" stroke="#000" stroke-width="2"/>`, `fill="${REED_HEAD}" stroke="#000" stroke-width="2"/>`)) ?? svg;
  }
  if (type === "bench") {
    // The SDK's bench is misdrawn (its backrest floats off the seat, the back posts miss the seat's corners and the front legs are
    // uneven), so it is redrawn here in the same projection: a seat slab on four legs, a backrest panel with a slat standing on two
    // posts on the seat's back edge; weathered wood on black iron legs, shaded like the SDK's boxes.
    const start = svg.indexOf(`<path d="M-34-9v15m53-12v14M-28-38v28m53-7v-28"`), endMark = `<path d="M-23-40l43 14" stroke="#000"/>`, end = svg.indexOf(endMark);
    if (start < 0 || end < start) return svg;
    return tintedPattern(svg.slice(0, start) + `<path d="M-16.45 -8.68L-16.45 -19.68M26.85 5.32L26.85 -5.68" stroke="#000" stroke-width="4"/><path d="M-12.12 -24.4L-12.12 -41.4M25.98 -12.08L25.98 -29.08" stroke="#000" stroke-width="4"/><path d="M-15.59 -42.52L29.44 -27.96L29.44 -15.96L-15.59 -30.52Z" fill="${BENCH_WOOD}" stroke="#000" stroke-width="2" stroke-linejoin="miter"/><path d="M-12.99 -35.68L26.85 -22.8" stroke="#000" stroke-width="1"/><path d="M32.91 -10.4L17.32 -5.36L17.32 -0.36L32.91 -5.4Z" fill="url(#${id}-dither-wood)" stroke="#000" stroke-width="2" stroke-linejoin="miter"/><path d="M17.32 -5.36L-32.91 -21.6L-32.91 -16.6L17.32 -0.36Z" fill="${BENCH_WOOD_DARK}" stroke="#000" stroke-width="1.5" stroke-linejoin="miter"/><path d="M-17.32 -26.64L32.91 -10.4L17.32 -5.36L-32.91 -21.6Z" fill="${BENCH_WOOD}" stroke="#000" stroke-width="2" stroke-linejoin="miter"/><path d="M-26.85 -5.32L-26.85 -16.32M16.45 8.68L16.45 -2.32" stroke="#000" stroke-width="4"/>` + svg.slice(end + endMark.length), id, "dither", "wood", BENCH_WOOD_SIDE);
  }
  if (type === "planter") {
    // The box's right side, then its top, both dotted: terracotta, then soil.
    let out: string | null = tintedPattern(tintedPattern(svg, id, "dither", "pot", POT_COLOUR), id, "dither", "soil", POT_SOIL);
    out = swap(out, `fill="url(#${id}-dither)"`, `fill="url(#${id}-dither-pot)"`);
    out = out && swap(out, `fill="url(#${id}-dither)"`, `fill="url(#${id}-dither-soil)"`);
    if (!out) return svg;
    // The pot's front face: dark terracotta (with a black outline) instead of solid black, as the bench's front is dark wood.
    out = swap(out, `fill="#000" stroke="#fff" stroke-width="1.5"`, `fill="${POT_FRONT}" stroke="#000" stroke-width="1.5"`) ?? out;
    // The SDK's plants (a scaled flower, the branching stems and their two square leaves) make way for the chosen plant.
    const start = out.indexOf(`<g transform="translate(-10 -24) scale(.85)">`), endMark = `<path d="M-16-42h8v7h-8M15-55h7v7h-7" fill="#fff" stroke="#000" stroke-width="2"/>`, end = out.indexOf(endMark);
    return start < 0 || end < start ? out : out.slice(0, start) + PLANTER_PLANTS[plant] + out.slice(end + endMark.length);
  }
  return svg;
}
/** Trees in faded pastels: the canopy's white a medium green and the trunk's a faded brown. Every black pixel (outlines, the dotted
 * shading, the branch lines) stays black: the SDK's tree drawing is changed before it is loaded, its white canopy fill recoloured
 * and its two dotted areas given green- and brown-backed copies of the dotted pattern. */
const TREE_LEAF = "#a6c79a", TREE_BARK = "#b39a7c";
function pastelTree(svg: string): string {
  const id = /id="(rf-[^"]*?)-dense"/.exec(svg)?.[1]; if (!id) return svg;
  const dense = new RegExp(`<pattern id="${id}-dense"[^>]*>[\\s\\S]*?</pattern>`).exec(svg)?.[0]; if (!dense) return svg;
  const tinted = (name: string, fill: string) => dense.replace(`id="${id}-dense"`, `id="${id}-dense-${name}"`).replace('fill="#fff"', `fill="${fill}"`);
  const trunk = `<path d="M-5-15h10v20H-5z" fill="url(#${id}-dense)"`, canopy = `fill="#fff" stroke="#000" stroke-width="2"/><path d="M-27-23`;
  const shade = `<path d="M-27-23h16v-8h8v-8h8v-8h24v12h-8v12H5v8h-24z" fill="url(#${id}-dense)"/>`;
  if (![trunk, canopy, shade].every(part => svg.includes(part))) return svg; // a changed SDK drawing: keep it as it is
  // The SDK tree is misdrawn: its shading spills 4 units below the canopy, over the canopy's bottom outline and the top of the
  // trunk, which stops short of the canopy. Here the shading stays inside the canopy (its bottom 2 units above the canopy's, its lowest step 6 units tall),
  // the canopy outline is drawn again over it, and the trunk reaches up under the canopy.
  const outline = `<path d="M-28-19v-16h-8v-24h8v-16h16v-8h24v8h16v16h8v24h-8v16z" fill="none" stroke="#000" stroke-width="2"/>`;
  return svg.replace(dense, `${dense}${tinted("bark", TREE_BARK)}${tinted("leaf", TREE_LEAF)}`)
    .replace(trunk, `<path d="M-5-20h10v25H-5z" fill="url(#${id}-dense-bark)"`)
    .replace(canopy, `fill="${TREE_LEAF}" stroke="#000" stroke-width="2"/><path d="M-27-23`)
    .replace(shade, `<path d="M-25-21V-27h14v-4h8v-8h8v-8h24v12h-8v12H5v2z" fill="url(#${id}-dense-leaf)"/>${outline}`);
}
/** Each building's inside in faded colours: its floor, its walls (the dotted boxes: the dots on this colour, a lighter top) and the
 * red Western rug on the doormat. Furniture is warm off-white, a little darker on the sides. */
const INTERIOR_COLOURS: Readonly<Record<BuildingKind, { floor: string; wall: string; wallTop: string }>> = {
  datacenter: { floor: "#dfe5ea", wall: "#b9c2cc", wallTop: "#e9edf1" },
  charging: { floor: "#e6e1d4", wall: "#cbbf9f", wallTop: "#efe9dc" },
  coldstorage: { floor: "#e3eef5", wall: "#bccbd6", wallTop: "#eef4f8" },
  miningfarm: { floor: "#e7dcc6", wall: "#c9a988", wallTop: "#f0e7d6" },
};
/** The Mining Farm's ASIC racks: steel, so their fan grilles and green and red lights stand out. */
const RACK_TOP = "#9aa6b1", RACK_SIDE = "#6c7883";
const RUG_COLOUR = "#b5604a", FURNITURE_TOP = "#f3ead8", FURNITURE_SIDE = "#e4d6bc";
/** The menu each terminal opens when you walk into it. */
const TERMINAL_MENUS = { terminal: "achievements", charger: "charger", mint: "mint", vault: "vault", settlement: "settlement" } as const;
const INTERIORS = Object.fromEntries(BUILDING_KINDS.map(kind => [kind, makeInterior(kind)])) as Readonly<Record<BuildingKind, Interior>>;
/** The Cold Storage's frozen Friends, one token ID per tube, left to right. A tube whose read fails stays empty. */
const CRYO_FRIEND_IDS: readonly bigint[] = [2208n, 8371n, 268812n];
const rectHits = (x: number, y: number, radius: number, rect: Rect) => {
  const nx = Math.max(rect.x, Math.min(rect.x + rect.w, x)), ny = Math.max(rect.y, Math.min(rect.y + rect.h, y));
  return Math.hypot(x - nx, y - ny) < radius || (radius === 0 && x === nx && y === ny);
};
function interiorWalkable(interior: Interior, point: WorldPoint, radius: number) {
  const [x, y] = point;
  if (x < radius || y < radius || x > interior.width - radius || y > interior.height - radius) return false;
  return ![...interior.walls, ...interior.furniture].some(rect => rectHits(x, y, Math.max(radius, 0.5), rect));
}
const sceneWalkable = (scene: Scene) => (point: WorldPoint, radius: number) =>
  scene === "outside" ? walkable(point, radius) : interiorWalkable(INTERIORS[scene], point, radius);
/** Split a rect into short pieces along its long axis so boxes depth-sort against the characters. */
function splitRect(rect: Rect, size = 32): Rect[] {
  const pieces: Rect[] = [];
  if (rect.w >= rect.h) for (let x = rect.x; x < rect.x + rect.w; x += size) pieces.push({ x, y: rect.y, w: Math.min(size, rect.x + rect.w - x), h: rect.h, kind: rect.kind, slot: rect.slot });
  else for (let y = rect.y; y < rect.y + rect.h; y += size) pieces.push({ x: rect.x, y, w: rect.w, h: Math.min(size, rect.y + rect.h - y), kind: rect.kind, slot: rect.slot });
  return pieces;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

type ItemId = "laser" | "butterfly-net" | "cleaver" | "temp-horse";
/** Pumper carries the top half of a hardware wallet and Dumper the bottom half; only the two combined can be hacked. */
type WalletHalf = "top" | "bottom";
const HALF_OF: Readonly<Record<string, WalletHalf>> = { Pumper: "top", Dumper: "bottom" };
const COMBINED_ID = -2; // the wallet puzzle's npcId for the combined Pumper & Dumper wallet (real NPC ids are positive)
const PAIR = ["Pumper", "Dumper"];
/** `op`: priced in Outlaw Points rather than RF (then `price` is 0n). */
type Item = Readonly<{ id: ItemId; name: string; price: bigint; op?: number; blurb: string; sold: boolean }>;
/** Outlaw Points (OP): the simulated game currency. Earned by neutralizing outlaws and downing animals, spent at the Exchange. */
const OP_BIG_GAME = 5, OP_ANIMAL = 1;
/** A cracked wallet pays OP_PER_TIER x its tier in OP, times 1, 1.5 or 2 for one, two or three stars. A wiped wallet pays none. */
const OP_PER_TIER = 10, OP_STAR_MULTIPLIER = [1, 1, 1.5, 2] as const;
const walletOp = (level: number, stars: number) => Math.round(OP_PER_TIER * (level + 1) * OP_STAR_MULTIPLIER[Math.max(0, Math.min(3, stars))]);

// What else a cracked wallet can hold (simulated, rolled in the browser; only the RF comes from the SDK's plays).
/** The twelve seed phrase words, one new word per cracked wallet (two from a jackpot wallet). */
const SEED_WORDS = ["ember", "saddle", "cactus", "lantern", "canyon", "spur", "mesa", "nugget", "dusk", "rattle", "bounty", "tumbleweed"] as const;
type SeedWord = typeof SEED_WORDS[number];
/** Programs a card can carry: pre-loaded into your first slot when you next open a wallet. Only ones every board can use. */
const CARD_PROGRAMS = ["rollback", "ico", "flashloan", "lowentropy", "multisig", "staking", "explorer"] as const;
type BuildingKey = "datacenter" | "miningfarm";
/** Playtesting: building keys every new game starts with (empty in the released game). */
const PLAYTEST_START_KEYS: readonly BuildingKey[] = ["datacenter"];
const BUILDING_KEYS: Readonly<Record<BuildingKey, { name: string; text: string }>> = {
  datacenter: { name: "Data Center key", text: "The server room is yours: every wanted outlaw shows on your map from now on." },
  miningfarm: { name: "Mining Farm key", text: "The racks mine for you: 1 OP every 30 s, up to 60, collected when you walk into the Mining Farm." },
};
const MINING_MS = 30_000, MINING_CAP = 60;
/** The odds, per loot roll (a jackpot wallet rolls twice): a program card, a building key you lack, intel, a gas voucher, a horse token. */
const LOOT_ODDS = { card: 0.5, key: 0.15, intel: 0.35, gas: 0.4, horse: 0.3 } as const;
/** A cracked wallet's contents as the REWARDS frame shows them: every item with its rarity (OP first), whose wallet, and whether it
 * is a jackpot wallet. */
type Haul = { items: readonly RewardItem[]; jackpot: boolean; outlaw: string };
/** How rare each kind of wallet loot is, for its halo on the REWARDS frame; keepsakes carry their own rarity. */
const KEEPSAKE_RARITY: Readonly<Record<Rarity, LootRarity>> = { Common: "common", Uncommon: "uncommon", Rare: "rare", Legendary: "legendary" };
/** The licence payouts big enough to call a jackpot at the end of a run. */
const JACKPOT_OUTCOMES = ["Vault", "Jackpot"];
/** A keepsake you hold: one of an outlaw's drops (KEEPSAKES.md), how many, and its rarity. */
type OwnedKeepsake = { name: string; outlaw: string; rarity: Rarity; detail: string; count: number; perk?: KeepsakePerk };
/** One of a keepsake stack added to a list (a new row, or one more on its row). */
const addKeepsake = (list: readonly OwnedKeepsake[], keepsake: OwnedKeepsake): OwnedKeepsake[] => list.some(item => item.name === keepsake.name)
  ? list.map(item => (item.name === keepsake.name ? { ...item, count: item.count + 1 } : item)) : [...list, { ...keepsake, count: 1 }];
/** One of a keepsake stack taken off a list (its row goes when the last one does). */
const dropKeepsake = (list: readonly OwnedKeepsake[], name: string): OwnedKeepsake[] =>
  list.flatMap(item => (item.name !== name ? [item] : item.count > 1 ? [{ ...item, count: item.count - 1 }] : []));
/** Settling a licence at the Data Center: each seed word handed in pays more OP than the one before (2, 4, 6 ... 24 OP: 156 for all
 * twelve) and adds one head start for your next licence, in this order. Twelve words also open the Cold Wallet. */
const SEED_OP_STEP = 2;
type HeadStart = { shots: number; intel: number; gas: number; cards: number };
const NO_HEAD_START: HeadStart = { shots: 0, intel: 0, gas: 0, cards: 0 };
const HEAD_START_STEPS: readonly (keyof HeadStart)[] = ["shots", "intel", "gas", "shots", "cards", "intel", "gas", "shots", "cards", "intel", "gas", "shots"];
const HEAD_START_SHOTS = 5; // Laser shots per "shots" step
const seedOp = (words: number) => SEED_OP_STEP * words * (words + 1) / 2;
const headStartFor = (words: number): HeadStart => HEAD_START_STEPS.slice(0, words).reduce((sum, step) => ({ ...sum, [step]: sum[step] + (step === "shots" ? HEAD_START_SHOTS : 1) }), NO_HEAD_START);
const headStartText = (head: HeadStart) => [head.shots && `+${head.shots} Laser shots`, head.intel && `${head.intel} Intel`, head.gas && `${head.gas} gas voucher${head.gas === 1 ? "" : "s"}`,
  head.cards && `${head.cards} program card${head.cards === 1 ? "" : "s"}`].filter(Boolean).join(", ");
/** The Cold Wallet's loot table (twelve seed words): for now only the Permanent Shiny Golden Trojan Horse. */
const COLD_WALLET_LOOT: readonly RewardItem[] = [{ icon: "golden-horse", label: "Permanent Shiny Golden Trojan Horse", detail: "yours for good · carries over", rarity: "legendary" }];
/** The colours of a unique belonging (the hardware wallet) and of a stolen item in the belongings list, next to the rarity colours. */
const UNIQUE_COLOUR = "#d94f3c", STOLEN_COLOUR = "#8a8a8a";
/** A keepsake sells at the Exchange for Dust: this many OP. */
const DUST_OP = 1;
/** The Vault under the Cold Storage: what you put away there is safe from outlaws (they rob only what you carry) and out of play
 * (a stored program card or gas voucher is not used by your next hack, a stored cosmetic cannot be worn). */
type VaultStore = { items: Partial<Record<Durable, number>>; animals: Partial<Record<AnimalId, number>>; keepsakes: readonly OwnedKeepsake[];
  cards: readonly ProgramId[]; gas: number; intel: number };
const EMPTY_VAULT: VaultStore = { items: {}, animals: {}, keepsakes: [], cards: [], gas: 0, intel: 0 };
/** One thing that can move between the inventory and The Vault. */
type VaultEntry = { kind: "item"; id: Durable } | { kind: "animal"; id: AnimalId } | { kind: "keepsake"; name: string } | { kind: "card"; card: ProgramId }
  | { kind: "gas" } | { kind: "intel" };
/** A licence run: the SDK play of its licence (settled when the run ends, revealing the payout) and the wallets lost so far. */
/** A licence run: bought at the start (one confirmation), used when it ends (its play reveals the payout); wallets lost so far. */
type Run = { lost: number };
type RunEnd = { reason: string; outcome: string; reward: bigint };
/** Trojan Horses: the permanent one costs PERMANENT_HORSE_OP, the temporary ones TEMP_HORSE_OP (simulated OP); a temporary horse lasts HORSE_TEMP_MS from the
 * moment it is first ridden, and WILD_TEMP_HORSES of them stand somewhere in every fresh world, to ride but never to pocket. */
/** Playtesting: true starts every new game with the Permanent Trojan Horse, owned and waiting left of the start (startHorseSpot);
 * false (the released game) makes it a PERMANENT_HORSE_OP purchase at the Exchange. */
const PLAYTEST_START_HORSE = true;
/** Each animal's call (audio.ts) and how often each animal of that kind calls (ms, a random time in the range, on its own timer):
 * only animals within HEAR_RANGE are heard, quieter with distance and panned to their side of the screen. The dragon roars as it
 * breathes fire instead. */
const ANIMAL_CALLS: Partial<Readonly<Record<AnimalId, { cue: SoundId; every: readonly [number, number] }>>> = {
  rabbit: { cue: "thump", every: [9000, 20000] }, cat: { cue: "meow", every: [7000, 16000] }, dog: { cue: "bark", every: [6000, 14000] },
  deer: { cue: "snort", every: [9000, 20000] }, cow: { cue: "moo", every: [8000, 18000] }, pig: { cue: "oink", every: [5000, 11000] },
  rooster: { cue: "crow", every: [14000, 30000] }, hen: { cue: "cluck", every: [4000, 9000] }, bird: { cue: "chirp", every: [3000, 8000] },
  crow: { cue: "caw", every: [5000, 12000] },
  frog: { cue: "ribbit", every: [3000, 7000] }, ostrich: { cue: "boom", every: [12000, 25000] }, snake: { cue: "hiss", every: [9000, 18000] },
  lion: { cue: "roar", every: [7000, 14000] }, bear: { cue: "growl", every: [6000, 12000] }, fox: { cue: "yip", every: [4000, 9000] },
};
/** Sounds that go on while an animal is doing something, repeated every `every` ms while it is within `range`: a snake slithering
 * (only while it moves), the bees' buzz and a butterfly's wings. Several nearby add voices, up to three (bees one per `perVoice`). */
const ANIMAL_LOOPS: Partial<Readonly<Record<AnimalId, { cue: SoundId; every: number; range: number; moving?: boolean; perVoice?: number }>>> = {
  snake: { cue: "slither", every: 500, range: 360, moving: true }, bee: { cue: "buzz", every: 650, range: 300, perVoice: 5 }, butterfly: { cue: "flutter", every: 430, range: 170 },
};
/** At most this many animal calls start in any one second, however big the crowd. */
const MAX_CALLS_PER_SECOND = 5;
const HEAR_RANGE = 520; // world units: animals further away are not heard
/** Time between footsteps while walking (not riding). */
const STEP_MS = 330;
/** The music turns to The Standoff when a living outlaw comes this near, and back once it is further than MUSIC_CALM. */
const MUSIC_TENSE = 600, MUSIC_CALM = 820;
/** Time between a riding horse's galloping strides (each stride is four hoofbeats, the `hoof` cue). */
const HOOF_STRIDE_MS = 520;
const PERMANENT_HORSE_OP = 150, TEMP_HORSE_OP = 10, HORSE_TEMP_MS = 30_000, WILD_TEMP_HORSES = 2;
/** A Laser Gun is LASER_CHARGES of the SDK consumable bought at once (client.buy / play); the nets are simulated locally. The
 * Charging Station's terminal reloads it, one more consumable per RF, up to LASER_MAX charges in the gun. */
/** The Bounty Hunter licence (the game's one SDK consumable, one per run) comes with a Laser Gun of LASER_CHARGES shots; the
 * Charging Station tops it up for RELOAD_OP OP a shot, up to LASER_MAX. */
const LASER_CHARGES = 20n, LASER_MAX = 50n, RELOAD_OP = 1;
/** A run ends when The Liquidator's wallet is settled, or whenever you choose to retire and settle with the seed words you hold; wiped
 * wallets are counted but never end it. A cracked wallet is a jackpot wallet with JACKPOT_WALLET_CHANCE: triple OP, a second loot
 * roll and the better keepsake odds. */
const JACKPOT_WALLET_CHANCE = 0.05, LIQUIDATOR_LEVEL = 11;
/** OP every run starts with, on top of whatever you hold. */
const START_OP = 20;
const ITEMS: readonly Item[] = [
  { id: "laser", name: "Laser Gun", price: 0n, blurb: `Comes with your Bounty Hunter licence: ${LASER_CHARGES} shots. Reload at the Charging Station for OP.`, sold: false },
  // The Butterfly Net is not for sale: any outlaw drops one NET_DROP_CHANCE of the time when neutralized (simulated, durable).
  { id: "butterfly-net", name: "Butterfly Net", price: 0n, blurb: "Swing it right next to a butterfly to catch it. Any outlaw drops one now and then.", sold: false },
  // The Cleaver is not for sale either: the Pig Butcher carries it. Close range, animals only, one hit counts as one laser shot.
  { id: "cleaver", name: "Cleaver", price: 0n, blurb: "Swing it at an animal right next to you: one hit counts as one laser shot. No effect on outlaws. A common drop from the Pig Butcher.", sold: false },
  { id: "temp-horse", name: "Temporary Trojan Horse", price: 0n, op: TEMP_HORSE_OP, blurb: "Mount it from the inventory (outside): it vanishes from under you after 30 seconds. Stackable.", sold: true },
];
/** Robbable simulated items; the Laser Gun's charges live in the SDK ledger, so outlaws cannot take it. */
type Durable = Exclude<ItemId, "laser">;
type Owned = Record<Durable, number>;
const startOwned: Owned = { "butterfly-net": 0, cleaver: 0, "temp-horse": 0 };
/** Playtesting (remove before release: set false): every new game starts with everything you can wear, hold or ride: every cosmetic
 * keepsake (hats, masks, apron, hoodie, cape, shoes, off-hand items, the gun and cleaver skins, both pets and the diploma), the
 * Butterfly Net, the Cleaver, three Temporary Trojan Horses and the Shiny Golden Trojan Horse. */
const PLAYTEST_ALL_GEAR = true;
const playtestOwned: Owned = { "butterfly-net": 1, cleaver: 1, "temp-horse": 3 };
/** Every cosmetic keepsake, as a row of the inventory: found in the KEEPSAKES.md table by name. */
const playtestKeepsakes = (): OwnedKeepsake[] => Object.values(COSMETICS).flatMap(cosmetic => {
  for (const [outlaw, byRarity] of Object.entries(KEEPSAKES)) for (const rarity of RARITIES) {
    const found = byRarity[rarity].find(keepsake => keepsake.name === cosmetic.keepsake);
    if (found) return [{ name: found.name, outlaw, rarity, detail: found.detail, count: 1, perk: found.perk }];
  }
  return [];
});
/** What can be held in hand (Q, Space): not the Temporary Trojan Horse, which is mounted from the inventory instead. */
const holdable = (id: ItemId) => id !== "temp-horse";

// ---------------------------------------------------------------------------
// NPCs: outlaws and animals with a wander-pause-wander behaviour
// ---------------------------------------------------------------------------

type AnimalId = "rabbit" | "cat" | "dog" | "deer" | "cow" | "pig" | "rooster" | "hen" | "bird" | "crow" | "frog" | "ostrich" | "snake" | "butterfly" | "lion" | "bear" | "fox" | "dragon" | "bee";
type NpcKind = "outlaw" | AnimalId;
type Animal = AnimalId;
type Loot = Durable | AnimalId;
/** How an animal moves (see updateAnimal). */
type Behaviour = "wander" | "hop" | "slither" | "cat" | "dog" | "herd" | "chicken" | "ostrich" | "flee" | "flutter" | "dragon" | "swarm";
type Npc = {
  id: number; kind: NpcKind; name?: string; variant: number; scene: Scene; loot: Loot[]; position: WorldPoint; dir: [number, number];
  facing: "left" | "right"; walking: boolean; until: number;
  hp: number; fallenAt: number; tint?: string; accent?: string; mode: string; modeUntil: number; hover: number;
  /** You impounded something from this downed outlaw: it never gets back up (Pumper and Dumper included). */
  looted?: boolean;
  /** The keepsake this outlaw dropped when neutralized (once per outlaw; Pumper and Dumper share one), shown in its belongings. */
  keepsake?: { roll: NonNullable<ReturnType<typeof rollKeepsake>>; table: string; taken: boolean };
  /** It dropped its loot already (a keepsake, sometimes a Butterfly Net): never twice. */
  dropped?: boolean;
  /** It carries a Butterfly Net (NET_DROP_CHANCE when it went down), among its belongings until impounded. */
  net?: "waiting" | "taken";
  /** What a downed outlaw carries that can be impounded. */
  belongings?: { wallet: boolean; half?: WalletHalf };
};
/** One row of ANIMALS.md: chance (100 = always present at exactly `alive`; below 100 = percent chance that the species is present,
 * rolled at the start and again a minute after each kill; 0 = never), `alive` count, drawing (mask rows use '#' black, 'o' body fill, 'p' accent fill, '.' clear; `cell` sets
 * the size; shadeRows adds the darker 'x'/'q' tones on the underside and shadow side),
 * movement, which net catches it, how many laser shots kill it (0 = not shootable) and the OP reward for a kill (simulated). */
type AnimalSpec = Readonly<{
  id: AnimalId; name: string; chance: number; alive: number; cell: number; speed: number; behaviour: Behaviour; flying: boolean;
  net: "drop" | "butterfly" | null; shots: number; tint?: string; accent?: string; palette?: readonly string[]; accentPalette?: readonly string[]; mask: readonly string[]; altMask?: readonly string[];
}>;
const KILL_RESPAWN_MS = 60_000, FALLEN_MS = 10_000;
const RABBIT_MASK: readonly string[] = [
  ".........#..#...",
  "........#o##o#..",
  ".......#oo#oo#..",
  ".......#op#op#..",
  ".......#op#op#..",
  ".......#opoop#..",
  ".......#oooooo#.",
  "....#####ooo#o#.",
  "...#oooooooooop#",
  ".##oooooooooooo#",
  "#o#oo##ooooooo#.",
  "#o#o#oo#oooo##..",
  ".#oooooo#oooo#..",
  ".#ooooooooooo#..",
  "..#oooooooooo#..",
  "..#oooooo##oo#..",
  "...######..##...",
];
const CAT_MASK: readonly string[] = [
  ".##.............#......",
  "#pp#...........#o#..#..",
  ".#pp#..........#oo##o#.",
  "..#po#.........#pppoo#.",
  "..#oo#........#oopooo#.",
  "..#oo#........#oooo#o#.",
  "..#oo#.......#oooooooo#",
  "..#oo#.......#ppoooooo#",
  "..#oo#########oppoooo#.",
  "..#ooopoppopoooopp###..",
  "..#ooppppppppoooop#....",
  "...#ooppppppooooo#.....",
  "...#opoppopopoooo#.....",
  "...#pppoooooooooo#.....",
  "....#poooooooooo#......",
  "...#pp#oo###oo#oo#.....",
  "...#oo#oo#.#oo#oo#.....",
  "..#oo##oo#.#oo##oo#....",
  "..#oo##oo#.#oo##oo#....",
  ".#oo#.#oo#.#oo#.#oo#...",
  ".#oo#.#oo#.#oo#.#oo#...",
  "..##...##...##...##....",
];
const DOG_MASK: readonly string[] = [
  "................",
  "................",
  ".........####...",
  "........#ooooo#.",
  "........##oo#oo#",
  ".#......###ooo##",
  "#o#.....###ooo#.",
  "#o#.....#pppp#..",
  "#o#######oooo#..",
  "#ooo###oooooo#..",
  ".#ooo##oooooo#..",
  ".#ooooooooooo#..",
  "..#oo#####oo#...",
  "..#oo#...#oo#...",
  "..####...####...",
];
const DEER_MASK: readonly string[] = [
  "......#.#...#.#.",
  ".......##...##..",
  "........#...#...",
  ".........#.#....",
  "..........#.....",
  "......##.####...",
  "......#p#ooo##..",
  ".......##oo#oo#.",
  "........#oooooo#",
  "........#ooo####",
  ".......#oooo#...",
  ".#.....#oooo#...",
  "#p#####ooooo#...",
  "#ooooooooooo#...",
  ".#oooooooooo#...",
  ".#oooooooooo#...",
  "..#oo#####oo#...",
  "..#o#.....#o#...",
  "..#o#.....#o#...",
  "..###.....###...",
];
const COW_MASK: readonly string[] = [
  "....................",
  "....................",
  ".............#.....#",
  "..............#...#.",
  "..............#####.",
  "............##ooooo#",
  "...###########oo#oo#",
  ".##oooooooooooooooo#",
  "#.#ooo###ooooooppp#.",
  "#.#oo####ooooooop#p#",
  "#.#ooo##ooooooooppp#",
  "#.#oooooo###ooo#####",
  "###ooooooo###ooo#...",
  "##.#oooooooooooo#...",
  "...#oo#ppp#oo###....",
  "...#oo#####oo#......",
  "...#oo#.#.#oo#......",
  "...#oo#...#oo#......",
  "...####...####......",
  "...####...####......",
];
const PIG_MASK: readonly string[] = [
  "....................",
  "....................",
  "....................",
  "....................",
  ".............##.....",
  "............#pp#....",
  "....#########oo###..",
  "...#oooooooooooooo#.",
  ".##ooooooooooooo#o##",
  "#.#oooooooooooooopp#",
  ".##oooooooooooooopp#",
  "#.#ooooooooooooo####",
  "..#ooooooooooooooo#.",
  "..#oooooooooooooo#..",
  "...#oooooooooooo#...",
  "...#ooo#####ooo#....",
  "...#ooo#...#ooo#....",
  "...#ooo#...#ooo#....",
  "...#ppp#...#ppp#....",
  "...#####...#####....",
];
const ROOSTER_MASK: readonly string[] = [
  ".........#.#.#..",
  "........#p#p#p#.",
  "........#ppppp#.",
  ".####...#ooooo#.",
  "#oooo#..#oo#o###",
  "#o##oo#.#oooo##.",
  "#o#o#oo##ooop#..",
  "#o#oo#o#oooop#..",
  "#o#oo#o#ooooo#..",
  "#oo###oooooooo#.",
  "#ooo##oo####ooo#",
  ".#oooo##oooo#oo#",
  ".#ooo#ooooo#ooo#",
  "..#oo#oooo#ooo#.",
  "..#ooo####ooo#..",
  "...##ooooooo#...",
  ".....#######....",
  ".......#..#.....",
  "......##.##.....",
  ".......##.##....",
];
const HEN_MASK: readonly string[] = [
  "................",
  "................",
  "..........#.#...",
  ".........#p#p#..",
  "........#oooo#..",
  "........#oo#o##.",
  "........#oooo###",
  ".##.....#oop#...",
  "#oo#...#oooo#...",
  "#ooo###ooooo#...",
  "#oooo#####oooo#.",
  "#ooo#ooooo#oooo#",
  "#ooo#oooo#ooooo#",
  ".#ooo####oooooo#",
  "..##ooooooooo##.",
  "....#########...",
  "......#..#......",
  ".....##.##......",
];
const BIRD_MASK: readonly string[] = [
  "..##.............",
  ".#pp##...........",
  "..#opo#..........",
  "..#o#oo#....#....",
  "...#o#oo#..#p#...",
  "....#o#oo##ooo#..",
  ".#...#oooo#oo#o#.",
  "#p#####ooo#oooo##",
  ".#oooooooooppp##.",
  ".#oooooooppp##...",
  "#p##oooppppp#....",
  ".#..##opppp#.....",
  "......#####......",
];
const FROG_MASK: readonly string[] = [
  "................",
  "................",
  "..####....####..",
  ".#pppp#..#pppp#.",
  ".#pp#p####p#pp#.",
  "#oooooooooooooo#",
  "#oooooooooooooo#",
  ".#oo#oooooo#oo#.",
  ".#ooo######ooo#.",
  "#ooooo#pp#ooooo#",
  "#oooooo##oooooo#",
  "#oooooooooooooo#",
  "#oo#oooooooo#oo#",
  "#oo#oooooooo#oo#",
  "#o###oooooo###o#",
  "################",
];
const OSTRICH_MASK: readonly string[] = [
  "...........###..",
  "..........#ppp#.",
  "..........#p#pp#",
  "..........#pppp#",
  "...........#p##.",
  "...........#p#..",
  "...........#p#..",
  "...........#p#..",
  "..........#p#...",
  "..........#p#...",
  ".##.......#p#...",
  "#oo#......#p#...",
  "#oo#######ppp#..",
  "#oo###########..",
  ".#o##oooo######.",
  ".#o#oooooooo###.",
  ".#o#o#o#o#o####.",
  "..############..",
  "...##########...",
  "....#pp##pp#....",
  "....#pp##pp#....",
  "....#p#..#p#....",
  "....#p#...#p#...",
  "....#p#...#p#...",
  "....#p#...#p#...",
  "....#p#...#p#...",
  "....#pp#..#pp#..",
  ".....##....##...",
];
const OSTRICH_DOWN_MASK: readonly string[] = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  ".##.............",
  "#oo#............",
  "#oo#######ppp#..",
  "#oo##########pp.",
  ".#o##oooo####pp#",
  ".#o#oooooooo#pp#",
  ".#o#o#o#o#o##pp#",
  "..###########pp#",
  "...##########p#.",
  "....#pp##pp#pp#.",
  "....#pp##pp#pp#.",
  "....#p#..#p#pp#.",
  "....#p#...#ppp#.",
  "....#p#...#ppp#.",
  "....#p#...#ppp#.",
  "....#p#...#ppp#.",
  "....#pp#..#pppp#",
  ".....##....####.",
];
const SNAKE_MASK: readonly string[] = [
  "..##.....................",
  ".#pp#....................",
  ".####....................",
  ".#pp#.............###....",
  ".####...##....##.#ooo#...",
  "..#o#..#po#..#po##oo#o#..",
  "..#oo##opoo##opoooooooo##",
  "...#opoo##opoo##ooooooo#.",
  "....#po#..#po#..#######.#",
  ".....##....##............",
];
/** A bee: wings up top, a striped yellow abdomen and a sting at the back. */
const BEE_MASK: readonly string[] = [
  "...##.##..",
  "..#oo#oo#.",
  "..#oo#o#..",
  ".#######..",
  "##p#p#p##.",
  ".#p#p#p#o#",
  "..#######.",
];
const BUTTERFLY_MASK: readonly string[] = [
  ".....#....#.....",
  "......#..#......",
  "..###..##..###..",
  ".#opo#.##.#opo#.",
  "#opooo####ooopo#",
  "#ppoopp##ppoopp#",
  "#po#ppo##opp#op#",
  ".#ooppo##oppoo#.",
  "..#pooo##ooop#..",
  "...#oo####oo#...",
  "..#poop##poop#..",
  ".#oopoo##oopoo#.",
  ".#poop####poop#.",
  "..####.##.####..",
];
const LION_MASK: readonly string[] = [
  "......................",
  ".............####.....",
  "............#pppp#....",
  "..#........#pppppp#...",
  ".#p#......#ppppp####..",
  "#ppp#.....#pppp#oooo#.",
  "#ppp#....#ppppp#oo#o#.",
  "#ppp#######pppp#oooo##",
  ".#o##oooooopppp#ooooo#",
  ".#o#ooooooppppp#ooo###",
  "..#oooooooopppp###oo#.",
  "...#ooooooo#pppppp##..",
  "...#oooooooopppppp#...",
  "...#ooooooooopppp#....",
  "...#oooooooooooo#.....",
  "....#ooo#####ooo#.....",
  "....#ooo#...#ooo#.....",
  "....#ooo#...#ooo#.....",
  "....#ooo#...#ooo#.....",
  ".....###.....###......",
];
const BEAR_MASK: readonly string[] = [
  "....................",
  "....................",
  "....................",
  "...........###..###.",
  "...#########p####p#.",
  "..#oooopooo#ooooooo#",
  ".#opoooopoo#ooooooo#",
  "#ooopoooooo#oo#oo#o#",
  "#oooooooopo#ooooooo#",
  "#opooopooop#oopp##o#",
  "#oopooopooo#oopp#po#",
  "#oooooooooo#ooppppo#",
  "#oooopooopo#o#######",
  "#oooooooooo#oo###...",
  "#oooooo###oooooo#...",
  "#ooo#o#...#o#ooo#...",
  "#ooo#o#...#o#ooo#...",
  "#ooo#o#...#o#ooo#...",
  "#ooo###...###ooo#...",
  "#####.......#####...",
];
const FOX_MASK: readonly string[] = [
  "..........#..#..", "..........##.##.", "..........#ooo#.", "...........#o#o#", "...........#oo##", ".##........#oo#.",
  "#oo#..#####oo#..", "#ooo#oooooooo#..", "#oooo#ooooooo#..", ".#ooo#oooooooo#.", ".#oo#ooooooooo#.", "..##oooooooooo#.",
  "....#o##oooo#o#.", "....#o#.#oo#.#o#", "....##..#o#..##.", "........##......",
];
const DRAGON_MASK: readonly string[] = [
  "..........###...........", "........##ooo##.........", ".......#ooooooo#........", ".......#ooooooo#....###.", "........#ooooo#....#o#o#",
  "....#....#ooo#....#oooo#", "....##..#.#o#.#..#ooo###", ".....#.#o#o#o#o#.#ooo#..", "......#ooooooooo##ooo#..", ".....#oooooooooooooo#...",
  "....#oooooooooooooo#....", "...#ooooooooooooooo#....", "..#oooo#oooooooooo#.....", ".#ooo##.#oooooooo#......", "#oo##....#o###o#........",
  "##.......#o#.#o#........", ".........##..##.........", "........................", "........................", "........................",
];
const ANIMALS: readonly AnimalSpec[] = [
  { id: "rabbit", name: "Rabbit", chance: 100, alive: 3, cell: 3, speed: 110, behaviour: "wander", flying: false, net: null, shots: 1, palette: ["#cdb8a0", "#ffffff"], accent: "#e0ad9e", mask: RABBIT_MASK },
  { id: "cat", name: "Cat", chance: 100, alive: 2, cell: 3, speed: 80, behaviour: "cat", flying: false, net: null, shots: 0, tint: "#e6c79c", accent: "#9a6a3e", mask: CAT_MASK },
  { id: "dog", name: "Dog", chance: 100, alive: 1, cell: 5, speed: 85, behaviour: "dog", flying: false, net: null, shots: 0, tint: "#d8b88c", accent: "#7f8c3a", mask: DOG_MASK },
  { id: "deer", name: "Deer", chance: 100, alive: 6, cell: 5, speed: 45, behaviour: "herd", flying: false, net: null, shots: 1, tint: "#c89b6c", accent: "#a5703e", mask: DEER_MASK },
  { id: "cow", name: "Cow", chance: 100, alive: 5, cell: 5, speed: 35, behaviour: "herd", flying: false, net: null, shots: 1, tint: "#f3ede2", accent: "#d9a58f", mask: COW_MASK },
  { id: "pig", name: "Pig", chance: 100, alive: 4, cell: 4, speed: 40, behaviour: "herd", flying: false, net: null, shots: 1, tint: "#f5c9d2", accent: "#e58ea8", mask: PIG_MASK },
  { id: "rooster", name: "Rooster", chance: 100, alive: 2, cell: 3, speed: 45, behaviour: "chicken", flying: false, net: null, shots: 0, tint: "#d7a067", accent: "#d94f3c", mask: ROOSTER_MASK },
  { id: "hen", name: "Hen", chance: 100, alive: 8, cell: 3, speed: 45, behaviour: "chicken", flying: false, net: null, shots: 0, tint: "#e8caa0", accent: "#f2b06a", mask: HEN_MASK },
  { id: "bird", name: "Bird", chance: 100, alive: 5, cell: 3, speed: 120, behaviour: "wander", flying: true, net: null, shots: 0, tint: "#e4ded3", accentPalette: ["#3d7bd9", "#d94f3c", "#e0b030", "#3c8f5a", "#b04fd9", "#ff8a2a"], mask: BIRD_MASK },
  // Black crows: the bird's shape drawn larger, jet black with dark grey wings and beak; they caw (Ra! Ra!).
  { id: "crow", name: "Crow", chance: 100, alive: 4, cell: 4, speed: 105, behaviour: "wander", flying: true, net: null, shots: 0, tint: "#26262c", accent: "#4a4a54", mask: BIRD_MASK },
  { id: "frog", name: "Frog", chance: 100, alive: 5, cell: 3, speed: 70, behaviour: "hop", flying: false, net: null, shots: 0, tint: "#a8cc8e", accentPalette: ["#3c8f5a", "#8ab83a", "#d9a441", "#d94f3c", "#3d7bd9", "#b04fd9"], mask: FROG_MASK },
  { id: "ostrich", name: "Ostrich", chance: 100, alive: 1, cell: 5, speed: 60, behaviour: "ostrich", flying: false, net: null, shots: 1, tint: "#e3bba8", accent: "#5b534a", mask: OSTRICH_MASK, altMask: OSTRICH_DOWN_MASK },
  { id: "snake", name: "Snake", chance: 100, alive: 3, cell: 4, speed: 40, behaviour: "slither", flying: false, net: null, shots: 1, tint: "#aab97f", accent: "#408080", mask: SNAKE_MASK },
  { id: "butterfly", name: "Butterfly", chance: 100, alive: 2, cell: 3, speed: 35, behaviour: "flutter", flying: true, net: "butterfly", shots: 0, tint: "#f6eedb", accentPalette: ["#d94f3c", "#3d7bd9", "#e0b030", "#b04fd9", "#ff8a2a", "#3c8f5a"], mask: BUTTERFLY_MASK },
  { id: "bee", name: "Bee", chance: 100, alive: 20, cell: 2, speed: 55, behaviour: "swarm", flying: true, net: null, shots: 0, tint: "#f2d34f", accent: "#f2c200", mask: BEE_MASK },
  { id: "lion", name: "Lion", chance: 5, alive: 1, cell: 5, speed: 115, behaviour: "flee", flying: false, net: null, shots: 2, tint: "#d2ae74", accent: "#ffae5e", mask: LION_MASK },
  { id: "bear", name: "Bear", chance: 5, alive: 1, cell: 5, speed: 105, behaviour: "flee", flying: false, net: null, shots: 2, tint: "#8b5a2b", accent: "#6e4520", mask: BEAR_MASK },
  { id: "fox", name: "Golden Fox", chance: 0, alive: 1, cell: 5, speed: 125, behaviour: "flee", flying: false, net: null, shots: 0, tint: "#e0b030", mask: FOX_MASK },
  { id: "dragon", name: "Dragon", chance: 0, alive: 1, cell: 5, speed: 130, behaviour: "dragon", flying: true, net: null, shots: 3, tint: "#6b8f3a", mask: DRAGON_MASK },
];
/** Depth: body cells ('o'/'p') whose underside or left neighbour is not body become their shaded tones ('x'/'q'); the light sits upper right. */
function shadeRows(rows: readonly string[]): readonly string[] {
  const body = (c: string | undefined) => c === "o" || c === "p";
  return rows.map((row, y) => [...row].map((c, x) => !body(c) ? c : (!body(rows[y + 1]?.[x]) || !body(row[x - 1])) ? (c === "o" ? "x" : "q") : c).join(""));
}
const ANIMAL_BY_ID = Object.fromEntries(ANIMALS.map(spec => [spec.id, { ...spec, mask: shadeRows(spec.mask), altMask: spec.altMask && shadeRows(spec.altMask) }])) as Readonly<Record<AnimalId, AnimalSpec>>;
const isAnimal = (kind: string): kind is AnimalId => kind in ANIMAL_BY_ID;
for (const spec of ANIMALS) for (const rows of [spec.mask, spec.altMask ?? spec.mask]) if (rows.some(row => row.length !== rows[0].length)) throw new Error(`${spec.id} mask rows must share one width.`);
const lootName = (loot: Loot) => ITEMS.find(item => item.id === loot)?.name ?? `captured ${ANIMAL_BY_ID[loot as AnimalId]?.name.toLowerCase() ?? loot}`;
const NPC = {
  // Outlaws spawn one named wave at a time (two NPCs only for "Pumper & Dumper"); see spawnOutlawWave.
  outlaw: { count: 1, speed: 75, respawnMs: [9000, 15000] as const },
};

/** The wanted outlaws in the order they appear: one wave at a time, the Rugpuller first; once The Liquidator is gone, no more come. */
const NAMED_OUTLAWS: readonly string[] = [
  "Rugpuller",
  "Pig Butcher",
  "Exit Scammer",
  "Wallet Drainer",
  "Pumper & Dumper",
  "Honeypot",
  "Black Hat Hacker",
  "Mrs. Sybil",
  "Front Runner",
  "Sandwich Bot",
  "Dr. Ponzi",
  "The Liquidator",
];
let outlawSequence = 0;
/** The next outlaw in the sequence (reset with the world by resetOutlawSequence). */
function nextOutlawName(): string | null { if (outlawSequence >= NAMED_OUTLAWS.length) return null; const name = NAMED_OUTLAWS[outlawSequence]; outlawSequence += 1; return name; }
/** The outlaw the next wave will bring, without taking it from the sequence (null once the list is done). */
const upcomingOutlawName = (): string | null => NAMED_OUTLAWS[outlawSequence] ?? null;
const resetOutlawSequence = () => { outlawSequence = PLAYTEST.liquidator ? NAMED_OUTLAWS.indexOf("The Liquidator") : 0; };
/** An outlaw's 0-based position in the wanted list, which picks its hardware wallet's tier (Pumper and Dumper share their wave's). */
const outlawLevel = (name: string | undefined) => { const index = NAMED_OUTLAWS.indexOf(name === "Pumper" || name === "Dumper" ? "Pumper & Dumper" : name ?? ""); return Math.max(0, index); };
/** The members of a wave: one outlaw, or the Pumper & Dumper pair. */
const waveMembers = (name: string) => (name === "Pumper & Dumper" ? ["Pumper", "Dumper"] : [name]);
/** A stable hat variant per name, so the wanted poster shows the outlaw that is actually out there. */
const variantOf = (name: string) => [...name].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7) % OUTLAW_HATS.length;
const NPC_RADIUS = 6; // world units, for walkability checks
const CONTACT = 14; // world units; walking into an outlaw lets it rob you
const INSIDE_ODDS = 0.25; // chance a new outlaw wave holes up inside a building
const NET_REACH = 30; // world units; a swung net catches a butterfly this close
/** Any neutralized outlaw drops a Butterfly Net this often; it is listed as Uncommon since any outlaw can drop it. */
const NET_DROP_CHANCE = 0.05;
const CLEAVER_REACH = 34; // world units; the Cleaver hits an animal this close
const WARN_RANGE = 420; // world units; off-screen outlaws this close get an edge arrow
const CONTACT_COOLDOWN = 3000; // ms of immunity after a wallet crack ends or a hacker slips away
/** Laser hits it takes to down each wanted outlaw, by tier: 1 for the Rugpuller, 2 for tiers 2-4, 3 for tiers 5-11, 5 for The
 * Liquidator: later outlaws take more of the licence gun's shots to bring down. */
const OUTLAW_HITS_BY_TIER = [1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 5] as const;
const outlawHits = (name: string | undefined) => OUTLAW_HITS_BY_TIER[Math.min(OUTLAW_HITS_BY_TIER.length - 1, outlawLevel(name))];
const OUTLAW_DOWN_MS = 60_000; // a downed outlaw left lying gets back up after this long
const VOICE_MS = 3000; // how long the "Voice command received" message shows before the hack starts
const SHOT_SPEED = NPC.outlaw.speed * 2; // native projected px/s: a laser bolt moves at twice an outlaw's pace
const SHOT_RANGE = 800; // native projected px before a laser bolt fades
const SHOT_HIT = 12; // world units; a bolt this close to a hacker downs it and opens its hardware wallet
/** Laser hit radius for an animal, scaled from SHOT_HIT by its drawn size; zero when it cannot be shot. */
const hitRadius = (npc: Npc) => { const spec = ANIMAL_BY_ID[npc.kind as AnimalId]; return spec.shots ? Math.max(8, SHOT_HIT * spec.mask[0].length * spec.cell / 80) : 0; };
const AIM_CONE = Math.PI / 7; // aim assist: an outlaw within this angle of the facing direction is targeted exactly
type Shot = { position: WorldPoint; dir: [number, number]; travelled: number; muzzle: [number, number] };
/** Where the equipped Laser Gun's emitter sits on screen, relative to the Friend's feet, for each facing (matches drawEquipped). */
const MUZZLE: Readonly<Record<SpriteFacing, [number, number]>> = { up: [16, -82], down: [-16, -10], left: [-54, -30], right: [54, -30] };

/** Small 16 x 16 one-bit masks, drawn like the Friend (black, white halo). The outlaw is a hooded criminal: a black hood
 * around a shadowed face with two pale eyes, a hoodie with drawstrings, arms at the sides. */
const OUTLAW_HATS: readonly (readonly string[])[] = [
  ["......####......", "....########....", "..############.."],
  [".......##.......", ".....######.....", "..############.."],
  ["......####......", "...##########...", ".##############."],
];
const OUTLAW_BODY: readonly string[] = [
  "..##.######.##..", "..##.#.##.#.##..", "..##.######.##..", "...##########...", "..############..",
  "..#.###oo###.#..", "..#.########.#..", "..#.########.#..", "..#.########.#..", "....########....",
  "....###..###....", "....###..###....", "...####..####...",
];
const outlawMask = (variant: number) => [...OUTLAW_HATS[variant % OUTLAW_HATS.length], ...OUTLAW_BODY];
/** An outlaw's colour by part, over its white cells: rows r0-r1 and columns c0-c1 (inclusive) in `colour`; later parts win. */
type OutlawPart = readonly [number, number, number, number, string];
/** The outlaws' faded Western palette, in the villager's and the buildings' tones (each keeps its own accent colour too). */
const OC = {
  skin: "#e3bf98", pale: "#f1d9bf", pink: "#e8b8a0", cream: "#efe3c8", apron: "#e6dcc6", coat: "#ece6d8", veil: "#d9d2c0",
  khaki: "#c9a878", sand: "#d8b27a", duster: "#b08d57", leather: "#8a5a3a", boots: "#5b3a1e", rust: "#b5543a", brick: "#9c5a4a",
  terracotta: "#b5704a", sage: "#7f9a78", denim: "#6f86a0", shirt: "#a9bfd0", mauve: "#9a6a7a", grey: "#b9b3a8", steel: "#9aa6b1",
  iron: "#7d8a99", charcoal: "#4f5560",
} as const;
/** Custom art per named outlaw (any grid size, '#' outline, 'o' body, 'p' accent), coloured by `parts`; names without an entry use
 * the hooded default in their hood variant. */
const OUTLAW_ART: Readonly<Record<string, { rows: readonly string[]; accent: string; parts?: readonly OutlawPart[] }>> = {
  Rugpuller: { accent: "#800020", parts: [[0, 17, 0, 27, OC.khaki], [1, 3, 13, 21, OC.skin], [4, 9, 0, 11, OC.sand], [4, 9, 21, 27, OC.sand], [9, 14, 9, 23, OC.leather], [15, 17, 13, 21, OC.boots]], rows: [
    "...............####.........",
    "..............#oooo#........",
    ".............#oooooo#.......",
    "............#oo####oo#......",
    "..###########o######o######.",
    ".#p#ooopo##p#o#o##o#o#opooo#",
    ".#p#oopo#oo##o######o#pooop#",
    ".##popoo#ooo##o####o#pooopo#",
    ".#p#pooopoo###oooooo##oopoo#",
    "..###########ooooooooo#####.",
    ".........#o##oooooooooo#....",
    ".........#ooooooooooo#o#....",
    ".........####ooo##ooo#o#....",
    "............#oooooooo#o#....",
    "............##oooooo##p#....",
    "..............#oooo#.##.....",
    ".............#oo##oo#.......",
    ".............###..###.......",
  ] },
  "Pig Butcher": { accent: "#8a0303", parts: [[0, 20, 0, 19, OC.apron], [3, 10, 3, 12, OC.pink], [7, 12, 12, 16, OC.pink], [12, 17, 1, 3, OC.pink]], rows: [
    "...............###..",
    ".....######....##p..",
    "....########...##p..",
    "...###oooo###..##p..",
    "...##oooooo##..###..",
    "...#oooooooo#..#....",
    "...#oo#oo#oo#.###...",
    "...#oooooooo###p#...",
    "...#oo####oo##oo#...",
    "....#o#oo#o###oo#...",
    "...####oo#####o##...",
    ".############oo#....",
    ".#o##oooooo#oo##....",
    ".#oo#opooop#oo#.....",
    ".#oo#ooopoo####.....",
    ".#oo#oopooo#........",
    ".#oo#pooopo#........",
    ".##o#oooooo#........",
    "..##########........",
    "....###..###........",
    "....###..###........",
  ] },
  Pumper: { accent: "#2e9e44", parts: [[0, 18, 0, 20, OC.sage], [2, 8, 3, 12, OC.skin], [9, 9, 4, 11, OC.cream], [6, 18, 13, 20, OC.steel], [16, 17, 4, 11, OC.charcoal]], rows: [
    ".....#######.........",
    "....#########........",
    "....##oooooo#........",
    "...#oooooooo#........",
    "...#o######o#........",
    "...#oo#oo#oo#........",
    "...#oooooooo#.######.",
    "...#o#oooo#o#.#oooo#.",
    "....#o####o#.#oo####.",
    ".....#oooo#.#oo###...",
    "..###o#pp#o#oo#####..",
    ".#oo#o#pp#o###.#oo#..",
    ".#oo#o#pp#o#...#pp#..",
    ".#oo#o#pp#o#...#pp#..",
    ".#oo#oo##oo#...#pp#..",
    ".#oo########...#oo#..",
    "..##oo#..#o#...#oo#..",
    "....#o#..#o#...#oo#..",
    "....###..###..######.",
  ] },
  Dumper: { accent: "#d91a1a", parts: [[0, 18, 0, 20, OC.brick], [2, 9, 8, 17, OC.skin], [5, 10, 0, 8, OC.sand], [16, 17, 9, 16, OC.charcoal]], rows: [
    "..........#######....",
    ".........#########...",
    ".........##oooooo#...",
    "........#oooooooo#...",
    "........#o######o#...",
    ".####...#oo#oo#oo#...",
    "#oooo#..#oooooooo#...",
    "#oppo##.#o#oooo#o#...",
    "#oooooo#.#o####o#....",
    "#oooo#oo#.#oooo#.....",
    ".#oo#.#oo#o#pp#o###..",
    ".......###o#pp#o#oo#.",
    "..p......#o#pp#o#oo#.",
    "...p.....#o#pp#o#oo#.",
    ".p.......#oo##oo#oo#.",
    "...p.....########oo#.",
    ".........#o#..#oo##..",
    "..p.p....#o#..#o#....",
    ".p.......###..###....",
  ] },
  // The Liquidator: a hulking enforcer with blue droplets flying from one hand.
  "The Liquidator": { accent: "#0080ff", parts: [[0, 19, 0, 22, OC.charcoal], [1, 7, 5, 12, OC.skin], [9, 16, 7, 10, OC.cream]], rows: [
    "......######...........",
    ".....#oooooo#..........",
    ".##.#oooooooo#.##......",
    "#####oooooooo#####.....",
    "#oo##o##oo##o##oo#.....",
    "#oo##o#poop#o##oo#.....",
    "#oo##ooo##ooo##oo#.....",
    "#oo##oo####oo##oo#.....",
    "#oo############oo#....p",
    ".###oo#oooo#oo######.p.",
    ".#o#oo#oooo#oooo#oo#p.p",
    ".#o#oo#oooo#ooooo###.p.",
    ".#o#oo#oooo#oo###.....p",
    ".#o############......p.",
    ".#o#oo#oooo#oo#........",
    ".###oo#oooo#oo#........",
    "..##oo#oooo#oo#........",
    "....#ooo##ooo#.........",
    "....##########.........",
    ".....###..###..........",
  ] },
  // Dr. Ponzi: a doctor in a white coat holding up a gold pyramid.
  "Dr. Ponzi": { accent: "#d4af37", parts: [[0, 21, 0, 20, OC.coat], [1, 2, 4, 11, OC.grey], [3, 9, 3, 12, OC.pale], [4, 9, 13, 19, OC.pale], [11, 17, 8, 12, OC.shirt], [20, 21, 3, 12, OC.charcoal]], rows: [
    "....########.........",
    "...##oooooo##....#...",
    "...##oooooo##...#p#..",
    "...##ooo#####..#ppp#.",
    "...#oo#o#o#o#.#ppppp#",
    "...#oooo###o#...###..",
    "...#oooooopp#.o#oo#..",
    "...##o####o#p..#oo#..",
    "....#oooooo#..#ooo#..",
    "...###oooo####ooo#...",
    ".##ooo####oooooo#....",
    "#o#oooo#ooooooo#.....",
    "#o#oooo#o#o#o##......",
    "#o#ooo####o#o#.......",
    "#o#oooo#o###o#.......",
    "#o#oooo#ooooo#.......",
    "#o#ooo####ooo#.......",
    "#o#oooo#ooooo#.......",
    ".##oooo#ooooo#.......",
    ".#############.......",
    "...#oo#..#oo#........",
    "...####..####........",
  ] },
  // Sandwich Bot: a robot with a gold antenna and a gold-filled sandwich across its chest.
  "Sandwich Bot": { accent: "#d4af37", parts: [[0, 21, 0, 17, OC.steel], [11, 17, 0, 1, OC.iron], [11, 17, 16, 17, OC.iron], [19, 21, 0, 17, OC.iron]], rows: [
    "........pp........",
    ".......####.......",
    "....##########....",
    "...#oooooooooo#...",
    "...#o#oooooo#o#...",
    "...#oo##oo##oo#...",
    "...#oooooooooo#...",
    "...#oo#o#o#ooo#...",
    "...#oooooooooo#...",
    "...####oooo####...",
    ".##.##########.##.",
    "#o##oooooooooo##o#",
    "#o#oooooooooooo#o#",
    "#o##############o#",
    "#o#pppp#pp#pppp#o#",
    "#o#ppppp##ppppp#o#",
    "#o##############o#",
    "#o#oooooooooooo#o#",
    "###.##########.###",
    "....#oo#..#oo#....",
    "....#oo#..#oo#....",
    "....####..####....",
  ] },
  // Front Runner: a sprinter in a red-banded cap, mid-stride.
  "Front Runner": { accent: "#d91a1a", parts: [[0, 19, 0, 17, OC.denim], [2, 2, 4, 13, OC.cream], [4, 8, 4, 12, OC.skin], [6, 8, 1, 3, OC.skin], [15, 18, 4, 12, OC.skin]], rows: [
    "......######......",
    ".....########.....",
    "....##oooooo##....",
    "....#pppppppp#....",
    "....#o######o#....",
    "..###ooooo#oo#....",
    ".#pp##o###oo#.....",
    ".#oo###oooo##...##",
    ".#ooooooooooo##...",
    "..#oooo#oo#oooo#..",
    "##.##oop##poooo#..",
    "....#oopp#poooo#..",
    "....#oopp#pooooo#.",
    "....#oooooooo#oo#.",
    "....#########.##..",
    "....#ooo#ooo#..##.",
    "....#ooo######....",
    "....#ooo#.###.....",
    "....#ooo#.........",
    "....#####.........",
  ] },
  // Mrs. Sybil: one figure among a crowd of flickering copies of herself.
  "Mrs. Sybil": { accent: "#ca0000", parts: [[0, 19, 0, 23, OC.mauve], [6, 10, 8, 15, OC.pale], [11, 15, 5, 6, OC.pale], [11, 15, 17, 18, OC.pale]], rows: [
    "......#.#.####..#.#.....",
    ".....#.#.######..#.#....",
    "....#.#.########..#.#...",
    "...#.#..########.#.#....",
    "..#.#..##########.#.#...",
    "...#.#.##########..#.#..",
    "..#.#..##oooooo##.#.#...",
    "...#.#..###oo###.#.#....",
    "....#.#.#oooooo#..#.#...",
    "...#.#..#ooppoo#.#.#....",
    "....#.#.##oooo##..#.#...",
    ".#.#..##oo#o#ooo##.#.#..",
    "#.#..#o#oooooooo#o#.#.#.",
    ".#.#.#o##########o#..#.#",
    "#.#..#o#oooooooo#o#.#.#.",
    ".#.#.#o#oooooooo#o#..#.#",
    "..#.#.#oooooooooo#..#.#.",
    ".#.#..#oooooooooo#.#.#..",
    "..#.#..##########.#.#...",
    ".....#...##..##....#....",
  ] },
  "Black Hat Hacker": { accent: "#39ff14", parts: [[0, 20, 0, 17, OC.cream], [3, 3, 5, 12, OC.rust], [7, 9, 4, 13, OC.skin], [12, 16, 0, 3, OC.skin], [12, 16, 14, 17, OC.skin]], rows: [
    ".....########.....",
    ".....########.....",
    ".....########.....",
    ".....#oooooo#.....",
    ".....########.....",
    "..##############..",
    "..####pp##pp####..",
    "....#oooooooo#....",
    "....#oo####oo#....",
    "...##oooooooo##...",
    ".################.",
    "#######ooo########",
    "###o##o#o#o###o###",
    "###o###ooo####o###",
    "###o###o#o####o###",
    "###o##########o###",
    "#ooo##########ooo#",
    ".################.",
    "..##############..",
    "...############...",
    ".....###..###.....",
  ] },
  Honeypot: { accent: "#e8a317", parts: [[0, 18, 0, 22, OC.cream], [1, 1, 5, 12, OC.sand], [4, 8, 3, 14, OC.veil], [8, 14, 16, 22, OC.terracotta]], rows: [
    "......######...........",
    ".....#oooooo#..........",
    "..####pppppp####.......",
    ".################......",
    "..##o#o#o#o#o###.......",
    "...##o###oo##o#........",
    "...#o#o#o#o#o##........",
    "...##o#o#o#o#o#........",
    "...#o#o#o#o#o##.######.",
    ".###############pppppp#",
    "#oo#oooo#oooooo##oooo#.",
    "#oo#oooo#oooooo#opoooo#",
    "#oo#oooo#oooooo#o####o#",
    "#oo####o#o###oo#oooooo#",
    "#oo#oooo#oooooo#######.",
    "####oooo#oooooo#..p....",
    ".###oooo##oooo#........",
    "...############...p....",
    "....####..####.........",
  ] },
  "Wallet Drainer": { accent: "#d4af37", parts: [[0, 18, 0, 15, OC.leather], [2, 5, 3, 12, OC.skin], [2, 2, 3, 12, OC.boots], [6, 8, 3, 12, OC.rust], [10, 16, 4, 9, OC.khaki], [13, 15, 10, 13, OC.boots]], rows: [
    "....########....",
    "...##########...",
    "...##ooo#ooo#...",
    "...#oooooooo#...",
    "...#o##oo##o#...",
    "#..#oooooooo#..#",
    "##.#o######o#.##",
    "####o#o##o#o####",
    "####o#oppo#o####",
    "################",
    ".#oo###oo###oo#.",
    ".#oo#oooooo#oo#.",
    ".#oo#oooo######.",
    ".#oo#oooo#oooo#.",
    ".#oo#oooo#o#pp#.",
    ".#oo#oooo#oooo#.",
    ".#oo#oooo######.",
    ".##############.",
    "...###....###...",
  ] },
  "Exit Scammer": { accent: "#d91a1a", parts: [[0, 23, 0, 15, OC.duster]], rows: [
    ".....######.....",
    "....########....",
    "...##########...",
    "...##########...",
    "...##########...",
    "..###########...",
    "..############..",
    ".#####oooo#####.",
    "#####ooopoo#####",
    "####ooopppoo####",
    "#ooooopppppoooo#",
    "#oooooopppooooo#",
    "#oooooopppooooo#",
    "#oooooooooooooo#",
    "#o##o#o#o#o###o#",
    "#o#oo#o#o#oo#oo#",
    "#o##oo#oo#oo#oo#",
    "#o#oo#o#o#oo#oo#",
    "#o##o#o#o#oo#oo#",
    "#oooooooooooooo#",
    ".##############.",
    "..############..",
    "...####..####...",
    "...###....###...",
  ] },
};
/** The Exit Scammer is always seen from behind, "EXIT" lettered across his back; he is never mirrored. */
const EXIT_SCAMMER = "Exit Scammer";
/** Outlaws drawn from one side only (lettering on the back), so they are never flipped to face left. */
const noMirror = (name: string | undefined) => name === EXIT_SCAMMER;
const FLEE_RANGE = 260; // world units: the Exit Scammer walks away from a Friend this close
/** The mask and accent to draw a named outlaw with, shaded like the animals. */
const outlawArts = new Map<string, OutlawArt>();
type OutlawArt = { rows: readonly string[]; accent: string; colours?: readonly (readonly (string | undefined)[])[] };
const outlawArt = (name: string | undefined, variant: number): OutlawArt => {
  const custom = name ? OUTLAW_ART[name] : undefined;
  if (!custom) return { rows: outlawMask(variant), accent: "#fff" };
  const cached = outlawArts.get(name!); if (cached) return cached;
  // Each white cell takes the colour of the last part covering it.
  const colours = custom.rows.map((row, y) => [...row].map((_, x) => custom.parts?.reduce<string | undefined>((colour, [r0, r1, c0, c1, part]) => (y >= r0 && y <= r1 && x >= c0 && x <= c1 ? part : colour), undefined)));
  const art = { rows: shadeRows(custom.rows), accent: custom.accent, colours };
  outlawArts.set(name!, art); return art;
};
/** The Centralised Exchange: a western storefront in the world's one-bit style ('#' black, 'o' white, '.' clear), anchored at its
 * bottom centre; rows 4-6 are its sign band. */
const SHOP_SPRITE: readonly string[] = [
  "..............########..............",
  ".............#oooooooo#.............",
  "............#oooooooooo#............",
  "..##########oooooooooooo##########..",
  ".#oooooooooooooooooooooooooooooooo#.",
  ".#oooooooooooooooooooooooooooooooo#.",
  ".#oooooooooooooooooooooooooooooooo#.",
  ".##################################.",
  ".#o#o#o#o#o#o#o#o#o#o#o#o#o#o#o#o##.",
  ".##################################.",
  "..#oooooooooooooooooooooooooooooo#..",
  "..#o######ooooo######oooo######oo#..",
  "..#o#oooo#ooooo#oooo#oooo#oooo#oo#..",
  "..#o#o##o#ooooo#oooo#oooo#o##o#oo#..",
  "..#o#oooo#ooooo#oooo#oooo#oooo#oo#..",
  "..#o######ooooo#oo#o#oooo######oo#..",
  "..#oooooooooooo#oooo#oooooooooooo#..",
  "..#oooooooooooo#oooo#oooooooooooo#..",
  "..##############oooo##############..",
  ".##################################.",
  "####################################",
];
if (SHOP_SPRITE.some(row => row.length !== SHOP_SPRITE[0].length)) throw new Error("SHOP_SPRITE rows must share one width.");
const SHOP_CELL = 8; // the exchange, 1.6x its original size (pixel cells stay whole)
/** Flat one-bit building fronts ('#' black, 'o' white, '.' clear), 38 cells wide with the doorway centred at the bottom; rows 3-5
 * (1-3 for the Charging Station canopy) are the sign band that carries the building's name. */
const DATACENTER_SPRITE: readonly string[] = [
  "..................#...................",
  "................#####.................",
  "..................#...................",
  "..##################################..",
  "..#oooooooooooooooooooooooooooooooo#..",
  "..#oooooooooooooooooooooooooooooooo#..",
  "..#oooooooooooooooooooooooooooooooo#..",
  "..##################################..",
  "..#oooooooooooooooooooooooooooooooo#..",
  "..#o##o##o##o##o##o##o##o##o##o##o##..",
  "..#o##o##o##o##o##o##o##o##o##o##o##..",
  "..#oooooooooooooooooooooooooooooooo#..",
  "..#o##o##o##o##o##o##o##o##o##o##o##..",
  "..#o##o##o##o##o##o##o##o##o##o##o##..",
  "..#oooooooooooooooooooooooooooooooo#..",
  "..#ooooooooooooo######ooooooooooooo#..",
  "..#ooooooooooooo#oooo#ooooooooooooo#..",
  "..###############oooo###############..",
  ".####################################.",
  "######################################",
];
const CHARGING_SPRITE: readonly string[] = [
  "....##############################....",
  "...#oooooooooooooooooooooooooooooo#...",
  "...#oooooooooooooooooooooooooooooo#...",
  "...#oooooooooooooooooooooooooooooo#...",
  "....##############################....",
  "....##.........................##.....",
  "....##.........####............##.....",
  "....##.........#oo#............##.....",
  "....##.........#o##............##.....",
  "..##################################..",
  "..#oooooooooooooooooooooooooooooooo#..",
  "..#o####oooo####oooo####oooo####ooo#..",
  "..#o#oo#oooo#oo#oooo#oo#oooo#oo#ooo#..",
  "..#o####oooo####oooo####oooo####ooo#..",
  "..#oooooooooooooooooooooooooooooooo#..",
  "..#ooooooooooooo######ooooooooooooo#..",
  "..#ooooooooooooo#oooo#ooooooooooooo#..",
  "..###############oooo###############..",
  ".####################################.",
  "######################################",
];
const COLDSTORAGE_SPRITE: readonly string[] = [
  "........##..........##..........##....",
  "........##..........##..........##....",
  "..##################################..",
  "..#oooooooooooooooooooooooooooooooo#..",
  "..#oooooooooooooooooooooooooooooooo#..",
  "..#oooooooooooooooooooooooooooooooo#..",
  "..##################################..",
  "..#oo#oo#oo#oooooooooooooo#oo#oo#oo#..",
  "..#oo#oo#oo#oooo#o#o#ooooo#oo#oo#oo#..",
  "..#oo#oo#oo#ooooo###oooooo#oo#oo#oo#..",
  "..#oo#oo#oo#oooo#####ooooo#oo#oo#oo#..",
  "..#oo#oo#oo#ooooo###oooooo#oo#oo#oo#..",
  "..#oo#oo#oo#oooo#o#o#ooooo#oo#oo#oo#..",
  "..#oo#oo#oo#oooooooooooooo#oo#oo#oo#..",
  "..#oooooooooooooooooooooooooooooooo#..",
  "..#ooooooooooooo######ooooooooooooo#..",
  "..#ooooooooooooo#oooo#ooooooooooooo#..",
  "..###############oooo###############..",
  ".####################################.",
  "######################################",
];
const MININGFARM_SPRITE: readonly string[] = [
  "....##.....##.....##.....##.....##....",
  "....##.....##.....##.....##.....##....",
  "..##################################..",
  "..#oooooooooooooooooooooooooooooooo#..",
  "..#oooooooooooooooooooooooooooooooo#..",
  "..#oooooooooooooooooooooooooooooooo#..",
  "..##################################..",
  "..#oooooooooooooooooooooooooooooooo#..",
  "..#o###o###o###o###o###o###o###o####..",
  "..#o#o#o#o#o#o#o#o#o#o#o#o#o#o#o#o##..",
  "..#o###o###o###o###o###o###o###o####..",
  "..#oooooooooooooooooooooooooooooooo#..",
  "..#o###o###o###o###o###o###o###o####..",
  "..#o#o#o#o#o#o#o#o#o#o#o#o#o#o#o#o##..",
  "..#oooooooooooooooooooooooooooooooo#..",
  "..#ooooooooooooo######ooooooooooooo#..",
  "..#ooooooooooooo#oooo#ooooooooooooo#..",
  "..###############oooo###############..",
  ".####################################.",
  "######################################",
];
/** The friendly local: '#' black outline, arms and boots, 'h' the bowler's brown crown, 'r' its red band, 'f' the face, 'c' the tan
 * duster coat, '.' clear. Drawn without a halo (drawVillager). */
const FRIENDLY_MASK: readonly string[] = [
  ".....######.....",
  "....#hhhhhh#....",
  "....#rrrrrr#....",
  "...##########...",
  "....#ffffff#....",
  "....#f#ff#f#....",
  "....#ffffff#....",
  "....#f####f#....",
  ".....######.....",
  "...##########...",
  "..#.#cccccc#.#..",
  "..#.#cccccc#.#..",
  "....#cccccc#....",
  "....###..###....",
  "....###..###....",
  "...####..####...",
];
const VILLAGER_COLOURS: Readonly<Record<string, string>> = { "#": "#000", h: "#5b3a1e", r: "#c9573f", f: "#f1d9bf", c: "#c9a878" };
/** The friendly local at the size and anchor of drawMask (bottom centre, 5 px cells), in colour and without a halo. */
function drawVillager(ctx: CanvasRenderingContext2D, x: number, y: number, flip: boolean) {
  const cell = 5, width = FRIENDLY_MASK[0].length, height = FRIENDLY_MASK.length;
  const left = Math.round(x) - Math.round(width / 2) * cell, top = Math.round(y) - (height - 1) * cell;
  FRIENDLY_MASK.forEach((row, py) => [...row].forEach((pixel, px) => {
    const colour = VILLAGER_COLOURS[pixel]; if (!colour) return;
    ctx.fillStyle = colour; ctx.fillRect(left + (flip ? width - 1 - px : px) * cell, top + py * cell, cell, cell);
  }));
}
/** A building front plus the rows of its sign band, where the name is lettered. */
/** A building's colours by part. The pixel art only knows black and white, so its white cells are sorted into parts when it is
 * first drawn (`buildingPart`): the sign band's rows are the sign, rows above it the roof, the white area reached from the
 * doorway's threshold the door, small white areas shut in by black lines the windows, and the rest the walls; `bands` then
 * recolour chosen rows (and columns) last, for trims and panels. */
type BuildingColours = Readonly<{ wall: string; sign: string; roof: string; door: string; window: string;
  bands?: readonly Readonly<{ rows: readonly [number, number]; cols?: readonly (readonly [number, number])[]; colour: string }>[] }>;
/** A solid block behind part of a building's front (its art's columns and rows, inclusive): a roof face and a right side face
 * recede from it at the world's isometric slope, BUILDING_DEPTH cells deep, so the flat front reads as a 3D building. */
type BuildingBlock = Readonly<{ cols: readonly [number, number]; rows: readonly [number, number]; roof: string; side: string }>;
type BuildingArt = Readonly<{ rows: readonly string[]; name: string; sign: readonly [number, number]; colours?: BuildingColours; blocks?: readonly BuildingBlock[] }>;
/** The buildings' stone steps (the art's two base rows, drawn as slabs): front, top and side. */
const STEP_COLOURS = { front: "#bfb5a4", top: "#d8cfbf", side: "#a39985" };
/** How deep the building blocks are, in art cells, and the world's isometric slope (screen rise per screen run along a world axis). */
const BUILDING_DEPTH = 10, ISO_SLOPE = 0.28 / 0.8660254038;
/** Prototype: building fronts sheared onto the world's isometric x axis (0 keeps them facing the camera, as before). The door's
 * walk-in band, "Walk in" label, exit spot and horse parking follow the sheared door. */
const BUILDING_SHEAR = ISO_SLOPE;
const BUILDING_BLOCKS: Readonly<Record<BuildingKind | "store", readonly BuildingBlock[]>> = {
  store: [{ cols: [2, 33], rows: [3, 18], roof: "#9c7654", side: "#b3946d" }],
  datacenter: [{ cols: [2, 35], rows: [3, 17], roof: "#95a1ad", side: "#a9b4bf" }],
  // The Charging Station: the station, and its canopy above it on the pillars, each a block.
  charging: [{ cols: [2, 35], rows: [9, 17], roof: "#aaa293", side: "#bdb5a5" }, { cols: [3, 34], rows: [0, 4], roof: "#efd07a", side: "#c9a643" }],
  coldstorage: [{ cols: [2, 35], rows: [2, 17], roof: "#cddbe6", side: "#b3c4d2" }],
  miningfarm: [{ cols: [2, 35], rows: [2, 17], roof: "#a9805f", side: "#b99a78" }],
};
const SIGN_CREAM = "#f3ead8", GLASS = "#cfe3ea";
const BUILDING_COLOURS: Readonly<Record<BuildingKind | "store", BuildingColours>> = {
  // The Exchange: a weathered-wood Western storefront, a darker pediment, a faded red awning trim, pale glass, a dark wood door.
  store: { wall: "#d4b48c", sign: SIGN_CREAM, roof: "#b08e66", door: "#8a6a4a", window: GLASS, bands: [{ rows: [8, 8], colour: "#c9573f" }] },
  // The Data Center: pale slate, a steel door (its windows are black).
  datacenter: { wall: "#c9d3dc", sign: SIGN_CREAM, roof: "#c9d3dc", door: "#9aa3ab", window: "#8fb4d0" },
  // The Charging Station: warm concrete under an amber canopy (the sign band) and an amber plug sign between the pillars.
  charging: { wall: "#d9d2c3", sign: "#e8c35a", roof: "#e8c35a", door: "#b8902e", window: GLASS, bands: [{ rows: [5, 8], colour: "#e8c35a" }] },
  // The Cold Storage: icy walls with steel-blue shutter panels either side of the snowflake, a steel-blue door.
  coldstorage: { wall: "#dde9f1", sign: SIGN_CREAM, roof: "#dde9f1", door: "#8fa9bf", window: GLASS, bands: [{ rows: [7, 13], cols: [[3, 10], [27, 34]], colour: "#b9ccdb" }] },
  // The Mining Farm: adobe with a rust door, its racks' small lights green.
  miningfarm: { wall: "#d9b894", sign: SIGN_CREAM, roof: "#d9b894", door: "#b0704a", window: "#9fd08a" },
};
/** The colour of each white cell of a building's art, sorted into parts as BuildingColours describes. */
function buildingPart(art: BuildingArt): (px: number, py: number) => string {
  const colours = art.colours; if (!colours) return () => "#fff";
  const { rows, sign } = art, height = rows.length, width = rows[0].length, key = (x: number, y: number) => y * width + x;
  const white = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && rows[y][x] === "o";
  // White areas below the sign band, as connected components.
  const component = new Map<number, number>(), sizes: number[] = [];
  for (let y = sign[1] + 1; y < height; y++) for (let x = 0; x < width; x++) {
    if (!white(x, y) || component.has(key(x, y))) continue;
    const id = sizes.length, stack: [number, number][] = [[x, y]]; let size = 0;
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      if (cy <= sign[1] || !white(cx, cy) || component.has(key(cx, cy))) continue;
      component.set(key(cx, cy), id); size++;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    sizes.push(size);
  }
  const walls = sizes.indexOf(Math.max(...sizes));
  const doorIds = new Set([...rows[height - 3]].flatMap((pixel, x) => (pixel === "o" ? [component.get(key(x, height - 3))!] : [])));
  return (px, py) => {
    const band = colours.bands?.find(entry => py >= entry.rows[0] && py <= entry.rows[1] && (!entry.cols || entry.cols.some(([a, b]) => px >= a && px <= b)));
    if (band) return band.colour;
    if (py >= sign[0] && py <= sign[1]) return colours.sign;
    if (py < sign[0]) return colours.roof;
    const id = component.get(key(px, py));
    return id === undefined ? colours.wall : doorIds.has(id) ? colours.door : id === walls ? colours.wall : colours.window;
  };
}
const BUILDING_ART: Readonly<Record<BuildingKind, BuildingArt>> = {
  datacenter: { rows: DATACENTER_SPRITE, name: BUILDING_NAMES.datacenter, sign: [4, 6], colours: BUILDING_COLOURS.datacenter, blocks: BUILDING_BLOCKS.datacenter },
  charging: { rows: CHARGING_SPRITE, name: BUILDING_NAMES.charging, sign: [1, 3], colours: BUILDING_COLOURS.charging, blocks: BUILDING_BLOCKS.charging },
  coldstorage: { rows: COLDSTORAGE_SPRITE, name: BUILDING_NAMES.coldstorage, sign: [3, 5], colours: BUILDING_COLOURS.coldstorage, blocks: BUILDING_BLOCKS.coldstorage },
  miningfarm: { rows: MININGFARM_SPRITE, name: BUILDING_NAMES.miningfarm, sign: [3, 5], colours: BUILDING_COLOURS.miningfarm, blocks: BUILDING_BLOCKS.miningfarm },
};
const SHOP_ART: BuildingArt = { rows: SHOP_SPRITE, name: "Centralised Exchange", sign: [4, 6], colours: BUILDING_COLOURS.store, blocks: BUILDING_BLOCKS.store };
const BUILDING_CELL = 8;
/** The drawn doorway: the clear run in the sprite's door row, as screen px left/right of the building's anchor
 * (its bottom centre), plus the band in front of it (screen px below the anchor) that counts as walking into the door. */
// The band reaches well out from the steps and past the doorway's sides, so walking roughly at the door (along the sheared front)
// goes in; the exit spot lies just beyond it, so stepping out and turning aside does not walk straight back in.
const DOOR_BAND = { slack: 24, depth: 85 * BUILDING_SCALE, exit: 95 * BUILDING_SCALE };
function doorSpan(sprite: readonly string[], cell: number) {
  const row = sprite[sprite.length - 3], clear = [...row].map((pixel, index) => pixel === "o" ? index : -1).filter(index => index >= 0);
  const middle = row.length * cell / 2;
  return { left: (clear[0] * cell - middle) * BUILDING_SCALE, right: ((clear[clear.length - 1] + 1) * cell - middle) * BUILDING_SCALE };
}
const DOORS: Readonly<Record<BuildingKind, { left: number; right: number }>> = {
  datacenter: doorSpan(DATACENTER_SPRITE, BUILDING_CELL), charging: doorSpan(CHARGING_SPRITE, BUILDING_CELL),
  coldstorage: doorSpan(COLDSTORAGE_SPRITE, BUILDING_CELL), miningfarm: doorSpan(MININGFARM_SPRITE, BUILDING_CELL),
};
/** The Centralised Exchange's doorway; walking against it opens the shop. */
const SHOP_DOOR = doorSpan(SHOP_SPRITE, SHOP_CELL);
/** Screen-px offset of a world point from a building's anchor, in the game view's pixels. */
function doorOffset(building: WorldPoint, point: WorldPoint) {
  const [bx, by] = project(...building), [px, py] = project(...point);
  return { dx: (px - bx) * SCALE, dy: (py - by) * SCALE };
}
/** Whether a walking player is pressed against the visible front of the building's door (the band just below the doorway). */
function atDoor(kind: BuildingKind | "store", building: WorldPoint, point: WorldPoint) {
  const door = kind === "store" ? SHOP_DOOR : DOORS[kind], { dx, dy } = doorOffset(building, point);
  // Below the doorway measured from the (sheared) front's bottom edge, which drops BUILDING_SHEAR px per px to the right.
  const below = dy - BUILDING_SHEAR * dx;
  return dx >= door.left - DOOR_BAND.slack && dx <= door.right + DOOR_BAND.slack && below > 0 && below <= DOOR_BAND.depth;
}
/** The middle of a doorway's threshold (a building's or the exchange's): where its "walk in" label shows, just below it. */
function doorFront(kind: BuildingKind | "store", building: WorldPoint): WorldPoint {
  const door = kind === "store" ? SHOP_DOOR : DOORS[kind], [bx, by] = project(...building);
  const middle = (door.left + door.right) / 2;
  return unproject(bx + middle / SCALE, by + BUILDING_SHEAR * middle / SCALE);
}
/** The spot straight below the doorway where a player steps out of the building. */
function doorExit(kind: BuildingKind, building: WorldPoint): WorldPoint {
  const door = DOORS[kind], [bx, by] = project(...building);
  const middle = (door.left + door.right) / 2;
  return unproject(bx + middle / SCALE, by + (DOOR_BAND.exit + BUILDING_SHEAR * middle) / SCALE);
}
for (const rows of [DATACENTER_SPRITE, CHARGING_SPRITE, COLDSTORAGE_SPRITE, MININGFARM_SPRITE]) if (rows.some(row => row.length !== rows[0].length)) throw new Error("Building sprite rows must share one width.");

const buildingImages = new Map<BuildingArt, { canvas: HTMLCanvasElement; anchorX: number; anchorY: number }>();

/** Pre-render a building front flat, like every other element: '#' cells black with a one-cell white halo, 'o' cells white,
 * then the building's name lettered in black across its sign band. */
function buildingImage(art: BuildingArt, cell: number) {
  const cached = buildingImages.get(art);
  if (cached) return cached;
  const { rows, name, sign } = art;
  const width = rows[0].length * cell, height = rows.length * cell, pad = cell + 2;
  const outline = Math.max(3, Math.round(cell * 0.5));
  const faceOn = (target: CanvasRenderingContext2D) => (points: readonly (readonly [number, number])[], fill: string | CanvasPattern) => {
    target.beginPath(); points.forEach(([x, y], i) => (i ? target.lineTo(x, y) : target.moveTo(x, y))); target.closePath();
    target.fillStyle = fill; target.fill(); target.strokeStyle = "#000"; target.lineWidth = outline; target.lineJoin = "miter"; target.stroke();
  };
  // The steps: the art's last two rows (its base) as stone slabs, the lower one first.
  const steps = art.blocks?.length ? rows.slice(-2).map((row, k) => ({ y: rows.length - 2 + k, from: row.indexOf("#"), to: row.lastIndexOf("#") })).reverse() : [];

  // 1. The front, flat, on its own canvas (front coordinates: the art at (pad, pad)): the art, its stone step fronts over the black
  // base rows, and the sign.
  const front = document.createElement("canvas"); front.width = width + pad * 2; front.height = height + pad * 2;
  const fctx = front.getContext("2d")!, fface = faceOn(fctx);
  const each = (test: (pixel: string) => boolean, paint: (px: number, py: number) => void) =>
    rows.forEach((row, py) => [...row].forEach((pixel, px) => { if (test(pixel)) paint(px, py); }));
  // No white halo round the building (like the Friend and the horses): its black outline sits straight on the ground.
  const part = buildingPart(art);
  each(pixel => pixel === "o", (px, py) => { fctx.fillStyle = part(px, py); fctx.fillRect(pad + px * cell, pad + py * cell, cell, cell); });
  fctx.fillStyle = "#000";
  each(pixel => pixel === "#", (px, py) => fctx.fillRect(pad + px * cell, pad + py * cell, cell, cell));
  for (const step of steps) fface([[pad + step.from * cell, pad + step.y * cell], [pad + (step.to + 1) * cell, pad + step.y * cell],
    [pad + (step.to + 1) * cell, pad + (step.y + 1) * cell], [pad + step.from * cell, pad + (step.y + 1) * cell]], STEP_COLOURS.front);
  // The sign: the name in bold capitals, centred on the band and shrunk if a long name would touch the frame.
  const bandWidth = width - cell * 6, centreY = pad + (sign[0] + sign[1] + 1) / 2 * cell;
  let size = Math.round(cell * 1.9);
  fctx.textAlign = "center"; fctx.textBaseline = "middle";
  const text = name.toUpperCase();
  for (; size > 8; size--) { fctx.font = `bold ${size}px system-ui, sans-serif`; if (fctx.measureText(text).width <= bandWidth) break; }
  fctx.fillStyle = "#000"; fctx.fillText(text, pad + width / 2, centreY + 1);

  // 2. The building: the front sheared along the world's x axis (BUILDING_SHEAR: falling to the right like the paths' edges; 0 keeps
  // it facing the camera), pivoting on its bottom centre so the building's anchor stays put, and behind it the blocks' and steps'
  // roof and side faces, built on the sheared front's edges and receding up and to the right along the world's other axis.
  const depthX = art.blocks?.length ? BUILDING_DEPTH * cell : 0, depthY = Math.round(depthX * ISO_SLOPE);
  const pivot = pad + width / 2, shearPad = Math.ceil(BUILDING_SHEAR * (width / 2 + pad));
  const canvas = document.createElement("canvas");
  canvas.width = width + pad * 2 + depthX; canvas.height = height + pad * 2 + depthY + shearPad * 2;
  const ctx = canvas.getContext("2d")!, face = faceOn(ctx), offsetY = depthY + shearPad;
  const at = (x: number, y: number): [number, number] => [x, y + offsetY + BUILDING_SHEAR * (x - pivot)];
  const back = ([x, y]: [number, number]): [number, number] => [x + depthX, y - depthY];
  const dots = document.createElement("canvas"); dots.width = cell; dots.height = cell;
  const slab = (x0: number, x1: number, y0: number, y1: number, top: string, side: string | CanvasPattern) => {
    const tl = at(x0, y0), tr = at(x1, y0), br = at(x1, y1);
    face([tr, back(tr), back(br), br], side);
    face([tl, tr, back(tr), back(tl)], top);
  };
  for (const step of steps) slab(pad + step.from * cell, pad + (step.to + 1) * cell, pad + step.y * cell, pad + (step.y + 1) * cell, STEP_COLOURS.top, STEP_COLOURS.side);
  for (const block of art.blocks ?? []) {
    const dctx = dots.getContext("2d")!; dctx.fillStyle = block.side; dctx.fillRect(0, 0, cell, cell); dctx.fillStyle = "rgba(0, 0, 0, 0.35)"; dctx.fillRect(0, 0, 2, 2); dctx.fillRect(cell / 2, cell / 2, 2, 2);
    slab(pad + block.cols[0] * cell, pad + (block.cols[1] + 1) * cell, pad + block.rows[0] * cell, pad + (block.rows[1] + 1) * cell, block.roof, ctx.createPattern(dots, "repeat")!);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, BUILDING_SHEAR, 0, 1, 0, offsetY - BUILDING_SHEAR * pivot); ctx.drawImage(front, 0, 0); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const image = { canvas, anchorX: Math.round(pivot), anchorY: pad + height + offsetY };
  buildingImages.set(art, image);
  return image;
}

/** Draw a building anchored at its bottom centre. */
function drawBuilding(ctx: CanvasRenderingContext2D, art: BuildingArt, x: number, y: number, cell: number) {
  // Rendered once at whole cells of cell × BUILDING_SCALE (10 px), sign lettering included, and drawn 1:1 so every pixel is even.
  const image = buildingImage(art, Math.round(cell * BUILDING_SCALE));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image.canvas, Math.round(x) - image.anchorX, Math.round(y) - image.anchorY);
}
const drawShop = (ctx: CanvasRenderingContext2D, x: number, y: number) => drawBuilding(ctx, SHOP_ART, x, y, SHOP_CELL);

/** A one-bit arrow floating above the friendly's head, pointing along a screen direction (toward the wanted outlaw). */
function drawGuideArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, bob: number) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y) - 98 - bob); ctx.rotate(angle);
  ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-2, -14); ctx.lineTo(-2, -6); ctx.lineTo(-18, -6); ctx.lineTo(-18, 6); ctx.lineTo(-2, 6); ctx.lineTo(-2, 14); ctx.closePath();
  ctx.lineJoin = "round"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 8; ctx.stroke();
  ctx.strokeStyle = "#000"; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.fill();
  ctx.restore();
}

const random = (min: number, max: number) => min + Math.random() * (max - min);
const distance = (a: WorldPoint, b: WorldPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function randomWalkable(away: WorldPoint, minimum: number): WorldPoint {
  for (let attempt = 0; attempt < 300; attempt++) {
    const point: WorldPoint = [random(NPC_RADIUS, WORLD_SIZE.width - NPC_RADIUS), random(NPC_RADIUS, WORLD_SIZE.height - NPC_RADIUS)];
    if (walkable(point, NPC_RADIUS) && distance(point, away) >= minimum) return point;
  }
  return spawn;
}
function randomInterior(interior: Interior): WorldPoint {
  for (let attempt = 0; attempt < 300; attempt++) {
    const point: WorldPoint = [random(WALL + NPC_RADIUS, interior.width - WALL - NPC_RADIUS), random(WALL + NPC_RADIUS, interior.height - WALL - 60)];
    if (interiorWalkable(interior, point, NPC_RADIUS)) return point;
  }
  return interior.spawn;
}

let npcSerial = 0;
function spawnNpc(kind: NpcKind, away: WorldPoint, now: number, name?: string, scene: Scene = "outside"): Npc {
  const position = scene === "outside" ? randomWalkable(away, kind === "outlaw" ? 260 : 140) : randomInterior(INTERIORS[scene]);
  return { id: ++npcSerial, kind, name, variant: name ? variantOf(name) : 0, scene, loot: [], position, dir: [1, 0], facing: "right", walking: false, until: now + random(300, 1500), hp: 1, fallenAt: 0, mode: "", modeUntil: 0, hover: 0 };
}
const inPuddle = (point: WorldPoint) => {
  const nx = (point[0] - PUDDLE.centre[0]) / PUDDLE.rx, ny = (point[1] - PUDDLE.centre[1]) / PUDDLE.ry;
  return Math.hypot(nx, ny) <= puddleRadius(Math.atan2(ny, nx));
};
/** A spot on the chickens' side of the farmyard (20 to 120 units from the yard's centre, walkable). */
const randomYardPoint = (): WorldPoint => {
  for (let attempt = 0; attempt < 40; attempt++) {
    const angle = random(0, Math.PI * 2), r = random(20, 120);
    const point: WorldPoint = [YARD.centre[0] + Math.cos(angle) * r, YARD.centre[1] + Math.sin(angle) * r * 0.8];
    if (!inPuddle(point) && walkable(point, NPC_RADIUS)) return point;
  }
  return randomWalkable(YARD.centre, 0);
};
/** A frog's spot in or around the Mining Pool (the water counts as ground for frogs). */
const randomPoolPoint = (): WorldPoint => {
  for (let attempt = 0; attempt < 40; attempt++) {
    const point: WorldPoint = [random(POOL.x - 50, POOL.x + POOL.w + 50), random(POOL.y - 40, POOL.y + POOL.h + 40)];
    if (inPool(point) || walkable(point, NPC_RADIUS)) return point;
  }
  return POOL.centre;
};
const randomPuddlePoint = (): WorldPoint => {
  for (let attempt = 0; attempt < 30; attempt++) {
    const angle = random(0, Math.PI * 2), r = Math.sqrt(random(0, 1)) * 0.85 * puddleRadius(angle);
    const point: WorldPoint = [PUDDLE.centre[0] + Math.cos(angle) * PUDDLE.rx * r, PUDDLE.centre[1] + Math.sin(angle) * PUDDLE.ry * r];
    if (walkable(point, NPC_RADIUS)) return point;
  }
  return PUDDLE.centre;
};
/** Spawn `count` of one species outside: pigs in the mud puddle, other herd species as a cluster, everything else singly. */
function spawnSpecies(spec: AnimalSpec, count: number, away: WorldPoint, now: number): Npc[] {
  const centre = spec.behaviour === "herd" && spec.id !== "pig" ? randomWalkable(away, 140) : null;
  return Array.from({ length: count }, (_, i) => {
    const npc = spawnNpc(spec.id, away, now);
    if (spec.id === "pig") npc.position = randomPuddlePoint();
    else if (spec.id === "frog") npc.position = randomPoolPoint();
    else if (spec.id === "bee") npc.position = [HIVE[0] + random(-SWARM_RADIUS, SWARM_RADIUS), HIVE[1] + random(-SWARM_RADIUS, SWARM_RADIUS)];
    else if (spec.behaviour === "chicken") { npc.position = randomYardPoint(); npc.modeUntil = now + random(8000, 20000); }
    else if (centre) { const near: WorldPoint = [centre[0] + random(-60, 60), centre[1] + random(-40, 40)]; npc.position = i === 0 ? centre : walkable(near, NPC_RADIUS) ? near : centre; }
    npc.hp = Math.max(1, spec.shots);
    npc.hover = spec.flying ? (spec.id === "dragon" ? 90 : spec.id === "bird" || spec.id === "crow" ? 34 : spec.id === "bee" ? random(14, 40) : 18) : 0;
    if (spec.palette) {
      // Random colours: a main tint plus a different accent from the same palette, mixed on the mask's 'p' cells.
      npc.tint = spec.palette[Math.floor(Math.random() * spec.palette.length)];
      const others = spec.palette.filter(colour => colour !== npc.tint); npc.accent = spec.accent ?? others[Math.floor(Math.random() * others.length)];
    }
    // Random accents on a white body (birds): one colour from the accent palette per individual.
    if (spec.accentPalette) npc.accent = spec.accentPalette[Math.floor(Math.random() * spec.accentPalette.length)];
    if (spec.behaviour === "dragon") { npc.mode = "circle"; npc.modeUntil = now + random(6000, 12000); }
    return npc;
  });
}
/** Whether a species shows up on a roll: chance 100 always, 0 never, otherwise that percentage. */
const speciesRolls = (spec: AnimalSpec) => spec.chance >= 100 || (spec.chance > 0 && Math.random() * 100 < spec.chance);
/** The starting population from ANIMALS.md: every chance-100 species at exactly its count, chance species at their count when their roll succeeds. */
const initialAnimals = (away: WorldPoint, now: number): Npc[] => ANIMALS.flatMap(spec => speciesRolls(spec) ? spawnSpecies(spec, spec.alive, away, now) : []);
/** Take the next wanted outlaw in the sequence and spawn its members (two for Pumper & Dumper), sometimes holed up in a building. */
/** Outlaws tied to a building: they hide only in it, spawn near it outdoors, and never wander further than HOME_RANGE from it. */
const OUTLAW_HOMES: Readonly<Record<string, BuildingKind>> = { "Pig Butcher": "miningfarm" };
const HOME_RANGE = 260; // world units from the home building
const homeOf = (name: string | undefined) => { const kind = name ? OUTLAW_HOMES[name] : undefined; return kind ? PLACED_BUILDINGS.find(building => building.kind === kind)! : null; };
/** A walkable spot 110-240 units from a building, for an outlaw arriving at its home. */
function nearHome(home: WorldPoint): WorldPoint {
  for (let attempt = 0; attempt < 60; attempt++) {
    const angle = random(0, Math.PI * 2), r = random(110, 240), point: WorldPoint = [home[0] + Math.cos(angle) * r, home[1] + Math.sin(angle) * r];
    if (walkable(point, NPC_RADIUS)) return point;
  }
  return randomWalkable(home, 0);
}
function spawnOutlawWave(away: WorldPoint, now: number) {
  const name = nextOutlawName();
  if (!name) return null; // the list is done: the country is clear
  const home = homeOf(name);
  // The Honeypot never hides indoors: he turns up beside the bees' tree.
  const scene: Scene = name !== "Honeypot" && Math.random() < INSIDE_ODDS ? (home?.kind ?? SCENES[Math.floor(Math.random() * SCENES.length)]) : "outside";
  return { name, scene, npcs: waveMembers(name).map(member => {
    const npc = { ...spawnNpc("outlaw", away, now, member, scene), hp: outlawHits(member), belongings: { wallet: true, half: HALF_OF[member] } };
    if (home && scene === "outside") npc.position = nearHome(home.position);
    if (name === "Honeypot") npc.position = nearHome(HIVE);
    return npc;
  }) };
}
/** Where an outlaw is from the outside: its position, or the building it is hiding in. */
const outlawSpot = (npc: Npc): WorldPoint => npc.scene === "outside" ? npc.position : PLACED_BUILDINGS.find(building => building.kind === npc.scene)!.position;

/** Move along npc.dir at `speed`; flyers ignore obstacles but stay inside the world, walkers stop at obstacles. Returns whether it moved. */
function advance(npc: Npc, deltaMs: number, speed: number, flying: boolean, amphibious = false) {
  const [sx, sy] = project(...npc.position);
  const step = Math.min(40, deltaMs) * speed / 1000;
  const next = unproject(sx + npc.dir[0] * step, sy + npc.dir[1] * step);
  if (flying) {
    if (next[0] < NPC_RADIUS || next[1] < NPC_RADIUS || next[0] > WORLD_SIZE.width - NPC_RADIUS || next[1] > WORLD_SIZE.height - NPC_RADIUS) return false;
    npc.position = next; return true;
  }
  // Frogs hop through the Mining Pool's water, which blocks everyone else.
  if (!(amphibious && npc.scene === "outside" && inPool(next)) && !sceneWalkable(npc.scene)(next, NPC_RADIUS)) return false;
  npc.position = next; return true;
}
const aimAt = (npc: Npc, target: WorldPoint, away = false) => {
  const [sx, sy] = project(...npc.position), [tx, ty] = project(...target), far = Math.hypot(tx - sx, ty - sy) || 1;
  const sign = away ? -1 : 1;
  npc.dir = [sign * (tx - sx) / far, sign * (ty - sy) / far]; npc.facing = npc.dir[0] < 0 ? "left" : "right";
};
const randomDir = (npc: Npc) => { const angle = random(0, Math.PI * 2); npc.dir = [Math.cos(angle), Math.sin(angle)]; npc.facing = npc.dir[0] < 0 ? "left" : "right"; };

/** Species behaviour from ANIMALS.md. `player` is the Friend's position when it shares the animal's scene. */
function updateAnimal(npc: Npc, now: number, deltaMs: number, player: WorldPoint | null, all: readonly Npc[]) {
  const spec = ANIMAL_BY_ID[npc.kind as AnimalId];
  if (npc.fallenAt) return;
  const near = player ? distance(npc.position, player) : Infinity;
  const pauses: [number, number] = spec.behaviour === "herd" || spec.behaviour === "ostrich" ? [1500, 4500] : spec.behaviour === "hop" ? [500, 1400] : [800, 2500];
  const walks: [number, number] = spec.behaviour === "hop" ? [250, 450] : spec.behaviour === "flutter" ? [300, 800] : spec.behaviour === "slither" ? [2500, 5000] : [1500, 3500];
  const wanderStep = () => {
    if (now >= npc.until) {
      if (npc.walking) { npc.walking = false; npc.until = now + random(...pauses); }
      else { randomDir(npc); npc.walking = true; npc.until = now + random(...walks); }
    }
    if (npc.walking && !advance(npc, deltaMs, spec.speed, spec.flying, spec.id === "frog")) { npc.walking = false; npc.until = now + random(200, 600); }
  };
  switch (spec.behaviour) {
    case "hop":
      // Frogs keep to the Mining Pool and its banks.
      if (!inPool(npc.position, 120) && now >= npc.until && !npc.walking) { aimAt(npc, POOL.centre); npc.walking = true; npc.until = now + random(400, 900); }
      wanderStep(); return;
    case "wander": case "flutter": wanderStep(); return;
    case "slither":
      // Continuous movement with a slow drift of direction.
      if (now >= npc.until) { randomDir(npc); npc.until = now + random(...walks); }
      npc.walking = true;
      if (!advance(npc, deltaMs, spec.speed, false)) { randomDir(npc); }
      return;
    case "cat":
      // Occasionally comes over to the Friend, then bolts.
      if (npc.mode === "approach") { if (player) aimAt(npc, player); npc.walking = true; if (!advance(npc, deltaMs, spec.speed, false) || near < 40 || now > npc.modeUntil) { npc.mode = "flee"; npc.modeUntil = now + 1500; } return; }
      if (npc.mode === "flee") { if (player) aimAt(npc, player, true); npc.walking = true; if (!advance(npc, deltaMs, spec.speed * 1.5, false) || now > npc.modeUntil) { npc.mode = "roam"; npc.modeUntil = now + random(6000, 12000); npc.walking = false; npc.until = now; } return; }
      if (now > npc.modeUntil && player && near < 260 && near > 60) { npc.mode = "approach"; npc.modeUntil = now + 4000; return; }
      wanderStep(); return;
    case "dog":
      // Trots over when the Friend is nearby, sits a moment, then roams for a while.
      if (npc.mode === "approach") { if (player) aimAt(npc, player); npc.walking = true; if (!advance(npc, deltaMs, spec.speed, false) || near < 35 || now > npc.modeUntil) { npc.mode = "sit"; npc.modeUntil = now + random(1000, 2200); npc.walking = false; } return; }
      if (npc.mode === "sit") { npc.walking = false; if (player && npc.position[0] < player[0]) npc.facing = "right"; else npc.facing = "left"; if (now > npc.modeUntil) { npc.mode = "roam"; npc.modeUntil = now + random(6000, 10000); npc.until = now; } return; }
      if (now > npc.modeUntil && player && near < 200 && near > 50) { npc.mode = "approach"; npc.modeUntil = now + 4000; return; }
      wanderStep(); return;
    case "herd": {
      // Slow grazing; strays drift back toward the rest of their kind.
      // Pigs keep to their mud puddle; other herds gather around their own kind.
      const kin = all.filter(other => other.kind === npc.kind && other !== npc && !other.fallenAt && other.scene === npc.scene);
      // Pigs wallow in the puddle and wander the yard around it, heading back once they roam past PIG_RANGE from its centre.
      if (spec.id === "pig" && distance(npc.position, PUDDLE.centre) > PIG_RANGE) { aimAt(npc, PUDDLE.centre); npc.walking = true; npc.until = now + random(600, 1200); advance(npc, deltaMs, spec.speed, false); return; }
      if (now >= npc.until && !npc.walking) {
        if (spec.id === "pig") { /* inside the puddle: graze freely */ }
        else if (kin.length) {
          const centre: WorldPoint = [kin.reduce((sum, other) => sum + other.position[0], 0) / kin.length, kin.reduce((sum, other) => sum + other.position[1], 0) / kin.length];
          if (distance(npc.position, centre) > 100) { aimAt(npc, centre); npc.walking = true; npc.until = now + random(1500, 3000); }
        }
      }
      wanderStep(); return;
    }
    case "chicken": {
      // Roosters and hens peck on their side of the farmyard; now and then the flock gathers, and now and then one crosses to the
      // pigs' puddle for a visit before drifting home again.
      const home = npc.mode === "visit" ? PUDDLE.centre : YARD.centre;
      if (distance(npc.position, home) > YARD.range) {
        // Head home (or over to the puddle); the Mining Farm stands between the two sides, so a blocked step slides along it.
        aimAt(npc, home); npc.walking = true;
        if (!advance(npc, deltaMs, spec.speed, false)) { const [dx, dy] = npc.dir; npc.dir = [-dy, dx]; if (!advance(npc, deltaMs, spec.speed, false)) { npc.dir = [dy, -dx]; advance(npc, deltaMs, spec.speed, false); } }
        return;
      }
      if (npc.mode === "visit") { if (now > npc.modeUntil) { npc.mode = ""; npc.modeUntil = now + random(40000, 80000); } wanderStep(); return; }
      if (npc.mode === "gather") {
        const kin = all.filter(other => other !== npc && !other.fallenAt && isAnimal(other.kind) && ANIMAL_BY_ID[other.kind].behaviour === "chicken");
        if (kin.length) {
          const centre: WorldPoint = [kin.reduce((sum, other) => sum + other.position[0], 0) / kin.length, kin.reduce((sum, other) => sum + other.position[1], 0) / kin.length];
          if (distance(npc.position, centre) > 30) { aimAt(npc, centre); npc.walking = true; if (!advance(npc, deltaMs, spec.speed, false)) randomDir(npc); } else npc.walking = false;
        }
        if (now > npc.modeUntil) { npc.mode = ""; npc.modeUntil = now + random(15000, 30000); npc.until = now; }
        return;
      }
      if (now > npc.modeUntil) {
        if (Math.random() < 0.15) { npc.mode = "visit"; npc.modeUntil = now + random(10000, 16000); aimAt(npc, PUDDLE.centre); npc.walking = true; npc.until = now + 2500; }
        else { npc.mode = "gather"; npc.modeUntil = now + random(3000, 5000); }
        return;
      }
      wanderStep(); return;
    }
    case "swarm": {
      // Bees buzz round the tree until the Honeypot is out, then round him wherever he goes; once he has been neutralized they
      // are free and wander the country.
      const honeypot = all.find(other => other.kind === "outlaw" && other.name === "Honeypot" && other.scene === npc.scene);
      if (honeypot?.fallenAt || (!honeypot && npc.mode === "follow")) npc.mode = "free";
      const anchor = npc.mode === "free" ? null : honeypot ? honeypot.position : HIVE;
      if (npc.mode !== "free" && honeypot) npc.mode = "follow";
      // Jittery flight: small random turns every few frames, and a pull back once the bee strays past the swarm radius.
      if (anchor && distance(npc.position, anchor) > SWARM_RADIUS) aimAt(npc, anchor);
      else if (Math.random() < 0.2) { const [dx, dy] = npc.dir, turn = random(-1.4, 1.4); npc.dir = [dx * Math.cos(turn) - dy * Math.sin(turn), dx * Math.sin(turn) + dy * Math.cos(turn)]; npc.facing = npc.dir[0] < 0 ? "left" : "right"; }
      npc.walking = true;
      if (!advance(npc, deltaMs, anchor ? spec.speed * (honeypot && distance(npc.position, anchor) > SWARM_RADIUS ? 1.8 : 1) : spec.speed * 0.7, true)) randomDir(npc);
      return;
    }
    case "ostrich":
      // Buries its head while the Friend is close.
      if (player && near < 120) { npc.mode = "hide"; npc.walking = false; npc.until = now + 800; return; }
      npc.mode = ""; wanderStep(); return;
    case "flee":
      // Keeps well away from the Friend, otherwise wanders.
      if (player && near < (spec.id === "fox" ? 300 : 220)) { aimAt(npc, player, true); npc.walking = true; if (!advance(npc, deltaMs, spec.speed, false)) { randomDir(npc); advance(npc, deltaMs, spec.speed, false); } return; }
      wanderStep(); return;
    case "dragon":
      // Circles high, dives on the Friend, breathes fire (harmless), then climbs away.
      if (npc.mode === "dive") {
        if (player) aimAt(npc, player);
        npc.hover = Math.max(30, npc.hover - deltaMs * 0.08); npc.walking = true; advance(npc, deltaMs, spec.speed * 1.6, true);
        if (!player || near < 30 || now > npc.modeUntil) { npc.mode = "breathe"; npc.modeUntil = now + 1200; npc.walking = false; }
        return;
      }
      if (npc.mode === "breathe") { if (player) { npc.facing = npc.position[0] - npc.position[1] < player[0] - player[1] ? "right" : "left"; } if (now > npc.modeUntil) { npc.mode = "away"; npc.modeUntil = now + 3000; if (player) aimAt(npc, player, true); } return; }
      if (npc.mode === "away") { npc.hover = Math.min(90, npc.hover + deltaMs * 0.05); npc.walking = true; if (!advance(npc, deltaMs, spec.speed * 1.4, true)) randomDir(npc); if (now > npc.modeUntil) { npc.mode = "circle"; npc.modeUntil = now + random(8000, 15000); npc.until = now; } return; }
      npc.hover = Math.min(90, npc.hover + deltaMs * 0.05);
      if (now > npc.modeUntil && player && near < 700) { npc.mode = "dive"; npc.modeUntil = now + 5000; return; }
      wanderStep(); return;
  }
}

/** Outlaws: pick a random direction, walk for a few seconds, pause, repeat; blocked steps turn around early. A downed hacker stays put. */
function wander(npc: Npc, now: number, deltaMs: number, player: WorldPoint | null = null) {
  if (npc.fallenAt) return;
  // The Exit Scammer keeps his back to the Friend and walks away whenever it comes near, sliding along whatever blocks him.
  if (npc.name === EXIT_SCAMMER && player && distance(npc.position, player) < FLEE_RANGE) {
    const [sx, sy] = project(...npc.position), [px, py] = project(...player), far = Math.hypot(sx - px, sy - py) || 1;
    npc.dir = [(sx - px) / far, (sy - py) / far]; npc.walking = true; npc.until = now + random(600, 1200);
    // Of 16 headings, take the open one pointing most directly away; cornered, he edges sideways rather than toward the Friend.
    const step = Math.min(40, deltaMs) * NPC.outlaw.speed / 1000, [dx, dy] = npc.dir;
    const headings = Array.from({ length: 16 }, (_, i): [number, number] => [Math.cos(i * Math.PI / 8), Math.sin(i * Math.PI / 8)])
      .filter(([ax, ay]) => ax * dx + ay * dy > -0.2).sort((a, b) => (b[0] * dx + b[1] * dy) - (a[0] * dx + a[1] * dy));
    for (const [ax, ay] of headings) {
      const point = unproject(sx + ax * step, sy + ay * step);
      if (sceneWalkable(npc.scene)(point, NPC_RADIUS)) { npc.position = point; npc.dir = [ax, ay]; break; }
    }
    return;
  }
  if (now >= npc.until) {
    if (npc.walking) { npc.walking = false; npc.until = now + random(800, 2500); }
    else {
      const angle = random(0, Math.PI * 2);
      npc.dir = [Math.cos(angle), Math.sin(angle)];
      // An outlaw with a home building heads back toward it once it has strayed past HOME_RANGE.
      const home = npc.scene === "outside" ? homeOf(npc.name) : null;
      if (home && distance(npc.position, home.position) > HOME_RANGE) {
        const [px, py] = project(...npc.position), [hx, hy] = project(...home.position), far = Math.hypot(hx - px, hy - py) || 1;
        npc.dir = [(hx - px) / far, (hy - py) / far];
      }
      npc.facing = npc.dir[0] < 0 ? "left" : "right";
      npc.walking = true; npc.until = now + random(1500, 3500);
    }
  }
  if (!npc.walking) return;
  const [sx, sy] = project(...npc.position);
  // The leash, checked every frame: past HOME_RANGE and still walking away, turn straight back toward home.
  const home = npc.scene === "outside" ? homeOf(npc.name) : null;
  if (home && distance(npc.position, home.position) > HOME_RANGE) {
    const [hx, hy] = project(...home.position), far = Math.hypot(hx - sx, hy - sy) || 1, back: [number, number] = [(hx - sx) / far, (hy - sy) / far];
    if (npc.dir[0] * back[0] + npc.dir[1] * back[1] < 0.3) { npc.dir = back; npc.facing = back[0] < 0 ? "left" : "right"; }
  }
  const step = Math.min(40, deltaMs) * NPC.outlaw.speed / 1000;
  const next = unproject(sx + npc.dir[0] * step, sy + npc.dir[1] * step);
  if (sceneWalkable(npc.scene)(next, NPC_RADIUS)) npc.position = next;
  else if (home) {
    // Heading home and blocked (by the building itself, say): slide along the obstacle instead of stopping.
    const [dx, dy] = npc.dir, sides: [number, number][] = [[-dy, dx], [dy, -dx]];
    const slide = sides.map(([ax, ay]) => unproject(sx + ax * step, sy + ay * step)).find(point => sceneWalkable(npc.scene)(point, NPC_RADIUS));
    if (slide) npc.position = slide; else { npc.walking = false; npc.until = now + random(200, 600); }
  }
  else { npc.walking = false; npc.until = now + random(200, 600); }
}

// ---------------------------------------------------------------------------
// The Trojan horse: a rideable mount. For this first test it stands beside the Friend at the start; walking into it mounts,
// R dismounts, and riding moves faster. The side-view sprite is flipped for left and reused for up/down until oriented art exists.
// ---------------------------------------------------------------------------

const HORSE_MASK: readonly string[] = [
  "........................",
  "..................#.....",
  ".................#o#....",
  "...............##oo####.",
  "..............#pp#oo#oo#",
  ".............#pp#oooooo#",
  ".............#pp#oooo#o#",
  "............#pp#ooo#####",
  "............#pp#ooo#....",
  "...........#pp#oooo#....",
  "....#######pp#ooooo#....",
  "..##oooooooooooooooo#...",
  "#p#oooo#oooooo#oooooo#..",
  "#p##################o#..",
  "#p#ooooooo#oooooooooo#..",
  "#p#ooooooo#ooooooooo#...",
  "#p###################...",
  "##.#ooo#.......#ooo#....",
  "...#ooo#.......#ooo#....",
  "########################",
  "#ppp#ooo#pppppp#ooo#ppp#",
  "####oo#oo######oo#oo####",
  "...#o###o#....#o###o#...",
  "...#oo#oo#....#oo#oo#...",
  "....#ooo#......#ooo#....",
  ".....###........###.....",
];
/** Facing south (toward the camera): the whole front view draws over the rider, whose head shows above the horse's. */
const HORSE_SOUTH_MASK: readonly string[] = [
  "........................",
  "........................",
  "........................",
  "..........#..#..........",
  ".........#o##o#.........",
  ".........#oooo#.........",
  ".........#oooo#.........",
  "........#oooooo#........",
  "........#o#oo#o#........",
  "........#oooooo#........",
  ".........#oooo#.........",
  ".........#o##o#.........",
  "........##oooo##........",
  ".......#poooooop#.......",
  ".......#poooooop#.......",
  "......##oooooooo##......",
  "......#oooooooooo#......",
  "......#oooooooooo#......",
  "......#oo#oooo#oo#......",
  "......############......",
  ".....#pppppppppppp#.....",
  ".....##############.....",
  "......#o#......#o#......",
  "......#o#......#o#......",
  "......###......###......",
  "........................",
];
/** Facing north (away): the head and neck sit behind the rider ... */
const HORSE_NORTH_FAR_MASK: readonly string[] = [
  "........................",
  "........................",
  "........................",
  "..........#..#..........",
  ".........#o##o#.........",
  ".........#oooo#.........",
  ".........#oppo#.........",
  "........#ooppoo#........",
  "........#ooppoo#........",
  ".........#oppo#.........",
  ".........#oppo#.........",
  "........##oppo##........",
  "........#oopppoo#.......",
  "........#oopppoo#.......",
  "........#oopppoo#.......",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
];
/** ... and the rump, base and wheels draw in front of the rider's legs. */
const HORSE_NORTH_NEAR_MASK: readonly string[] = [
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "......##oooooooo##......",
  "......#oooooooooo#......",
  "......#oooooooooo#......",
  "......#oooo#ooooo#......",
  "......############......",
  ".....#pppppppppppp#.....",
  ".....##############.....",
  "......#o#......#o#......",
  "......#o#......#o#......",
  "......###......###......",
  "........................",
];
const HORSE = { cell: 4, accent: "#efe3cf", speed: 2, reach: 26, seat: 44, headLift: 40, cooldownMs: 1500 }; // seat: px the rider sits above the horse's feet
/** Each kind's colours: temporary horses white with light brown accents, the permanent one a dark brown body with a chestnut mane. */
const HORSE_COLOURS: Readonly<Record<Horse["kind"], { tint: string; accent: string }>> = { temporary: { tint: "#fff", accent: HORSE.accent }, permanent: { tint: "#5b3a1e", accent: "#a0673a" }, golden: { tint: "#e0b030", accent: "#fff0a0" } };
const HORSE_ROWS = { side: shadeRows(HORSE_MASK), south: shadeRows(HORSE_SOUTH_MASK), northFar: shadeRows(HORSE_NORTH_FAR_MASK), northNear: shadeRows(HORSE_NORTH_NEAR_MASK) };
/** A Trojan Horse on the ground or under the Friend. A temporary one starts its 30 seconds the first time it is ridden (`expiresAt`). */
/** A Trojan Horse: a temporary one (30 seconds of riding), the permanent brown one, or the Permanent Shiny Golden Trojan Horse from
 * the Cold Wallet (yours for good: it carries over to every new hunt). */
type Horse = { id: number; kind: "permanent" | "temporary" | "golden"; position: WorldPoint; facing: SpriteFacing; mounted: boolean; cooldown: number; expiresAt: number | null };
let horseSerial = 0;
const newHorse = (kind: Horse["kind"], position: WorldPoint): Horse => ({ id: ++horseSerial, kind, position, facing: "right", mounted: false, cooldown: 0, expiresAt: null });
/** The temporary horses a fresh world starts with: at random walkable spots, well away from the start. */
const wildHorses = (golden = false): Horse[] => [...(PLAYTEST_START_HORSE ? [newHorse("permanent", startHorseSpot())] : []), ...(golden ? [newHorse("golden", goldenSpot())] : []), ...Array.from({ length: WILD_TEMP_HORSES }, () => newHorse("temporary", randomWalkable(spawn, 260)))];
/** The horse's drawing for a facing, split into what goes behind the rider and what goes in front of them. */
function horseLayers(ctx: CanvasRenderingContext2D, facing: SpriteFacing, x: number, y: number, mounted: boolean, kind: Horse["kind"] = "temporary") {
  const { tint, accent } = HORSE_COLOURS[kind];
  // No white halo round a horse (like the Friend): its black outline sits straight on the ground.
  const draw = (rows: readonly string[], flip = false, lift = 0) => () => drawMask(ctx, rows, x, y - lift, HORSE.cell, flip, tint, accent, false);
  // Facing away with a rider, the head and neck rise so the head shows above the rider's rather than hiding behind them.
  // Its neck is also drawn at its own height behind the rider, so the horse fills the space between the rider's legs (with only the
  // raised copy, the ground showed through there).
  if (facing === "up") return { behind: mounted ? () => { draw(HORSE_ROWS.northFar)(); draw(HORSE_ROWS.northFar, false, HORSE.headLift)(); } : draw(HORSE_ROWS.northFar), front: draw(HORSE_ROWS.northNear) };
  if (facing === "down") return { behind: null, front: draw(HORSE_ROWS.south) };
  return { behind: draw(HORSE_ROWS.side, facing === "left"), front: null };
}
/** Where the Golden Trojan Horse waits at the start of a hunt: a little to the start's left on screen, on walkable ground. */
const goldenSpot = (): WorldPoint => { const spot: WorldPoint = [spawn[0] - 28, spawn[1] + 28]; return walkable(spot, NPC_RADIUS) ? spot : randomWalkable(spawn, 0); };
/** Where a bought horse appears: a little to the Friend's right on screen, on walkable ground. */
/** Where a starting horse waits: in the open ground straight left of the starting point on screen (about 350 px), clear of the
 * Exchange, the road and the pool. */
const startHorseSpot = (): WorldPoint => { const spot: WorldPoint = [spawn[0] - 67, spawn[1] + 67]; return walkable(spot, NPC_RADIUS) ? spot : horseBeside(spawn); };
const horseBeside = (from: WorldPoint): WorldPoint => { const spot: WorldPoint = [from[0] + 28, from[1] - 28]; return walkable(spot, NPC_RADIUS) ? spot : randomWalkable(from, 0); };

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

type Point = { x: number; y: number };
const rf = (value: bigint) => `${formatGameAmount(value, 18)} RF`;

/** A colour darkened for shading (about 60% brightness). */
const shadeOf = (colour: string) => "#" + [1, 3, 5].map(i => Math.round(parseInt(colour.slice(i, i + 2), 16) * 0.6).toString(16).padStart(2, "0")).join("");

/** A one-bit mask at an integer cell size: '#' black with a one-cell white halo, 'o' filled with `tint` and 'p' with `accent`
 * (white by default), 'x'/'q' their shaded tones (a black dither on white), anchored at the bottom centre; any grid size works. */
function drawMask(ctx: CanvasRenderingContext2D, rows: readonly string[], x: number, y: number, cell = 5, flip = false, tint = "#fff", accent = tint, halo = true,
  colours?: readonly (readonly (string | undefined)[])[]) {
  const width = rows[0].length, height = rows.length;
  const left = Math.round(x) - Math.round(width / 2) * cell, top = Math.round(y) - (height - 1) * cell;
  const col = (px: number) => (flip ? width - 1 - px : px);
  const each = (test: (pixel: string) => boolean, paint: (sx: number, sy: number) => void) =>
    rows.forEach((row, py) => [...row].forEach((pixel, px) => { if (test(pixel)) paint(left + col(px) * cell, top + py * cell); }));
  // The white halo that lifts sprites off the ground; skipped for sprites that sit in dark water.
  if (halo) { ctx.fillStyle = "#fff"; each(pixel => pixel === "#", (sx, sy) => ctx.fillRect(sx - cell, sy - cell, cell * 3, cell * 3)); }
  // A body cell takes its part's colour from `colours` (by mask row and column), or `tint`.
  const bodyColour = (sx: number, sy: number) => { const py = (sy - top) / cell, px = (sx - left) / cell; return colours?.[py]?.[flip ? width - 1 - px : px] ?? tint; };
  each(pixel => pixel === "o", (sx, sy) => { ctx.fillStyle = bodyColour(sx, sy); ctx.fillRect(sx, sy, cell, cell); });
  ctx.fillStyle = accent; each(pixel => pixel === "p", (sx, sy) => ctx.fillRect(sx, sy, cell, cell));
  const dither = (sx: number, sy: number) => {
    const step = Math.max(1, Math.floor(cell / 2));
    ctx.fillStyle = "#fff"; ctx.fillRect(sx, sy, cell, cell); ctx.fillStyle = "#000";
    for (let i = 0; i < cell; i += step) for (let j = 0; j < cell; j += step) if (((i + j) / step) % 2 === 0) ctx.fillRect(sx + i, sy + j, Math.min(step, cell - i), Math.min(step, cell - j));
  };
  each(p => p === "x", (sx, sy) => { const base = bodyColour(sx, sy); if (base === "#fff") dither(sx, sy); else { ctx.fillStyle = shadeOf(base); ctx.fillRect(sx, sy, cell, cell); } });
  if (accent === "#fff") each(p => p === "q", dither);
  else { ctx.fillStyle = shadeOf(accent); each(p => p === "q", (sx, sy) => ctx.fillRect(sx, sy, cell, cell)); }
  ctx.fillStyle = "#000";
  each(pixel => pixel === "#", (sx, sy) => ctx.fillRect(sx, sy, cell, cell));
}

/** An animal at its screen spot: flyers hover over a ground shadow, frogs hop, snakes wiggle, fallen bodies lie on their side,
 * a hiding ostrich shows its head-down frame, and a breathing dragon spits harmless fire toward `fireAt`. */
function drawAnimal(ctx: CanvasRenderingContext2D, npc: Npc, at: Point, now: number, still: boolean, fireAt: Point | null) {
  const spec = ANIMAL_BY_ID[npc.kind as AnimalId], cell = spec.cell, tint = npc.tint ?? spec.tint ?? "#fff", accent = npc.accent ?? spec.accent ?? tint;
  const rows = spec.behaviour === "ostrich" && npc.mode === "hide" && spec.altMask ? spec.altMask : spec.mask;
  const flip = npc.facing === "left";
  if (npc.fallenAt) {
    ctx.save(); ctx.translate(Math.round(at.x), Math.round(at.y)); ctx.rotate(flip ? -Math.PI / 2 : Math.PI / 2);
    drawMask(ctx, rows, 0, Math.round(rows[0].length / 2) * cell * 0.5, cell, flip, tint, accent, false); ctx.restore(); return;
  }
  let lift = 0, sway = 0;
  if (spec.flying) {
    lift = npc.hover + (still ? 0 : Math.sin(now / (spec.id === "butterfly" ? 140 : spec.id === "bee" ? 50 : 260) + npc.id) * (spec.id === "butterfly" ? 4 : spec.id === "bee" ? 2 : 3));
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)"; ctx.beginPath(); ctx.ellipse(at.x, at.y, rows[0].length * cell * 0.3, cell * 1.2, 0, 0, Math.PI * 2); ctx.fill();
  } else if (spec.behaviour === "hop" && npc.walking && !still) lift = Math.abs(Math.sin(now / 90)) * 7;
  else if (spec.behaviour === "slither" && npc.walking && !still) sway = Math.sin(now / 120 + npc.id) * 3;
  else if (npc.walking && !still) lift = Math.floor(now / 160) % 2;
  // No white halo round an animal (like the Friend, the horses and the buildings): its coloured body inside the black outline
  // stands out on its own.
  drawMask(ctx, rows, at.x + sway, at.y - lift, cell, flip, tint, accent, false);
  if (spec.behaviour === "dragon" && npc.mode === "breathe" && fireAt) {
    // Fire: flickering orange and red squares from the mouth toward the Friend.
    const mouth = { x: at.x + (flip ? -1 : 1) * 11 * cell, y: at.y - lift - 14 * cell }, dx = fireAt.x - mouth.x, dy = fireAt.y - mouth.y, far = Math.hypot(dx, dy) || 1;
    for (let i = 0; i < 14; i++) {
      const t = ((i * 0.07) + (still ? 0 : (now / 90) % 1) / 14) % 1, spread = (Math.sin(i * 12.9898 + now / 60) * 0.5) * t * 40;
      const px = mouth.x + dx / far * far * t * 0.8 - dy / far * spread, py = mouth.y + dy / far * far * t * 0.8 + dx / far * spread, size = 4 + t * 8;
      ctx.fillStyle = i % 3 === 0 ? "#d94f3c" : i % 3 === 1 ? "#ff8a2a" : "#ffd23c"; ctx.fillRect(Math.round(px - size / 2), Math.round(py - size / 2), size, size);
    }
  }
}

/** A wooden signpost: a light-brown board with a black frame and lettering on a post, anchored at the post's foot. */
function drawSignpost(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  const bx = Math.round(x), by = Math.round(y);
  ctx.font = "bold 13px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const width = Math.ceil(ctx.measureText(text).width) + 18, height = 26, top = by - 56;
  ctx.fillStyle = "#fff"; ctx.fillRect(bx - 5, top + height - 2, 10, by - top - height + 4);
  ctx.fillStyle = "#000"; ctx.fillRect(bx - 3, top + height - 2, 6, by - top - height + 2);
  ctx.fillStyle = "#fff"; ctx.fillRect(bx - width / 2 - 2, top - 2, width + 4, height + 4);
  ctx.fillStyle = "#000"; ctx.fillRect(bx - width / 2, top, width, height);
  ctx.fillStyle = "#e6d2b5"; ctx.fillRect(bx - width / 2 + 2, top + 2, width - 4, height - 4);
  ctx.fillStyle = "#000"; ctx.fillText(text, bx, top + height / 2 + 1);
  ctx.textBaseline = "alphabetic";
}

/** The minimap: a top-down sketch of the whole country in the bottom-right corner (white, black frame): roads, buildings and
 * the exchange as black marks, the Mining Pool and the puddle, hackers as red dots (or their hideout), the horse, the current
 * view as an outline and the Friend as a blinking marker. Drawn outdoors only. */
const MINIMAP = { x: 792, y: 396, w: 156, h: 104 }; // clears the guide line and toasts
/** The minimap enlarged (M, or a tap on it): centred over the world, same 3:2 shape. */
const MINIMAP_BIG = { x: 180, y: 110, w: 600, h: 400 };
type MapBox = { x: number; y: number; w: number; h: number };
/** A marker on the minimap and what hovering it says. */
type MapMark = { x: number; y: number; label: string };
const inBox = (box: MapBox, x: number, y: number) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
/** A caption box: white (or light red) with a black frame and bold text, centred on (x, y) and kept inside the view. */
function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tone: "plain" | "warn" = "plain") {
  ctx.save(); ctx.font = "bold 12px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const w = Math.ceil(ctx.measureText(text).width) + 14, h = 20;
  const left = Math.round(Math.max(4, Math.min(VIEW.width - w - 4, x - w / 2))), top = Math.round(Math.max(4, Math.min(VIEW.height - h - 4, y - h / 2)));
  ctx.fillStyle = "#000"; ctx.fillRect(left - 2, top - 2, w + 4, h + 4);
  ctx.fillStyle = tone === "warn" ? "#f7c4c0" : "#fff"; ctx.fillRect(left, top, w, h);
  ctx.fillStyle = "#000"; ctx.fillText(text, left + w / 2, top + h / 2 + 1); ctx.restore();
}
/** Where a tap is taking the Friend: a flat ring on the ground with a cross, the ring pulsing unless motion is reduced. */
function drawTapMarker(ctx: CanvasRenderingContext2D, x: number, y: number, now: number, still: boolean) {
  const grow = still ? 0 : (Math.sin(now / 180) + 1) * 2;
  ctx.save(); ctx.lineCap = "round";
  for (const [width, colour] of [[5, "#fff"], [2, "#000"]] as const) {
    ctx.lineWidth = width; ctx.strokeStyle = colour;
    ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), 12 + grow, 6 + grow / 2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 5, y - 2.5); ctx.lineTo(x + 5, y + 2.5); ctx.moveTo(x + 5, y - 2.5); ctx.lineTo(x - 5, y + 2.5); ctx.stroke();
  }
  ctx.restore();
}
/** What the Friend has seen so far: tiles that have been in view, landmarks that have been on screen, hackers by id. Only these
 * show on the minimap; everything else stays fogged until discovered. */
type Discovered = { tiles: Set<number>; landmarks: Set<string>; outlaws: Set<number> };
const freshDiscovery = (): Discovered => ({ tiles: new Set(), landmarks: new Set(), outlaws: new Set() });
/** Mark whatever the current view contains as discovered. `view` is the world-space bounding box of the window. */
function discover(found: Discovered, view: { x0: number; y0: number; x1: number; y1: number }, npcs: readonly Npc[], horses: readonly Horse[]) {
  const inView = (point: WorldPoint, margin = 0) => point[0] >= view.x0 - margin && point[0] <= view.x1 + margin && point[1] >= view.y0 - margin && point[1] <= view.y1 + margin;
  for (let j = Math.max(0, Math.floor(view.y0 / PLANE.h)); j <= Math.min(GRID.rows - 1, Math.floor(view.y1 / PLANE.h)); j++)
    for (let i = Math.max(0, Math.floor(view.x0 / PLANE.w)); i <= Math.min(GRID.cols - 1, Math.floor(view.x1 / PLANE.w)); i++) found.tiles.add(j * GRID.cols + i);
  for (const building of PLACED_BUILDINGS) if (inView(building.position, 60)) found.landmarks.add(`building:${building.kind}`);
  if (inView(store.position, 60)) found.landmarks.add("store");
  if (inView(POOL.centre, POOL.w / 2)) found.landmarks.add("pool");
  if (inView(PUDDLE.centre, PUDDLE.rx)) found.landmarks.add("puddle");
  for (const mount of horses) if (mount.mounted || inView(mount.position, 40)) found.landmarks.add(`horse:${mount.id}`);
  for (const npc of npcs) if (npc.kind === "outlaw" && npc.scene === "outside" && inView(npc.position, 20)) found.outlaws.add(npc.id);
}
function drawMinimap(ctx: CanvasRenderingContext2D, player: WorldPoint, npcs: readonly Npc[], horses: readonly Horse[], found: Discovered, now: number, still: boolean, box: MapBox = MINIMAP): MapMark[] {
  const { x, y, w, h } = box, sx = w / WORLD_SIZE.width, sy = h / WORLD_SIZE.height;
  const at = (point: WorldPoint) => ({ x: x + point[0] * sx, y: y + point[1] * sy });
  ctx.fillStyle = "#fff"; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.fillStyle = "#000"; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  // Fog: unexplored tiles are a fine dither; explored ones are white and show their roads.
  ctx.fillStyle = "#fff"; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#000";
  for (let py = 0; py < h; py += 3) for (let px = (py / 3) % 2; px < w; px += 3) ctx.fillRect(x + px, y + py, 1, 1);
  const tw = PLANE.w * sx, th = PLANE.h * sy;
  ctx.fillStyle = "#fff";
  for (const index of found.tiles) { const i = index % GRID.cols, j = Math.floor(index / GRID.cols); ctx.fillRect(Math.floor(x + i * tw), Math.floor(y + j * th), Math.ceil(tw) + 1, Math.ceil(th) + 1); }
  ctx.strokeStyle = "#000"; ctx.lineWidth = 1;
  for (const index of found.tiles) {
    const i = index % GRID.cols, j = Math.floor(index / GRID.cols), tx0 = x + i * tw, ty0 = y + j * th;
    if (ROAD_ROWS.includes(j)) { const py = Math.round(ty0 + TRUNK.y * sy) + 0.5; ctx.beginPath(); ctx.moveTo(tx0, py); ctx.lineTo(tx0 + tw, py); ctx.stroke(); }
    if (ROAD_COLS.includes(i)) { const px = Math.round(tx0 + TRUNK.x * sx) + 0.5; ctx.beginPath(); ctx.moveTo(px, ty0); ctx.lineTo(px, ty0 + th); ctx.stroke(); }
  }
  if (found.landmarks.has("pool")) { ctx.fillStyle = "#000"; ctx.fillRect(Math.round(x + POOL.x * sx), Math.round(y + POOL.y * sy), Math.max(3, Math.round(POOL.w * sx)), Math.max(2, Math.round(POOL.h * sy))); }
  if (found.landmarks.has("puddle")) { const mud = at(PUDDLE.centre); ctx.fillStyle = "#7a5230"; ctx.fillRect(Math.round(mud.x) - 2, Math.round(mud.y) - 1, 4, 3); }
  for (const building of PLACED_BUILDINGS) { if (!found.landmarks.has(`building:${building.kind}`)) continue; const p = at(building.position); ctx.fillStyle = "#000"; ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y) - 3, 6, 6); ctx.fillStyle = "#fff"; ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2); }
  if (found.landmarks.has("store")) { const shop = at(store.position); ctx.fillStyle = "#000"; ctx.fillRect(Math.round(shop.x) - 3, Math.round(shop.y) - 3, 6, 6); ctx.fillStyle = "#ccff00"; ctx.fillRect(Math.round(shop.x) - 1, Math.round(shop.y) - 1, 2, 2); }
  for (const mount of horses) if (!mount.mounted && found.landmarks.has(`horse:${mount.id}`)) { const hp = at(mount.position); ctx.fillStyle = "#000"; ctx.fillRect(Math.round(hp.x) - 1, Math.round(hp.y) - 2, 3, 3); ctx.fillStyle = mount.kind === "temporary" ? "#efe3cf" : HORSE_COLOURS[mount.kind].accent; ctx.fillRect(Math.round(hp.x), Math.round(hp.y) - 1, 1, 1); }
  for (const npc of npcs) { if (npc.kind !== "outlaw" || !found.outlaws.has(npc.id)) continue; const p = at(outlawSpot(npc)); ctx.fillStyle = "#fff"; ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y) - 3, 6, 6); ctx.fillStyle = "#d94f3c"; ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 4, 4); }
  // The viewport: the world span the window shows, as an outline.
  const [cx, cy] = project(...player), corners = [unproject(cx - VIEW.width / 2 / SCALE, cy - VIEW.height / 2 / SCALE), unproject(cx + VIEW.width / 2 / SCALE, cy - VIEW.height / 2 / SCALE), unproject(cx + VIEW.width / 2 / SCALE, cy + VIEW.height / 2 / SCALE), unproject(cx - VIEW.width / 2 / SCALE, cy + VIEW.height / 2 / SCALE)].map(at);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.5)"; ctx.lineWidth = 1; ctx.beginPath(); corners.forEach((c, i) => i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)); ctx.closePath(); ctx.stroke();
  ctx.restore();
  const me = at(player), on = still || Math.floor(now / 400) % 2 === 0;
  ctx.fillStyle = "#000"; ctx.fillRect(Math.round(me.x) - 3, Math.round(me.y) - 3, 7, 7); ctx.fillStyle = on ? "#ccff00" : "#fff"; ctx.fillRect(Math.round(me.x) - 2, Math.round(me.y) - 2, 5, 5);
  // What each marker is, for the hover captions: only what has been discovered, you first so you win a tie.
  const marks: MapMark[] = [{ ...me, label: "You" }];
  for (const npc of npcs) if (npc.kind === "outlaw" && found.outlaws.has(npc.id)) marks.push({ ...at(outlawSpot(npc)), label: `${npc.name ?? "Outlaw"} (wanted)` });
  for (const mount of horses) if (!mount.mounted && found.landmarks.has(`horse:${mount.id}`)) marks.push({ ...at(mount.position), label: mount.kind === "golden" ? "Your Golden Trojan Horse" : mount.kind === "permanent" ? "Your Trojan Horse" : "Temporary Trojan Horse" });
  if (found.landmarks.has("store")) marks.push({ ...at(store.position), label: "Centralised Exchange" });
  for (const building of PLACED_BUILDINGS) if (found.landmarks.has(`building:${building.kind}`)) marks.push({ ...at(building.position), label: BUILDING_NAMES[building.kind] });
  if (found.landmarks.has("pool")) marks.push({ ...at(POOL.centre), label: "Mining Pool" });
  if (found.landmarks.has("puddle")) marks.push({ ...at(PUDDLE.centre), label: "Puddle" });
  return marks;
}

/** Coloured flowers: the SDK flower's petals are a white cross (a horizontal bar and a vertical bar, black outline, black centre);
 * each flower's petals take one faded exotic colour picked by a hash of its position, so the world looks the same on every load. */
// Exotic blooms, a little brighter than pastel but still faded: hibiscus coral, orchid magenta, bird-of-paradise orange, plumeria
// yellow, lotus pink, passionflower violet and a tropical teal.
const PETALS = ["#ef9a8a", "#dd96d0", "#f1b36e", "#efd97a", "#f2a7bf", "#b39ae4", "#86cfc4"] as const;
const flowerHash = (x: number, y: number) => { let h = (Math.round(x) * 73856093) ^ (Math.round(y) * 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
function colourFlower(ctx: CanvasRenderingContext2D, prop: WorldProp, at: Point, k: number) {
  const colour = PETALS[flowerHash(prop.x, prop.y) % PETALS.length];
  // Rectangles in prop units from the flower's base, inset one unit inside the art's 2-unit outline.
  const fill = (x0: number, y0: number, x1: number, y1: number, colour: string) => {
    ctx.fillStyle = colour; ctx.fillRect(Math.round(at.x + x0 * k), Math.round(at.y + y0 * k), Math.round((x1 - x0) * k), Math.round((y1 - y0) * k));
  };
  fill(-5, -21, 5, -15, colour);   // side petals
  fill(-1, -25, 1, -11, colour);   // top and bottom petals
  fill(-2, -20, 2, -16, "#000");   // the black centre
}

/** A caught outlaw's WANTED poster at any size: the frame, "WANTED", the art fitted in a portrait box, the name, and a rough red
 * chalk cross over the picture (a few jittered, semi-transparent strokes per line, fixed per name so each poster's cross differs). */
/** A caught outlaw's poster: its name and hood variant, and the star rating once its wallet was cracked. */
type Poster = { name: string; variant: number; stars?: number; jackpot?: boolean };
/** One five-pointed star centred on (x, y), filled gold or left as a dark outline. */
function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, filled: boolean) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const angle = -Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius); }
  ctx.closePath(); if (filled) { ctx.fillStyle = "#d9b048"; ctx.fill(); } ctx.strokeStyle = "#3a2a20"; ctx.lineWidth = Math.max(1, r * 0.22); ctx.stroke();
}
function drawCaughtPoster(ctx: CanvasRenderingContext2D, name: string, variant: number, w: number, h: number, stars?: number) {
  const k = w / 72; // designed on a 72 x 90 grid
  ctx.fillStyle = "#f3e6c4"; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = "#000"; ctx.lineWidth = 3 * k; ctx.strokeRect(2 * k, 2 * k, w - 4 * k, h - 4 * k);
  ctx.fillStyle = "#000"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.font = `bold ${Math.round(13 * k)}px ui-monospace, monospace`; ctx.fillText("WANTED", w / 2, 18 * k);
  // A starred poster keeps a strip under a slightly shorter portrait for its rating.
  const box = { x: 10 * k, y: 24 * k, w: 52 * k, h: (stars ? 41 : 46) * k };
  ctx.fillStyle = "#fff"; ctx.fillRect(box.x, box.y, box.w, box.h); ctx.lineWidth = 1.5 * k; ctx.strokeRect(box.x, box.y, box.w, box.h);
  const art = outlawArt(name, variant), rows = art.rows.length, cols = art.rows[0].length;
  const cell = Math.max(1, Math.floor(Math.min(box.w, box.h) / Math.max(rows + 2, cols + 2)));
  drawMask(ctx, art.rows, box.x + box.w / 2, Math.round(box.y + box.h / 2 + (rows - 2) * cell / 2), cell, false, "#fff", art.accent, true, art.colours);
  // The cross: rough chalk, two strokes corner to corner, each built from a few wobbly passes.
  let seed = flowerHash(name.length * 97, [...name].reduce((sum, c) => sum + c.charCodeAt(0), 0)); const jitter = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed / 0xffffffff - 0.5) * 2; };
  ctx.lineCap = "round";
  for (const [x0, y0, x1, y1] of [[box.x + 5 * k, box.y + 5 * k, box.x + box.w - 5 * k, box.y + box.h - 5 * k], [box.x + box.w - 5 * k, box.y + 5 * k, box.x + 5 * k, box.y + box.h - 5 * k]]) {
    for (let pass = 0; pass < 4; pass++) {
      ctx.strokeStyle = `rgba(200, 30, 30, ${0.45 + pass * 0.1})`; ctx.lineWidth = (2.4 + jitter() * 0.8) * k;
      ctx.beginPath(); ctx.moveTo(x0 + jitter() * 2 * k, y0 + jitter() * 2 * k);
      for (let t = 0.25; t <= 1.001; t += 0.25) ctx.lineTo(x0 + (x1 - x0) * t + jitter() * 1.6 * k, y0 + (y1 - y0) * t + jitter() * 1.6 * k);
      ctx.stroke();
    }
  }
  ctx.lineCap = "butt";
  // The name shrinks until it fits inside the frame (long names like "Wallet Drainer" or "The Liquidator").
  ctx.fillStyle = "#000";
  let size = 8 * k;
  do { ctx.font = `bold ${Math.round(size)}px ui-monospace, monospace`; size -= 0.5; } while (ctx.measureText(name).width > 60 * k && size > 4 * k);
  // A cracked wallet's rating: three stars between the portrait and the name, gold for each one earned.
  if (stars) { for (let i = 0; i < 3; i++) drawStar(ctx, w / 2 + (i - 1) * 9 * k, 71.5 * k, 3.4 * k, i < stars); ctx.fillStyle = "#000"; }
  ctx.fillText(name, w / 2, (stars ? 83 : 82) * k);
}
/** The small poster bitmap hung on the Data Center wall, cached per name. */
const wallPosters = new Map<string, HTMLCanvasElement>();
function wallPoster(name: string, variant: number, stars?: number, jackpot = false): HTMLCanvasElement {
  const key = `${name}:${stars ?? 0}:${jackpot}`, cached = wallPosters.get(key); if (cached) return cached;
  const canvas = document.createElement("canvas"); canvas.width = 96; canvas.height = 120;
  drawCaughtPoster(canvas.getContext("2d")!, name, variant, 96, 120, stars);
  // A jackpot wallet's poster gets a gold frame.
  if (jackpot) { const g = canvas.getContext("2d")!; g.lineWidth = 6; g.strokeStyle = "#d9b048"; g.strokeRect(3, 3, 90, 114); g.lineWidth = 1.5; g.strokeStyle = "#8a6a1a"; g.strokeRect(0.75, 0.75, 94.5, 118.5); }
  wallPosters.set(key, canvas); return canvas;
}
/** Where posters hang in the Data Center: the fully visible 32-unit tiles of the back wall (camera-facing side at y = WALL) left
 * to right, then of the left wall (its side at x = WALL) back to front, skipping tiles cut by a corner or a joining wall. Each slot
 * carries its wall piece's depth, the floor spot in front of it, and its face corners for a 24 x 30 poster centred on the tile. */
type PosterSlot = { wall: "back" | "left"; start: number; depth: number; stand: WorldPoint };
function posterSlots(interior: Interior): PosterSlot[] {
  const slots: PosterSlot[] = [], midX = WALL + ROOM.w, midY = WALL + ROOM.h;
  for (let x = 0; x + 32 <= interior.width; x += 32) {
    if (x < WALL || x + 32 > interior.width - WALL || (x < midX + WALL && x + 32 > midX - 32)) continue; // the corners, the middle wall and the tile it hides
    slots.push({ wall: "back", start: x, depth: x + 16 + WALL + 0.1, stand: [x + 16, WALL + 22] });
  }
  for (let y = WALL; y + 32 <= interior.height - WALL; y += 32) {
    if (y < midY + WALL && y + 32 > midY - 32) continue; // the middle cross wall and the tile it hides
    slots.push({ wall: "left", start: y, depth: WALL / 2 + y + 32 + 0.1, stand: [WALL + 22, y + 16] });
  }
  return slots;
}
const POSTER_REACH = 30; // world units: close enough to a poster's floor spot to view it with V

/** A floor quad (or one `lift` units up or down) through four world points, filled and optionally outlined. */
function floorQuad(ctx: CanvasRenderingContext2D, lifted: (point: WorldPoint, lift: number) => Point, points: readonly WorldPoint[], lift: number, fill: string, stroke?: string) {
  ctx.beginPath(); points.map(point => lifted(point, lift)).forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}
/** The Cold Storage's open hatch in the floor: a steel frame round a dark opening, four steps going down away from the room (each
 * tread lower and darker, a riser facing you in front of it), clipped to the opening. Each step drops only 3 units: from this
 * camera angle a deeper drop would sink the steps out of sight behind the hatch's front rim. For show only. */
function drawHatch(ctx: CanvasRenderingContext2D, lifted: (point: WorldPoint, lift: number) => Point, rect: Rect) {
  const { x, y, w, h } = rect, box = (x0: number, y0: number, x1: number, y1: number): WorldPoint[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  floorQuad(ctx, lifted, box(x, y, x + w, y + h), 0, "#9fb3c4", "#000");
  const inset = 4, ox0 = x + inset, oy0 = y + inset, ox1 = x + w - inset, oy1 = y + h - inset;
  floorQuad(ctx, lifted, box(ox0, oy0, ox1, oy1), 0, "#05080c", "#000");
  ctx.save();
  ctx.beginPath(); box(ox0, oy0, ox1, oy1).map(point => lifted(point, 0)).forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.clip();
  const steps = 4, depth = (oy1 - oy0) / steps, drop = 3, treads = ["#dfe8ef", "#aebdc9", "#7d8e9c", "#4d5d6b"], risers = ["#8a9aa8", "#667784", "#465663", "#2a3742"];
  // Painted from the deepest step (at the back) to the top one (at the front), so each covers the one behind it.
  for (let k = steps - 1; k >= 0; k--) {
    const front = oy1 - k * depth, back = front - depth, lift = -(k + 1) * drop;
    floorQuad(ctx, lifted, box(ox0, back, ox1, front), lift, treads[k]);
    // The riser: the face at this tread's front edge, from the step above down to this tread.
    const top = -k * drop; ctx.beginPath(); [lifted([ox0, front], top), lifted([ox1, front], top), lifted([ox1, front], lift), lifted([ox0, front], lift)].forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath();
    ctx.fillStyle = risers[k]; ctx.fill();
  }
  ctx.restore();
}
/** The hatch's lid, standing open on its hinge along the back edge of the frame: a steel plate with rivets and a handle. */
function drawHatchLid(ctx: CanvasRenderingContext2D, lifted: (point: WorldPoint, lift: number) => Point, rect: Rect) {
  const x0 = rect.x + 2, x1 = rect.x + rect.w - 2, y = rect.y + 1, height = rect.h - 6;
  const corners = [lifted([x0, y], 0), lifted([x1, y], 0), lifted([x1, y], height), lifted([x0, y], height)];
  ctx.beginPath(); corners.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath();
  ctx.fillStyle = "#c9d6e0"; ctx.fill(); ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = "#4d5d6b";
  for (const [u, lift] of [[0.12, 0.15], [0.88, 0.15], [0.12, 0.85], [0.88, 0.85]] as const) { const q = lifted([x0 + (x1 - x0) * u, y], height * lift); ctx.fillRect(Math.round(q.x) - 1, Math.round(q.y) - 1, 2, 2); }
  const handleA = lifted([x0 + (x1 - x0) * 0.35, y], height * 0.55), handleB = lifted([x0 + (x1 - x0) * 0.65, y], height * 0.55);
  ctx.strokeStyle = "#2a3742"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(handleA.x, handleA.y); ctx.lineTo(handleB.x, handleB.y); ctx.stroke();
}

/** Draw an image flat onto a vertical wall face: `origin` is its top-left, `across` and `down` the screen vectors of its edges. */
function drawOnFace(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, origin: Point, across: Point, down: Point) {
  ctx.save(); ctx.setTransform(across.x / image.width, across.y / image.width, down.x / image.height, down.y / image.height, origin.x, origin.y);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 0, 0); ctx.restore();
}

/** A one-bit explosion: black and orange squares bursting outward for EXPLOSION_MS. */
const EXPLOSION_MS = 900;
function drawExplosion(ctx: CanvasRenderingContext2D, at: Point, t: number) {
  for (let i = 0; i < 18; i++) {
    const angle = i * Math.PI * 2 / 18 + (i % 2) * 0.17, reach = (30 + (i % 4) * 22) * t, size = Math.max(2, 14 * (1 - t));
    ctx.fillStyle = i % 3 === 0 ? "#000" : i % 3 === 1 ? "#ff8a2a" : "#d94f3c";
    ctx.fillRect(Math.round(at.x + Math.cos(angle) * reach - size / 2), Math.round(at.y - 40 + Math.sin(angle) * reach * 0.6 - size / 2), size, size);
  }
}

/** The unmodified canonical Friend mask at an integer 5x scale, drawn without the one-cell white halo the other sprites get. */
function drawFriend(ctx: CanvasRenderingContext2D, sprites: GenerationSprites, x: number, y: number, facing: SpriteFacing, walking: boolean, frame: number, side: "left" | "right") {
  const rows = spriteFrame(sprites, facing, walking, frame, side).frame.rows;
  const left = Math.round(x) - 40, top = Math.round(y) - 75;
  ctx.save(); ctx.beginPath(); ctx.rect(left, top, 80, 80); ctx.clip();
  // Holes shut in by the black outline (the eyes, and the inside of an outlined body) are white, whatever is behind the Friend: on a
  // horse they showed its brown, and on coloured ground its colour.
  const cell = 5, width = rows[0].length, height = rows.length, mx = Math.round(x) - Math.round(width / 2) * cell, my = Math.round(y) - (height - 1) * cell;
  ctx.fillStyle = "#fff";
  for (const [hx, hy] of enclosedHoles(rows)) ctx.fillRect(mx + hx * cell, my + hy * cell, cell, cell);
  drawMask(ctx, rows, x, y, cell, false, "#fff", "#fff", false);
  ctx.restore();
}
/** The clear cells of a sprite that are shut in by its drawn cells (not reachable from its edge through clear cells): its eyes. */
function enclosedHoles(rows: readonly string[]): [number, number][] {
  const height = rows.length, width = rows[0].length, open = new Set<number>(), stack: [number, number][] = [];
  for (let x = 0; x < width; x++) stack.push([x, 0], [x, height - 1]);
  for (let y = 0; y < height; y++) stack.push([0, y], [width - 1, y]);
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= width || y >= height || rows[y][x] !== "." || open.has(y * width + x)) continue;
    open.add(y * width + x); stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const holes: [number, number][] = [];
  rows.forEach((row, y) => [...row].forEach((pixel, x) => { if (pixel === "." && !open.has(y * width + x)) holes.push([x, y]); }));
  return holes;
}

/** A small coloured pixel icon held by the Friend: beside them facing left/right, turned upward behind them facing up,
 * and turned downward in front of them facing down (the caller orders it behind or in front of the Friend). */
function drawEquipped(ctx: CanvasRenderingContext2D, item: ItemId, x: number, y: number, facing: SpriteFacing, side: "left" | "right", gear: Gear = {}) {
  ctx.save();
  if (facing === "up") { ctx.translate(Math.round(x) + 10, Math.round(y) - 62); ctx.rotate(-Math.PI / 2); }
  else if (facing === "down") { ctx.translate(Math.round(x) - 10, Math.round(y) - 30); ctx.rotate(Math.PI / 2); }
  else if (side === "left") { ctx.translate(Math.round(x) - 34, Math.round(y) - 36); ctx.scale(-1, 1); }
  else ctx.translate(Math.round(x) + 34, Math.round(y) - 36);
  const px = (dx: number, dy: number, w: number, h: number) => ctx.fillRect(dx, dy, w, h);
  // Held items are drawn without a white backing (like everything else in the world): their black outlines sit on the ground.
  if (item === "laser") { if (gear["gun-skin"] === "liquidator-gun") drawLiquidatorGun(ctx); else drawLaserPistol(ctx); }
  else if (item === "cleaver" && gear["cleaver-skin"] === "diamond-cleaver") drawDiamondCleaver(ctx);
  // The horse icon: never held any more (a Temporary Trojan Horse is mounted from the inventory), kept for a future trophy.
  else if (item === "temp-horse") drawMask(ctx, HORSE_ROWS.side, 12, 26, 1, false, "#fff", HORSE.accent);
  else if (item === "cleaver") {
    // A butcher's cleaver: brown handle, a broad grey blade with a black edge and a hanging hole.
    ctx.fillStyle = "#6e4520"; px(0, 9, 10, 4);
    ctx.fillStyle = "#000"; px(9, 0, 13, 14);
    ctx.fillStyle = "#d0d0d0"; px(10, 1, 11, 11);
    ctx.fillStyle = "#000"; px(17, 3, 2, 2);
  } else {
    // The Butterfly Net: a long wooden handle, a metal hoop holding the net's mouth, and a bag of fine mesh hanging from it.
    ctx.fillStyle = "#000"; px(0, 8, 18, 5);
    ctx.fillStyle = "#9a6a38"; px(1, 9, 16, 3); ctx.fillStyle = "#6e4520"; px(3, 10, 2, 1); px(8, 9, 2, 1); px(13, 10, 2, 1);
    // The hoop and bag sit past the end of the handle (1.5 times the length it had).
    ctx.translate(6, 0);
    // The mesh bag, below and beyond the hoop: fine light crosshatch inside a thin grey outline.
    ctx.save(); ctx.beginPath(); ctx.moveTo(13, 4); ctx.quadraticCurveTo(24, 9, 21, 19); ctx.quadraticCurveTo(15, 18, 13, 13); ctx.closePath();
    ctx.fillStyle = "#f4f6f8"; ctx.fill(); ctx.clip();
    ctx.strokeStyle = "#aab4bd"; ctx.lineWidth = 0.6;
    for (let k = -20; k < 30; k += 2.5) { ctx.beginPath(); ctx.moveTo(10 + k, 2); ctx.lineTo(30 + k, 22); ctx.stroke(); ctx.beginPath(); ctx.moveTo(30 + k, 2); ctx.lineTo(10 + k, 22); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = "#6b7680"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(13, 4); ctx.quadraticCurveTo(24, 9, 21, 19); ctx.quadraticCurveTo(15, 18, 13, 13); ctx.stroke();
    // The hoop: a metal ring seen edge-on, fixed to the end of the handle.
    ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(13, 8.5, 2.5, 6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#b8c2cb"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(13, 8.5, 2.5, 6, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

/** An isometric box (walls, furniture) with a white top and dithered sides, from screen-space corner projection. */
function drawBox(ctx: CanvasRenderingContext2D, at: (point: WorldPoint, lift: number) => Point, rect: Rect, lift: number, side: CanvasPattern | string, top = "#fff") {
  const { x, y, w, h } = rect;
  const A = at([x, y], lift), B = at([x + w, y], lift), C = at([x + w, y + h], lift), D = at([x, y + h], lift);
  const B0 = at([x + w, y], 0), C0 = at([x + w, y + h], 0), D0 = at([x, y + h], 0);
  const face = (points: Point[], fill: CanvasPattern | string) => {
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (const point of points.slice(1)) ctx.lineTo(point.x, point.y); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.stroke();
  };
  face([D, C, C0, D0], side); face([B, C, C0, B0], side); face([A, B, C, D], top);
}

/** A glass cylinder of liquid nitrogen standing on the floor at screen (x, y): a steel plinth and cap, faint blue liquid with a
 * Friend frozen in it (bobbing slightly, still under reduced motion), rising bubbles, a glass highlight and vapour over the cap. */
function drawCryoTube(ctx: CanvasRenderingContext2D, x: number, y: number, sprites: GenerationSprites | null, now: number, still: boolean, slot: number) {
  const rx = 26, ry = 9, height = 92, top = y - height, surface = top + 12;
  ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = "#000";
  const ellipse = (cy: number, grow: number) => { ctx.beginPath(); ctx.ellipse(x, cy, rx + grow, ry + grow * 0.4, 0, 0, Math.PI * 2); };
  // Plinth: a dark steel disc with a front band.
  ctx.fillStyle = "#4a5c6b"; ctx.fillRect(x - rx - 4, y, (rx + 4) * 2, 7); ctx.strokeRect(x - rx - 4, y, (rx + 4) * 2, 7);
  ellipse(y, 4); ctx.fillStyle = "#6f8494"; ctx.fill(); ctx.stroke();
  // The liquid column, the frozen Friend in it, then the liquid's tint over the Friend.
  ctx.fillStyle = "#cfe8f8"; ctx.fillRect(x - rx, surface, rx * 2, y - surface); ellipse(y, 0); ctx.fill();
  if (sprites) {
    const rows = spriteFrame(sprites, "down", false, 0, "right").frame.rows, bob = still ? 0 : Math.sin(now / 900 + slot * 2) * 2;
    drawMask(ctx, rows, x, y - 14 + bob, 3, false, "#eef8ff", "#eef8ff", false);
  }
  ctx.fillStyle = "rgba(120, 185, 230, 0.32)"; ctx.fillRect(x - rx, surface, rx * 2, y - surface); ellipse(y, 0); ctx.fill();
  ellipse(surface, 0); ctx.fillStyle = "rgba(225, 243, 255, 0.9)"; ctx.fill();
  // Bubbles rising through the liquid.
  if (!still) for (let k = 0; k < 5; k++) {
    const t = ((now / 1600 + k * 0.21 + slot * 0.37) % 1), bx = x - rx + 6 + ((k * 37 + slot * 11) % (rx * 2 - 12)), by = y - 4 - t * (y - surface - 8);
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)"; ctx.beginPath(); ctx.arc(bx, by, 1.5 + (k % 2), 0, Math.PI * 2); ctx.fill();
  }
  // The glass: side outlines, a highlight stripe, the cap on top.
  ctx.beginPath(); ctx.moveTo(x - rx, top); ctx.lineTo(x - rx, y); ctx.moveTo(x + rx, top); ctx.lineTo(x + rx, y); ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)"; ctx.fillRect(x - rx + 5, top + 6, 4, height - 14);
  ctx.fillStyle = "rgba(200, 230, 250, 0.35)"; ctx.fillRect(x + rx - 9, top + 6, 3, height - 14);
  ctx.fillStyle = "#4a5c6b"; ctx.fillRect(x - rx - 3, top - 6, (rx + 3) * 2, 8); ctx.strokeRect(x - rx - 3, top - 6, (rx + 3) * 2, 8);
  ellipse(top - 6, 3); ctx.fillStyle = "#8ea3b3"; ctx.fill(); ctx.stroke();
  // Nitrogen vapour curling off the cap.
  for (let k = 0; k < 3; k++) {
    const t = still ? 0.4 : (now / 2400 + k / 3 + slot * 0.2) % 1;
    ctx.fillStyle = `rgba(225, 242, 255, ${0.5 * (1 - t)})`; ctx.beginPath(); ctx.ellipse(x - 10 + k * 10 + Math.sin(t * 6 + k) * 4, top - 12 - t * 22, 6 + t * 6, 3 + t * 2, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** The Laser Gun in local pixel units: grey body and grip, red emitter and sight, barrel pointing along +x with its tip at (20, 6.5). */
function drawLaserPistol(ctx: CanvasRenderingContext2D) {
  const px = (x: number, y: number, w: number, h: number) => ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#5a5a5a"; px(0, 4, 16, 5); px(2, 9, 6, 7);
  ctx.fillStyle = "#e0301e"; px(16, 3, 4, 7); px(8, 2, 6, 2);
}
const PISTOL_GRIP: Point = { x: 5, y: 12 }, PISTOL_TIP: Point = { x: 20, y: 6.5 };

/** A laser bolt drawn as a comet: a white-hot head with a red glow, tapering into a long tail with pink energy
 * wisps and sparks. Drawn with the head at (x, y) travelling along `angle`; at scale 1 it is barrel-sized (about 30 x 7 px). */
function drawLaserBolt(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
  const comet = (length: number, radius: number, fill: string) => {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(-length, 0);
    ctx.quadraticCurveTo(-length * 0.35, -radius, 0, -radius); ctx.arc(0, 0, radius, -Math.PI / 2, Math.PI / 2);
    ctx.quadraticCurveTo(-length * 0.35, radius, -length, 0); ctx.closePath(); ctx.fill();
  };
  ctx.shadowColor = "rgba(255, 50, 30, 0.9)"; ctx.shadowBlur = 8 * scale;
  comet(30, 3.5, "rgba(255, 60, 40, 0.55)");
  ctx.shadowBlur = 0;
  comet(24, 2.6, "#ff3b2a"); comet(16, 1.7, "#ff9cb4"); comet(10, 1, "#fff4f0");
  ctx.strokeStyle = "rgba(255, 170, 205, 0.85)"; ctx.lineWidth = 0.7;
  for (const sign of [1, -1]) {
    ctx.beginPath();
    for (let t = 0; t <= 1.001; t += 0.1) { const wx = -26 * t, wy = sign * Math.sin(t * Math.PI * 2) * 2.6 * (1 - t * 0.5); if (t === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy); }
    ctx.stroke();
  }
  ctx.fillStyle = "#ffd0da";
  for (const [sx, sy] of [[-5, -5], [-12, 4.5], [-19, -3.5], [-8, 6], [-24, 2]]) ctx.fillRect(sx, sy, 1, 1);
  ctx.restore();
}

/** MSX-style edge arrow pointing at an off-screen outlaw. */
function drawWarningArrow(ctx: CanvasRenderingContext2D, target: Point, pulse: number) {
  const cx = VIEW.width / 2, cy = VIEW.height / 2, dx = target.x - cx, dy = target.y - cy;
  const margin = 26, half = { x: VIEW.width / 2 - margin, y: VIEW.height / 2 - margin };
  const t = Math.min(half.x / Math.abs(dx || 1e-6), half.y / Math.abs(dy || 1e-6));
  const x = cx + dx * t, y = cy + dy * t, angle = Math.atan2(dy, dx);
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.fillStyle = pulse ? "#d94f3c" : "#ff8a75";
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-10, -11); ctx.lineTo(-4, 0); ctx.lineTo(-10, 11); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Hack the Hardware Wallet overlay
// ---------------------------------------------------------------------------

/** Board icons are vector drawings (wallet-icons.ts): a defender's, the Honeypot's and the USB port's by kind, a program's by id. */
const ICON_SIZE = 32;
/** Defenders are drawn smaller than the other board icons. */
const DEFENDER_ICON_SCALE = 0.75;
/** The icon a tile shows: its kind's, or its program's for a program tile. */
/** A Validator's heal: ms the hit shows before the heal lands, then ms the "+1" floats. */
const HEAL_HOLD = 450, HEAL_FLOAT = 800;
/** A picked-up program: ms on its tile, ms floating to its slot, ms of the slot's landing flash. */
const PICKUP_HOLD = 500, PICKUP_FLY = 650, PICKUP_FLASH = 300;
const tileIcon = (tile: { kind: WalletTileKind; program?: ProgramId }): WalletIconId | null =>
  tile.kind === "program" ? (tile.program ?? null) : tile.kind === "empty" || tile.kind === "void" ? null : tile.kind;
/** The wallet board's layout: tiles are `maxTile` px wide (2:1 isometric) whatever the board size, so bigger boards simply grow,
 * up to 10 × 10; only a board too big for the band below the title (`bandTop` to `bandBottom`, `maxWidth` wide) gets smaller
 * tiles. The board is centred on `cx` and in that band; the readout sits in the bottom left corner, clear of the board. */
const WALLET_VIEW = { maxTile: 72, pyramidTile: 96, cx: 480, bandTop: 151, bandBottom: 529, maxWidth: 912, slab: 12 }; // band lowered 0.5 cm (19 px) in all
const walletTile = (size: number) => 2 * Math.floor(Math.min(WALLET_VIEW.maxTile, (WALLET_VIEW.bandBottom - WALLET_VIEW.bandTop - WALLET_VIEW.slab) * 2 / size, WALLET_VIEW.maxWidth / size) / 2);
const walletTop = (size: number) => WALLET_VIEW.bandTop + (WALLET_VIEW.bandBottom - WALLET_VIEW.bandTop - (size * walletTile(size) / 2 + WALLET_VIEW.slab)) / 2;

/** A tile's explanation for the hover box: what it is, what it did or will do. */
function walletTileHelp(state: WalletState, index: number): string {
  const tile = state.tiles[index], { tier } = state;
  if (tile.kind === "void") return "";
  // The Ponzi pyramid: the tile's row, its support, and what a flip here costs.
  if (tier.pyramid) {
    const level = pyramidLevel(tier.size, index), have = pyramidRevealed(state, level), need = pyramidQuota(tier.size, level);
    const cost = pyramidFlipCost(state, index), lacking = Math.log2(cost);
    const row = `Pyramid row ${level + 1} (${have} of ${need} uncovered${have >= need ? ", supporting the rows above" : ` needed to support the rows above`}).`;
    const flip = !tile.revealed && canFlip(state, index) ? ` A flip here costs ${cost} trace${cost > 1 ? `: ${lacking} row${lacking > 1 ? "s" : ""} below lack${lacking > 1 ? "" : "s"} support` : ""}.` : "";
    return `${row}${flip} ${walletTileHelpInner(state, index)}`;
  }
  return walletTileHelpInner(state, index);
}
function walletTileHelpInner(state: WalletState, index: number): string {
  const tile = state.tiles[index], tier = state.tier, atk = (kind: DefenderKind) => strikeBack(state, kind);
  if (state.liquidator === index) return `The Liquidator. While your Equity is at ${Math.round(EQUITY.forced * 100)}% or under he walks a tile a move toward your probe, through anything; above it he stands still. If he reaches you: Equity ${Math.round(EQUITY.liquidated * 100)}% and every uncovered tile but yours is seized.`;
  if (state.viruses.some(v => v.tile === index)) return `The Virus. It does not know where you are: it wanders until it finds your trail and follows it to your probe. If your probe is on or next to its tile (the red outline) it bites for ${tier.virusBite} Integrity. It bites defenders it walks onto. An Airdrop lures it; an Antivirus wipes it.`;
  if (index === state.airdrop) return "Airdrop: free tokens. Every Virus heads here instead of you, and stops to feed.";
  if (state.targeting) {
    const p = PROGRAMS[state.targeting];
    return `${p.name}: ${p.rule} Click a tile to run it here, or press Esc to put it away.`;
  }
  if (!tile.revealed) {
    const peek = state.explored.includes(index) ? ` The Block Explorer shows ${tile.kind === "empty" ? "an empty sector" : tile.kind === "program" && tile.program ? `a ${PROGRAMS[tile.program].name} program` : `a ${walletKindName(tile.kind)}`} here.` : "";
    // The same words for every glint, so the hover never gives a twist away.
    const glint = tile.kind === "honeypot" || (tier.twist === "honeyfarm" && tile.kind === "program") ? " It glints." : "";
    // Who locks it: a defender next to it, or a Firewall's line running through it.
    const byLine = isLocked(state, index) && lockers(state, index).some(other => !gridNeighbours(tier.size, index).includes(other));
    const lock = byLine && !lockers(state, index).some(other => gridNeighbours(tier.size, index).includes(other)) ? "a Firewall's line" : byLine ? "a defender next to it and a Firewall's line" : "an active defender next to it";
    const undo = byLine && lock === "a Firewall's line" ? "take down the Firewall" : "defeat every defender locking it";
    if (isLocked(state, index)) return `Locked by ${lock}: it cannot be flipped until you ${undo}.${peek}${glint}`;
    if (state.trace >= tier.traceLimit) return "Face-down tile. The trace is complete: no more flips.";
    if (canFlip(state, index)) return `Face-down tile. Click to flip it; each flip advances the trace (${state.trace} of ${tier.traceLimit}).${peek}${glint}`;
    return `Face-down tile. You can only flip tiles next to one you have already revealed.${peek}${glint}`;
  }
  const hits = (kind: DefenderKind) => `Click to hit it for ${effectivePower(state)}; while it stands it strikes back for ${atk(kind)} Integrity and locks the tiles around it.`;
  if (isFrozen(state, index) && (tile.kind === "empty" || tile.kind === "program") && index !== state.start) return `${tile.kind === "program" ? "A program sector" : tile.beacon ? "Beacon" : "Empty sector"}: its reading is frozen by a Cold Storage nearby. It shows once the storage thaws.`;
  switch (tile.kind) {
    case "cold": return isFrozenCold(tile) ? `Cold Storage. It cannot be attacked or passed, and every reading within ${COLD_REACH} tiles of it is frozen while it stands. Reveal ${COLD_THAW} tiles around it to thaw it and take the program inside (${coldRevealed(state, index)} of ${COLD_THAW}).` : "Cold Storage, thawed.";
    case "empty":
      if (index === state.start) return "USB port. You plugged in here.";
      if (tile.blank) return "Empty sector. Its reading was wiped by the exit scam.";
      if (tile.exposed) return `${tile.beacon ? "Beacon" : "Empty sector"}, caught lying by a Checksum: it says ${readingText(displayReading(state, tile), tile.beacon)}, and that is false.`;
      return `${tile.beacon ? "Beacon" : "Empty sector"}: ${readingText(displayReading(state, tile), tile.beacon)}.`;
    case "wall": return tile.hp > 0 ? `Firewall. HP ${tile.hp}, ATK ${atk("wall")}. ${hits("wall")}` : "Firewall, burnt out.";
    case "alarm": return tile.hp > 0 ? `Tamper Alarm. ${(tile.fuse ?? -1) > 0 ? `Its fuse: ${tile.fuse} moves until it sounds for +${tier.alarmTrace} trace; defeat it first.` : "It has sounded."} HP ${tile.hp}, ATK ${atk("alarm")}. ${hits("alarm")}` : "Tamper Alarm, silenced.";
    case "validator": return tile.hp > 0 ? `Validator. While it stands, every defender on the board heals 1 HP each move, up to its maximum. HP ${tile.hp}, ATK ${atk("validator")}. ${hits("validator")}` : "Validator, offline.";
    case "gasspike": return `Gas Spike, spent: fees surged when you uncovered it, ${GAS_COST} trace a flip for ${GAS_MOVES} moves.`;
    case "reentrancy": return `Reentrancy Attack, spent: the contract called back into you for ${REENTRANCY_DAMAGE} Integrity when you uncovered it.`;
    case "whale": return tile.hp > 0 ? `Whale. Few HP, but it hits hard. HP ${tile.hp}, ATK ${atk("whale")}. ${hits("whale")}` : "Whale, beached.";
    case "bomb": return `Difficulty Bomb, spent: it exploded for ${BOMB_DAMAGE} Integrity when you uncovered it.`;
    case "chip": return tile.hp > 0 ? `Secure Chip. HP ${tile.hp}, ATK ${atk("chip")}. Break it to hack the wallet. ${hits("chip")}` : "Secure Chip, cracked.";
    case "fork": return `Hard Fork, spent: the chain split here when you uncovered it, for ${FORK_DAMAGE} Integrity and a fresh Virus.`;
    case "honeypot": return "Honeypot, emptied.";
    case "fakechip": return "A Red Chip, one of Sybil's fakes: the readings around it lied. The real Secure Chip is elsewhere.";
    case "drainer": return state.drained ? "A Wallet Drainer trap, sprung: the hardware wallet's valuables are gone." : "A Wallet Drainer trap.";
    case "program": return tile.program ? `${PROGRAMS[tile.program].name}, waiting for a free slot: ${PROGRAMS[tile.program].rule} ${canClaim(state, index) ? "Click to take it." : "Discard a program (right-click its slot) to make room."} Its reading: ${readingText(displayReading(state, tile), tile.beacon)}${tile.exposed ? ", and a Checksum caught that lie" : ""}.` : `A program sector, its program taken. Its reading: ${readingText(displayReading(state, tile), tile.beacon)}${tile.exposed ? ", and a Checksum caught that lie" : ""}.`;
  }
  return "";
}

/** The wallet as a React overlay above the frozen world: an isometric board on a raised slab, hatched face-down tiles, white
 * revealed ones with pips or standing icons, defender HP, a cursor and hover highlight with an explanation box, the Integrity and
 * Draw readout, and the deadpan log line. Clicks and keys become actions. */
/** The face-down board's processor look: a navy substrate with gold and blue traces. */
const CIRCUIT = { substrate: "#0f1d44", gold: "#d9b048", blue: "#5aa0ff", slabLeft: "#0a1433", slabRight: "#060d24" };
/** Pre-render one random circuit for the whole board (screen space, VIEW-sized): traces run along quarter-tile lanes, turn at
 * right angles, cross each other and tile borders freely, and end in square pads, with a few vias along the way. A fresh
 * pattern is drawn for every wallet opened. */
function drawCircuit(size: number, at: (col: number, row: number) => Point, scale = 1): HTMLCanvasElement {
  // Built at `scale` device pixels per unit (the wallet canvas's resolution), so the circuit stays sharp; draw it back at VIEW size.
  const canvas = document.createElement("canvas"); canvas.width = Math.round(VIEW.width * scale); canvas.height = Math.round(VIEW.height * scale);
  const c = canvas.getContext("2d")!; c.scale(scale, scale); const lanes = size * 4, lane = (k: number) => (k + 0.5) / 4;
  const corners = [at(0, 0), at(size, 0), at(size, size), at(0, size)];
  c.beginPath(); corners.forEach((q, i) => i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)); c.closePath(); c.fillStyle = CIRCUIT.substrate; c.fill();
  const pad = (u: number, v: number, colour: string, big: boolean) => {
    const p = at(u, v), r = big ? 3 : 2; c.fillStyle = colour; c.fillRect(Math.round(p.x - r), Math.round(p.y - r), r * 2, r * 2);
    if (big) { c.fillStyle = CIRCUIT.substrate; c.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 2, 2); }
  };
  const steps: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (let wire = 0, wires = Math.round(size * size * 0.8); wire < wires; wire++) {
    const colour = Math.random() < 0.55 ? CIRCUIT.gold : CIRCUIT.blue;
    let x = Math.floor(Math.random() * lanes), y = Math.floor(Math.random() * lanes), dir = Math.floor(Math.random() * 4);
    const points: [number, number][] = [[x, y]];
    for (let step = 0, length = 4 + Math.floor(Math.random() * 14); step < length; step++) {
      if (step > 0 && Math.random() < 0.3) dir = (dir + (Math.random() < 0.5 ? 1 : 3)) % 4;
      const nx = x + steps[dir][0], ny = y + steps[dir][1];
      if (nx < 0 || ny < 0 || nx >= lanes || ny >= lanes) break;
      x = nx; y = ny; points.push([x, y]);
    }
    if (points.length < 3) continue;
    c.beginPath(); points.forEach(([u, v], i) => { const p = at(lane(u), lane(v)); if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); });
    c.strokeStyle = colour; c.lineWidth = 2; c.lineJoin = "miter"; c.stroke();
    pad(lane(points[0][0]), lane(points[0][1]), colour, true);
    pad(lane(x), lane(y), colour, true);
    if (points.length > 6 && Math.random() < 0.5) { const [u, v] = points[Math.floor(points.length / 2)]; pad(lane(u), lane(v), colour, false); }
  }
  return canvas;
}

/** The Virus centred on (x, y) in leg frame `frame` (vector, wallet-icons.ts): head up, or head down when it crawls down the screen;
 * `cell` sets its size as the old 15-cell mask did, and `squash` < 1 lays it flat on the isometric floor so it fits in one tile. */
function drawVirus(ctx: CanvasRenderingContext2D, x: number, y: number, down: boolean, frame: number, cell = 3, squash = 1) {
  drawVirusIcon(ctx, x, y, down, frame, cell * 15, squash);
}
/** The wipe of a lost board, `t` seconds in: a white flash, the tiles blasted outward as tumbling shards that fall and fade,
 * and fire rising from where the board stood. Everything is seeded by tile, so each frame continues the same explosion. */
function drawWipe(ctx: CanvasRenderingContext2D, at: (col: number, row: number) => Point, n: number, tileW: number, tileH: number, t: number, live: (i: number) => boolean = () => true) {
  const centre = at(n / 2, n / 2), rand = (i: number, k: number) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  if (t < 0.15) { ctx.fillStyle = `rgba(255, 240, 200, ${0.8 * (0.15 - t) / 0.15})`; ctx.fillRect(0, 0, VIEW.width, VIEW.height); }
  const fade = Math.max(0, 1 - t / 1.3);
  if (fade > 0) for (let i = 0; i < n * n; i++) {
    if (!live(i)) continue;
    const c = at(i % n + 0.5, Math.floor(i / n) + 0.5), dx = c.x - centre.x, dy = c.y - centre.y, far = Math.hypot(dx, dy) || 1;
    const speed = 180 + rand(i, 1) * 260, x = c.x + dx / far * speed * t, y = c.y + (dy / far * speed - 160) * t + 420 * t * t;
    ctx.save(); ctx.globalAlpha = fade; ctx.translate(x, y); ctx.rotate((rand(i, 2) - 0.5) * 8 * t);
    ctx.beginPath(); ctx.moveTo(0, -tileH / 3); ctx.lineTo(tileW / 3, 0); ctx.lineTo(0, tileH / 3); ctx.lineTo(-tileW / 3, 0); ctx.closePath();
    ctx.fillStyle = rand(i, 3) < 0.5 ? CIRCUIT.substrate : "#fff"; ctx.fill(); ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }
  const burn = Math.max(0, 1 - t / 1.6);
  if (burn > 0) for (let i = 0; i < 160; i++) {
    const life = (t * (1.1 + rand(i, 4)) + rand(i, 5)) % 1, x = centre.x + (rand(i, 6) - 0.5) * n * tileW * 0.75 + Math.sin(t * 7 + i) * 7;
    const y = centre.y + tileH * n * 0.25 - life * 220, size = Math.round((1 - life) * 16 + 4);
    ctx.globalAlpha = Math.min(1, burn * 1.4) * (1 - life * 0.7); ctx.fillStyle = life < 0.25 ? "#fff3b0" : life < 0.45 ? "#ffd23c" : life < 0.7 ? "#ff8a2a" : "#d94f3c";
    ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
  }
  ctx.globalAlpha = 1;
}
/** One small drawn icon for the wallet help page. */
function HelpIcon({ draw, label }: { draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; label: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  // Drawn at the screen's pixel density, so the vector icons stay sharp.
  const density = typeof window === "undefined" ? 1 : Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  useEffect(() => { const ctx = ref.current?.getContext("2d"); if (ctx) { ctx.setTransform(density, 0, 0, density, 0, 0); ctx.clearRect(0, 0, 72, 48); draw(ctx, 72, 48); } }, [draw, density]);
  return <canvas ref={ref} width={Math.round(72 * density)} height={Math.round(48 * density)} style={{ width: 72, height: 48 }} role="img" aria-label={label} />;
}
/** A locked tile's mark: a flat red cross lying on the tile, its two bars running corner to corner, outlined black. */
const drawLockCross = (ctx: CanvasRenderingContext2D, at: (col: number, row: number) => Point, col: number, row: number) => {
  const w = 0.045, lo = 0.16, hi = 0.84; // w: half the bar's width, across the other diagonal; lo/hi: how near the corners it reaches
  const bars = [[[lo + w, lo - w], [hi + w, hi - w], [hi - w, hi + w], [lo - w, lo + w]], [[hi + w, lo + w], [lo + w, hi + w], [lo - w, hi - w], [hi - w, lo - w]]];
  const path = () => { ctx.beginPath(); for (const bar of bars) bar.forEach(([c, r], i) => { const p = at(col + c, row + r); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); };
  // Outline both bars first, then fill both, so the crossing has no line through it.
  for (const bar of bars) { ctx.beginPath(); bar.forEach(([c, r], i) => { const p = at(col + c, row + r); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.closePath(); ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.lineJoin = "miter"; ctx.stroke(); }
  path(); ctx.fillStyle = "#d94f3c"; ctx.fill("nonzero");
};
/** A 3 × 5 pixel font for the defenders' badges: digits and the x of a beaten defender. */
const PIXEL_GLYPHS: Readonly<Record<string, readonly string[]>> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"], "1": [".#.", "##.", ".#.", ".#.", "###"], "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", ".##", "..#", "###"], "4": ["#.#", "#.#", "###", "..#", "..#"], "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"], "7": ["###", "..#", ".#.", ".#.", ".#."], "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"], x: ["...", "#.#", ".#.", "#.#", "..."],
};
/** The width of a pixel badge holding `text`. */
const pixelBadgeWidth = (text: string) => text.length * 4 * 2 - 2 + 3 * 2 + 4;
/** A pixel badge: a black-framed box of `fill` holding `text` in the pixel font (2 px a pixel), top left at (x, y). Returns its width. */
const drawPixelBadge = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, ink: string, frame = "#000") => {
  const cell = 2, pad = 3, w = pixelBadgeWidth(text), h = 5 * cell + pad * 2 + 4;
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = frame; ctx.fillRect(x, y, w, h); ctx.fillStyle = fill; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = ink;
  [...text].forEach((char, k) => (PIXEL_GLYPHS[char] ?? []).forEach((line, r) => [...line].forEach((bit, c) => {
    if (bit === "#") ctx.fillRect(x + 2 + pad + (k * 4 + c) * cell, y + 2 + pad + r * cell, cell, cell);
  })));
  return w;
};
/** Where a defender count's dots lie on a tile, in tile units (0 to 1 along its column and row), like the faces of a die. */
const DICE: readonly (readonly [number, number][])[] = (() => {
  const a = 0.25, m = 0.5, b = 0.75, four: [number, number][] = [[a, a], [b, a], [a, b], [b, b]], six: [number, number][] = [[a, a], [a, m], [a, b], [b, a], [b, m], [b, b]];
  return [[], [[m, m]], [[a, a], [b, b]], [[a, a], [m, m], [b, b]], four, [...four, [m, m]], six, [...six, [m, m]], [...six, [m, a], [m, b]]];
})();
/** A tile's reading. A defender count is flat dots on the tile, laid out like a die (none for 0); a beacon's distance to the chip is
 * a cyan pixel badge. Red when a Checksum caught it lying. `small`: the compact one on the right of a program's icon. */
const drawReading = (ctx: CanvasRenderingContext2D, at: (col: number, row: number) => Point, col: number, row: number, shown: number, beacon: boolean, exposed: boolean, small = false) => {
  const mid = at(col + 0.5, row + 0.5);
  if (beacon) {
    const text = `${shown}`, w = text.length * 8 + 8, right = small ? 19 : 0;
    drawPixelBadge(ctx, text, mid.x + right - w / 2, mid.y - 10, exposed ? "#f7c4c0" : "#3fbfbf", exposed ? "#d94f3c" : "#000", exposed ? "#d94f3c" : "#000");
    return;
  }
  // The compact count sits in the tile's right quarter (towards its right corner), at half size.
  const [oc, or, scale] = small ? [0.53, 0.05, 0.42] : [0, 0, 1], r = small ? 0.06 : 0.1;
  ctx.fillStyle = exposed ? "#d94f3c" : "#000";
  for (const [u, v] of DICE[Math.max(0, Math.min(8, shown))]) {
    const cu = col + oc + u * scale, cv = row + or + v * scale, p = [at(cu - r, cv - r), at(cu + r, cv - r), at(cu + r, cv + r), at(cu - r, cv + r)];
    ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.fill();
  }
};
/** A flippable tile's mark: a small flat white diamond lying on the tile (a quarter of its width), outlined black so it shows on
 * any stretch of circuit. `alpha` pulses the white only; the black outline stays solid so the mark never fades into the board. */
const drawFlipMarker = (ctx: CanvasRenderingContext2D, at: (col: number, row: number) => Point, col: number, row: number, alpha = 1) => {
  const r = 0.125, p = [at(col + 0.5 - r, row + 0.5 - r), at(col + 0.5 + r, row + 0.5 - r), at(col + 0.5 + r, row + 0.5 + r), at(col + 0.5 - r, row + 0.5 + r)];
  ctx.save();
  ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath();
  ctx.strokeStyle = "#000"; ctx.lineWidth = 4; ctx.lineJoin = "miter"; ctx.stroke(); ctx.fillStyle = "#000"; ctx.fill();
  ctx.globalAlpha = alpha; ctx.fillStyle = "#fff"; ctx.fill();
  ctx.restore();
};
/** A lone board tile for the help icons: the diamond, filled white (revealed) or with the circuit (face down). */
const helpTile = (ctx: CanvasRenderingContext2D, w: number, h: number, faceDown: boolean, locked = false, fill = "#fff") => {
  const at = (col: number, row: number): Point => ({ x: w / 2 + (col - row) * 30, y: h / 2 - 15 + (col + row) * 15 });
  const path = () => { const p = [at(0, 0), at(1, 0), at(1, 1), at(0, 1)]; ctx.beginPath(); p.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); };
  path();
  if (faceDown) { ctx.save(); ctx.clip(); ctx.drawImage(drawCircuit(1, at, ctx.getTransform().a), 0, 0, VIEW.width, VIEW.height); if (locked) { ctx.fillStyle = "rgba(0, 0, 0, 0.55)"; ctx.fillRect(0, 0, w, h); } ctx.restore(); path(); }
  else { ctx.fillStyle = fill; ctx.fill(); }
  ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.stroke();
  return { x: w / 2, y: h / 2, at };
};
const helpIcon = (icon: WalletIconId, dead = false) => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  drawWalletIcon(ctx, icon, w / 2, h - 7, 34, dead);
};
const helpSprite = (kind: WalletIconId, dead = false) => helpIcon(kind, dead);
const HELP_DRAW = {
  faceDown: (ctx: CanvasRenderingContext2D, w: number, h: number) => { helpTile(ctx, w, h, true); },
  flippable: (ctx: CanvasRenderingContext2D, w: number, h: number) => drawFlipMarker(ctx, helpTile(ctx, w, h, true).at, 0, 0),
  locked: (ctx: CanvasRenderingContext2D, w: number, h: number) => { drawLockCross(ctx, helpTile(ctx, w, h, true, true).at, 0, 0); },
  glint: (ctx: CanvasRenderingContext2D, w: number, h: number) => { const c = helpTile(ctx, w, h, true); drawGlint(ctx, c.x, c.y, 1); },
  reading: (shown: number, beacon: boolean) => (ctx: CanvasRenderingContext2D, w: number, h: number) => drawReading(ctx, helpTile(ctx, w, h, false).at, 0, 0, shown, beacon, false),
  usb: helpSprite("usb"), wall: helpSprite("wall"), alarm: helpSprite("alarm"), validator: helpSprite("validator"), gasspike: helpSprite("gasspike"), whale: helpSprite("whale"), bomb: helpSprite("bomb"), fork: helpSprite("fork"), reentrancy: helpSprite("reentrancy"), cold: helpSprite("cold"), chip: helpSprite("chip"), honeypot: helpSprite("honeypot"),
  virus: (ctx: CanvasRenderingContext2D, w: number, h: number) => drawVirus(ctx, w / 2, h / 2, false, 0, 2.6),
  beaten: helpSprite("alarm", true),
  program: Object.fromEntries((Object.keys(PROGRAMS) as ProgramId[]).map(id => [id, helpIcon(id)])) as Record<ProgramId, (ctx: CanvasRenderingContext2D, w: number, h: number) => void>,
};
// Built once, so the icons do not redraw every render: counts of 0, 1 and 3 defenders, and a beacon 5 steps from the chip.
const PIP_DRAW = [HELP_DRAW.reading(0, false), HELP_DRAW.reading(1, false), HELP_DRAW.reading(3, false), HELP_DRAW.reading(5, true)];

/** The help page's own words for the programs (the cards keep their rules from wallet.ts). */
const HELP_PROGRAM_TEXT: Partial<Record<ProgramId, string>> = {
  rollback: "Reorganise the chain: Tracing -3, but it costs 2 Integrity.",
  ico: "Raise funds anonymously: Tracing -2.",
  flashloan: "Your next hit hits double and takes no strike-backs.",
  halving: "The half of the board holding the Secure Chip shines gold for 5 seconds.",
  lowentropy: "Pick a revealed Defender, the Secure Chip included: its key weakens and its HP is halved.",
  multisig: "The next two strike-backs need more signatures: they are blocked.",
  staking: "+1 Power for the rest of the board.",
  explorer: "Pick a face-down Tile: it shows what it holds. More picks on higher levels.",
  airdrop: "Pick a Tile: every Virus heads for the free tokens and stops there to feed.",
  antivirus: "Pick a Virus: that Virus is wiped.",
};
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

/** The explanation page behind the wallet's "?" button (it never names the board's twist): the rules in short, then every icon on the board,
 * with this tier's numbers. */
function WalletHelp({ tier, onClose }: { tier: WalletState["tier"]; onClose: () => void }) {
  const d = tier.defenders;
  type Row = { draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; name: string; text: string };
  const groups: { title: string; rows: Row[] }[] = [
    { title: "The board", rows: [
      { draw: HELP_DRAW.usb, name: "USB Port", text: "Starting point." },
      { draw: HELP_DRAW.flippable, name: "Face-down Tile", text: "Flip it to see what's hidden. Only tiles with a white diamond can be flipped." },
      { draw: HELP_DRAW.locked, name: "Locked Tile", text: "An active Defender guards this Tile: it cannot be flipped until you defeat it." },
    ] },
    { title: "Readings", rows: [
      { draw: PIP_DRAW[0], name: "No Dots", text: "No Defender or Attacker in the eight Tiles around it." },
      { draw: PIP_DRAW[2], name: "Dotted", text: "The number of dots shows the number of Defenders and Attackers around it." },
      { draw: PIP_DRAW[3], name: "Beacon", text: "The number in the cyan block shows the exact number of steps to the Secure Chip." },
    ] },
    { title: "Defenders (they stay on the board for you to deal with)", rows: [
      { draw: HELP_DRAW.chip, name: "Secure Chip", text: "Break it to win the game." },
      { draw: HELP_DRAW.wall, name: "Firewall", text: tier.firewallLine ? "Locks all the Tiles in either its row or its column, which depends on your approach." : "Locks the Tiles around it." },
      { draw: HELP_DRAW.alarm, name: "Tamper Alarm", text: `A fuse: ${tier.fuse} moves after you reveal it, it exposes you for +${tier.alarmTrace} Trace unless you defeat it first.` },
      { draw: HELP_DRAW.validator, name: "Validator", text: "While it stands, every Defender on the board, the Secure Chip included, heals 1 HP each move, up to its maximum." },
      { draw: HELP_DRAW.whale, name: "Whale", text: "Low HP, but hits hard." },
      ...(tier.counts.cold > 0 ? [{ draw: HELP_DRAW.cold, name: "Cold Storage", text: `Cannot be attacked, locks nothing, but cannot be passed, and every reading within ${COLD_REACH} tiles is frozen while it stands. Reveal ${COLD_THAW} tiles touching it and it thaws: the readings return and the program inside is yours.` }] : []),
    ] },
    { title: "Attackers (they go off when you uncover them)", rows: [
      ...(tier.counts.bomb > 0 ? [{ draw: HELP_DRAW.bomb, name: "Difficulty Bomb", text: `Explodes for -${BOMB_DAMAGE} Integrity.` }] : []),
      ...(tier.counts.reentrancy > 0 ? [{ draw: HELP_DRAW.reentrancy, name: "Reentrancy Attack", text: `A vulnerability hits you for -${REENTRANCY_DAMAGE} Integrity.` }] : []),
      ...(tier.counts.fork > 0 ? [{ draw: HELP_DRAW.fork, name: "Hard Fork", text: `The chain splits: -${FORK_DAMAGE} Integrity, and a fresh Virus spawns about a board-width from you.` }] : []),
      ...(tier.counts.gasspike > 0 ? [{ draw: HELP_DRAW.gasspike, name: "Gas Spike", text: `Fees surge: every flip costs ${GAS_COST} trace for your next ${GAS_MOVES} moves.` }] : []),
    ] },
    { title: `Programs (${tier.slots} slots: click a slot or press 1-${tier.slots} to run, right-click to discard)`, rows: [
      ...(Object.keys(PROGRAMS) as ProgramId[]).filter(id => programsDealt(tier).includes(id) || (tier.guaranteed ?? []).includes(id)).map(id => ({ draw: HELP_DRAW.program[id], name: PROGRAMS[id].name, text: HELP_PROGRAM_TEXT[id] ?? PROGRAMS[id].rule })),
      { draw: HELP_DRAW.glint, name: "Honeypot", text: `A glinting face-down Tile. Inside is a Program, but opening it pings the tracer (+${tier.honeypotTrace} Tracing) and makes every Virus lunge two steps towards you.` },
    ] },
    ...(tier.viruses > 0 || tier.counts.fork > 0 ? [{ title: "The Virus", rows: [
      { draw: HELP_DRAW.virus, name: "Virus", text: "It does not know where you are. It wanders until it finds your trail, then follows it to your active Tile (green outline). The moment you are next to it (outlined in red), it bites you. Damage and speed vary by level. It also bites Defenders it walks into, for the same amount." },
    ] }] : []),
  ];
  return <div className="outlaw-wallet-help" role="dialog" aria-label="How to hack the wallet">
    <h2>How to hack the wallet</h2>
    <p>You start at the USB port. Flip adjacent Tiles and try to find a path to the Secure Chip, then break it. Click a Defender to hit it
      with your Power. If it survives, it strikes back at your Integrity. Its health (HP) is the number in white, its attack power (ATK) the
      number in red. At 0 Integrity, the hack fails.</p>
    <p>While you move, you are being Traced. The Tracing fills one step per Tile flip and {tier.alarmTrace} more when a Tamper Alarm goes off. If
      Tracing completes before the Secure Chip breaks, even with the Chip already found, the Kill Switch fires and the hack fails.</p>
    <p>Your path inevitably forms a chain of uncovered Tiles. For every {ordinal(tier.chainStep)} Tile added to the chain, you get a Block Reward of
      +{tier.blockReward} Integrity. Only the longest chain counts. Beaten Defenders count.</p>
    <p>On the board you'll find Readings to help you navigate, Defenders, Attackers and The Virus to make your life difficult, and Programs that
      help you. More detail can be found in the sections below.</p>
    <p>Keyboard: arrows or WASD move the cursor. Enter or Space flips or attacks. 1-{tier.slots} runs a Program; right-click a slot to discard
      or sell (special situations){tier.twist === "frontrun" ? ". G toggles priority gas" : ""}. Esc puts a Program away or gives up.</p>
    {groups.map(group => <section key={group.title}>
      <h3>{group.title}</h3>
      <ul>{group.rows.map(item => <li key={item.name}><HelpIcon draw={item.draw} label={item.name} /><span><strong>{item.name}</strong>{item.text}</span></li>)}</ul>
    </section>)}
    <button type="button" className="rf-frame-primary" onClick={onClose}>Back to the board · Esc</button>
  </div>;
}

/** Frost in place of a reading a Cold Storage has frozen: a small ice-blue six-pointed star, outlined dark. */
function drawFrost(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.lineCap = "round";
  for (const [w, colour] of [[4, "#2b5a80"], [2, "#e8f4ff"]] as const) {
    ctx.strokeStyle = colour; ctx.lineWidth = w; ctx.beginPath();
    for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; ctx.moveTo(-Math.cos(a) * 6, -Math.sin(a) * 6); ctx.lineTo(Math.cos(a) * 6, Math.sin(a) * 6); }
    ctx.stroke();
  }
  ctx.restore();
}
/** A gold sparkle over a glinting face-down tile (a Honeypot, or on the Honeypot Farm any program), twinkling at `phase` 0-1. */
function drawGlint(ctx: CanvasRenderingContext2D, x: number, y: number, phase: number) {
  const r = 4 + phase * 3;
  ctx.fillStyle = "#ffe08a"; ctx.fillRect(Math.round(x - 1), Math.round(y - r), 3, Math.round(r * 2)); ctx.fillRect(Math.round(x - r), Math.round(y - 1), Math.round(r * 2), 3);
  ctx.fillStyle = "#fff"; ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 3, 3);
}

/** One thing the mint terminal can list: a game item you hold or an achievement you have earned. */
type Mintable = { id: string; group: "item" | "achievement"; name: string; detail: string };
/** The Cold Storage's mint terminal: pick game items and achievements to mint into the Friend's wallet. The selection screen is
 * ready; minting itself is not implemented yet, so the mint button stays disabled and nothing leaves the game. */
function MintTerminal({ friendId, items, onClose }: { friendId: bigint; items: readonly Mintable[]; onClose: () => void }) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string) => setChosen(value => { const next = new Set(value); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const groups = [["item", "Game items"], ["achievement", "Achievements"]] as const;
  const all = items.length > 0 && items.every(item => chosen.has(item.id));
  return <GameMenu title="Mint terminal" onClose={onClose}>
    <p>Cold Storage {"·"} mint game items and achievements into Friend #{friendId.toString()}'s wallet.</p>
    {items.length === 0 && <p>Nothing to mint yet. Earn items and achievements in the country first.</p>}
    {items.length > 0 && <button type="button" onClick={() => setChosen(all ? new Set() : new Set(items.map(item => item.id)))}>{all ? "Clear selection" : "Select all"}</button>}
    {groups.map(([group, title]) => {
      const rows = items.filter(item => item.group === group);
      return rows.length > 0 && <section key={group}>
        <h3>{title}</h3>
        {rows.map(item => <label className="outlaw-item outlaw-mint-row" key={item.id}>
          <span><strong>{item.name}</strong><small>{item.detail}</small></span>
          <input type="checkbox" checked={chosen.has(item.id)} onChange={() => toggle(item.id)} aria-label={`Select ${item.name}`} />
        </label>)}
      </section>;
    })}
    <p className="outlaw-mint-note">{chosen.size} selected {"·"} Minting is not live yet: the selection is prepared, but nothing is sent to the wallet.</p>
    <button type="button" className="rf-frame-primary" disabled>Mint {chosen.size || ""} to wallet</button>
    <button type="button" onClick={onClose}>Back to the Cold Storage</button>
  </GameMenu>;
}

/** The Hack the Hardware Wallet overlay; exported for the standalone practice page (practice/). */
/** The briefing before each board: its twist, told on purpose a little vaguely (enough to worry about, not how it works exactly),
 * in the words the board itself shows (its banners, programs and bars). The ? page has the exact rules. */
const TWIST_BRIEFINGS: Readonly<Record<TwistId, string>> = {
  rugpull: "Somewhere between move 7 and 10 the ground gives way: RUGPULL. What you uncovered may be hidden again, remember what you saw.",
  butchering: "The Pig Butcher fattens you up with many Programs and a third slot. All this grooming may come at a price when you're BUTCHERED.",
  exitscam: "You never think it will happen to you so you keep everything in your hot wallet. Check again, it's gone. SKEM.",
  drainer: "Traps lie among the sectors. Step on the wrong one and everything gets DRAINED.",
  pumpdump: "Your first flip gets you PUMPED. But time and trace stop for no one. What gets pumped, gets DUMPED.",
  honeyfarm: "Every Program glints weakly on its unflipped tile. The tracer and the Virus both have a taste for HONEY.",
  botnet: "More than one Virus is on your trail. Some Programs on the board were made for exactly this.",
  sybil: "Not every Chip is what it seems and not every Beacon tells the truth.",
  frontrun: "Someone is watching your every move. Priority gas may keep what's yours, at a price.",
  sandwich: "Bots on the move. Get caught in the middle and you are SANDWICHED. Low Slippage buys a little peace.",
  ponzi: "Build a broad following to succeed at the top. Limited support in the lower rungs means people rat you out. Feel free to Rob Peter to pay Paul.",
  margincall: "Your Integrity now becomes your Equity position. Let it slide and get a MARGIN CALL. Let it slide further and experience FORCED SELLING. Beware the FLASH CRASH and above all The Liquidator.",
};
function WalletBriefing({ tier, name, onStart }: { tier: WalletState["tier"]; name: string; onStart: () => void }) {
  const startRef = useRef<HTMLButtonElement | null>(null), start = useRef(onStart); start.current = onStart;
  useEffect(() => {
    startRef.current?.focus();
    // Enter or Space starts the hack wherever the focus is (the game's own keys do the same).
    const onKey = (event: KeyboardEvent) => { if ((event.code === "Enter" || event.code === "Space") && !event.repeat) { event.preventDefault(); start.current(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return <div className="outlaw-briefing-scrim"><div className="outlaw-briefing" role="dialog" aria-label={`${TWISTS[tier.twist].name}: before you hack`}>
    <p className="outlaw-briefing-kicker">{name}'s hardware wallet {"·"} {tier.name}</p>
    <h2>{TWISTS[tier.twist].name}</h2>
    <p>{TWIST_BRIEFINGS[tier.twist]}</p>
    <button ref={startRef} type="button" className="rf-frame-primary" onClick={onStart}>Start hacking {"·"} Enter</button>
  </div></div>;
}

export function WalletOverlay({ wallet, name, busy, reducedMotion, onAct, onClose, closeLabel = "Close", belowHud = false, briefing, onBriefed }: {
  wallet: WalletState | "probing"; name: string; busy: boolean; reducedMotion: boolean; onAct: (action: WalletAction) => void; onClose: () => void;
  /** The finished board's close button; null leaves it out (the practice page's last tier). */
  closeLabel?: string | null;
  /** In the game the HUD's Inventory and Settings buttons hold the top right corner, so Give up sits just below them. */
  belowHud?: boolean;
  /** The twist briefing before the board: shown while true (the game controls it, as its keys dismiss it too). Left out, the
   * overlay shows it once per mount (the practice page). */
  briefing?: boolean;
  onBriefed?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hover = useRef({ index: -1, x: 0, y: 0 });
  const tipRef = useRef<HTMLDivElement | null>(null);
  const live = useRef({ wallet, reducedMotion, belowHud }); live.current = { wallet, reducedMotion, belowHud };
  // When the board was lost (animation clock for the explosion), or null while it is still open.
  const lostAt = useRef<number | null>(null);
  // The Rug Pull: when it happened (the board is yanked away, then drops back face down), the last rug state seen, and a snapshot of
  // the board as it was, taken every frame so the yank can show it.
  const pullAt = useRef<number | null>(null), lastRug = useRef<number | null>(null), boardSnap = useRef<HTMLCanvasElement | null>(null);
  // The Virus's latest bite, animated for a second: which bite object it was (to spot a new one), where, how much, and when.
  // Each Virus crawls: from its last tile to its current one over a short time, facing the way it went (keyed by its place in the list).
  const crawl = useRef<Map<number, { from: number; to: number; at: number; down: boolean }>>(new Map());
  const healSeen = useRef<object | null>(null), healAnim = useRef<{ tiles: number[]; at: number } | null>(null);
  // A Halving's golden sheen: the half it named and when it appeared, so it can fade out after HALVING_SHEEN_MS.
  const halvingSeen = useRef<object | null>(null), halvingAnim = useRef<{ half: BoardHalf; at: number } | null>(null);
  const rewardSeen = useRef<object | null>(null), rewardAnim = useRef<{ tile: number; chain: number; amount: number; at: number } | null>(null);
  const twistSeen = useRef<object | null>(null), twistAnim = useRef<{ label: string; detail?: string; at: number } | null>(null);
  const biteSeen = useRef<object | null>(null), biteAnim = useRef<{ tile: number; amount: number; at: number } | null>(null);
  // Where the program slots were last drawn: a click runs one, a right-click discards it.
  const slotBoxes = useRef<{ x: number; y: number; w: number; h: number }[]>([]);
  // Programs picked up: each stays on its tile for half a second, then floats to its slot (presentation only; the slot is already loaded).
  const pickups = useRef<{ id: ProgramId; slot: number; tile: number; at: number }[]>([]), lastSlots = useRef<readonly ProgramId[] | null>(null);
  const [help, setHelp] = useState(false);
  const [ownBriefing, setOwnBriefing] = useState(true);
  const briefed = briefing === undefined ? !ownBriefing : !briefing;
  const endBriefing = () => { if (briefing === undefined) setOwnBriefing(false); else onBriefed?.(); };
  // Sandwich Attack: the board runs on real time. The loop ticks it (ten times a second, while open and the help page is closed)
  // through onAct; both are kept here so the loop always uses the latest. `lastTick`: when the loop last ticked (null: not ticking).
  const ticker = useRef({ onAct, help }); ticker.current = { onAct, help: help || (wallet !== "probing" && wallet.phase === "open" && !briefed) };
  // `anchor`: the real time the board's clock counts from (null while not ticking), so a state's clock maps to the real moment it
  // describes and the bots can be carried forward from there, whatever React's lag; `lastTick`: when the loop last ticked.
  const anchor = useRef<number | null>(null), lastTick = useRef<number | null>(null);
  const squeezeSeen = useRef<object | null>(null), squeezeAnim = useRef<{ tile: number; amount: number; at: number } | null>(null);
  const seizuresSeen = useRef(0);
  const blastSeen = useRef<object | null>(null), blastAnim = useRef<{ tile: number; amount: number; at: number } | null>(null);
  // While the help page is open it takes the keyboard: Esc closes it, and nothing reaches the board or the game behind it.
  useEffect(() => {
    if (!help) return;
    const onKey = (event: KeyboardEvent) => { event.stopImmediatePropagation(); if (event.code === "Escape") { event.preventDefault(); setHelp(false); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [help]);
  const size = wallet === "probing" ? 6 : wallet.tier.size;
  // A pyramid board (the Ponzi Scheme) keeps the isometric view but is drawn bigger (the pyramid is only 36 tiles) and centred on
  // its own extent rather than the full grid's. Only the projection changes; every drawing routine goes through `at`.
  const pyramid = wallet !== "probing" && !!wallet.tier.pyramid, firstRow = size - pyramidLevels(size);
  // Bigger boards get smaller tiles so the board keeps its width on screen.
  // The pyramid's isometric extent: (levels + 0.5) tiles wide from its left point to the base's right corner, and levels tile
  // heights tall from the apex's top corner to the bottom point.
  const band = WALLET_VIEW.bandBottom - WALLET_VIEW.bandTop;
  const tileW = pyramid ? 2 * Math.floor(Math.min(WALLET_VIEW.pyramidTile, (band - WALLET_VIEW.slab) * 2 / pyramidLevels(size), WALLET_VIEW.maxWidth / (pyramidLevels(size) + 0.5)) / 2) : walletTile(size), tileH = tileW / 2;
  const top = pyramid ? WALLET_VIEW.bandTop + (band - (pyramidLevels(size) * tileH + WALLET_VIEW.slab)) / 2 - (size - 1) / 2 * tileH : walletTop(size);
  // Shift the pyramid right so its own extent, not the grid's, is centred on the screen's middle.
  const shiftX = pyramid ? (size - 2) / 4 * tileW : 0;
  // Screen position of a grid corner (col, row may be fractional): columns run down-right, rows down-left.
  const at = (col: number, row: number): Point => ({ x: WALLET_VIEW.cx + shiftX + (col - row) * tileW / 2, y: top + (col + row) * tileH / 2 });
  const tileAtPointer = (px: number, py: number) => {
    const u = (px - WALLET_VIEW.cx - shiftX) / (tileW / 2), v = (py - top) / (tileH / 2);
    const col = Math.floor((u + v) / 2), row = Math.floor((v - u) / 2);
    return col >= 0 && row >= 0 && col < size && row < size ? row * size + col : -1;
  };
  const pointerAt = (event: { clientX: number; clientY: number; currentTarget: HTMLCanvasElement }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) * VIEW.width / rect.width, y = (event.clientY - rect.top) * VIEW.height / rect.height;
    return { index: tileAtPointer(x, y), x, y };
  };
  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    // The canvas is drawn at the resolution it is shown at (its CSS size times the device pixel ratio, up to 3 pixels a unit), not
    // stretched from 960 x 640, so text, lines and icons stay sharp. Everything is still drawn in VIEW units under that scale.
    let scale = 1, circuit = drawCircuit(size, at);
    const resize = () => {
      const next = Math.min(3, Math.max(1, (canvas.getBoundingClientRect().width / VIEW.width) * (window.devicePixelRatio || 1)));
      if (Math.abs(next - scale) < 0.01 && canvas.width === Math.round(VIEW.width * scale)) return;
      scale = next; canvas.width = Math.round(VIEW.width * scale); canvas.height = Math.round(VIEW.height * scale);
      circuit = drawCircuit(size, at, scale); boardSnap.current = null;
    };
    resize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize); observer?.observe(canvas);
    const wrap = (text: string, width: number) => {
      const lines: string[] = []; let line = "";
      for (const word of text.split(" ")) { const next = line ? `${line} ${word}` : word; if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next; }
      if (line) lines.push(line); return lines;
    };
    let frame = 0;
    const loop = (now: number) => {
      const { wallet: current, reducedMotion: still, belowHud: inGame } = live.current;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = "#160b08"; ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.fillStyle = "#f5e9d0"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.font = "bold 24px system-ui, sans-serif"; ctx.fillText("HACK THE HARDWARE WALLET", 480, 84); // title and subtitle lowered 0.2 cm (8 px), clear of the HUD buttons
      ctx.font = "13px ui-monospace, monospace"; ctx.fillText(current === "probing" ? "Find the Secure Chip" : `Find the Secure Chip · ${TWISTS[current.tier.twist].name}`, 480, 106);
      if (current === "probing") { ctx.font = "bold 16px ui-monospace, monospace"; ctx.fillText("Probing the wallet…", 480, 330); frame = requestAnimationFrame(loop); return; }
      const { tiles, tier } = current, n = tier.size, S = WALLET_VIEW.slab;
      const diamond = (col: number, row: number) => { const p = [at(col, row), at(col + 1, row), at(col + 1, row + 1), at(col, row + 1)]; ctx.beginPath(); p.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); };
      // A newly loaded slot starts a pickup from the tile that held the program (the probe: flipping or claiming it made it so). A
      // pickup whose slot no longer holds its program (run, discarded, drained, a new board) is dropped.
      const before = lastSlots.current; lastSlots.current = current.slots;
      if (before && current.slots !== before && current.slots.length > before.length) {
        const slot = current.slots.length - 1;
        pickups.current.push({ id: current.slots[slot], slot, tile: current.probe, at: now });
      }
      pickups.current = pickups.current.filter(p => current.slots[p.slot] === p.id && now - p.at < PICKUP_HOLD + PICKUP_FLY + PICKUP_FLASH);
      // A Validator's heal: its defenders' badges show the hit first (one HP lower) for HEAL_HOLD ms, then the healed HP with a "+1".
      if (current.healed && current.healed !== healSeen.current) { healSeen.current = current.healed; healAnim.current = { tiles: current.healed.tiles, at: now }; }
      const healT = healAnim.current ? now - healAnim.current.at : Infinity, healing = (index: number) => healT < HEAL_HOLD + HEAL_FLOAT && healAnim.current!.tiles.includes(index);
      // A Halving's sheen: full gold at once, fading through its last second, gone after HALVING_SHEEN_MS.
      if (current.halved && current.halved !== halvingSeen.current) { halvingSeen.current = current.halved; halvingAnim.current = { half: current.halved.half, at: now }; }
      if (current.moves === 0) { halvingSeen.current = null; halvingAnim.current = null; }
      const sheenLeft = halvingAnim.current ? HALVING_SHEEN_MS - (now - halvingAnim.current.at) : -1;
      const sheen = sheenLeft > 0 ? Math.min(1, sheenLeft / 1000) : 0;
      const shines = (index: number) => sheen > 0 && halfHolds(n, index, halvingAnim.current!.half);
      // On the Margin Call board Integrity is Equity, shown as a share of full; amounts in the floating texts follow suit.
      const equity = tier.twist === "margincall";
      const amount = (points: number) => (equity ? `${Math.round(points / tier.grit * 100)}% Equity` : `${points} Integrity`);
      // Sandwich Attack: tick the board on real time while it is open and the help page is closed; otherwise the bots stand still.
      if (tier.twist === "sandwich" && current.phase === "open" && !ticker.current.help) {
        if (lastTick.current === null) { lastTick.current = now; anchor.current = now - current.clock; }
        else if (now - lastTick.current >= 100) { const ms = now - lastTick.current; lastTick.current = now; ticker.current.onAct({ type: "tick", ms }); }
      } else { lastTick.current = null; anchor.current = null; }
      // Between ticks the bots are carried forward from the real moment the shown state describes, so they glide whatever the lag
      // between a tick and React showing its result (they sit at their last ticked spot under reduced motion). A stalled tab
      // (the reducer caps a tick at 500 ms) is re-anchored rather than letting them run ahead.
      let botsExtra = still || anchor.current === null ? 0 : now - (anchor.current + current.clock);
      if (botsExtra > 600 || botsExtra < 0) { anchor.current = now - current.clock; botsExtra = 0; }
      const bots = current.bots ? advanceBots(current, botsExtra)?.bots ?? current.bots : null;
      const onBotLine = (index: number) => !!bots && (bots.axis === "row" ? Math.floor(index / n) : index % n) === bots.line;
      const heldOn = (index: number) => pickups.current.find(p => p.tile === index && now - p.at < PICKUP_HOLD);
      // A lost board is wiped: it explodes in a flash, shards and fire, then stays gone behind the loss message.
      if (current.phase !== "lost") lostAt.current = null; else if (lostAt.current === null) lostAt.current = now;
      const wipedFor = lostAt.current === null ? -1 : (now - lostAt.current) / 1000;
      if (wipedFor >= 0 && !still) drawWipe(ctx, at, n, tileW, tileH, wipedFor, i => tiles[i].kind !== "void");
      // The Rug Pull: spot the moment it happens, then yank the old board off to the left (0.7 s) and drop the reset one in (0.55 s).
      if (current.moves === 0) pullAt.current = null;
      if (current.pulled && lastRug.current === 0) pullAt.current = now;
      lastRug.current = current.pulled ? 1 : 0;
      // A liquidation seizes the board the same way.
      if (current.seizures > seizuresSeen.current) { seizuresSeen.current = current.seizures; pullAt.current = now; }
      if (current.moves === 0) seizuresSeen.current = 0;
      const sincePull = pullAt.current === null ? 9 : (now - pullAt.current) / 1000, pullT = still ? 9 : sincePull, yanking = pullT < 0.7, dropping = pullT >= 0.7 && pullT < 1.25;
      // The board's extent on screen (the pyramid's own, on a pyramid board): for the yank, and to centre the twist lettering.
      const topY = pyramid ? at(Math.floor(n / 2), firstRow).y : at(0, 0).y, rightX = pyramid ? at(n, n - 1).x : at(n, 0).x;
      const area = { x: at(0, n).x - 16, y: topY - 30, w: rightX - at(0, n).x + 32, h: at(n, n).y - topY + S + 40 };
      if (wipedFor < 0 && yanking && boardSnap.current) {
        const e = (pullT / 0.7) ** 2, cx = area.x + area.w / 2, cy = area.y + area.h / 2;
        ctx.save(); ctx.translate(cx - e * 1250, cy + e * 70); ctx.rotate(-0.25 * e); ctx.translate(-cx, -cy);
        ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip(); ctx.drawImage(boardSnap.current, 0, 0, VIEW.width, VIEW.height); ctx.restore();
      }
      if (wipedFor < 0 && !yanking) {
      ctx.save();
      if (dropping) { const e = 1 - (1 - (pullT - 0.7) / 0.55) ** 3; ctx.translate(0, -(1 - e) * 360); ctx.globalAlpha = Math.min(1, e * 1.5); }

      // The slab: the board's two front faces, dithered on the left and dense on the right, for depth.
      const L = at(0, n), B = at(n, n), R = at(n, 0);
      const face = (a: Point, b: Point, fill: CanvasPattern | string) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x, b.y + S); ctx.lineTo(a.x, a.y + S); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.stroke(); };
      const pins = (a: Point, b: Point, count: number) => { for (let pin = 1; pin < count; pin++) { const t = pin / count, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t; ctx.fillStyle = CIRCUIT.gold; ctx.fillRect(Math.round(x - 1.5), Math.round(y + 3), 3, S - 5); } };
      if (tier.pyramid) {
        // A pyramid board: each tile with nothing in front of it (down-left or down-right) shows its own slab face, so the slab
        // follows the pyramid's stepped sides.
        const solid = (col: number, row: number) => col >= 0 && col < n && row >= 0 && row < n && tiles[row * n + col].kind !== "void";
        for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
          if (!solid(col, row)) continue;
          if (!solid(col, row + 1)) { face(at(col, row + 1), at(col + 1, row + 1), CIRCUIT.slabLeft); pins(at(col, row + 1), at(col + 1, row + 1), 3); }
          if (!solid(col + 1, row)) { face(at(col + 1, row + 1), at(col + 1, row), CIRCUIT.slabRight); pins(at(col + 1, row + 1), at(col + 1, row), 3); }
        }
      } else {
        face(L, B, CIRCUIT.slabLeft); face(B, R, CIRCUIT.slabRight);
        // Gold pins down both slab faces, like the legs of a chip package.
        pins(L, B, n * 3); pins(B, R, n * 3);
      }
      const order = tiles.map((_, index) => index).sort((a, b) => ((a % n) + Math.floor(a / n)) - ((b % n) + Math.floor(b / n)));
      // Flippable tiles' markers breathe between full and 40% over 1.1 s (steady under reduced motion), so they never vanish.
      const breath = still ? 1 : 0.7 + 0.3 * Math.sin(now * 2 * Math.PI / 1100);
      for (const index of order) {
        const tile = tiles[index], col = index % n, row = Math.floor(index / n), centre = at(col + 0.5, row + 0.5);
        if (tile.kind === "void") continue;
        const locked = isLocked(current, index), flippable = current.phase === "open" && canFlip(current, index);
        diamond(col, row);
        // A lying sector a Checksum caught is tinted red (its pips too, below).
        if (tile.revealed) { ctx.fillStyle = tile.exposed ? "#f7c4c0" : "#fff"; ctx.fill(); }
        else {
          // Face down: this tile's patch of the board-wide circuit; a locked tile is dimmed.
          ctx.save(); ctx.clip(); ctx.drawImage(circuit, 0, 0, VIEW.width, VIEW.height);
          if (locked) { ctx.fillStyle = "rgba(0, 0, 0, 0.55)"; ctx.fillRect(0, 0, VIEW.width, VIEW.height); }
          ctx.restore(); diamond(col, row);
        }
        ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.stroke();
        // The Halving's golden sheen over every tile of the half that holds the chip, under whatever stands on the tile.
        if (shines(index)) { ctx.save(); diamond(col, row); ctx.fillStyle = `rgba(255, 196, 40, ${0.55 * sheen})`; ctx.fill(); ctx.strokeStyle = `rgba(255, 230, 120, ${sheen})`; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); }
        // The sandwich bots' line is tinted gold while they run it.
        if (onBotLine(index)) { ctx.save(); diamond(col, row); ctx.fillStyle = "rgba(212, 175, 55, 0.22)"; ctx.fill(); ctx.restore(); }
        // Your tile (the probe, what the Viruses hunt) is outlined green, the keyboard cursor white and the hovered tile pale green.
        // Each is drawn inside its own tile, in the tile's turn, so the icons standing on the tiles in front stay in front of it.
        const outline = index === current.probe ? "#3fbf4f" : index === current.cursor ? "#fff" : index === hover.current.index ? "#c8f2c2" : "";
        if (outline) {
          ctx.save(); diamond(col, row); ctx.clip();
          ctx.strokeStyle = outline; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.stroke();
          ctx.restore();
        }
        if (!tile.revealed) {
          // What a Block Explorer showed, drawn faintly; a Honeypot (on the Honeypot Farm, any program too) glints.
          if (current.explored.includes(index)) {
            ctx.save(); ctx.globalAlpha = 0.55;
            const ghost = tileIcon(tile);
            if (ghost) drawWalletIcon(ctx, ghost, centre.x, centre.y + 4, ICON_SIZE);
            else { ctx.fillStyle = "#f5e9d0"; ctx.fillRect(Math.round(centre.x - 2), Math.round(centre.y - 2), 4, 4); }
            ctx.restore();
          }
          if (tile.kind === "honeypot" || (tier.twist === "honeyfarm" && tile.kind === "program")) drawGlint(ctx, centre.x + 8, centre.y - 6, still ? 0.5 : (Math.sin(now / 260 + index) + 1) / 2);
          if (locked) drawLockCross(ctx, at, col, row);
          else if (flippable) drawFlipMarker(ctx, at, col, row, breath);
          continue;
        }
        // A reading: pips along the diagonal, or a hollow "far" mark (red when a Checksum caught it lying). `small` is the compact one
        // beside a program's icon, on the tile's right.
        const reading = (small = false) => (isFrozen(current, index) && index !== current.start ? drawFrost(ctx, centre.x + (small ? 10 : 0), centre.y - 2) : drawReading(ctx, at, col, row, displayReading(current, tile), !!tile.beacon, !!tile.exposed, small));
        // A program tile shows its reading too: beside the program's icon (moved a little left) while it waits there, in the middle
        // once it is taken.
        const programIcon = (id: ProgramId) => { drawWalletIcon(ctx, id, centre.x - 7, centre.y + 4, ICON_SIZE); reading(true); };
        const held = heldOn(index);
        if (held) { if (tile.kind === "program") programIcon(held.id); else drawWalletIcon(ctx, held.id, centre.x, centre.y + 4, ICON_SIZE); continue; }
        if (tile.kind === "program") { if (tile.program) programIcon(tile.program); else reading(); continue; }
        if (index === current.start && tile.kind === "empty") drawWalletIcon(ctx, "usb", centre.x, centre.y + 4, ICON_SIZE);
        else if (tile.kind === "empty") {
          // The reading as the tile shows it now (pumped or dumped under Pump and Dump): pips along the diagonal, or a
          // hollow "far" mark; a seed word adds a small gold key. A sector the Exit Scam wiped shows nothing.
          if (!tile.blank) reading();
        } else {
          // Icons stand up on their tile like the world's sprites, feet near the tile's centre.
          // Defenders stand until beaten; attackers are spent the moment they show, so they are always drawn in greys.
          const icon = tileIcon(tile), dead = (isDefender(tile.kind) && tile.hp <= 0) || isAttacker(tile.kind);
          if (icon) drawWalletIcon(ctx, icon, centre.x, centre.y + 4, isDefender(tile.kind) || isAttacker(tile.kind) || tile.kind === "cold" ? ICON_SIZE * DEFENDER_ICON_SCALE : ICON_SIZE, dead);
          // A Cold Storage shows how many of its neighbours are revealed, toward its thaw.
          if (isFrozenCold(tile)) drawPixelBadge(ctx, `${coldRevealed(current, index)}/${COLD_THAW}`, centre.x + 9, centre.y - 30, "#e8f4ff", "#2b5a80");
          let atkLeft = centre.x + 9;
          if (isDefender(tile.kind)) {
            // Its HP in a white pixel badge, top right, and just left of it its attack (the strike-back it deals now) in a red one; a
            // beaten defender shows no badges at all.
            const shownHp = healing(index) && healT < HEAL_HOLD ? tile.hp - 1 : tile.hp;
            if (!dead) {
              drawPixelBadge(ctx, `${shownHp}`, centre.x + 9, centre.y - 30, "#fff", "#000", "#000");
              const atk = `${strikeBack(current, tile.kind as DefenderKind)}`;
              atkLeft = centre.x + 7 - pixelBadgeWidth(atk);
              drawPixelBadge(ctx, atk, atkLeft, centre.y - 30, "#d94f3c", "#fff", "#000");
            }
            // The "+1" pops above the badge and floats up as the heal lands.
            if (healing(index) && healT >= HEAL_HOLD) {
              const t = (healT - HEAL_HOLD) / HEAL_FLOAT;
              ctx.save(); ctx.globalAlpha = t > 0.6 ? (1 - t) / 0.4 : 1; ctx.textAlign = "center"; ctx.font = "bold 14px ui-monospace, monospace"; ctx.lineJoin = "round";
              const y = centre.y - 36 - (still ? 0 : t * 16);
              ctx.lineWidth = 4; ctx.strokeStyle = "#000"; ctx.strokeText("+1", centre.x + 18, y); ctx.fillStyle = "#3fbf4f"; ctx.fillText("+1", centre.x + 18, y);
              ctx.restore();
            }
            // A lit fuse: an orange pixel badge, top left, with the moves left before the alarm sounds.
            if (tile.kind === "alarm" && tile.hp > 0 && (tile.fuse ?? -1) > 0) drawPixelBadge(ctx, `${tile.fuse}`, Math.min(centre.x - 25, atkLeft - 2 - pixelBadgeWidth(`${tile.fuse}`)), centre.y - 30, "#ff8a2a", "#000");
          }
        }
      }
      // The Airdrop: free tokens on their tile, the bait every Virus heads for.
      if (current.airdrop >= 0) { const c = at(current.airdrop % n + 0.5, Math.floor(current.airdrop / n) + 0.5); drawWalletIcon(ctx, "airdrop", c.x, c.y + 4, ICON_SIZE); }
      // The hunt: each Virus's bite range (its tile and the four next to it) is tinted and outlined red, and the bug crawls between
      // tiles towards your probe (the green-outlined tile).
      if (current.viruses.length) {
        for (const v of current.viruses) for (const tile of [v.tile, ...gridNeighbours(n, v.tile)]) {
          diamond(tile % n, Math.floor(tile / n)); ctx.fillStyle = "rgba(226, 88, 62, 0.16)"; ctx.fill();
          ctx.strokeStyle = "rgba(226, 88, 62, 0.85)"; ctx.lineWidth = 2; ctx.stroke();
        }
      }
      const spot = (tile: number) => at(tile % n + 0.5, Math.floor(tile / n) + 0.5);
      if (current.trail.length === 1) crawl.current.clear(); // a fresh board: the Viruses start in place
      current.viruses.forEach((v, k) => {
        let move = crawl.current.get(k);
        if (!move || move.to !== v.tile) {
          const from = move ? move.to : v.tile, a = spot(from), b = spot(v.tile);
          move = { from, to: v.tile, at: now, down: from === v.tile ? (move?.down ?? false) : b.y > a.y };
          crawl.current.set(k, move);
        }
        // Crawl over 450 ms (at once under reduced motion); legs step quickly while moving and twitch slowly at rest.
        const t = still ? 1 : Math.min(1, (now - move.at) / 450), a = spot(move.from), b = spot(move.to);
        const legs = still ? 0 : Math.floor(now / (t < 1 ? 90 : 420)) % 2;
        drawVirus(ctx, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - 2, move.down, legs, 1.875);
      });
      for (const k of [...crawl.current.keys()]) if (k >= current.viruses.length) crawl.current.delete(k);
      // The Ponzi pyramid: each row's support at its left end (uncovered of needed), green once it supports the rows above.
      if (tier.pyramid) for (let level = 0; level < pyramidLevels(n); level++) {
        const row = n - 1 - level, have = pyramidRevealed(current, level), need = pyramidQuota(n, level), p = at(level - 0.55, row + 0.5);
        drawPixelBadge(ctx, `${have}/${need}`, p.x - 18, p.y - 10, have >= need ? "#c8f2c2" : "#f7c4c0", "#000");
      }
      // The Liquidator, standing on his tile.
      if (current.liquidator !== null) { const p = at(current.liquidator % n + 0.5, Math.floor(current.liquidator / n) + 0.5); drawWalletIcon(ctx, "liquidator", p.x, p.y + 4, ICON_SIZE); }
      // The sandwich bots: one in from each end of their line, gliding at each other (2 tiles a second).
      if (bots) {
        const spotOn = (c: number) => (bots.axis === "row" ? at(c + 0.5, bots.line + 0.5) : at(bots.line + 0.5, c + 0.5));
        for (const c of [bots.a, n - 1 - bots.b]) { const p = spotOn(c); drawWalletIcon(ctx, "sandwichbot", p.x, p.y + 4, ICON_SIZE); }
      }
      // A sandwich that hurt (gold) or a Difficulty Bomb going off (orange, with a burst of sparks): the tile flashes and the
      // Integrity it took floats up.
      if (current.sandwiched && current.sandwiched !== squeezeSeen.current) { squeezeSeen.current = current.sandwiched; squeezeAnim.current = { ...current.sandwiched, at: now }; }
      if (current.exploded && current.exploded !== blastSeen.current) { blastSeen.current = current.exploded; blastAnim.current = { ...current.exploded, at: now }; }
      for (const [hurt, tint, sparks] of [[squeezeAnim.current, "212, 175, 55", false], [blastAnim.current, "255, 138, 42", true]] as const) {
        const hurtT = hurt ? (now - hurt.at) / 1000 : 2;
        if (!hurt || hurtT >= 1.2) continue;
        const c = at(hurt.tile % n + 0.5, Math.floor(hurt.tile / n) + 0.5), fade = Math.max(0, 1 - hurtT / 1.2);
        diamond(hurt.tile % n, Math.floor(hurt.tile / n)); ctx.fillStyle = `rgba(${tint}, ${0.75 * fade})`; ctx.fill();
        if (sparks && !still) for (let i = 0; i < 12; i++) {
          const angle = i / 12 * Math.PI * 2, r = 6 + hurtT * 60;
          ctx.fillStyle = `rgba(${tint}, ${fade})`; ctx.fillRect(Math.round(c.x + Math.cos(angle) * r - 2), Math.round(c.y + Math.sin(angle) * r * 0.6 - 2), 4, 4);
        }
        ctx.save(); ctx.globalAlpha = fade; ctx.textAlign = "center"; ctx.font = "bold 18px ui-monospace, monospace"; ctx.lineJoin = "round";
        const ty = c.y - 24 - (still ? 0 : hurtT * 30);
        ctx.lineWidth = 4; ctx.strokeStyle = "#000"; ctx.strokeText(`-${amount(hurt.amount)}`, c.x, ty); ctx.fillStyle = "#ff8a80"; ctx.fillText(`-${amount(hurt.amount)}`, c.x, ty);
        ctx.restore();
      }
      ctx.restore();
      // Keep a snapshot of the settled board, for a Rug Pull to yank away.
      if (!dropping && (tier.twist === "rugpull" || tier.twist === "margincall")) {
        const snap = boardSnap.current ?? (boardSnap.current = Object.assign(document.createElement("canvas"), { width: canvas.width, height: canvas.height }));
        const sc = snap.getContext("2d")!; sc.clearRect(0, 0, snap.width, snap.height); sc.drawImage(canvas, 0, 0);
      }
      }
      // A twist striking (RUGPULL!!!, BUTCHERED!!!, ...): big red letters over the board for two seconds, popping in unless motion is
      // reduced, shrunk to fit the board's width. Twists are never announced before this moment.
      if (current.twistEvent && current.twistEvent !== twistSeen.current) { twistSeen.current = current.twistEvent; twistAnim.current = { label: current.twistEvent.label, detail: current.twistEvent.detail, at: now }; }
      const struck = twistAnim.current, sinceTwist = struck ? (now - struck.at) / 1000 : 9;
      if (struck && sinceTwist < 2.2) {
        const pop = still ? 1 : Math.min(1, 0.6 + sinceTwist * 2), fade = sinceTwist > 1.8 ? (2.2 - sinceTwist) / 0.4 : 1;
        ctx.save(); ctx.globalAlpha = Math.max(0, fade); ctx.translate(480, area.y + area.h / 2); ctx.rotate(still ? 0 : -0.06);
        ctx.textAlign = "center"; ctx.font = "900 72px system-ui, sans-serif"; ctx.lineJoin = "round";
        const fit = Math.min(1, 860 / ctx.measureText(struck.label).width); ctx.scale(pop * fit, pop * fit);
        ctx.lineWidth = 10; ctx.strokeStyle = "#000"; ctx.strokeText(struck.label, 0, 24); ctx.fillStyle = "#e0321f"; ctx.fillText(struck.label, 0, 24);
        // What the twist just did, in a line under the shout (PUMPED!!!: your Power is up).
        if (struck.detail) {
          ctx.font = "bold 24px ui-monospace, monospace"; ctx.lineWidth = 6;
          ctx.strokeText(struck.detail, 0, 70); ctx.fillStyle = "#fff"; ctx.fillText(struck.detail, 0, 70);
        }
        ctx.restore();
      }
      // A block reward: "Chain size 8. Integrity +1" pops in green over the tile you acted on and floats up (still under reduced
      // motion), above any bite text from the same move.
      if (current.chainReward && current.chainReward !== rewardSeen.current) { rewardSeen.current = current.chainReward; rewardAnim.current = { ...current.chainReward, at: now }; }
      const paid = rewardAnim.current, paidT = paid ? (now - paid.at) / 1000 : 9;
      if (paid && paidT < 1.6) {
        const c = at(paid.tile % n + 0.5, Math.floor(paid.tile / n) + 0.5), fade = paidT > 1.1 ? Math.max(0, (1.6 - paidT) / 0.5) : 1;
        const pop = still ? 1 : paidT < 0.15 ? 0.6 + paidT / 0.15 * 0.55 : Math.max(1, 1.15 - (paidT - 0.15) * 1.5);
        const label = `Chain size ${paid.chain}. ${paid.amount > 0 ? `+${amount(paid.amount)}` : equity ? "Equity full" : "Integrity full"}`;
        ctx.font = "bold 18px ui-monospace, monospace";
        const half = ctx.measureText(label).width / 2 + 10, x = Math.max(half, Math.min(VIEW.width - half, c.x));
        ctx.save(); ctx.globalAlpha = fade; ctx.translate(x, c.y - 44 - (still ? 0 : paidT * 34)); ctx.scale(pop, pop);
        ctx.textAlign = "center"; ctx.lineJoin = "round";
        ctx.lineWidth = 4; ctx.strokeStyle = "#000"; ctx.strokeText(label, 0, 0); ctx.fillStyle = "#3fbf4f"; ctx.fillText(label, 0, 0);
        ctx.restore();
      }
      // A Virus bite: the probe's tile flashes red, the bug bursts into red bits and the Integrity it took floats up.
      if (current.bite && current.bite !== biteSeen.current) { biteSeen.current = current.bite; biteAnim.current = { ...current.bite, at: now }; }
      const bitten = biteAnim.current, biteT = bitten ? (now - bitten.at) / 1000 : 2;
      if (bitten && biteT < 1.2) {
        const c = at(bitten.tile % n + 0.5, Math.floor(bitten.tile / n) + 0.5), fade = Math.max(0, 1 - biteT / 1.2);
        diamond(bitten.tile % n, Math.floor(bitten.tile / n)); ctx.fillStyle = `rgba(217, 79, 60, ${0.75 * fade})`; ctx.fill();
        if (!still) for (let i = 0; i < 14; i++) {
          const angle = i / 14 * Math.PI * 2, r = 8 + biteT * 70;
          ctx.fillStyle = `rgba(217, 79, 60, ${fade})`; ctx.fillRect(Math.round(c.x + Math.cos(angle) * r - 2), Math.round(c.y + Math.sin(angle) * r * 0.6 - 2), 4, 4);
        }
        ctx.save(); ctx.globalAlpha = fade; ctx.textAlign = "center"; ctx.font = "bold 18px ui-monospace, monospace";
        const ty = c.y - 24 - (still ? 0 : biteT * 30);
        ctx.lineWidth = 4; ctx.strokeStyle = "#000"; ctx.strokeText(`-${amount(bitten.amount)}`, c.x, ty); ctx.fillStyle = "#ff8a80"; ctx.fillText(`-${amount(bitten.amount)}`, c.x, ty);
        ctx.restore();
      }
      // Readout: Integrity and Power top left, starting below the title and subtitle, Trace in the bottom left corner (in the game
      // just above the runtime's Friend and wallet bar), and the Flash Loan line a clear gap above Trace once one is found.
      // Top left: Integrity and its bar, the chain line under it, then Power. Bottom left, from the bottom up: the trace and its
      // bar, the program slots and their label above it, and the status lines above those.
      const gy = 80, ty = (inGame ? 528 : 568) + 19; // the trace sits 0.5 cm (19 px) lower than the earlier layout
      ctx.textAlign = "left"; ctx.font = "bold 14px ui-monospace, monospace"; ctx.fillStyle = "#f5e9d0";
      ctx.fillText(equity ? `EQUITY ${Math.round(equityOf(current) * 100)}%` : `INTEGRITY ${current.grit} / ${tier.grit}`, 24, gy);
      // Integrity drains and the trace fills; both run green, yellow, orange then red by quarters used, and blink with 3 left.
      const bandColour = (left: number, full: number) => { const used = 1 - left / full; return used < 0.25 ? "#3fbf4f" : used < 0.5 ? "#f2d43c" : used < 0.75 ? "#ff8a2a" : "#d94f3c"; };
      const blink = (left: number) => left <= 3 && !still && Math.floor(now / 300) % 2 === 1;
      ctx.fillStyle = "#3a2a20"; ctx.fillRect(24, gy + 8, 150, 10);
      // The Equity bar is green above the margin call (60%), orange down to forced selling (40%) and red below; the Integrity bar
      // runs its usual quarters.
      const equityColour = equityOf(current) > EQUITY.margin ? "#3fbf4f" : equityOf(current) > EQUITY.forced ? "#ff8a2a" : "#d94f3c";
      ctx.fillStyle = blink(current.grit) ? "#ff8a80" : equity ? equityColour : bandColour(current.grit, tier.grit); ctx.fillRect(24, gy + 8, Math.max(0, Math.min(150, Math.round(150 * current.grit / tier.grit))), 10);
      // The Equity bar's thresholds: an orange line at the margin call (60%) and a red one at forced selling (40%), each a
      // two-pixel bar standing a little proud of the bar's top and bottom.
      if (equity) for (const [share, colour] of [[EQUITY.margin, "#ff8a2a"], [EQUITY.forced, "#d94f3c"]] as const) {
        const x = 24 + Math.round(150 * share);
        ctx.fillStyle = "#000"; ctx.fillRect(x - 2, gy + 5, 4, 16); ctx.fillStyle = colour; ctx.fillRect(x - 1, gy + 6, 2, 14);
      }
      // The chain, in green, under the Integrity bar: the longest route through your uncovered tiles, and the length that pays
      // the next block reward.
      ctx.font = "bold 13px ui-monospace, monospace"; ctx.fillStyle = "#3fbf4f";
      ctx.fillText(`CHAIN SIZE ${current.chain} · +${amount(tier.blockReward).toUpperCase()} AT ${(current.chainPaid + 1) * tier.chainStep}`, 24, gy + 40);
      ctx.font = "bold 14px ui-monospace, monospace";
      const power = effectivePower(current);
      const py = gy + 62 + 9; // Power sits 0.25 cm (9 px) below the chain line's natural spot
      ctx.fillStyle = "#f5e9d0"; ctx.fillText(`POWER ${power}`, 24, py);
      // Program slots, just above the trace: a box per slot with its program's icon (gold while it waits for a tile), numbered for
      // the keys.
      const sy = ty - 64 - 19; // the slots sit 0.5 cm (19 px) higher than just above the trace, for a clear gap
      ctx.fillStyle = "#f5e9d0"; ctx.fillText("PROGRAMS", 24, sy - 6);
      slotBoxes.current = [];
      for (let i = 0; i < current.slotLimit; i++) {
        const box = { x: 24 + i * 48, y: sy, w: 42, h: 42 }, id = current.slots[i];
        slotBoxes.current.push(box);
        ctx.fillStyle = "#2a1a12"; ctx.fillRect(box.x, box.y, box.w, box.h);
        ctx.strokeStyle = id && current.targeting === id ? "#ffe08a" : "#5a4636"; ctx.lineWidth = id && current.targeting === id ? 3 : 2; ctx.strokeRect(box.x, box.y, box.w, box.h);
        // A slot whose program is still on its way stays empty until it lands, then flashes white.
        const coming = pickups.current.find(p => p.slot === i), since = coming ? now - coming.at : Infinity, lands = PICKUP_HOLD + (still ? 0 : PICKUP_FLY);
        if (id && since >= lands) drawWalletIcon(ctx, id, box.x + box.w / 2 + 2, box.y + 34, 27);
        if (coming && since >= lands && since < lands + PICKUP_FLASH) { ctx.strokeStyle = `rgba(255, 255, 255, ${1 - (since - lands) / PICKUP_FLASH})`; ctx.lineWidth = 3; ctx.strokeRect(box.x, box.y, box.w, box.h); }
        ctx.font = "10px ui-monospace, monospace"; ctx.fillStyle = "#b8a890"; ctx.textAlign = "left"; ctx.fillText(`${i + 1}`, box.x + 3, box.y + 11); ctx.font = "bold 14px ui-monospace, monospace";
      }
      // Programs in flight, over everything: an eased arc from the tile's centre up to the slot (reduced motion: they land at once).
      for (const p of pickups.current) {
        const t = (now - p.at - PICKUP_HOLD) / PICKUP_FLY, box = slotBoxes.current[p.slot];
        if (t < 0 || t >= 1 || still || !box) continue;
        const e = 1 - (1 - t) ** 3, from = at(p.tile % n + 0.5, Math.floor(p.tile / n) + 0.5), to = { x: box.x + box.w / 2, y: box.y + 30 };
        drawWalletIcon(ctx, p.id, from.x + (to.x - from.x) * e, from.y + 4 + (to.y - from.y - 4) * e - Math.sin(e * Math.PI) * 60, ICON_SIZE);
      }
      // The trace fills up: each flip advances it, running green, yellow, orange and red by quarters of the limit; when it is full
      // before the Secure Chip cracks (found or not), the kill switch fires. The last 3 steps blink. "TRACING" gets cycling dots (in a fixed-width
      // slot so the numbers stay put, steady under reduced motion) until the trace completes.
      const traced = Math.min(current.trace, tier.traceLimit), traceLeft = tier.traceLimit - traced;
      const dots = still ? "..." : ".".repeat(1 + Math.floor(now / 400) % 3).padEnd(3, " ");
      ctx.fillStyle = "#f5e9d0"; ctx.fillText(traceLeft > 0 ? `TRACING${dots} ${traced} / ${tier.traceLimit}` : `TRACE COMPLETE ${traced} / ${tier.traceLimit}`, 24, ty);
      ctx.fillStyle = "#3a2a20"; ctx.fillRect(24, ty + 8, 150, 10);
      ctx.fillStyle = blink(traceLeft) ? "#ff8a80" : bandColour(traceLeft, tier.traceLimit); ctx.fillRect(24, ty + 8, Math.round(150 * traced / tier.traceLimit), 10);
      // Status lines above the program slots: programs running, and a twist's lasting effect, only once it has struck. They stay
      // inside the bottom-left corner, left of the hover panel (which starts at 25% of the width), so the two never overlap:
      // lines are wrapped to that column and stacked upward.
      const column = VIEW.width / 4 - 24 - 10;
      const status: [string, string][] = [];
      // A targeted program waiting for a tile; the Block Explorer shows its picks left (all of them, before the first is spent).
      const owed = current.explorerPicks || (current.targeting === "explorer" ? explorerPicks(n) : 0);
      if (current.targeting) status.push([`${PROGRAMS[current.targeting].name.toUpperCase()}: PICK A TILE${owed > 1 ? ` (${owed} LEFT)` : ""}`, "#ffe08a"]);
      if (current.flashloan) status.push(["FLASH LOAN ARMED", "#3fbf4f"]);
      if (current.multisig) status.push([`MULTISIG x${current.multisig}`, "#b04fd9"]);
      const tw = tier.twist, struckBy = (key: string) => current.fired.includes(key);
      if (tw === "pumpdump" && (struckBy("pump") || struckBy("dump"))) status.push([struckBy("dump") ? "DUMPED: POWER 1" : "PUMPED: POWER 4", struckBy("dump") ? "#ff8a80" : "#3fbf4f"]);
      if (tw === "butchering" && current.butchered) status.push([`BUTCHERED: ${current.slotLimit} SLOT${current.slotLimit === 1 ? "" : "S"} LEFT`, "#ff8a80"]);
      if (sheen > 0) status.push([`HALVING: THE CHIP IS IN THE ${halvingAnim.current!.half.toUpperCase()} HALF`, "#ffd75e"]);
      if (tw === "sandwich" && current.clock < current.slippageUntil) status.push([`LOW SLIPPAGE: ${Math.ceil((current.slippageUntil - current.clock) / 1000)}S LEFT`, "#3fbf4f"]);
      if (tw === "frontrun") status.push([current.priority ? "PRIORITY GAS: +1 TRACE A MOVE, NOTHING FRONT-RUN" : "NORMAL GAS: REWARDS CAN BE FRONT-RUN", current.priority ? "#3fbf4f" : "#ffd75e"]);
      if (tw === "drainer" && current.drained) status.push(["DRAINED: NO VALUABLES LEFT", "#ff8a80"]);
      if (gasMovesLeft(current) > 0) status.push([`GAS SPIKE: FLIPS COST ${GAS_COST} TRACE (${gasMovesLeft(current)} MOVE${gasMovesLeft(current) === 1 ? "" : "S"} LEFT)`, "#ff8a2a"]);
      if (tier.pyramid) { const held = Array.from({ length: pyramidLevels(n) }, (_, level) => pyramidSupported(current, level)).filter(Boolean).length; status.push([`PYRAMID: ${held} OF ${pyramidLevels(n)} ROWS SUPPORTED`, held === pyramidLevels(n) ? "#3fbf4f" : "#d9b048"]); }
      if (marginCallOpen(current)) status.push([`MARGIN CALL: RIGHT-CLICK A PROGRAM TO SELL, +${Math.round(EQUITY.sale * 100)}% EQUITY (${EQUITY.sales - current.sales} LEFT)`, "#ffd75e"]);
      if (tw === "margincall" && current.forced > 0) status.push([`FORCED SELLING: ${EQUITY.forcedTimes - current.forced} LEFT`, "#ff8a80"]);
      if (tw === "margincall" && current.liquidator !== null) status.push([equityOf(current) <= EQUITY.forced ? `THE LIQUIDATOR: ${gridDistance(n, current.liquidator, current.probe)} TILES AWAY` : "THE LIQUIDATOR WAITS", equityOf(current) <= EQUITY.forced ? "#ff8a80" : "#ffd75e"]);
      // The Flash Crash: announced the move before with a red flicker, then counted down.
      if (flashCrashing(current)) status.push([`FLASH CRASH: POWER 1, HITS DOUBLED (${flashLeft(current)} MOVE${flashLeft(current) === 1 ? "" : "S"} LEFT)`, "#ff8a80"]);
      else if (flashLooming(current)) status.push(["FLASH CRASH NEXT MOVE", still || Math.floor(now / 250) % 2 === 0 ? "#ff8a80" : "#ffd75e"]);
      ctx.textAlign = "left"; ctx.font = "bold 12px ui-monospace, monospace";
      // The newest status lines lowest, wrapped to the column, the oldest dropped first.
      const stack = status.slice(-4).flatMap(([line, colour]) => wrap(line, column).map(text => [text, colour] as const));
      stack.forEach(([text, colour], i) => { ctx.fillStyle = colour; ctx.fillText(text, 24, sy - 28 - (stack.length - 1 - i) * 16); });
      // The loss message, centred where the board was, once the explosion has cleared (at once under reduced motion).
      if (wipedFor >= 0 && (still || wipedFor > 0.9)) {
        ctx.save(); ctx.globalAlpha = still ? 1 : Math.min(1, (wipedFor - 0.9) / 0.3);
        const boxW = 520, boxH = 112, bx = 480 - boxW / 2, by = 300 - boxH / 2;
        ctx.fillStyle = "#2a0d0d"; ctx.fillRect(bx, by, boxW, boxH); ctx.strokeStyle = "#d94f3c"; ctx.lineWidth = 3; ctx.strokeRect(bx, by, boxW, boxH);
        ctx.textAlign = "center"; ctx.fillStyle = "#ff8a80"; ctx.font = "bold 26px system-ui, sans-serif"; ctx.fillText("WALLET WIPED", 480, by + 44);
        ctx.fillStyle = "#f5e9d0"; ctx.font = "15px ui-monospace, monospace";
        wrap(equity ? lossReason(current.lostBy).replace(/Integrity/g, "Equity") : lossReason(current.lostBy), boxW - 40).slice(0, 2).forEach((line, i) => ctx.fillText(line, 480, by + 76 + i * 20));
        ctx.restore();
      }
      // Hover panel: the hovered tile's explanation in a fixed box centred under the board, clear of both margins.
      // A hovered program slot explains its program in the same panel.
      const hovered = hover.current.index, { x: hx, y: hy } = hover.current;
      const slotHovered = slotBoxes.current.findIndex(box => hx >= box.x && hx <= box.x + box.w && hy >= box.y && hy <= box.y + box.h);
      const slotId = slotHovered >= 0 ? current.slots[slotHovered] : undefined;
      const hoverText = slotHovered >= 0
        ? (slotId ? `${PROGRAMS[slotId].name}: ${PROGRAMS[slotId].rule} Click or press ${slotHovered + 1} to run${PROGRAMS[slotId].target ? ", then click a tile" : ""}; right-click to ${marginCallOpen(current) ? `sell it for +${Math.round(EQUITY.sale * 100)}% Equity (margin call)` : "discard"}.` : `Empty program slot ${slotHovered + 1}. Programs you find on the board load here.`)
        : hovered >= 0 && hovered < tiles.length ? walletTileHelp(current, hovered) : "";
      // The hover panel is HTML over the canvas: text drawn into the scaled, pixelated canvas lost rows and looked cropped.
      const tip = tipRef.current, shown = hoverText && current.phase === "open" ? hoverText : "";
      if (tip) {
        ctx.font = "13px ui-monospace, monospace";
        const lines = shown ? wrap(shown, 456).length : 0, below = Math.max(at(0, size).y, at(size, size).y) + WALLET_VIEW.slab + 14;
        // Under the board (it moves with it), but never past the bottom of the screen on the biggest boards.
        const place = below + lines * 18 + 18 > VIEW.height - 6 ? `b${lines}` : `t${Math.round(below)}`;
        if (tip.textContent !== shown) tip.textContent = shown;
        tip.hidden = !shown;
        if (tip.dataset.place !== place) {
          tip.dataset.place = place;
          tip.style.top = place[0] === "t" ? `${below / VIEW.height * 100}%` : "";
          tip.style.bottom = place[0] === "b" ? `${6 / VIEW.height * 100}%` : "";
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [size, name, pyramid]);
  const open = wallet !== "probing" && wallet.phase === "open";
  return <div className="outlaw-wallet">
    <canvas ref={canvasRef} width={VIEW.width} height={VIEW.height} aria-label="Hack the Hardware Wallet"
      onPointerMove={event => { hover.current = pointerAt(event); }}
      onPointerLeave={() => { hover.current = { index: -1, x: 0, y: 0 }; }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        const { index, x, y } = pointerAt(event), slot = slotBoxes.current.findIndex(box => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h);
        if (open && slot >= 0) { onAct({ type: "run", slot }); return; }
        if (open && index >= 0) onAct({ type: "act", index });
      }}
      onContextMenu={event => {
        // Right-click a program slot to discard its program.
        const { x, y } = pointerAt(event), slot = slotBoxes.current.findIndex(box => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h);
        // Under a margin call the right-click sells the program instead.
        if (slot >= 0) { event.preventDefault(); if (open) onAct(marginCallOpen(wallet) ? { type: "sell", slot } : { type: "discard", slot }); }
      }} />
    <div ref={tipRef} className="outlaw-wallet-tip" hidden />
    <div className={belowHud ? "outlaw-wallet-controls outlaw-wallet-controls-high" : "outlaw-wallet-controls"}>
      {/* During play the latest message is for screen readers only (the hover panel explains tiles); a finished board shows its result. */}
      <p role="status" className={open ? "outlaw-live" : undefined}>{wallet === "probing" ? "Probing the wallet…" : wallet.text}</p>

      {/* Front-Running: the gas toggle. Priority gas costs +1 trace a move and keeps every program and block reward from the Front Runner. */}
      {open && wallet.tier.twist === "frontrun" && <button type="button" className={wallet.priority ? "rf-frame-primary" : undefined} aria-pressed={wallet.priority}
        title="Priority gas costs +1 trace on every flip, attack or claim; at normal gas the Front Runner takes any program or block reward a move would give you."
        onClick={() => onAct({ type: "gas" })}>{wallet.priority ? "Priority gas: on (+1 trace)" : "Priority gas: off"} · G</button>}
      {/* Once the board has ended in any way, its close button sits below the board, under the result. */}
      {!help && !open && wallet !== "probing" && closeLabel !== null && <button type="button" className="rf-frame-primary" onClick={onClose}>{closeLabel} · Esc</button>}
    </div>
    {/* Top right: Give up while the board is open. */}
    {!help && open && <button type="button" className={belowHud ? "outlaw-wallet-giveup outlaw-wallet-giveup-low" : "outlaw-wallet-giveup"}
      onClick={() => onAct({ type: "giveUp" })}>Give up · Esc</button>}
    {wallet !== "probing" && wallet.phase === "open" && !briefed && !help && <WalletBriefing tier={wallet.tier} name={name} onStart={endBriefing} />}
    {wallet !== "probing" && !help && <button type="button" className="outlaw-wallet-help-button" aria-label="How to hack the wallet" onClick={() => setHelp(true)}>?</button>}
    {wallet !== "probing" && help && <WalletHelp tier={wallet.tier} onClose={() => setHelp(false)} />}
  </div>;
}


type Wanted = { name: string; members: { name: string; variant: number }[] };
/** A shop poster drawn from the wanted outlaw's own sprite (both portraits for Pumper & Dumper). */
/** A hung poster shown full size in its original upright shape, cross and all. */
function PosterView({ poster }: { poster: Poster }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => { const ctx = canvasRef.current?.getContext("2d"); if (ctx) drawCaughtPoster(ctx, poster.name, poster.variant, 216, 270, poster.stars); }, [poster]);
  return <figure className="outlaw-poster"><canvas ref={canvasRef} width={216} height={270} style={{ width: "min(346px, 78vw)", height: "auto", imageRendering: "pixelated" }} role="img" aria-label={`Wanted poster: ${poster.name}, crossed out${poster.stars ? `, hacked with ${poster.stars} of 3 stars` : ""}`} /></figure>;
}

/** The wanted poster's size in its own units: wider for a pair (Pumper & Dumper). */
const wantedSize = (wanted: Wanted) => ({ width: 120 + wanted.members.length * 120, height: 196 });
/** Paint the wanted poster: title, a portrait frame per member with the figure centred in it, then each name below its frame. */
function paintWanted(ctx: CanvasRenderingContext2D, wanted: Wanted) {
  const { width, height } = wantedSize(wanted), frame = { top: 56, size: 96 };
  {
    ctx.fillStyle = "#f3e6c4"; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#000"; ctx.lineWidth = 4; ctx.strokeRect(6, 6, width - 12, height - 12);
    ctx.lineWidth = 1; ctx.strokeRect(14, 14, width - 28, height - 28);
    ctx.fillStyle = "#000"; ctx.textAlign = "center";
    ctx.font = "bold 26px ui-monospace, monospace"; ctx.fillText("WANTED", width / 2, 44);
    wanted.members.forEach((member, index) => {
      const cx = width / 2 + (index - (wanted.members.length - 1) / 2) * 120;
      ctx.fillStyle = "#fff"; ctx.fillRect(cx - frame.size / 2, frame.top, frame.size, frame.size);
      ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.strokeRect(cx - frame.size / 2, frame.top, frame.size, frame.size);
      // The largest cell (up to 4 px) that fits the mask and its halo in the frame, then centred: a mask of h rows anchored at y
      // spans y - (h - 1) × cell to y + cell, so its middle is y - (h - 2) × cell / 2.
      const art = outlawArt(member.name, member.variant), rows = art.rows.length, cols = art.rows[0].length;
      const cell = Math.max(1, Math.min(4, Math.floor(frame.size / Math.max(rows + 2, cols + 2))));
      drawMask(ctx, art.rows, cx, Math.round(frame.top + frame.size / 2 + (rows - 2) * cell / 2), cell, false, "#fff", art.accent, true, art.colours);
      ctx.fillStyle = "#000"; ctx.font = "bold 12px ui-monospace, monospace"; ctx.fillText(member.name, cx, frame.top + frame.size + 18);
    });
  }
}
/** The poster on the signpost, painted once per wanted wave. */
const wantedBitmaps = new Map<string, HTMLCanvasElement>();
function wantedBitmap(wanted: Wanted): HTMLCanvasElement {
  const cached = wantedBitmaps.get(wanted.name); if (cached) return cached;
  const { width, height } = wantedSize(wanted), canvas = document.createElement("canvas"); canvas.width = width * 2; canvas.height = height * 2;
  const ctx = canvas.getContext("2d")!; ctx.scale(2, 2); paintWanted(ctx, wanted);
  wantedBitmaps.set(wanted.name, canvas); return canvas;
}
/** The signpost beside the Centralised Exchange: right of its front, clear of the door. */
/** The wanted signpost stands in the open ground south-east of the horse's spot beside the starting point (where you begin and where
 * every hack sends you back), off the road and in view from there. */
const WANTED_SIGN: WorldPoint = [spawn[0] + 87, spawn[1] - 7];
const WANTED_SIGN_REACH = 110; // world units: close enough for its "read" label and the V key

/** The wanted poster, drawn at `scale` (the signpost's close-up view shows it larger). */
function WantedPoster({ wanted, scale = 1 }: { wanted: Wanted; scale?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { width, height } = wantedSize(wanted), density = 2;
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(density * scale, 0, 0, density * scale, 0, 0); paintWanted(ctx, wanted);
  }, [wanted, scale]);
  return <figure className="outlaw-poster">
    <canvas ref={canvasRef} width={width * density * scale} height={height * density * scale} style={{ width: width * scale, maxWidth: "100%" }} role="img" aria-label={`Wanted poster: ${wanted.name}`} />
    <figcaption>Wanted: <strong>{wanted.name}</strong> {"\u00b7"} last seen wandering the country</figcaption>
  </figure>;
}

// ---------------------------------------------------------------------------
// Game component
// ---------------------------------------------------------------------------

type Menu = "shop" | "inventory" | "settings" | "rules" | "achievements" | "charger" | "mint" | "vault" | "settlement" | "licence" | null;

/** Only the requested game. The SDK runtime supplies the selected owned Friend
 * and the fixed preview/live client. */
export default function RarefriendOutlaw({ friendId, client, paused }: GameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Device pixels per VIEW unit the world canvas is drawn at (see the fit effect below): 1 when it is simply stretched. */
  const worldScale = useRef(1);
  const mover = useRef<ReturnType<typeof createMovement> | null>(null);
  const camera = useRef<Point>({ x: 0, y: 0 });
  /** The minimap is enlarged (M, or a tap on it); the pointer's spot over the world canvas in VIEW units, for its captions. */
  const bigMap = useRef(false), pointer = useRef<Point | null>(null);
  // Pixel-exact world canvas. Stretched by CSS with nearest-neighbour scaling to a size that is not a whole multiple of 960 x 640
  // (the frame shows it at 958 x 638), the browser drops or doubles a few pixel columns and rows, and every line of art that
  // scrolls across one of them jumps: a visible judder while walking. So when a whole number of device pixels per VIEW unit gives
  // a size within 3% of the space (1x or 2x on most screens), the canvas is drawn at that resolution and shown at exactly that
  // size, centred, the odd pixel at the edge cropped. Otherwise it keeps stretching to fit, as before.
  useEffect(() => {
    const canvas = canvasRef.current, box = canvas?.parentElement;
    if (!canvas || !box) return;
    const fit = () => {
      const rect = box.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      if (!rect.width || !rect.height) return;
      const k = Math.max(1, Math.round(Math.min(rect.width / VIEW.width, rect.height / VIEW.height) * dpr));
      const w = VIEW.width * k / dpr, h = VIEW.height * k / dpr;
      const exact = Math.abs(w - rect.width) <= rect.width * 0.03 && Math.abs(h - rect.height) <= rect.height * 0.03;
      const scale = exact ? k : 1;
      if (canvas.width !== VIEW.width * scale) { canvas.width = VIEW.width * scale; canvas.height = VIEW.height * scale; }
      worldScale.current = scale;
      Object.assign(canvas.style, exact
        ? { width: `${w}px`, height: `${h}px`, left: `${(rect.width - w) / 2}px`, top: `${(rect.height - h) / 2}px`, right: "auto", bottom: "auto" }
        : { width: "", height: "", left: "", top: "", right: "", bottom: "" });
    };
    fit();
    const observer = new ResizeObserver(fit); observer.observe(box);
    let media: MediaQueryList | null = null;
    const watch = () => { media?.removeEventListener("change", onDpr); media = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`); media.addEventListener("change", onDpr); };
    const onDpr = () => { fit(); watch(); };
    watch();
    return () => { observer.disconnect(); media?.removeEventListener("change", onDpr); };
  }, []);
  const npcs = useRef<Npc[]>([]);
  const respawns = useRef<{ kind: "outlaw" | "animal"; species?: AnimalId; at: number }[]>([]);
  const effects = useRef<{ position: WorldPoint; start: number }[]>([]);
  const contactCooldown = useRef(0);
  const sceneRef = useRef<Scene>("outside");
  const [inside, setInside] = useState<BuildingKind | null>(null);
  const [status, setStatus] = useState("Loading the country and your Friend…");
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [riding, setRiding] = useState(false);
  const horses = useRef<Horse[]>([]);
  /** The Cold Storage's three frozen Friends: CRYO_FRIEND_IDS' canonical art, read once per session. */
  const cryoFriends = useRef<(GenerationSprites | null)[]>([null, null, null]);
  const ridden = () => horses.current.find(mount => mount.mounted);
  /** Outlaw Points, and whether the permanent Trojan Horse has been bought (it then always stands somewhere in the world). */
  const [op, setOp] = useState(0);
  const [permanentHorse, setPermanentHorse] = useState(PLAYTEST_START_HORSE);
  const discovered = useRef<Discovered>(freshDiscovery());
  const [wallet, setWallet] = useState<{ npcId: number; name?: string; state: WalletState | "probing" } | null>(null);
  // Sound (audio.ts): one player for the session, switched on by the first click, tap or key; Settings mutes it or sets its volume.
  const audio = useRef<ReturnType<typeof createOutlawAudio> | null>(null);
  if (!audio.current) audio.current = createOutlawAudio();
  // Music volume 0.5 is the music's designed level; it starts a little under that (0.37, about 2.5 dB quieter).
  const [soundOn, setSoundOn] = useState(true), [soundVolume, setSoundVolume] = useState(0.7), [musicOn, setMusicOn] = useState(true), [musicVolume, setMusicVolume] = useState(0.37);
  useEffect(() => { audio.current?.setMuted(!soundOn); audio.current?.setVolume(soundVolume); audio.current?.setMusic(musicOn); audio.current?.setMusicVolume(musicVolume); }, [soundOn, soundVolume, musicOn, musicVolume]);
  // A hardware wallet's board plays Trace; closing it hands back to the country's music (the frame loop picks the mood).
  useEffect(() => { if (wallet) audio.current?.setMusicMood("hack"); }, [wallet]);
  useEffect(() => () => audio.current?.dispose(), []);
  // The hacking board's cues come from comparing each new board state with the last: a tile uncovered plucks the note of the chain's
  // size, hitting a defender smashes brick (its instant strike-back included), other lost Integrity is a thud, a new twist event
  // is its stinger, and a cracked wallet plays the win flourish.
  const lastBoard = useRef<WalletState | null>(null);
  useEffect(() => {
    const next = wallet && wallet.state !== "probing" ? wallet.state : null, before = lastBoard.current;
    lastBoard.current = next;
    if (!next) return;
    if (!before || before === next) return;
    const player = audio.current!, revealed = (board: WalletState) => board.tiles.filter(tile => tile.revealed).length;
    // A defender hit: its HP dropped (a strike-back lands at the same moment, so the smash stands for both).
    const hit = next.tiles.findIndex((tile, index) => isDefender(tile.kind) && before.tiles[index]?.kind === tile.kind && tile.hp < before.tiles[index].hp);
    if (next.twistEvent && next.twistEvent !== before.twistEvent) player.play("twist");
    else if (next.phase === "won" && before.phase !== "won") player.play("win");
    else if (hit >= 0) player.play("smash", { heavy: next.tiles[hit].hp <= 0 });
    else if (next.grit < before.grit) player.play("strike");
    // The flip's note is the chain's size: it climbs when the chain grows and repeats the last note when it does not.
    else if (revealed(next) > revealed(before)) player.play("flip", { step: Math.max(0, next.chain - 1) });
  }, [wallet]);
  const walletSettled = useRef(-1); // npcId whose wallet outcome has been paid out or closed, guarding against double awards
  // The "neutralized" dialog: the belongings list, then the kill-switch warning, then (after "Heck no") the voice-command notice.
  const [prompt, setPrompt] = useState<{ npcId: number; name: string; step: "list" | "killswitch" | "voice" | "exited" } | null>(null);
  // The impounded wallet halves: kept apart from the robbable items, and used up when combined.
  const [halves, setHalves] = useState<Record<WalletHalf, boolean>>({ top: false, bottom: false });
  /** What the Friend has on: one cosmetic per slot (headwear, mask, clothing, cape, shoes, off hand, weapon skins, pet, wall). */
  const [gear, setGear] = useState<Gear>({});
  /** The summoned pet's spot in the world, the scene it is in and which way it faces. */
  const petSpot = useRef<{ position: WorldPoint; scene: Scene; flip: boolean } | null>(null);
  // Keepsakes: each neutralized outlaw drops one (KEEPSAKES.md). Simulated, not robbable.
  // Achievements for this session, shown on the Data Center terminal; `posters` hang on its wall in the order outlaws were caught.
  const [stats, setStats] = useState({ shots: 0, bears: 0, lions: 0, jackpots: 0, biggest: 0n });
  // Wallet loot beyond RF and OP (simulated, this session).
  const [seedWords, setSeedWords] = useState<ReadonlySet<SeedWord>>(() => new Set());
  const [programCards, setProgramCards] = useState<readonly ProgramId[]>([]);
  const [keys, setKeys] = useState<ReadonlySet<BuildingKey>>(() => new Set(PLAYTEST_START_KEYS));
  const [intel, setIntel] = useState(0);
  const [gasVouchers, setGasVouchers] = useState(0);
  const [haul, setHaul] = useState<Haul | null>(null);
  /** The twist briefing is open over a new board, before the first move. */
  const [briefing, setBriefing] = useState(false);
  /** The REWARDS frame is open over the cracked board. */
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const miningSince = useRef<number | null>(null);
  const [posters, setPosters] = useState<Poster[]>([]);
  const [nearPoster, setNearPoster] = useState<number>(-1); // index of the poster the Friend stands in front of, or -1
  const [viewPoster, setViewPoster] = useState<Poster | null>(null);
  /** The signpost's poster open in its large frame; where the sign's board is on screen (for taps); whether you stand close to it. */
  const [viewWanted, setViewWanted] = useState(false);
  /** Sends the Friend back to the starting point in front of the Centralised Exchange (set up by the game loop). */
  const sendHome = useRef<((now: number) => void) | null>(null);
  const wantedSignRect = useRef<{ x: number; y: number; w: number; h: number } | null>(null), nearWantedSign = useRef(false);
  /** Where each Data Center poster is on screen this frame (for taps), by its index in `posters`. */
  const posterRects = useRef<{ index: number; x: number; y: number; w: number; h: number }[]>([]);
  const voiceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wanted, setWanted] = useState<Wanted | null>(null);
  /** Shots left in the Laser Gun (it comes with the licence), and the licence run: active, and how the last one ended. */
  const [shotsLeft, setShotsLeft] = useState(0n);
  const [run, setRun] = useState<Run | null>(null);
  const [runEnd, setRunEnd] = useState<RunEnd | null>(null);
  /** Keepsakes held, and the one-off keepsake perks waiting for your next hack. */
  const [keepsakes, setKeepsakes] = useState<readonly OwnedKeepsake[]>([]);
  /** A finished run's licence waiting to be settled at the Data Center (why the run ended), or null. */
  const [settling, setSettling] = useState<{ reason: string } | null>(null);
  /** What the last settlement gave, for the terminal's result page. */
  const [settled, setSettled] = useState<{ words: number; op: number; head: HeadStart; trophies: number[]; cold: boolean; hadGolden: boolean } | null>(null);
  /** Seed words placed in the terminal's phrase, before settling. */
  const [phrase, setPhrase] = useState<ReadonlySet<string>>(() => new Set());
  // Kept across new hunts (never reset by the world rebuild): the head start for your next licence, the best number of trophies
  // earned (1-12) and the Golden Trojan Horse. A page reload still loses them.
  const [headStart, setHeadStart] = useState<HeadStart>(NO_HEAD_START);
  const [trophies, setTrophies] = useState(0);
  const [goldenHorse, setGoldenHorse] = useState(PLAYTEST_ALL_GEAR);
  const goldenRef = useRef(false); goldenRef.current = goldenHorse;
  /** The Cold Wallet's REWARDS frame, open after a twelve-word settlement. */
  const [coldRewards, setColdRewards] = useState<readonly RewardItem[] | null>(null);
  /** What is stored in The Vault (Cold Storage, bottom-right room). */
  const [vault, setVault] = useState<VaultStore>(EMPTY_VAULT);
  const [perks, setPerks] = useState<readonly KeepsakePerk[]>([]);
  const shots = useRef<Shot[]>([]);
  const [menu, setMenu] = useState<Menu>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [spent, setSpent] = useState(0n);
  const [owned, setOwned] = useState<Owned>(startOwned);
  const [captured, setCaptured] = useState<Partial<Record<AnimalId, number>>>({});
  const [equipped, setEquipped] = useState<ItemId | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [note, setNoteText] = useState("");
  const [noteTone, setNoteTone] = useState<"good" | "bad">("good");
  /** Toasts: light green for neutral or good news, light red (`bad`) for hits, robberies, escapes and failed actions. */
  const setNote = (text: string, tone: "good" | "bad" = "good") => { setNoteText(text); setNoteTone(tone); };
  const [osReducedMotion, setOsReducedMotion] = useState(false);
  const [reducedMotionOverride, setReducedMotionOverride] = useState<boolean | null>(null);
  const reducedMotion = reducedMotionOverride ?? osReducedMotion;
  const live = useRef({ paused, wallet, prompt, menu, reducedMotion, equipped, status, owned, captured, halves, gear, busy, posters, nearPoster, viewPoster, charges: 0n, pending: false, keys, wanted, viewWanted, rewardsOpen, trophies, settling: Boolean(settling), briefing });
  live.current = { paused, wallet, prompt, menu, reducedMotion, equipped, status, owned, captured, halves, gear, busy, posters, nearPoster, viewPoster, charges: 0n, pending: false, keys, wanted, viewWanted, rewardsOpen, trophies, settling: Boolean(settling), briefing };
  const stop = () => mover.current?.stop();

  const definition = client.definition, maxPrize = maximumPrize(definition);
  const balance = snapshot ? snapshot.rfBalance - spent : 0n;
  // Every shot is simulated and deducted here without a prompt; the SDK ledger only sees the gun purchase (client.buy).
  const charges = shotsLeft;
  // The Laser Gun is in hand once bought this session or while the ledger still holds charges; at zero charges it is depleted.
  const hasLaser = run !== null;
  const count = (id: ItemId) => (id === "laser" ? (hasLaser ? 1n : 0n) : BigInt(owned[id]));
  const ownedItems = ITEMS.filter(item => count(item.id) > 0n);
  const hasNet = equipped === "butterfly-net";
  const capturedTotal = Object.values(captured).reduce((sum, value) => sum + (value ?? 0), 0);
  // Cosmetics you own: impounded headwear, and keepsakes that are cosmetics.
  const ownedCosmetics: CosmeticId[] = COSMETIC_IDS.filter(id => keepsakes.some(item => cosmeticForKeepsake(item.name) === id));
  // A worn cosmetic you no longer hold (sold, or put in The Vault) comes off.
  const heldCosmetics = ownedCosmetics.join(",");
  useEffect(() => {
    setGear(value => {
      const kept = Object.fromEntries(Object.entries(value).filter(([, id]) => !id || ownedCosmetics.includes(id as CosmeticId)));
      return Object.keys(kept).length === Object.keys(value).length ? value : kept as Gear;
    });
  }, [heldCosmetics]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleCosmetic = (id: CosmeticId) => setGear(value => { const slot = COSMETICS[id].slot; return { ...value, [slot]: value[slot] === id ? undefined : id }; });
  // What the Cold Storage's mint terminal lists: the items you hold, then the achievements you have earned this session.
  const mintables: Mintable[] = [
    ...(hasLaser ? [{ id: "item:laser", group: "item" as const, name: "Laser Gun", detail: `${charges.toString()} shots` }] : []),
    ...keepsakes.map(keepsake => ({ id: `item:keepsake-${keepsake.name}`, group: "item" as const, name: keepsake.name, detail: `${keepsake.rarity} keepsake from ${keepsake.outlaw}${keepsake.count > 1 ? ` · ${keepsake.count} held` : ""}` })),
    ...(Object.keys(owned) as Durable[]).filter(id => owned[id] > 0).map(id => ({ id: `item:${id}`, group: "item" as const, name: ITEMS.find(item => item.id === id)!.name, detail: `${owned[id]} held` })),
    ...(permanentHorse ? [{ id: "item:permanent-horse", group: "item" as const, name: "Permanent Trojan Horse", detail: "Your dark brown mount" }] : []),
    ...(halves.top ? [{ id: "item:half-top", group: "item" as const, name: "Top Hardware Wallet", detail: "From Pumper" }] : []),
    ...(halves.bottom ? [{ id: "item:half-bottom", group: "item" as const, name: "Bottom Hardware Wallet", detail: "From Dumper" }] : []),
    ...ANIMALS.filter(spec => (captured[spec.id] ?? 0) > 0).map(spec => ({ id: `item:captured-${spec.id}`, group: "item" as const, name: `Captured ${spec.name}`, detail: `${captured[spec.id]} kept` })),
    ...posters.map(poster => ({ id: `achievement:outlaw-${poster.name}`, group: "achievement" as const, name: `Neutralized ${poster.name}`, detail: "Wanted poster in the Data Center" })),
    ...(stats.bears > 0 ? [{ id: "achievement:bears", group: "achievement" as const, name: "Bear hunter", detail: `${stats.bears} bear${stats.bears === 1 ? "" : "s"} downed` }] : []),
    ...(stats.lions > 0 ? [{ id: "achievement:lions", group: "achievement" as const, name: "Lion hunter", detail: `${stats.lions} lion${stats.lions === 1 ? "" : "s"} downed` }] : []),
    ...(seedWords.size > 0 ? [{ id: "item:seed-phrase", group: "item" as const, name: "Seed phrase words", detail: `${seedWords.size} of ${SEED_WORDS.length}` }] : []),
    ...programCards.map((card, index) => ({ id: `item:card-${index}`, group: "item" as const, name: `${PROGRAMS[card].name} card`, detail: "Program card" })),
    ...[...keys].map(key => ({ id: `item:key-${key}`, group: "item" as const, name: BUILDING_KEYS[key].name, detail: "Building key" })),
    ...(stats.jackpots > 0 ? [{ id: "achievement:jackpots", group: "achievement" as const, name: "Jackpot hunter", detail: `${stats.jackpots} jackpot wallet${stats.jackpots === 1 ? "" : "s"}` }] : []),
    ...(trophies > 0 ? [{ id: "achievement:rank", group: "achievement" as const, name: `Highest rank: ${TROPHIES[trophies - 1].title}`, detail: `${trophies} of ${TROPHIES.length} trophies in the trophy hall` }] : []),
    ...(stats.shots > 0 ? [{ id: "achievement:shots", group: "achievement" as const, name: "Sharpshooter", detail: `${stats.shots} shot${stats.shots === 1 ? "" : "s"} fired` }] : []),
  ];
  const canBuyHorse = Boolean(snapshot) && !busy && !permanentHorse && op >= PERMANENT_HORSE_OP;
  const canBuy = (item: Item) => {
    if (item.op) return Boolean(snapshot) && !busy && op >= item.op;
    return Boolean(snapshot) && !busy && balance >= item.price;
  };
  // Buying the licence: the SDK's own rule (free stake must back the payout table's top prize).
  const canBuyLicence = Boolean(snapshot) && !busy && !run && balance >= definition.price && snapshot!.freeStake >= maxPrize;
  const pending = snapshot?.plays.find(play => play.outcomeId === null);
  live.current.charges = charges; live.current.pending = Boolean(pending);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setOsReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  useEffect(() => { if (paused || menu !== null || wallet || prompt) stop(); }, [paused, menu, wallet, prompt]);
  useEffect(() => { if (equipped && (count(equipped) === 0n || !holdable(equipped))) setEquipped(null); });
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(""), 2600);
    return () => clearTimeout(timer);
  }, [note]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = live.current;
      if (event.code === "Escape") {
        if (bigMap.current && !state.menu && !state.wallet && !state.prompt) { bigMap.current = false; return; }
        if (state.viewPoster) { setViewPoster(null); return; }
        if (state.viewWanted) { setViewWanted(false); return; }
        if (state.briefing && state.wallet) { setBriefing(false); return; }
        if (state.rewardsOpen) { setRewardsOpen(false); return; }
        if (state.menu) setMenu(null);
        else if (state.prompt) { if (state.prompt.step === "list") leaveWallet(); else if (state.prompt.step === "exited") setPrompt(null); }
        else if (state.wallet && state.wallet.state !== "probing") {
          // Esc first puts away a program waiting for a tile; otherwise it gives up (or closes a finished board).
          const w = state.wallet.state;
          if (w.phase === "open") walletAct(w.targeting ? { type: "cancel" } : { type: "giveUp" }); else closeWallet();
        }
        return;
      }
      if (state.prompt) return;
      // I opens and closes the inventory (not over another menu, the wallet or the loading screen).
      if (event.code === "KeyI" && !event.repeat && !state.paused && !state.status && !state.wallet && (state.menu === null || state.menu === "inventory")) {
        event.preventDefault(); if (state.menu === "inventory") setMenu(null); else openRef.current("inventory"); return;
      }
      if (state.paused || state.menu || state.status) return;
      if (state.wallet && state.briefing) {
        // The twist briefing is up: Enter or Space starts the hack; other keys wait.
        if ((event.code === "Enter" || event.code === "Space") && !event.repeat) { event.preventDefault(); setBriefing(false); }
        return;
      }
      if (state.wallet) {
        // Keyboard play inside the wallet: arrows move the cursor, Enter or Space acts on it, 1-3 run a held program.
        const current = state.wallet.state; if (current === "probing" || current.phase !== "open") return;
        const n = current.tier.size, col = current.cursor % n, row = Math.floor(current.cursor / n);
        const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] };
        if (moves[event.code]) { event.preventDefault(); const [dx, dy] = moves[event.code]; const nc = Math.max(0, Math.min(n - 1, col + dx)), nr = Math.max(0, Math.min(n - 1, row + dy)); walletAct({ type: "cursor", index: nr * n + nc }); }
        else if ((event.code === "Enter" || event.code === "Space") && !event.repeat) { event.preventDefault(); walletAct({ type: "act", index: current.cursor }); }
        else if (/^Digit[1-3]$/.test(event.code) && !event.repeat) { event.preventDefault(); walletAct({ type: "run", slot: Number(event.code.slice(5)) - 1 }); }
        else if (event.code === "KeyG" && !event.repeat && current.tier.twist === "frontrun") { event.preventDefault(); walletAct({ type: "gas" }); }
        return;
      }
      if (state.viewPoster) return;
      if (state.viewWanted) return;
      if (event.code === "KeyV" && !event.repeat && nearWantedSign.current && state.wanted) { event.preventDefault(); stop(); setViewWanted(true); return; }
      if (event.code === "KeyV" && !event.repeat && state.nearPoster >= 0 && state.posters[state.nearPoster]) { event.preventDefault(); stop(); setViewPoster(state.posters[state.nearPoster]); return; }
      if (event.code === "Space" && !event.repeat) { event.preventDefault(); useItem(); }
      if (event.code === "KeyQ" && !event.repeat) { event.preventDefault(); cycleEquipped(); }
      if (event.code === "KeyM" && !event.repeat) { event.preventDefault(); bigMap.current = !bigMap.current; }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    const node = canvasRef.current, ctx = node?.getContext("2d");
    if (!node || !ctx) { setFailed(true); setStatus("This browser cannot render the country."); return; }
    const abort = new AbortController();
    let movement = createMovement(spawn, sceneWalkable("outside"));
    mover.current = movement;
    sceneRef.current = "outside"; setInside(null);
    horses.current = wildHorses(goldenRef.current); setRiding(false); discovered.current = freshDiscovery();
    // The frozen Friends are read the first time the Cold Storage is entered, not at start.
    cryoFriends.current = [null, null, null];
    let cryoStarted = false;
    const loadCryoFriends = () => {
      if (cryoStarted) return; cryoStarted = true;
      const reader = createFriendReader();
      CRYO_FRIEND_IDS.forEach((id, slot) => void reader.read(id).then(art => { if (!abort.signal.aborted) cryoFriends.current[slot] = art; }, () => { /* the tube stays empty */ }));
    };
    let lastHoof = 0, lastStep = 0, tense = false, mood: MusicMood = "calm";
    /** Outlaws already met in this country (for the showdown cue). */
    const met = new Set<string>();
    /** When each kind of animal may next call, when each looping animal sound may next repeat, and the dragon breaths already roared. */
    const nextCall = new Map<number, number>(), nextLoop = new Map<string, number>(), roared = new Set<number>(), recentCalls: number[] = [];
    let cancelled = false, frame = 0, previous = 0, lastDebug = 0, shopLatch = false, terminalLatch = false, lastPoster = -1, side: "left" | "right" = "right", doorCooldown = 0;
    const enterBuilding = (kind: BuildingKind, now: number) => {
      const mount = ridden(); if (mount) {
        // The horse waits in the open, a little to the left of where you come out, not on the doorstep (from the doorstep the
        // building's footprint could keep you out of mounting reach from some sides) and away from the local at the right corner.
        const door = PLACED_BUILDINGS.find(building => building.kind === kind)!.position, exit = doorExit(kind, door), park: WorldPoint = [exit[0] - 26, exit[1] + 26];
        mount.mounted = false; mount.cooldown = now + HORSE.cooldownMs; mount.position = walkable(park, NPC_RADIUS) ? park : walkable(exit, NPC_RADIUS) ? exit : randomWalkable(exit, 0);
        setRiding(false);
      }
      if (kind === "coldstorage") loadCryoFriends();
      // The Mining Farm key: collect what the racks mined since the last visit (1 OP per MINING_MS, up to MINING_CAP).
      if (kind === "miningfarm" && live.current.keys.has("miningfarm") && miningSince.current !== null) {
        const mined = Math.min(MINING_CAP, Math.floor((now - miningSince.current) / MINING_MS));
        if (mined > 0) { miningSince.current = now; setOp(value => value + mined); setNote(`The racks mined ${mined} OP for you.`); }
      }
      sceneRef.current = kind; setInside(kind);
      movement = createMovement(INTERIORS[kind].spawn, sceneWalkable(kind)); mover.current = movement;
      shots.current = []; doorCooldown = now + DOOR_COOLDOWN; setNote(`You step into ${INTERIORS[kind].label}.`);
    };
    const leaveBuilding = (kind: BuildingKind, now: number) => {
      const door = PLACED_BUILDINGS.find(building => building.kind === kind)!.position;
      sceneRef.current = "outside"; setInside(null);
      movement = createMovement(doorExit(kind, door), sceneWalkable("outside")); mover.current = movement;
      shots.current = []; doorCooldown = now + DOOR_COOLDOWN;
    };
    // After a hack: back to the starting point in front of the Exchange, outside, on the horse you ride (if any).
    sendHome.current = now => {
      sceneRef.current = "outside"; setInside(null);
      movement = createMovement(spawn, sceneWalkable("outside")); mover.current = movement;
      const mount = ridden(); if (mount) { mount.position = [...spawn]; movement.setSpeed(HORSE.speed); }
      // Whenever you are sent home, your own horse comes too (unless you ride it, and then it already has): to its spot by the start.
      for (const horse of horses.current) {
        if (horse.mounted) continue;
        if (horse.kind === "permanent") horse.position = startHorseSpot();
        else if (horse.kind === "golden") horse.position = goldenSpot();
      }
      shots.current = []; doorCooldown = now + DOOR_COOLDOWN;
    };
    setFailed(false); setStatus("Loading the country and your Friend…"); setWallet(null); setPrompt(null); if (voiceTimer.current) clearTimeout(voiceTimer.current); setMenu(null); setStats({ shots: 0, bears: 0, lions: 0, jackpots: 0, biggest: 0n });
    setSeedWords(new Set(PLAYTEST.liquidator ? SEED_WORDS.slice(0, SEED_WORDS.length - 1) : [])); setProgramCards([]); setKeys(new Set(PLAYTEST_START_KEYS)); setIntel(0); setGasVouchers(0); setHaul(null); miningSince.current = null; setPosters([]); setNearPoster(-1); setViewPoster(null);
    setSnapshot(null); setSpent(0n); setShotsLeft(0n); setRun(null); setRunEnd(null); setSettling(null); setSettled(null); setPhrase(new Set()); setKeepsakes(PLAYTEST_ALL_GEAR ? playtestKeepsakes() : []); setVault(EMPTY_VAULT); setPerks([]); shots.current = []; setOwned(PLAYTEST_ALL_GEAR ? playtestOwned : startOwned); setHalves({ top: false, bottom: false });  setGear({}); petSpot.current = null;  setCaptured({}); setEquipped(null); effects.current = []; setOp(0); setPermanentHorse(PLAYTEST_START_HORSE);
    setFeedback(""); setNote(PLAYTEST.liquidator ? "Playtest: The Liquidator is the last outlaw, and you hold 11 of the 12 seed words. Buy a licence to hunt him." : ""); setBusy(false);
    const start = performance.now();
    const animals = initialAnimals(spawn, start);
    const dither = document.createElement("canvas"); dither.width = 4; dither.height = 4;
    const dctx = dither.getContext("2d")!; dctx.fillStyle = "#fff"; dctx.fillRect(0, 0, 4, 4); dctx.fillStyle = "#000"; dctx.fillRect(0, 0, 2, 2); dctx.fillRect(2, 2, 2, 2);
    const ditherPattern = ctx.createPattern(dither, "repeat")!;
    // The same two-by-two dots on a colour: each building's walls, and the doormat rug.
    const tintedDither = (colour: string) => { const tile = document.createElement("canvas"); tile.width = 4; tile.height = 4; const tctx = tile.getContext("2d")!; tctx.fillStyle = colour; tctx.fillRect(0, 0, 4, 4); tctx.fillStyle = "#000"; tctx.fillRect(0, 0, 2, 2); tctx.fillRect(2, 2, 2, 2); return ctx.createPattern(tile, "repeat")!; };
    const wallPatterns = Object.fromEntries(BUILDING_KINDS.map(kind => [kind, tintedDither(INTERIOR_COLOURS[kind].wall)])) as Record<BuildingKind, CanvasPattern>;
    const rugPattern = tintedDither(RUG_COLOUR);
    resetOutlawSequence();
    const wave = spawnOutlawWave(spawn, start)!;
    npcs.current = [...animals, ...wave.npcs];
    setWanted({ name: wave.name, members: wave.npcs.map(npc => ({ name: npc.name!, variant: npc.variant })) });
    respawns.current = []; contactCooldown.current = 0;
    window.addEventListener("blur", stop); document.addEventListener("visibilitychange", stop);
    // Terrain streams in per tile around the player (props are drawn separately from cached prop
    // artwork). The start-up load covers the tiles around spawn, the Friend's artwork, and the
    // initial client.read() that also supplies the runtime's wallet display and ready state.
    // Every SVG is rasterized once, into a plain bitmap canvas, as it loads: drawing an SVG image straight to the canvas makes the
    // browser re-rasterize it on many draws (per tile and per prop size, every frame), which showed as a regular stutter.
    const rasterize = (image: HTMLImageElement, width = image.width, height = image.height) => {
      const bitmap = document.createElement("canvas"); bitmap.width = width; bitmap.height = height;
      const bctx = bitmap.getContext("2d")!; bctx.imageSmoothingEnabled = true; bctx.drawImage(image, 0, 0, width, height);
      return bitmap;
    };
    // Terrain: each tile's SVG is kept while within EVICT_RING, and rasterized (TERRAIN_CROP, at the view's SCALE, so it blits 1:1 and
    // stays as crisp as the vector) while within LOAD_RING: at most nine bitmaps of about 8.6 MB. Rasterizing one takes a few dozen
    // ms and they come in threes as you cross into a new tile, so during play the frame loop does one horizontal strip of one tile per
    // frame (TERRAIN_STRIPS a tile) and shows a tile once all its strips are done; they are made a ring ahead of the view.
    const svgs = new Map<number, HTMLImageElement>(), terrains = new Map<number, HTMLCanvasElement>(), loading = new Set<number>();
    const TERRAIN_STRIPS = 4;
    const toRasterize: number[] = [];
    let strip: { index: number; bitmap: HTMLCanvasElement; next: number } | null = null;
    const terrainBitmap = () => { const bitmap = document.createElement("canvas"); bitmap.width = TERRAIN_CROP.w * SCALE; bitmap.height = TERRAIN_CROP.h * SCALE; return bitmap; };
    /** Rows [from, to) of the crop (in image px) from the tile's SVG into its bitmap. */
    const paintTerrain = (image: HTMLImageElement, bitmap: HTMLCanvasElement, from: number, to: number) =>
      bitmap.getContext("2d")!.drawImage(image, TERRAIN_CROP.x, TERRAIN_CROP.y + from, TERRAIN_CROP.w, to - from, 0, from * SCALE, TERRAIN_CROP.w * SCALE, (to - from) * SCALE);
    const rasterizeStep = () => {
      if (!strip) {
        const index = toRasterize.shift(); if (index === undefined) return;
        strip = { index, bitmap: terrainBitmap(), next: 0 };
      }
      const image = svgs.get(strip.index); if (!image) { strip = null; return; }
      const rows = Math.ceil(TERRAIN_CROP.h / TERRAIN_STRIPS), from = strip.next * rows;
      paintTerrain(image, strip.bitmap, from, Math.min(TERRAIN_CROP.h, from + rows));
      if (++strip.next >= TERRAIN_STRIPS) { terrains.set(strip.index, strip.bitmap); strip = null; }
    };
    /** A tile needed on screen right now (after a jump, such as being sent home after a hack) is rasterized whole at once. */
    const terrainNow = (index: number) => {
      const image = svgs.get(index); if (!image || terrains.has(index)) return terrains.get(index);
      if (strip?.index === index) strip = null;
      const queued = toRasterize.indexOf(index); if (queued >= 0) toRasterize.splice(queued, 1);
      const bitmap = terrainBitmap(); paintTerrain(image, bitmap, 0, TERRAIN_CROP.h); terrains.set(index, bitmap);
      return bitmap;
    };
    const loadTerrain = (index: number, now = false) => {
      if (svgs.has(index) || loading.has(index)) return Promise.resolve();
      loading.add(index);
      return loadSvg(seamless(sandyPatches(renderWorldLayers(TILES[index].terrain, { signals: false }).terrainSvg), TILES[index].i, TILES[index].j), abort.signal)
        .then(image => {
          if (cancelled) return;
          svgs.set(index, image);
          if (now) { const bitmap = terrainBitmap(); paintTerrain(image, bitmap, 0, TERRAIN_CROP.h); terrains.set(index, bitmap); }
        })
        .finally(() => loading.delete(index));
    };
    const streamTerrain = (around: number) => {
      for (const [index] of TILES.entries()) {
        const ring = tileRing(index, around);
        if (ring <= LOAD_RING) {
          if (!svgs.has(index)) void loadTerrain(index).catch(() => {});
          else if (!terrains.has(index) && strip?.index !== index && !toRasterize.includes(index)) toRasterize.push(index);
          continue;
        }
        terrains.delete(index); if (strip?.index === index) strip = null;
        const queued = toRasterize.indexOf(index); if (queued >= 0) toRasterize.splice(queued, 1);
        if (ring > EVICT_RING) svgs.delete(index);
      }
    };
    const startTile = tileIndexAt(spawn);
    // Props are drawn at up to about 780 px (a large tree), so an 800 px bitmap covers every size they appear at.
    const propSvg = async (svg: string) => rasterize(await loadSvg(svg.replace('width="240" height="240"', 'width="960" height="960"'), abort.signal), 800, 800);
    const propArt = Promise.all([
      ...PROP_TYPES_USED.map(async type => [type as string, await propSvg(type === "tree" ? pastelTree(renderProp(type)) : westernProp(type, renderProp(type)))] as const),
      // The planter's second plant: the cactus (the plain "planter" image holds the flowers).
      ...(PROP_TYPES_USED.includes("planter") ? [(async () => ["planter:cactus", await propSvg(westernProp("planter", renderProp("planter"), "cactus"))] as const)()] : []),
    ]);
    void Promise.all([
      Promise.all(TILES.map((_, index) => tileRing(index, startTile) <= LOAD_RING ? loadTerrain(index, true) : Promise.resolve())),
      propArt, createFriendReader().read(friendId), client.read(),
    ]).then(([, art, sprites, initial]) => {
        if (cancelled) return;
        if (initial.friendId !== friendId) throw new Error("Game session does not match the selected Friend.");
        const images = new Map(art);
        setSnapshot(initial); setStatus(""); setMenu("licence");
        const origin = project(0, 0);
        const render = (now: number) => {
          const active = !live.current.paused && live.current.menu === null && !live.current.wallet && !live.current.prompt && !live.current.viewPoster && !live.current.viewWanted && !document.hidden;
          const deltaMs = active && previous ? now - previous : 0; previous = now;
          const state = movement.update(deltaMs);
          const scene = sceneRef.current, interior = scene === "outside" ? null : INTERIORS[scene];
          const here = (npc: Npc) => npc.scene === scene;
          if (active) {
            for (const npc of npcs.current) { if (npc.kind === "outlaw") wander(npc, now, deltaMs, npc.scene === scene ? state.position : null); else updateAnimal(npc, now, deltaMs, scene === "outside" ? state.position : null, npcs.current); }
            // Fallen animals lie where they dropped for FALLEN_MS, then vanish (their respawn timer already runs from the kill).
            npcs.current = npcs.current.filter(npc => npc.kind === "outlaw" || !npc.fallenAt || now - npc.fallenAt < FALLEN_MS);
            effects.current = effects.current.filter(effect => now - effect.start < EXPLOSION_MS);
            // Laser bolts: advance in projected screen space, fade at range, the world edge or a wall, wing an outlaw on contact.
            for (const shot of [...shots.current]) {
              const [sx, sy] = project(...shot.position), step = Math.min(40, deltaMs) * SHOT_SPEED / 1000;
              shot.position = unproject(sx + shot.dir[0] * step, sy + shot.dir[1] * step); shot.travelled += step;
              const [wx, wy] = shot.position;
              const gone = shot.travelled > SHOT_RANGE || (interior ? !interiorWalkable(interior, shot.position, 0) : wx < 0 || wy < 0 || wx > WORLD_SIZE.width || wy > WORLD_SIZE.height);
              const hit = npcs.current.find(npc => here(npc) && !npc.fallenAt && (npc.kind === "outlaw" ? distance(npc.position, shot.position) <= SHOT_HIT : hitRadius(npc) > 0 && distance(npc.position, shot.position) <= hitRadius(npc)));
              if (hit?.kind === "outlaw") {
                // A hacker drops on the second hit for certain, on the first half the time; down, it lies still and its wallet is up for grabs.
                hit.hp -= 1;
                if (hit.hp <= 0) { hit.hp = 0; hit.fallenAt = now; hit.walking = false; movement.stop(); setNote(""); dropOutlawKeepsake(hit); const caught = hit.name ?? "The hacker", variant = hit.variant; setPosters(value => value.some(poster => poster.name === caught) ? value : [...value, { name: caught, variant }]); setPrompt({ npcId: hit.id, name: hit.name ?? "The hacker", step: "list" }); }
                else setNote(`${hit.name ?? "The hacker"} is winged and staggers. ${hit.hp} more hit${hit.hp === 1 ? "" : "s"} to bring them down.`, "bad");
              }
              else if (hit) {
                // A shot animal cries out in its own voice, placed like its calls.
                { const dx = (project(...hit.position)[0] - project(...state.position)[0]) * SCALE;
                  audio.current?.play("wail", { species: hit.kind, gain: Math.max(0.35, 1 - distance(hit.position, state.position) / HEAR_RANGE), pan: Math.max(-0.8, Math.min(0.8, dx / (VIEW.width / 2) * 0.8)) }); }
                hit.hp -= 1; if (hit.hp <= 0) killAnimal(hit, now); else setNote(`${ANIMAL_BY_ID[hit.kind as AnimalId].name} hit! ${hit.hp} more to bring it down.`, "bad");
              }
              if (gone || hit) shots.current = shots.current.filter(entry => entry !== shot);
            }
            const due = respawns.current.filter(entry => entry.at <= now);
            respawns.current = respawns.current.filter(entry => entry.at > now);
            for (const entry of due) {
              if (entry.kind === "animal") {
                // A killed animal returns a minute later: always for chance-100 species, otherwise by its chance, re-rolled every minute.
                const spec = ANIMAL_BY_ID[entry.species!];
                if (speciesRolls(spec)) npcs.current.push(...spawnSpecies(spec, 1, scene === "outside" ? state.position : spawn, now));
                else respawns.current.push({ ...entry, at: now + KILL_RESPAWN_MS });
                continue;
              }
              const wave = spawnOutlawWave(scene === "outside" ? state.position : spawn, now);
              if (!wave) { setWanted(null); setNote("Every outlaw on the list has been brought in. The country is clear."); continue; }
              npcs.current.push(...wave.npcs);
              setWanted({ name: wave.name, members: wave.npcs.map(npc => ({ name: npc.name!, variant: npc.variant })) });
            }
          }
          if (!interior) streamTerrain(tileIndexAt(state.position));
          rasterizeStep();
          // Snap the camera to whole screen pixels so terrain and sprites, which each round to pixels, step together instead of
          // shimmering against each other while the Friend sits at a fractional position.
          const [rawX, rawY] = project(...state.position);
          const px = Math.round(rawX * SCALE) / SCALE, py = Math.round(rawY * SCALE) / SCALE;
          camera.current = { x: px, y: py };
          const toScreen = (point: WorldPoint): Point => { const [x, y] = project(...point); return { x: VIEW.width / 2 + (x - px) * SCALE, y: VIEW.height / 2 + (y - py) * SCALE }; };
          const lifted = (point: WorldPoint, lift: number): Point => { const [x, y] = project(point[0], point[1], lift); return { x: VIEW.width / 2 + (x - px) * SCALE, y: VIEW.height / 2 + (y - py) * SCALE }; };
          const onScreen = (at: Point, margin: number) => at.x > -margin && at.x < VIEW.width + margin && at.y > -margin && at.y < VIEW.height + margin;
          ctx.setTransform(worldScale.current, 0, 0, worldScale.current, 0, 0);
          ctx.fillStyle = interior ? "#111" : "#fff"; ctx.fillRect(0, 0, VIEW.width, VIEW.height);
          const layers: { depth: number; draw: () => void }[] = [];
          if (interior) {
            // Floor, dot grid and the doormat, then walls and furniture as depth-sorted boxes.
            const corners = [[0, 0], [interior.width, 0], [interior.width, interior.height], [0, interior.height]].map(([x, y]) => toScreen([x, y]));
            ctx.beginPath(); ctx.moveTo(corners[0].x, corners[0].y); for (const corner of corners.slice(1)) ctx.lineTo(corner.x, corner.y); ctx.closePath();
            ctx.fillStyle = INTERIOR_COLOURS[interior.kind].floor; ctx.fill(); ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = "#000";
            for (let gy = 20; gy < interior.height; gy += 28) for (let gx = 20; gx < interior.width; gx += 28) { const at = toScreen([gx, gy]); if (onScreen(at, 0)) ctx.fillRect(Math.round(at.x) - 1, Math.round(at.y) - 1, 2, 2); }
            const mat = [[interior.entrance[0] - DOOR / 2, interior.height - WALL], [interior.entrance[0] + DOOR / 2, interior.height - WALL], [interior.entrance[0] + DOOR / 2, interior.height], [interior.entrance[0] - DOOR / 2, interior.height]].map(([x, y]) => toScreen([x, y]));
            ctx.beginPath(); ctx.moveTo(mat[0].x, mat[0].y); for (const corner of mat.slice(1)) ctx.lineTo(corner.x, corner.y); ctx.closePath(); ctx.fillStyle = rugPattern; ctx.fill();
            // The Cold Storage's open hatch: a steel frame in the floor, stairs going down into the dark, the lid standing open.
            for (const hatch of interior.furniture) if (hatch.kind === "hatch") {
              drawHatch(ctx, lifted, hatch);
              const hinge = toScreen([hatch.x + hatch.w / 2, hatch.y]);
              if (onScreen(hinge, 200)) layers.push({ depth: hatch.x + hatch.w / 2 + hatch.y + 0.2, draw: () => drawHatchLid(ctx, lifted, hatch) });
            }
            for (const wall of interior.walls) for (const piece of splitRect(wall)) {
              const at = toScreen([piece.x + piece.w / 2, piece.y + piece.h / 2]);
              if (onScreen(at, 260)) layers.push({ depth: piece.x + piece.w / 2 + piece.y + piece.h, draw: () => drawBox(ctx, lifted, piece, WALL_LIFT, wallPatterns[interior.kind], INTERIOR_COLOURS[interior.kind].wallTop) });
            }
            // Wanted posters of neutralized outlaws, left to right on the Data Center's back wall (its camera-facing side at y = WALL),
            // each drawn just after the wall piece it hangs on.
            posterRects.current = [];
            if (interior.kind === "datacenter") {
              const slots = posterSlots(interior);
              live.current.posters.forEach((poster, index) => {
                const slot = slots[index]; if (!slot) return;
                // A 24 x 30 poster centred on its 32-unit tile, 5 units above the floor in the 40-unit-tall wall.
                const top = WALL_LIFT - 5, bottom = 5, from = slot.start + 4, to = slot.start + 28;
                const at = (along: number, lift: number) => slot.wall === "back" ? lifted([along, WALL], lift) : lifted([WALL, along], lift);
                // Back wall: left-to-right on screen follows x; left wall: screen left-to-right runs toward smaller y.
                const [left, right] = slot.wall === "back" ? [from, to] : [to, from];
                const origin = at(left, top), across = at(right, top), down = at(left, bottom);
                const corners = [origin, across, down, { x: across.x + down.x - origin.x, y: across.y + down.y - origin.y }], xs = corners.map(c => c.x), ys = corners.map(c => c.y);
                posterRects.current.push({ index, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
                layers.push({ depth: slot.depth, draw: () => drawOnFace(ctx, wallPoster(poster.name, poster.variant, poster.stars, poster.jackpot), origin, { x: across.x - origin.x, y: across.y - origin.y }, { x: down.x - origin.x, y: down.y - origin.y }) });
              });
              // Dr. Ponzi's Medical Diploma, when hung, takes the last wall slot (the posters fill from the first).
              const hook = slots[slots.length - 1];
              if (live.current.gear.wall === "diploma" && hook && live.current.posters.length < slots.length) {
                const top = WALL_LIFT - 5, bottom = 5, from = hook.start + 4, to = hook.start + 28;
                const at = (along: number, lift: number) => hook.wall === "back" ? lifted([along, WALL], lift) : lifted([WALL, along], lift);
                const [left, right] = hook.wall === "back" ? [from, to] : [to, from];
                const origin = at(left, top), across = at(right, top), down = at(left, bottom);
                layers.push({ depth: hook.depth, draw: () => drawOnFace(ctx, diplomaBitmap(), origin, { x: across.x - origin.x, y: across.y - origin.y }, { x: down.x - origin.x, y: down.y - origin.y }) });
              }
            }
            // Racks are drawn in rack-unit slices (12 units) so each slice depth-sorts correctly against the Friend and NPCs beside it.
            for (const item of interior.furniture) if (item.kind === "cryo") {
              const base = toScreen([item.x + item.w / 2, item.y + item.h / 2]);
              if (onScreen(base, 200)) layers.push({ depth: item.x + item.w / 2 + item.y + item.h, draw: () => drawCryoTube(ctx, base.x, base.y, cryoFriends.current[item.slot ?? 0] ?? null, now, live.current.reducedMotion, item.slot ?? 0) });
            }
            for (const item of interior.furniture) if (item.kind !== "cryo" && item.kind !== "hatch") for (const piece of splitRect(item, item.kind === "asic" ? 12 : 32)) {
              const at = toScreen([piece.x + piece.w / 2, piece.y + piece.h / 2]);
              if (onScreen(at, 200)) layers.push({ depth: piece.x + piece.w / 2 + piece.y + piece.h, draw: () => {
                drawBox(ctx, lifted, piece, FURNITURE_LIFT, piece.kind === "mint" || piece.kind === "vault" ? "#e6f2fb" : piece.kind === "pedestal" ? "#ececec" : piece.kind === "asic" ? RACK_SIDE : FURNITURE_SIDE, piece.kind === "asic" ? RACK_TOP : FURNITURE_TOP);
                if (piece.kind === "pedestal") {
                  // A trophy on its pedestal once earned; before that, its faint silhouette.
                  const slot = piece.slot ?? 0, top = lifted([piece.x + piece.w / 2, piece.y + piece.h / 2], FURNITURE_LIFT);
                  drawTrophy(ctx, slot, top.x, top.y + 2, slot >= live.current.trophies, live.current.reducedMotion ? null : ((now / 2600 + slot * 0.13) % 1));
                }
                if (piece.kind === "terminal" || piece.kind === "charger" || piece.kind === "mint" || piece.kind === "vault" || piece.kind === "settlement") {
                  // A monitor on the desk: a black screen with green lines of output, facing the room (the charging terminal's
                  // screen shows an amber battery filling instead).
                  const a = lifted([piece.x + 4, piece.y + piece.h / 2], FURNITURE_LIFT + 22), b = lifted([piece.x + piece.w - 4, piece.y + piece.h / 2], FURNITURE_LIFT + 22);
                  const c = lifted([piece.x + piece.w - 4, piece.y + piece.h / 2], FURNITURE_LIFT + 2), d = lifted([piece.x + 4, piece.y + piece.h / 2], FURNITURE_LIFT + 2);
                  ctx.beginPath(); [a, b, c, d].forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath();
                  ctx.fillStyle = "#111"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.stroke();
                  if (piece.kind === "mint") {
                    // The mint terminal: a faint blue screen with a token coin and a row of item slots.
                    const cell = (u: number, t: number) => ({ x: a.x + (b.x - a.x) * u + (d.x - a.x) * t, y: a.y + (b.y - a.y) * u + (d.y - a.y) * t });
                    const quad = (u0: number, t0: number, u1: number, t1: number) => { ctx.beginPath(); [cell(u0, t0), cell(u1, t0), cell(u1, t1), cell(u0, t1)].forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); };
                    quad(0.06, 0.08, 0.94, 0.92); ctx.fillStyle = "#0e2436"; ctx.fill();
                    const coin = cell(0.3, 0.45); ctx.fillStyle = "#9fd4f5"; ctx.beginPath(); ctx.ellipse(coin.x, coin.y, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = "#0e2436"; ctx.fillRect(Math.round(coin.x) - 1, Math.round(coin.y) - 2, 2, 4);
                    const pulse = live.current.reducedMotion ? 0 : Math.floor(now / 500) % 3;
                    for (let k = 0; k < 3; k++) { quad(0.55 + k * 0.13, 0.35, 0.64 + k * 0.13, 0.6); ctx.fillStyle = k === pulse ? "#d8efff" : "#5d9cc4"; ctx.fill(); }
                  } else if (piece.kind === "settlement") {
                    // The Licence Settlement terminal: the twelve-word seed phrase as a 4 x 3 grid of amber cells.
                    const cell = (u: number, t: number) => ({ x: a.x + (b.x - a.x) * u + (d.x - a.x) * t, y: a.y + (b.y - a.y) * u + (d.y - a.y) * t });
                    const lit = live.current.reducedMotion ? 12 : 1 + Math.floor(now / 350) % 12;
                    for (let k = 0; k < 12; k++) {
                      const u0 = 0.1 + (k % 4) * 0.21, t0 = 0.15 + Math.floor(k / 4) * 0.25;
                      ctx.beginPath(); [cell(u0, t0), cell(u0 + 0.16, t0), cell(u0 + 0.16, t0 + 0.17), cell(u0, t0 + 0.17)].forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath();
                      ctx.fillStyle = k < lit ? "#f2c200" : "#4a3a08"; ctx.fill();
                    }
                  } else if (piece.kind === "vault") {
                    // The Vault terminal: a round steel vault door on a dark screen, its wheel turning slowly.
                    const cell = (u: number, t: number) => ({ x: a.x + (b.x - a.x) * u + (d.x - a.x) * t, y: a.y + (b.y - a.y) * u + (d.y - a.y) * t });
                    const centre = cell(0.5, 0.5), r = Math.max(4, Math.hypot(b.x - a.x, b.y - a.y) * 0.22);
                    ctx.fillStyle = "#9fb3c4"; ctx.beginPath(); ctx.ellipse(centre.x, centre.y, r, r * 1.1, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = "#0e2436"; ctx.lineWidth = 1.5; ctx.stroke();
                    const turn = live.current.reducedMotion ? 0 : now / 1400;
                    ctx.strokeStyle = "#0e2436"; ctx.lineWidth = 1.5;
                    for (let k = 0; k < 3; k++) { const angle = turn + k * Math.PI / 3; ctx.beginPath(); ctx.moveTo(centre.x - Math.cos(angle) * r * 0.7, centre.y - Math.sin(angle) * r * 0.7); ctx.lineTo(centre.x + Math.cos(angle) * r * 0.7, centre.y + Math.sin(angle) * r * 0.7); ctx.stroke(); }
                    ctx.fillStyle = "#d8efff"; ctx.fillRect(Math.round(centre.x) - 1, Math.round(centre.y) - 1, 3, 3);
                  } else if (piece.kind === "charger") {
                    const cell = (u: number, t: number) => ({ x: a.x + (b.x - a.x) * u + (d.x - a.x) * t, y: a.y + (b.y - a.y) * u + (d.y - a.y) * t });
                    ctx.strokeStyle = "#f2c200"; ctx.lineWidth = 2; ctx.beginPath(); [cell(0.15, 0.25), cell(0.75, 0.25), cell(0.75, 0.75), cell(0.15, 0.75)].forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.stroke();
                    ctx.fillStyle = "#f2c200"; ctx.beginPath(); [cell(0.75, 0.4), cell(0.85, 0.4), cell(0.85, 0.6), cell(0.75, 0.6)].forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.fill();
                    const lit = live.current.reducedMotion ? 3 : Math.floor(now / 400) % 4;
                    for (let bar = 0; bar < 3; bar++) if (bar < lit) { ctx.beginPath(); [cell(0.2 + bar * 0.18, 0.32), cell(0.34 + bar * 0.18, 0.32), cell(0.34 + bar * 0.18, 0.68), cell(0.2 + bar * 0.18, 0.68)].forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.fill(); }
                  } else {
                  ctx.fillStyle = "#39e75f";
                  for (let line = 0; line < 4; line++) { const t = 0.2 + line * 0.2, u0 = 0.15, u1 = 0.35 + ((line * 37) % 50) / 100; const p0 = { x: a.x + (b.x - a.x) * u0 + (d.x - a.x) * t, y: a.y + (b.y - a.y) * u0 + (d.y - a.y) * t }, p1 = { x: a.x + (b.x - a.x) * u1 + (d.x - a.x) * t, y: a.y + (b.y - a.y) * u1 + (d.y - a.y) * t }; ctx.fillRect(Math.round(Math.min(p0.x, p1.x)), Math.round(Math.min(p0.y, p1.y)), Math.max(2, Math.round(Math.abs(p1.x - p0.x))), 2); }
                  }
                }
                if (piece.kind === "asic") {
                  // ASIC units along the rack top: a black fan grille and a lime status LED every 12 units, LEDs blinking unless motion is reduced.
                  for (let t = 6; t < piece.h - 4; t += 12) {
                    const fan = lifted([piece.x + piece.w / 2 - 3, piece.y + t], FURNITURE_LIFT), led = lifted([piece.x + piece.w / 2 + 4, piece.y + t + 2], FURNITURE_LIFT);
                    ctx.fillStyle = "#000"; ctx.fillRect(Math.round(fan.x) - 3, Math.round(fan.y) - 3, 6, 6);
                    ctx.fillStyle = "#fff"; ctx.fillRect(Math.round(fan.x) - 1, Math.round(fan.y) - 1, 2, 2);
                    // Status LEDs: a bright green, and one in twenty a warning red, each blinking on its own beat.
                    const red = flowerHash(piece.x, piece.y + t) % 20 === 0; // a mixed position hash, so about one LED in twenty
                    const on = live.current.reducedMotion || Math.floor((now + t * 37 + piece.y) / 500) % 3 !== 0;
                    ctx.fillStyle = on ? (red ? "#ff3b30" : "#39e75f") : "#000"; ctx.fillRect(Math.round(led.x) - 1, Math.round(led.y) - 1, 3, 3);
                  }
                }
              } });
            }
          }
          // Terrain tiles, painter order by i + j so a tile's south/east cliff is hidden by the tile in front.
          // Only the loaded tiles (at most nine) are considered, and each blits just the part of its image that lands inside the
          // viewport, at a whole-pixel offset, so a frame costs about one viewport of pixels however many tiles overlap it.
          const playerTile = tileIndexAt(state.position);
          for (const index of interior ? [] : TILES.map((_, index) => index).filter(index => tileRing(index, playerTile) <= LOAD_RING).sort((a, b) => (TILES[a].i + TILES[a].j) - (TILES[b].i + TILES[b].j))) {
            const tile = TILES[index], [ox, oy] = project(...tile.offset);
            // The bitmap's top left on screen, at whole pixels; it is already at SCALE, so it blits 1:1.
            const bx = Math.round(VIEW.width / 2 + (ox - origin[0] - px + TERRAIN_CROP.x) * SCALE), by = Math.round(VIEW.height / 2 + (oy - origin[1] - py + TERRAIN_CROP.y) * SCALE);
            const sx = Math.max(0, -bx), sy = Math.max(0, -by), sw = Math.min(TERRAIN_CROP.w * SCALE, VIEW.width - bx) - sx, sh = Math.min(TERRAIN_CROP.h * SCALE, VIEW.height - by) - sy;
            if (sw <= 0 || sh <= 0) continue;
            // Missing its bitmap, a tile is rasterized at once only when its diamond (not just its bounding box) is on screen.
            let bitmap = terrains.get(index);
            if (!bitmap && diamondOnScreen(([[0, 0], [PLANE.w, 0], [PLANE.w, PLANE.h], [0, PLANE.h]] as WorldPoint[]).map(([x, y]) => toScreen([tile.offset[0] + x, tile.offset[1] + y])))) bitmap = terrainNow(index);
            if (!bitmap) continue;
            ctx.drawImage(bitmap, sx, sy, sw, sh, bx + sx, by + sy, sw, sh);
          }
          // Cover the interior tile seams (each tile draws its own boundary line), leaving the trunk paths intact.
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 3 * SCALE; ctx.lineCap = "butt";
          const seam = (a: WorldPoint, b: WorldPoint) => { const s = toScreen(a), e = toScreen(b); ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke(); };
          for (let i = 1; !interior && i < GRID.cols; i++) {
            const x = i * PLANE.w;
            let from = 0;
            for (const row of ROAD_ROWS) { const cross = row * PLANE.h + TRUNK.y; seam([x, from], [x, cross - 16]); from = cross + 16; }
            seam([x, from], [x, WORLD_SIZE.height]);
          }
          for (let j = 1; !interior && j < GRID.rows; j++) {
            const y = j * PLANE.h;
            let from = 0;
            for (const col of ROAD_COLS) { const cross = col * PLANE.w + TRUNK.x; seam([from, y], [cross - 16, y]); from = cross + 16; }
            seam([from, y], [WORLD_SIZE.width, y]);
          }
          if (state.facing === "left" || state.facing === "right") side = state.facing;
          const bob = live.current.reducedMotion ? 0 : Math.floor(now / 160) % 2;
          if (!interior) {
            // The pigs' mud puddle on the ground: a brown isometric ellipse with a dotted texture and a black rim.
            const rim = Array.from({ length: 48 }, (_, i) => { const angle = i * Math.PI / 24, r = puddleRadius(angle); return toScreen([PUDDLE.centre[0] + Math.cos(angle) * PUDDLE.rx * r, PUDDLE.centre[1] + Math.sin(angle) * PUDDLE.ry * r]); });
            if (rim.some(point => onScreen(point, 80))) {
              const shapes = [rim, ...PUDDLE_BLOTS.map(blot => Array.from({ length: 16 }, (_, i) => { const angle = i * Math.PI / 8; return toScreen([PUDDLE.centre[0] + (blot.dx + Math.cos(angle) * blot.rx * (1 + 0.2 * Math.sin(3 * angle))) * PUDDLE.rx, PUDDLE.centre[1] + (blot.dy + Math.sin(angle) * blot.ry) * PUDDLE.ry]); }))];
              for (const shape of shapes) {
                ctx.save(); ctx.beginPath(); shape.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.closePath();
                ctx.fillStyle = "#7a5230"; ctx.fill(); ctx.clip();
                const xs = shape.map(point => point.x), ys = shape.map(point => point.y), x0 = Math.floor(Math.min(...xs) / 10) * 10, x1 = Math.max(...xs), y0 = Math.floor(Math.min(...ys) / 10) * 10, y1 = Math.max(...ys);
                ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
                for (let y = y0; y <= y1; y += 8) for (let x = x0 + ((y / 8) % 2) * 5; x <= x1; x += 10) ctx.fillRect(x, y, 3, 3);
                ctx.restore(); ctx.beginPath(); shape.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.closePath();
                ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.stroke();
              }
            }
          }
          for (const prop of interior ? [] : PROPS) {
            if (prop.type === "terminal") continue; // a building's collision stand-in; the building itself is drawn below
            const at = toScreen([prop.x, prop.y]);
            if (!onScreen(at, 400)) continue;
            const image = images.get(prop.type === "planter" && flowerHash(prop.x, prop.y) % 2 ? "planter:cactus" : prop.type);
            if (!image) continue;
            const k = (prop.scale ?? 1) * 1.4 * SCALE;
            layers.push({ depth: prop.x + prop.y, draw: () => { ctx.imageSmoothingEnabled = true; ctx.drawImage(image, at.x - 120 * k, at.y - 180 * k, 240 * k, 240 * k); if (prop.type === "flower") colourFlower(ctx, prop, at, k); } });
          }
          for (const npc of npcs.current) {
            if (!here(npc)) continue;
            const at = toScreen(npc.position);
            if (!onScreen(at, 120)) continue;
            layers.push({ depth: npc.position[0] + npc.position[1], draw: () => {
              if (npc.kind !== "outlaw") { drawAnimal(ctx, npc, at, now, live.current.reducedMotion, { x: VIEW.width / 2, y: VIEW.height / 2 - 40 }); return; }
              const art = outlawArt(npc.name, npc.variant), flip = npc.facing === "left" && !noMirror(npc.name);
              if (npc.fallenAt) { ctx.save(); ctx.translate(Math.round(at.x), Math.round(at.y)); ctx.rotate(flip ? -Math.PI / 2 : Math.PI / 2); drawMask(ctx, art.rows, 0, Math.round(art.rows[0].length / 2) * 5 * 0.5, 5, flip, "#fff", art.accent, false, art.colours); ctx.restore(); }
              // Coloured by part, and without the white halo (like the Friend, the villagers, the horses and the animals).
              else drawMask(ctx, art.rows, at.x, at.y - (npc.walking ? bob : 0), 5, flip, "#fff", art.accent, false, art.colours);
              if (npc.name) {
                // The label floats just above the top of whatever mask this outlaw uses.
                const labelY = at.y - (art.rows.length - 1) * 5 - 10;
                ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "center";
                ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.strokeText(npc.name, at.x, labelY);
                ctx.fillStyle = "#000"; ctx.fillText(npc.name, at.x, labelY);
              }
            } });
          }
          for (const effect of effects.current) { const at = toScreen(effect.position); layers.push({ depth: effect.position[0] + effect.position[1] + 1, draw: () => drawExplosion(ctx, at, (now - effect.start) / EXPLOSION_MS) }); }
          if (!interior) { const signAt = toScreen(POOL.sign); if (onScreen(signAt, 120)) layers.push({ depth: POOL.sign[0] + POOL.sign[1], draw: () => drawSignpost(ctx, signAt.x, signAt.y, "Mining Pool") }); }
          const shopAt = toScreen(store.position);
          if (!interior && onScreen(shopAt, 300)) layers.push({ depth: store.position[0] + store.position[1], draw: () => drawShop(ctx, shopAt.x, shopAt.y) });
          for (const building of interior ? [] : PLACED_BUILDINGS) {
            const at = toScreen(building.position);
            if (onScreen(at, 300)) layers.push({ depth: building.position[0] + building.position[1], draw: () => drawBuilding(ctx, BUILDING_ART[building.kind], at.x, at.y, BUILDING_CELL) });
          }
          // Friendly guides: each points at the nearest living outlaw, or at the building it is hiding in (so the survivor of Pumper & Dumper is still tracked).
          const outlawsAlive = npcs.current.filter(npc => npc.kind === "outlaw");
          for (const guide of interior ? [] : GUIDES) {
            const at = toScreen(guide.position);
            if (!onScreen(at, 120)) continue;
            const target = live.current.settling ? dataCenterDoor()
              : outlawsAlive.map(npc => ({ spot: outlawSpot(npc), far: distance(outlawSpot(npc), guide.position) })).sort((a, b) => a.far - b.far)[0]?.spot;
            const aim = target ? toScreen(target) : null;
            layers.push({ depth: guide.position[0] + guide.position[1], draw: () => {
              drawVillager(ctx, at.x, at.y, aim ? aim.x < at.x : false);
              if (aim) drawGuideArrow(ctx, at.x, at.y, Math.atan2(aim.y - at.y, aim.x - at.x), live.current.reducedMotion ? 0 : Math.round(Math.sin(now / 250) * 3));
            } });
          }
          for (const shot of shots.current) {
            const at = toScreen(shot.position);
            layers.push({ depth: shot.position[0] + shot.position[1], draw: () => drawLaserBolt(ctx, at.x + shot.muzzle[0], at.y + shot.muzzle[1], Math.atan2(shot.dir[1], shot.dir[0])) });
          }
          // The horse: standing where it was left, or carrying the Friend. Its parts go behind or in front of the rider by facing.
          // The ridden horse's front parts go over the rider, so they are drawn after the Friend's layer.
          let riddenFront: { depth: number; draw: () => void } | null = null;
          for (const mount of horses.current) {
            const horseAt = mount.mounted ? { x: VIEW.width / 2, y: VIEW.height / 2 } : toScreen(mount.position);
            const gallop = mount.mounted && state.walking && !live.current.reducedMotion ? Math.floor(now / 140) % 2 * 2 : 0;
            // Hoofbeats: a galloping stride, again and again, while the ridden horse is moving.
            if (mount.mounted && state.walking && now - lastHoof >= HOOF_STRIDE_MS) { lastHoof = now; audio.current?.play("hoof"); }
            // While mounted the horse takes the Friend's current facing and depth, so its parts never sort against a stale position.
            const horseParts = !interior && onScreen(horseAt, 160) ? horseLayers(ctx, mount.mounted ? state.facing : mount.facing, horseAt.x, horseAt.y - gallop, mount.mounted, mount.kind) : null;
            const horseDepth = mount.mounted ? state.position[0] + state.position[1] : mount.position[0] + mount.position[1];
            if (horseParts?.behind) layers.push({ depth: horseDepth, draw: horseParts.behind });
            if (horseParts?.front && !mount.mounted) layers.push({ depth: horseDepth, draw: horseParts.front });
            if (horseParts?.front && mount.mounted) riddenFront = { depth: horseDepth, draw: horseParts.front };
            // The golden horse shines: a few white sparkles twinkle over it (one steady glint under reduced motion).
            if (horseParts && mount.kind === "golden") layers.push({ depth: horseDepth + 0.3, draw: () => {
              const still = live.current.reducedMotion;
              for (let k = 0; k < (still ? 1 : 3); k++) {
                const phase = still ? 0.5 : ((now / 900 + k / 3) % 1), size = Math.round(Math.sin(phase * Math.PI) * 5);
                if (size < 1) continue;
                const sx = Math.round(horseAt.x - 30 + ((k * 37 + Math.floor(now / 900 + k / 3) * 23) % 60)), sy = Math.round(horseAt.y - 70 + ((k * 19 + Math.floor(now / 900 + k / 3) * 17) % 44));
                ctx.fillStyle = "#fff"; ctx.fillRect(sx - 1, sy - size, 2, size * 2); ctx.fillRect(sx - size, sy - 1, size * 2, 2);
              }
            } });
          }
          layers.push({ depth: state.position[0] + state.position[1], draw: () => {
            // Facing up, the held item sits behind the Friend; otherwise in front. Riding lifts the Friend onto the horse's back.
            const item = live.current.equipped, lift = ridden() ? HORSE.seat : 0, cy = VIEW.height / 2 - lift;
            const worn = live.current.gear;
            if (item && state.facing === "up") drawEquipped(ctx, item, VIEW.width / 2, cy, state.facing, side, worn);
            const step = live.current.reducedMotion ? 0 : Math.floor(now / 110) % 8;
            // Gear behind the Friend (the cape, an off-hand item on the far side), the Friend, then gear over them.
            drawGearBehind(ctx, worn, sprites, VIEW.width / 2, cy, state.facing, state.walking, step, side);
            drawFriend(ctx, sprites, VIEW.width / 2, cy, state.facing, state.walking, step, side);
            drawGearFront(ctx, worn, sprites, VIEW.width / 2, cy, state.facing, state.walking, step, side, now, live.current.reducedMotion);
            if (item && state.facing !== "up") drawEquipped(ctx, item, VIEW.width / 2, cy, state.facing, side, worn);
          } });
          if (riddenFront) layers.push(riddenFront);
          // A summoned pet trails a little behind the Friend, catching up smoothly; it appears beside them in a new scene.
          const pet = live.current.gear.pet;
          if (pet) {
            const back = vectors[state.facing], target: WorldPoint = [state.position[0] - back[0] * 22 + back[1] * 12, state.position[1] - back[1] * 22 - back[0] * 12];
            if (!petSpot.current || petSpot.current.scene !== scene) petSpot.current = { position: target, scene, flip: false };
            const spot = petSpot.current, k = Math.min(1, deltaMs / 220), dx = (target[0] - spot.position[0]) * k, dy = (target[1] - spot.position[1]) * k;
            spot.position = [spot.position[0] + dx, spot.position[1] + dy];
            const moving = Math.hypot(dx, dy) > 0.05, screenDx = (dx - dy);
            if (Math.abs(screenDx) > 0.05) spot.flip = screenDx < 0;
            const at = toScreen(spot.position), flip = spot.flip;
            layers.push({ depth: spot.position[0] + spot.position[1], draw: () => drawPet(ctx, pet, at.x, at.y, now, live.current.reducedMotion, flip, moving) });
          } else petSpot.current = null;
          // The wanted signpost beside the exchange: a pole with the current wave's poster on a board (none between waves).
          wantedSignRect.current = null; nearWantedSign.current = false;
          const posted = live.current.wanted;
          if (!interior && posted) {
            const foot = toScreen(WANTED_SIGN);
            if (onScreen(foot, 200)) {
              const art = wantedBitmap(posted), boardH = 74, boardW = Math.round(boardH * art.width / art.height), poleH = 96;
              const board = { x: Math.round(foot.x - boardW / 2), y: Math.round(foot.y - poleH - boardH / 2), w: boardW, h: boardH };
              wantedSignRect.current = board;
              layers.push({ depth: WANTED_SIGN[0] + WANTED_SIGN[1], draw: () => {
                ctx.fillStyle = "#fff"; ctx.fillRect(Math.round(foot.x) - 6, Math.round(foot.y) - poleH - 2, 12, poleH + 4);
                ctx.fillStyle = "#000"; ctx.fillRect(Math.round(foot.x) - 4, Math.round(foot.y) - poleH, 8, poleH);
                ctx.fillStyle = "#6b4a2b"; ctx.fillRect(Math.round(foot.x) - 2, Math.round(foot.y) - poleH, 4, poleH - 2);
                ctx.fillStyle = "#fff"; ctx.fillRect(board.x - 5, board.y - 5, board.w + 10, board.h + 10);
                ctx.fillStyle = "#000"; ctx.fillRect(board.x - 3, board.y - 3, board.w + 6, board.h + 6);
                ctx.imageSmoothingEnabled = true; ctx.drawImage(art, board.x, board.y, board.w, board.h); ctx.imageSmoothingEnabled = false;
              } });
            }
            nearWantedSign.current = distance(state.position, WANTED_SIGN) <= WANTED_SIGN_REACH;
          }
          // Where a tap is taking the Friend, drawn on the ground under everything standing there.
          const goal = movement.destination;
          if (goal) { const g = toScreen(goal); layers.push({ depth: goal[0] + goal[1] - 40, draw: () => drawTapMarker(ctx, g.x, g.y, now, live.current.reducedMotion) }); }
          layers.sort((a, b) => a.depth - b.depth).forEach(layer => layer.draw());
          // Close to a Data Center poster, a label says how to view it.
          if (interior?.kind === "datacenter" && live.current.nearPoster >= 0) {
            const rect = posterRects.current.find(entry => entry.index === live.current.nearPoster);
            if (rect) drawLabel(ctx, "Tap the poster or press V to view it", rect.x + rect.w / 2, rect.y - 14);
          }
          // Close to the signpost, a label says how to read it.
          if (nearWantedSign.current && wantedSignRect.current) { const b = wantedSignRect.current; drawLabel(ctx, "Tap the poster or press V to read it", b.x + b.w / 2, b.y + b.h + 18); }
          // Walk-in labels: a building's door or the exchange's when you are close outside, a terminal when you are close inside.
          const LABEL_REACH = 90;
          if (!interior) {
            const doors: [BuildingKind | "store", WorldPoint, string][] = [["store", store.position, "Walk in to shop"],
              ...PLACED_BUILDINGS.map(building => [building.kind, building.position, `Walk in: ${BUILDING_NAMES[building.kind]}`] as [BuildingKind, WorldPoint, string])];
            for (const [kind, where, text] of doors) {
              const front = doorFront(kind, where);
              if (distance(state.position, front) <= LABEL_REACH * 1.6) { const p = toScreen(front); drawLabel(ctx, text, p.x, p.y + 22); }
            }
          } else for (const item of interior.furniture) {
            if (item.kind === "pedestal") {
              const slot = item.slot ?? 0, centre: WorldPoint = [item.x + item.w / 2, item.y + item.h / 2];
              const nearest = interior.furniture.filter(other => other.kind === "pedestal").reduce((best, other) =>
                distance(state.position, [other.x + other.w / 2, other.y + other.h / 2]) < distance(state.position, [best.x + best.w / 2, best.y + best.h / 2]) ? other : best);
              if (nearest === item && distance(state.position, centre) <= 30) {
                const p = lifted(centre, FURNITURE_LIFT + 50), trophy = TROPHIES[slot];
                drawLabel(ctx, slot < live.current.trophies ? `${trophy.name} · ${trophy.title}` : `${trophy.name}: settle a licence with ${slot + 1} seed word${slot ? "s" : ""}`, p.x, p.y);
              }
              continue;
            }
            const text = item.kind === "terminal" ? "Walk in: achievements" : item.kind === "charger" ? "Walk in: reload the Laser Gun" : item.kind === "mint" ? "Walk in: mint terminal" : item.kind === "vault" ? "Walk in: The Vault" : item.kind === "settlement" ? "Walk in: Licence Settlement" : null;
            const centre: WorldPoint = [item.x + item.w / 2, item.y + item.h / 2];
            if (text && distance(state.position, centre) <= LABEL_REACH * 0.7) { const p = lifted(centre, FURNITURE_LIFT + 60); drawLabel(ctx, text, p.x, p.y); }
          }
          // Temporary Trojan Horses count down: over a parked one with its time running, and as a bar at the top while ridden.
          for (const mount of horses.current) {
            if (mount.kind !== "temporary" || mount.expiresAt === null) continue;
            const left = Math.max(0, mount.expiresAt - now), seconds = Math.ceil(left / 1000);
            if (mount.mounted) {
              drawLabel(ctx, `Trojan Horse · ${seconds} s left · R dismounts`, VIEW.width / 2, 80, left < 10_000 ? "warn" : "plain");
              ctx.fillStyle = "#000"; ctx.fillRect(VIEW.width / 2 - 82, 94, 164, 6);
              ctx.fillStyle = left < 10_000 ? "#d94f3c" : "#3fbf4f"; ctx.fillRect(VIEW.width / 2 - 81, 95, Math.round(162 * left / HORSE_TEMP_MS), 4);
            } else if (!interior) { const p = toScreen(mount.position); drawLabel(ctx, `${seconds} s`, p.x, p.y - 118, left < 10_000 ? "warn" : "plain"); }
          }
          if (!interior) {
            // Discover whatever the window shows (its world-space bounding box), then draw the map of what has been seen.
            const [vx, vy] = project(...state.position), views = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([kx, ky]) => unproject(vx + kx * VIEW.width / 2 / SCALE, vy + ky * VIEW.height / 2 / SCALE));
            discover(discovered.current, { x0: Math.min(...views.map(v => v[0])), y0: Math.min(...views.map(v => v[1])), x1: Math.max(...views.map(v => v[0])), y1: Math.max(...views.map(v => v[1])) }, npcs.current, horses.current);
            // The Data Center key: every wanted outlaw is tracked on the map, seen or not.
            if (live.current.keys.has("datacenter")) for (const npc of npcs.current) if (npc.kind === "outlaw") discovered.current.outlaws.add(npc.id);
            const box = bigMap.current ? MINIMAP_BIG : MINIMAP;
            const marks = drawMinimap(ctx, state.position, npcs.current, horses.current, discovered.current, now, live.current.reducedMotion, box);
            // Hovering the map names the nearest marker under the pointer.
            const hover = pointer.current;
            if (hover && inBox(box, hover.x, hover.y)) {
              const nearest = marks.map(mark => ({ mark, far: Math.hypot(mark.x - hover.x, mark.y - hover.y) })).filter(entry => entry.far <= 8).sort((a, b) => a.far - b.far)[0];
              if (nearest) drawLabel(ctx, nearest.mark.label, nearest.mark.x, nearest.mark.y - 18);
            }
          }
          // Warning arrows for outlaws (or the building hiding one) that are close but off-screen.
          const pulse = live.current.reducedMotion ? 1 : Math.floor(now / 300) % 2;
          for (const npc of npcs.current) {
            if (npc.kind !== "outlaw") continue;
            const spot = interior ? (here(npc) ? npc.position : null) : outlawSpot(npc);
            if (!spot || distance(spot, state.position) > WARN_RANGE) continue;
            // The first time a new outlaw comes this near (as its red arrow would appear): tumbleweed time, the showdown cue. Once per
            // outlaw (Pumper and Dumper share theirs) in each fresh country.
            const meeting = PAIR.includes(npc.name ?? "") ? "Pumper & Dumper" : npc.name ?? "";
            if (active && !met.has(meeting)) { met.add(meeting); audio.current?.play("showdown"); }
            const at = toScreen(spot);
            if (!onScreen(at, 0)) drawWarningArrow(ctx, at, pulse);
          }
          // Animal sounds: every animal in earshot calls now and then on its own timer, so a herd or a flock sounds like one, placed by
          // distance and side of the screen; at most MAX_CALLS_PER_SECOND start in any second, so a crowd stays a chorus, not a din.
          if (active) {
            const place = (npc: Npc, far: number, range: number) => {
              const at = toScreen(npc.position);
              return { gain: Math.max(0, 1 - far / range) ** 1.3, pan: Math.max(-0.8, Math.min(0.8, (at.x - VIEW.width / 2) / (VIEW.width / 2) * 0.8)) };
            };
            while (recentCalls.length && now - recentCalls[0] > 1000) recentCalls.shift();
            const crowds = new Map<AnimalId, { npc: Npc; far: number }[]>();
            for (const npc of npcs.current) {
              if (npc.kind === "outlaw" || npc.fallenAt || !here(npc)) continue;
              const far = distance(npc.position, state.position), kind = npc.kind as AnimalId;
              // The dragon roars each time it stops to breathe fire.
              if (kind === "dragon" && npc.mode === "breathe" && far <= HEAR_RANGE * 1.5 && !roared.has(npc.modeUntil)) {
                roared.add(npc.modeUntil); audio.current?.play("dragon", place(npc, far, HEAR_RANGE * 1.5));
              }
              if (far > HEAR_RANGE) continue;
              const call = ANIMAL_CALLS[kind];
              if (call) {
                const due = nextCall.get(npc.id);
                // A newcomer starts at a random point in its rhythm, so animals of a kind never call in step.
                if (due === undefined) nextCall.set(npc.id, now + random(0, call.every[1]));
                else if (now >= due) {
                  if (recentCalls.length >= MAX_CALLS_PER_SECOND) nextCall.set(npc.id, now + random(200, 700));
                  else { nextCall.set(npc.id, now + random(...call.every)); recentCalls.push(now); audio.current?.play(call.cue, place(npc, far, HEAR_RANGE)); }
                }
              }
              const loop = ANIMAL_LOOPS[kind];
              if (loop && far <= loop.range && (!loop.moving || npc.walking)) {
                const crowd = crowds.get(kind); if (crowd) crowd.push({ npc, far }); else crowds.set(kind, [{ npc, far }]);
              }
            }
            // Ongoing sounds: the more of a kind nearby, the more voices (up to three), each from one of the nearest.
            for (const [kind, crowd] of crowds) {
              const loop = ANIMAL_LOOPS[kind]!;
              if (now < (nextLoop.get(kind) ?? 0)) continue;
              nextLoop.set(kind, now + loop.every);
              crowd.sort((a, b) => a.far - b.far);
              const voices = Math.min(3, crowd.length, loop.perVoice ? Math.ceil(crowd.length / loop.perVoice) : crowd.length);
              for (const { npc, far } of crowd.slice(0, voices)) audio.current?.play(loop.cue, place(npc, far, loop.range));
            }
          }
          // Soft footsteps while you walk on foot (the horse's hoofbeats take over while riding).
          if (active && state.walking && !ridden() && now - lastStep >= STEP_MS) { lastStep = now; audio.current?.play("step"); }
          // The music: The Standoff while a living outlaw is near (in the country, or in the building you are in), Trail Gallop while
          // riding, Lonesome Trail otherwise.
          {
            const near = Math.min(Infinity, ...npcs.current.filter(npc => npc.kind === "outlaw" && !npc.fallenAt).map(npc => {
              const spot = interior ? (here(npc) ? npc.position : null) : outlawSpot(npc);
              return spot ? distance(spot, state.position) : Infinity;
            }));
            tense = tense ? near <= MUSIC_CALM : near <= MUSIC_TENSE;
            // An outlaw near wins (The Standoff); otherwise riding a horse plays Trail Gallop, and walking Lonesome Trail.
            const next = live.current.wallet ? "hack" : tense ? "tense" : ridden() ? "ride" : "calm";
            if (next !== mood) { mood = next; audio.current?.setMusicMood(mood); }
          }
          // A downed outlaw left lying gets back up after OUTLAW_DOWN_MS (unless its dialog or wallet is open), but never once you
          // have looted it (impounded anything); walking into one while it is down reopens its belongings.
          if (active) for (const npc of npcs.current) {
            if (npc.kind !== "outlaw" || !npc.fallenAt || !here(npc)) continue;
            if (!npc.looted && now - npc.fallenAt >= OUTLAW_DOWN_MS) { npc.fallenAt = 0; npc.hp = outlawHits(npc.name); setNote(`${npc.name ?? "The hacker"} gets back up.`, "bad"); continue; }
            if (state.walking && now >= contactCooldown.current && distance(npc.position, state.position) <= CONTACT) { movement.stop(); contactCooldown.current = now + CONTACT_COOLDOWN; setPrompt({ npcId: npc.id, name: npc.name ?? "The hacker", step: "list" }); }
          }
          // Walking into an outlaw lets it rob you of one item (an outlaw bumping a standing player does not), then a short immunity.
          if (active && state.walking && now >= contactCooldown.current) {
            const outlaw = npcs.current.find(npc => npc.kind === "outlaw" && !npc.fallenAt && here(npc) && distance(npc.position, state.position) <= CONTACT);
            if (outlaw) {
              contactCooldown.current = now + CONTACT_COOLDOWN;
              audio.current?.play("bump");
              const { owned: haves, captured: pets } = live.current;
              const pool: Loot[] = [
                ...(Object.keys(haves) as Durable[]).filter(id => haves[id] > 0),
                ...(Object.keys(pets) as AnimalId[]).filter(kind => (pets[kind] ?? 0) > 0),
              ];
              const taken = pool[Math.floor(Math.random() * pool.length)];
              if (!taken) setNote(`Ouch, ${outlaw.name} shoved you, but you had nothing to take.`, "bad");
              else {
                outlaw.loot.push(taken);
                if (isAnimal(taken)) setCaptured(value => ({ ...value, [taken]: (value[taken] ?? 0) - 1 }));
                else setOwned(value => ({ ...value, [taken]: value[taken] - 1 }));
                setNote(`Ouch, ${outlaw.name} took ${lootName(taken)} from you`, "bad");
              }
            }
          }
          // The Trojan Horses: a temporary one's 30 seconds run out and it vanishes (from under you, if you are on it); the one you
          // ride moves with the Friend; walking into a standing one mounts it (after any dismount cooldown).
          for (const mount of horses.current) {
            if (mount.expiresAt === null || now < mount.expiresAt) continue;
            horses.current = horses.current.filter(other => other !== mount);
            if (mount.mounted) { movement.setSpeed(1); setRiding(false); setNote("The Trojan Horse vanishes from under you.", "bad"); }
          }
          if (!interior) {
            const mount = ridden();
            if (mount) { mount.position = [...state.position]; mount.facing = state.facing; }
            else if (active && state.walking) {
              const near = horses.current.find(other => now >= other.cooldown && distance(state.position, other.position) <= HORSE.reach);
              if (near) {
                near.mounted = true; near.position = [...state.position]; movement.setSpeed(HORSE.speed); setRiding(true);
                // A temporary horse's 30 seconds start on its first ride; remounting it says what is left.
                const fresh = near.kind === "temporary" && near.expiresAt === null;
                if (fresh) near.expiresAt = now + HORSE_TEMP_MS;
                const left = near.expiresAt === null ? 0 : Math.max(1, Math.ceil((near.expiresAt - now) / 1000));
                setNote(near.kind === "golden" ? "You mount your Shiny Golden Trojan Horse. Press R to dismount."
                  : near.kind === "permanent" ? "You mount your Trojan Horse. Press R to dismount."
                  : fresh ? "You mount a Temporary Trojan Horse: 30 seconds of riding. Press R to dismount."
                  : `You mount the Temporary Trojan Horse again: ${left} s of riding left. Press R to dismount.`);
              }
            }
          }
          // Doors: walk against the front of a building's door to go inside, or through the interior entrance to leave.
          if (active && (state.walking || state.pushing) && now >= doorCooldown) {
            if (interior) { if (distance(state.position, interior.entrance) <= 22) leaveBuilding(interior.kind, now); }
            else {
              // The flat storefront's doorway is where it is drawn: a band of screen px under the door gap, walked into (not away from).
              const building = state.facing === "down" ? undefined : PLACED_BUILDINGS.find(entry => atDoor(entry.kind, entry.position, state.position));
              if (building) enterBuilding(building.kind, now);
            }
          }
          // Standing in front of a hung poster (in the Data Center) lets V show it full size.
          let near = -1;
          if (interior?.kind === "datacenter") { const slots = posterSlots(interior); live.current.posters.forEach((_, index) => { const slot = slots[index]; if (slot && distance(state.position, slot.stand) <= POSTER_REACH) near = index; }); }
          if (near !== lastPoster) { lastPoster = near; setNearPoster(near); }
          // Walking into the Data Center's terminal opens the achievements, once per visit, like the exchange door.
          const terminal = interior?.furniture.find(item => item.kind && item.kind in TERMINAL_MENUS && rectHits(state.position[0], state.position[1], RADIUS + 4, item));
          if (!terminal) terminalLatch = false;
          else if (!terminalLatch && active && state.walking) { terminalLatch = true; movement.stop(); openRef.current(TERMINAL_MENUS[terminal.kind as keyof typeof TERMINAL_MENUS]); }
          // Walking against the exchange's door opens the shop, once per visit: it re-arms only after the Friend steps away.
          const atShop = !interior && atDoor("store", store.position, state.position);
          if (!atShop) shopLatch = false;
          else if (!shopLatch && active && (state.walking || state.pushing) && state.facing !== "down") { shopLatch = true; movement.stop(); openRef.current("shop"); }
          // Debug attributes for automated checks refresh ten times a second rather than every frame; serialising every NPC to the DOM per frame is wasted work on slower machines.
          if (now - lastDebug >= 100) { lastDebug = now;
          node.dataset.x = state.position[0].toFixed(2); node.dataset.y = state.position[1].toFixed(2); node.dataset.gear = JSON.stringify(live.current.gear);
          node.dataset.outlaws = JSON.stringify(npcs.current.filter(npc => npc.kind === "outlaw" && here(npc)).map(npc => { const at = toScreen(npc.position); return [Math.round(at.x), Math.round(at.y)]; }));
          node.dataset.wanted = JSON.stringify(npcs.current.filter(npc => npc.kind === "outlaw").map(npc => npc.name));
          node.dataset.shots = String(shots.current.length);
          node.dataset.scene = scene;
          node.dataset.flags = JSON.stringify({ busy: live.current.busy, paused: live.current.paused, equipped: live.current.equipped, charges: live.current.charges.toString(), pending: live.current.pending, wallet: live.current.wallet ? (live.current.wallet.state === "probing" ? "probing" : live.current.wallet.state.phase) : null });
          const w = live.current.wallet?.state;
          node.dataset.wallet = w && w !== "probing" ? JSON.stringify({ phase: w.phase, grit: w.grit, start: w.start, cursor: w.cursor, slots: w.slots, viruses: w.viruses.map(v => v.tile), tiles: w.tiles.map(tile => (tile.revealed ? tile.kind[0].toUpperCase() : tile.kind[0]) + (isDefender(tile.kind) ? tile.hp : "")) }) : "";
          node.dataset.loot = JSON.stringify(npcs.current.filter(npc => npc.kind === "outlaw").map(npc => [npc.name, npc.scene, ...npc.loot]));
          node.dataset.buildings = JSON.stringify(PLACED_BUILDINGS.map(building => [building.kind, Math.round(building.position[0]), Math.round(building.position[1])]));
          node.dataset.horses = JSON.stringify(horses.current.map(mount => ({ id: mount.id, kind: mount.kind, x: Math.round(mount.position[0]), y: Math.round(mount.position[1]), mounted: mount.mounted, expiresAt: mount.expiresAt })));
          node.dataset.pool = JSON.stringify({ x: POOL.x, y: POOL.y, w: POOL.w, h: POOL.h, frogs: npcs.current.filter(npc => npc.kind === "frog").length, near: npcs.current.filter(npc => npc.kind === "frog" && inPool(npc.position, 120)).length });
          node.dataset.yard = JSON.stringify({ centre: YARD.centre.map(Math.round), chickens: npcs.current.filter(npc => npc.kind === "rooster" || npc.kind === "hen").length, home: npcs.current.filter(npc => (npc.kind === "rooster" || npc.kind === "hen") && distance(npc.position, YARD.centre) <= YARD.range).length, visiting: npcs.current.filter(npc => (npc.kind === "rooster" || npc.kind === "hen") && npc.mode === "visit").length });
          node.dataset.puddle = JSON.stringify({ centre: PUDDLE.centre.map(Math.round), pigs: npcs.current.filter(npc => npc.kind === "pig").length, inside: npcs.current.filter(npc => npc.kind === "pig" && inPuddle(npc.position)).length });
          node.dataset.animals = JSON.stringify(npcs.current.filter(npc => npc.kind !== "outlaw").map(npc => { const at = toScreen(npc.position); return [npc.kind, Math.round(at.x), Math.round(at.y), npc.fallenAt ? "fallen" : npc.mode]; }));
          }
          frame = requestAnimationFrame(render);
        };
        frame = requestAnimationFrame(render);
      })
      .catch(cause => {
        if (cancelled) return;
        setFailed(true);
        setStatus(cause instanceof Error && cause.message.includes("selected Friend") ? cause.message
          : "The country or your Friend's artwork could not load. Check your connection and retry.");
      });
    return () => {
      cancelled = true; abort.abort(); cancelAnimationFrame(frame); stop(); mover.current = null;
      window.removeEventListener("blur", stop); document.removeEventListener("visibilitychange", stop);
    };
  }, [friendId, client, revision]);

  function cycleEquipped() {
    const ids = ITEMS.filter(item => holdable(item.id) && count(item.id) > 0n).map(item => item.id);
    if (!ids.length) { setEquipped(null); setNote("Nothing to equip yet. The Centralised Exchange sells a Laser Gun.", "bad"); return; }
    const next = ids[(ids.indexOf(equipped as ItemId) + 1) % ids.length];
    setEquipped(next);
    if (ids.length === 1 && equipped === next) setNote(`${ITEMS.find(item => item.id === next)!.name} is the only thing you can hold.`);
  }

  function removeNpc(id: number) {
    const npc = npcs.current.find(entry => entry.id === id);
    if (!npc) return;
    npcs.current = npcs.current.filter(entry => entry.id !== id);
    // Caught animals never respawn; the next outlaw wave is rolled only once the whole current wave is down.
    if (npc.kind !== "outlaw" || npcs.current.some(entry => entry.kind === "outlaw")) return;
    const [min, max] = NPC.outlaw.respawnMs;
    respawns.current.push({ kind: "outlaw", at: performance.now() + random(min, max) });
    // The signpost shows the next outlaw's poster straight away; the outlaw itself turns up with the wave, a little later.
    const upcoming = upcomingOutlawName();
    setWanted(upcoming ? { name: upcoming, members: waveMembers(upcoming).map(member => ({ name: member, variant: variantOf(member) })) } : null);
  }

  /** A laser kill: the body falls (a dragon explodes), any ANIMALS.md reward is added to the simulated balance as a trophy, and a fresh roll respawns after KILL_RESPAWN_MS. */
  function killAnimal(npc: Npc, now: number) {
    const spec = ANIMAL_BY_ID[npc.kind as AnimalId];
    if (spec.id === "dragon") { effects.current.push({ position: [...npc.position], start: now }); npcs.current = npcs.current.filter(entry => entry !== npc); }
    else { npc.fallenAt = now; npc.walking = false; }
    respawns.current.push({ kind: "animal", species: spec.id, at: now + KILL_RESPAWN_MS });
    if (spec.id === "bear" || spec.id === "lion") setStats(value => ({ ...value, [spec.id === "bear" ? "bears" : "lions"]: value[spec.id === "bear" ? "bears" : "lions"] + 1 }));
    setOp(value => value + (spec.id === "bear" || spec.id === "lion" ? OP_BIG_GAME : OP_ANIMAL));
    setNote(spec.id === "dragon" ? "The Dragon explodes!" : `${spec.name} down.`);
  }

  /** Add a rolled keepsake to the inventory (a perk arms for your next hack; the sealed feed sack waits to be opened) and say how it
   * reads on the REWARDS frame and in the belongings list. */
  function gainKeepsake(keepsake: NonNullable<ReturnType<typeof rollKeepsake>>, outlaw: string): string {
    // The Pig Butcher's Cleaver drops as the Cleaver itself, the usable item (not a keepsake row).
    if (keepsake.name === "Cleaver") { setOwned(value => ({ ...value, cleaver: value.cleaver + 1 })); return "the usable Cleaver: press Q to hold it"; }
    setKeepsakes(value => addKeepsake(value, { name: keepsake.name, outlaw, rarity: keepsake.rarity, detail: keepsake.detail, count: 1, perk: keepsake.perk }));
    if (keepsake.perk && keepsake.perk !== "card") setPerks(value => [...value, keepsake.perk!]);
    return keepsake.perk === "card" ? "open it in your inventory" : keepsake.perk ? `${PERK_TEXT[keepsake.perk]} next hack` : "keepsake";
  }
  /** A neutralized outlaw's loot, once (one that gets back up and goes down again drops nothing more): a Butterfly Net
   * NET_DROP_CHANCE of the time, and a keepsake from its own table in KEEPSAKES.md (normal odds, one for Pumper and Dumper
   * together). Both wait among its belongings to impound, with anything it stole from you. */
  function dropOutlawKeepsake(npc: Npc) {
    const pair = PAIR.includes(npc.name ?? ""), table = pair ? "Pumper & Dumper" : npc.name ?? "";
    if (npc.dropped) return;
    const shared = pair && npcs.current.some(other => other !== npc && PAIR.includes(other.name ?? "") && other.dropped);
    npc.dropped = true;
    if (Math.random() < NET_DROP_CHANCE) npc.net = "waiting";
    if (shared) return;
    // The keepsake is rolled now and waits among the belongings until you impound it.
    const keepsake = rollKeepsake(table, false); if (!keepsake) return;
    npc.keepsake = { roll: keepsake, table, taken: false };
  }

  /** Impound from a neutralized outlaw's belongings: its keepsake, a Butterfly Net or a stolen item goes into the inventory; its
   * hardware wallet trips the kill switch (half a wallet goes into the inventory instead). */
  function impound(item: "wallet" | "keepsake" | "net" | { stolen: number }) {
    const current = live.current.prompt; if (!current) return;
    const npc = npcs.current.find(entry => entry.id === current.npcId); if (!npc?.belongings) { setPrompt(null); return; }
    if (typeof item === "object") {
      // One of the things it stole from you: back into your inventory.
      const taken = npc.loot[item.stolen]; if (taken === undefined) return;
      npc.loot = npc.loot.filter((_, index) => index !== item.stolen); npc.looted = true;
      if (isAnimal(taken)) setCaptured(value => ({ ...value, [taken]: (value[taken] ?? 0) + 1 }));
      else setOwned(value => ({ ...value, [taken]: value[taken] + 1 }));
      setNote(`You take back your ${lootName(taken)}.`);
      setPrompt({ ...current });
    } else if (item === "net") {
      if (npc.net !== "waiting") return;
      npc.net = "taken"; npc.looted = true;
      setOwned(value => ({ ...value, "butterfly-net": value["butterfly-net"] + 1 }));
      setNote("You impound the Butterfly Net. Hold it with Q and swing it next to a butterfly.");
      setPrompt({ ...current });
    } else if (item === "keepsake") {
      if (!npc.keepsake || npc.keepsake.taken) return;
      npc.keepsake.taken = true; npc.looted = true;
      const note = gainKeepsake(npc.keepsake.roll, npc.keepsake.table);
      setNote(npc.keepsake.roll.name === "Cleaver" ? "You impound the Cleaver. Press Q to hold it." : `You impound the ${npc.keepsake.roll.name}${note === "keepsake" ? "" : `: ${note}`}.`);
      setPrompt({ ...current });
    } else if (item === "wallet" && npc.belongings.wallet && npc.belongings.half) {
      // Half a wallet cannot be hacked on its own: it goes into the inventory until the other half turns up.
      const half = npc.belongings.half;
      npc.belongings.wallet = false; npc.looted = true;
      setHalves(value => ({ ...value, [half]: true }));
      setPrompt({ ...current });
    } else if (item === "wallet" && npc.belongings.wallet) {
      npc.belongings.wallet = false; npc.looted = true;
      setPrompt({ ...current, step: "killswitch" });
    }
  }
  /** Start cracking the impounded wallet: a fresh, solvable board. */
  function hackNow() {
    const current = live.current.prompt; if (!current) return;
    if (voiceTimer.current) { clearTimeout(voiceTimer.current); voiceTimer.current = null; }
    if (current.npcId === COMBINED_ID) {
      walletSettled.current = -1; setPrompt(null);
      setWallet({ npcId: COMBINED_ID, name: "Pumper & Dumper", state: startWallet(outlawLevel("Pumper")) }); setBriefing(true);
      return;
    }
    const npc = npcs.current.find(entry => entry.id === current.npcId); if (!npc) { setPrompt(null); return; }
    walletSettled.current = -1;
    setPrompt(null);
    setWallet({ npcId: npc.id, name: npc.name, state: startWallet(outlawLevel(npc.name)) }); setBriefing(true);
  }
  /** "Heck no": the wallet hears "Hack now" anyway, shows that for VOICE_MS, then starts the hack. */
  function heckNo() {
    const current = live.current.prompt; if (!current) return;
    setPrompt({ ...current, step: "voice" });
    voiceTimer.current = setTimeout(() => { voiceTimer.current = null; hackNowRef.current(); }, VOICE_MS);
  }
  /** Put Pumper's top half and Dumper's bottom half together: the whole wallet trips its kill switch like any other. */
  function combineHalves() {
    if (!live.current.halves.top || !live.current.halves.bottom || live.current.wallet) return;
    setHalves({ top: false, bottom: false }); setMenu(null);
    setPrompt({ npcId: COMBINED_ID, name: "Pumper & Dumper", step: "killswitch" });
  }
  /** The Exit Scammer's "Exit": he is gone with the wallet (and whatever he stole that you left him); no hack, and the next outlaw comes along. */
  function exitScammed() {
    const current = live.current.prompt; if (!current || current.step !== "killswitch") return;
    removeNpc(current.npcId);
    setPrompt({ ...current, step: "exited" });
  }
  const hackNowRef = useRef(hackNow); hackNowRef.current = hackNow;
  useEffect(() => () => { if (voiceTimer.current) clearTimeout(voiceTimer.current); }, []);
  /** Leave the outlaw's belongings: it stays down on the floor for OUTLAW_DOWN_MS, then gets up with whatever was left; a looted
   * outlaw stays down for good. */
  function leaveWallet() {
    const current = live.current.prompt; if (!current || current.step !== "list") return;
    const npc = npcs.current.find(entry => entry.id === current.npcId);
    if (npc) npc.fallenAt = performance.now();
    contactCooldown.current = performance.now() + CONTACT_COOLDOWN;
    setPrompt(null); setNote(npc?.looted ? `${current.name} stays down for good.` : `${current.name} stays down for a minute.`);
  }

  /** Apply a wallet action; the first transition into won or lost pays out or lets the hacker go, exactly once. */
  function walletAct(action: WalletAction) {
    const current = live.current.wallet;
    if (!current || current.state === "probing" || current.state.phase !== "open") return;
    const next = walletReduce(current.state, action);
    if (next === current.state) return;
    setWallet({ ...current, state: next });
    if (next.phase === "open" || walletSettled.current === current.npcId) return;
    walletSettled.current = current.npcId;
    // Back to the Exchange the moment the hack ends, behind the board: its terrain loads and rasterizes while the result is on
    // screen, so closing the board shows the Exchange at once (not a blank or half-drawn country).
    sendHome.current?.(performance.now());
    const name = current.name ?? "The hacker";
    // The outlaws this wallet settles: its owner, or both Pumper and Dumper for the combined wallet. What they stole is impounded from
    // their belongings (or goes with them when they are taken in), so the wallet holds only its own haul.
    const owners = current.npcId === COMBINED_ID ? npcs.current.filter(npc => npc.kind === "outlaw" && PAIR.includes(npc.name ?? "")) : npcs.current.filter(npc => npc.id === current.npcId);
    const takeIn = () => { for (const npc of owners) removeNpc(npc.id); };
    if (next.phase === "won") {
      takeIn();
      // The rating goes on the result and on each owner's poster in the Data Center.
      const stars = walletStars(next), ownerNames = owners.map(npc => npc.name ?? name);
      setPosters(value => value.map(poster => (ownerNames.includes(poster.name) ? { ...poster, stars } : poster)));
      setWallet({ ...current, state: { ...next, text: `Wallet cracked. ${name} ${owners.length > 1 ? "weep" : "weeps"}. Rating: ${starText(stars)}.` } });
      openHaul(outlawLevel(current.npcId === COMBINED_ID ? "Pumper" : current.name), stars, ownerNames, current.npcId === COMBINED_ID ? "Pumper & Dumper" : name);
    } else {
      // The kill switch wipes the impounded wallet (its haul is lost), and the hacker is taken in.
      takeIn();
      setHaul(null);
      setWallet({ ...current, state: { ...next, text: `${next.text} The kill switch wipes the wallet. ${name} ${owners.length > 1 ? "are" : "is"} taken in.` } });
    }
    // The licence run: a wiped wallet counts against it; The Liquidator's wallet, or one wiped wallet too many, ends it.
    if (run) {
      const lost = run.lost + (next.phase === "won" ? 0 : 1), level = outlawLevel(current.npcId === COMBINED_ID ? "Pumper" : current.name);
      if (lost !== run.lost) setRun({ ...run, lost });
      if (level >= LIQUIDATOR_LEVEL) {
        // The last wallet: the board itself says where to go next.
        setWallet(value => value && value.state !== "probing" ? { ...value, state: { ...value.state, text: `${value.state.text} Your run is over: settle your licence at the Data Center's Licence Settlement terminal.` } } : value);
        void endRun("The Liquidator's wallet is settled: the country is clean.", { ...run, lost });
      }
    }
  }
  function closeWallet() {
    setBriefing(false);
    const finished = !!wallet && wallet.state !== "probing" && wallet.state.phase !== "open";
    // A finished hack already sent you home (walletAct), while the board still covered the country.
    // A finished run points to the Licence Settlement rather than just saying where you are.
    setWallet(null); setNote(!finished ? "" : settling ? "Run over: settle your licence at the Data Center's Licence Settlement terminal (its top-right room). The friendly locals point the way." : "Back at the Centralised Exchange."); setHaul(null); setRewardsOpen(false);
    // A run that just ended shows its payout once the board is closed.
    if ((settling || runEnd) && !run) open("licence");
  }

  /** Buy a Bounty Hunter licence (one SDK consumable, the one confirmation) unless you already hold an unused one, and start the run
   * with a Laser Gun. The licence is used, which rolls its payout, only when the run ends. */
  async function startRun() {
    if (!snapshot || busy || run) return;
    setBusy(true); setFeedback("");
    try {
      if (snapshot.consumables === 0n) await client.buy(1n);
      setSnapshot(await client.read());
      setRun({ lost: 0 }); setRunEnd(null);
      // A head start earned at the last settlement comes with this licence, then is used up.
      const head = headStart, shots = LASER_CHARGES + BigInt(head.shots) > LASER_MAX ? LASER_MAX : LASER_CHARGES + BigInt(head.shots);
      setShotsLeft(shots); setEquipped("laser"); setOp(value => value + START_OP);
      if (head.intel) setIntel(value => value + head.intel);
      if (head.gas) setGasVouchers(value => value + head.gas);
      if (head.cards) setProgramCards(value => [...value, ...Array.from({ length: head.cards }, () => CARD_PROGRAMS[Math.floor(Math.random() * CARD_PROGRAMS.length)])]);
      setHeadStart(NO_HEAD_START);
      setMenu(null);
      setNote(`Licence issued: your Laser Gun holds ${shots} shots, and ${START_OP} OP to start with.${headStartText(head) ? ` Head start: ${headStartText(head)}.` : ""} Happy hunting.`);
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "The licence could not be issued.");
    } finally { setBusy(false); }
  }
  /** End the run and reveal its payout. */
  async function endRun(reason: string, ending: Run | null = run) {
    if (!ending) return;
    setRun(null); setShotsLeft(0n); setEquipped(current => (current === "laser" ? null : current));
    // The licence is settled at the Data Center's Licence Settlement terminal, where the seed words are handed in.
    setSettling({ reason }); setSettled(null); setPhrase(new Set());
    setNote(`Run over. ${reason} Go to the Data Center to settle your licence: the terminal in its top-right room takes your seed words.`);
  }
  /** Settle the finished run's licence with the seed words placed in the phrase: its RF payout is rolled (the SDK "Use"), then each
   * word pays OP and a head start for your next licence, earns the trophies up to that count, and twelve open the Cold Wallet. */
  async function settleLicence() {
    // A finished run's licence, or the active run's: retiring is allowed any time, and settles with the words you hold so far.
    const reason = settling?.reason ?? (run ? "You retired." : null);
    if (!reason || busy) return;
    const words = SEED_WORDS.filter(word => phrase.has(word) && seedWords.has(word)), n = words.length;
    setBusy(true);
    try { if (!await revealPayout(reason)) return; } finally { setBusy(false); }
    // The active run ends only once its payout is through (cancelling the "Use" confirmation keeps it going).
    if (run) { setRun(null); setShotsLeft(0n); setEquipped(current => (current === "laser" ? null : current)); }
    const op = seedOp(n), head = headStartFor(n), earned = TROPHIES.map((_, index) => index).filter(index => index >= trophies && index < n);
    setOp(value => value + op);
    setHeadStart(value => ({ shots: value.shots + head.shots, intel: value.intel + head.intel, gas: value.gas + head.gas, cards: value.cards + head.cards }));
    setSeedWords(value => new Set([...value].filter(word => !words.includes(word))));
    if (n > trophies) setTrophies(n);
    const cold = n === SEED_WORDS.length, hadGolden = goldenHorse;
    if (cold) {
      setColdRewards(COLD_WALLET_LOOT.map(item => (hadGolden ? { ...item, detail: "already in your stable" } : item)));
      if (!hadGolden) { setGoldenHorse(true); horses.current = [...horses.current, newHorse("golden", goldenSpot())]; }
    }
    setSettled({ words: n, op, head, trophies: earned, cold, hadGolden }); setSettling(null); setPhrase(new Set());
  }
  /** Use the licence and settle it: its play rolls the RF payout (kept in your inventory to redeem). A play already made but not settled
   * (a reload in between) is settled instead of using another licence, so one licence always pays out exactly once. */
  async function revealPayout(reason: string): Promise<boolean> {
    try {
      const fresh = await client.read();
      let id = fresh.plays.find(play => play.outcomeId === null)?.id;
      if (id === undefined) { if (fresh.consumables === 0n) throw new Error("No licence to settle."); id = (await client.play(1n))[0].id; }
      const done = await client.settle(id), outcome = definition.outcomes[(done.outcomeId ?? 1) - 1];
      setSnapshot(await client.read());
      setRunEnd({ reason, outcome: outcome.name, reward: outcome.reward });
      setStats(value => ({ ...value, biggest: outcome.reward > value.biggest ? outcome.reward : value.biggest }));
      return true;
    } catch (cause) {
      setSnapshot(await client.read().catch(() => snapshot!));
      setRunEnd({ reason, outcome: "", reward: 0n });
      setFeedback(`The payout is not revealed yet: ${cause instanceof Error ? cause.message : "try again"}.`);
      return false;
    }
  }
  /** A licence play left unsettled by a reload: settle it now (its run's progress was lost with the reload). */
  async function resolvePending() {
    if (busy) return;
    setBusy(true);
    try { await revealPayout("The game reloaded during your last run."); } finally { setBusy(false); }
  }


  /** Open a cracked wallet: its OP (by tier and stars, tripled in a jackpot wallet), its loot and one keepsake from its outlaw. No RF
   * and no dialog: the RF is the licence's payout, revealed when the run ends. */
  function openHaul(level: number, stars: number, ownerNames: readonly string[], outlaw: string) {
    const jackpot = Math.random() < JACKPOT_WALLET_CHANCE, op = walletOp(level, stars) * (jackpot ? 3 : 1);
    setOp(value => value + op);
    const finds: RewardItem[] = [{ icon: "op", label: `+${op} OP`, detail: jackpot ? "tripled" : "Outlaw Points", rarity: jackpot ? "legendary" : "common" }];
    // No keepsake here: the owner's keepsake already dropped when it was neutralized (jackpot wallets add none).
    finds.push(...rollLoot(jackpot));
    setHaul({ items: finds, jackpot, outlaw }); setRewardsOpen(true);
    setStats(value => ({ ...value, jackpots: value.jackpots + (jackpot ? 1 : 0) }));
    if (jackpot) setPosters(value => value.map(poster => (ownerNames.includes(poster.name) ? { ...poster, jackpot: true } : poster)));
  }

  /** Roll a cracked wallet's other contents (twice for a jackpot wallet) and put them in the inventory; returns what was found. */
  function rollLoot(jackpot: boolean): RewardItem[] {
    const finds: RewardItem[] = [];
    // A new seed phrase word every time, two from a jackpot wallet.
    const missing = SEED_WORDS.filter(word => !seedWords.has(word)).sort(() => Math.random() - 0.5).slice(0, jackpot ? 2 : 1);
    if (missing.length) {
      const total = seedWords.size + missing.length;
      setSeedWords(value => new Set([...value, ...missing]));
      for (const word of missing) finds.push({ icon: "seed", label: `Seed word "${word}"`, detail: total === SEED_WORDS.length ? "phrase complete" : `${total} of ${SEED_WORDS.length}`, rarity: "uncommon" });
    }
    let lacking = (["datacenter", "miningfarm"] as BuildingKey[]).filter(key => !keys.has(key));
    for (let roll = 0; roll < (jackpot ? 2 : 1); roll++) {
      if (Math.random() < LOOT_ODDS.card) { const card = CARD_PROGRAMS[Math.floor(Math.random() * CARD_PROGRAMS.length)]; setProgramCards(value => [...value, card]); finds.push({ icon: "card", label: `${PROGRAMS[card].name} card`, detail: "pre-loaded next hack", rarity: "uncommon", program: card }); }
      if (lacking.length && Math.random() < LOOT_ODDS.key) {
        const key = lacking[Math.floor(Math.random() * lacking.length)]; lacking = lacking.filter(other => other !== key);
        setKeys(value => new Set([...value, key])); if (key === "miningfarm") miningSince.current = performance.now();
        finds.push({ icon: "key", label: BUILDING_KEYS[key].name, detail: "building key", rarity: "rare" });
      }
      if (Math.random() < LOOT_ODDS.intel) { setIntel(value => value + 1); finds.push({ icon: "intel", label: "Intel", detail: "marks the outlaws", rarity: "common" }); }
      if (Math.random() < LOOT_ODDS.gas) { setGasVouchers(value => value + 1); finds.push({ icon: "gas", label: "Gas voucher", detail: "+1 trace next hack", rarity: "common" }); }
      if (Math.random() < LOOT_ODDS.horse) { setOwned(value => ({ ...value, "temp-horse": value["temp-horse"] + 1 })); finds.push({ icon: "horse", label: "Horse token", detail: "a Temporary Trojan Horse", rarity: "uncommon" }); }
    }
    return finds;
  }

  /** A fresh board for this wallet, with one gas voucher (+1 trace) and one program card (in your first slot) spent on it if you have them. */
  function startWallet(level: number): WalletState {
    let state = newWallet(walletTierFor(level));
    const notes: string[] = [];
    if (gasVouchers > 0) { state = { ...state, tier: { ...state.tier, traceLimit: state.tier.traceLimit + 1 } }; setGasVouchers(value => value - 1); notes.push("Gas voucher spent: +1 trace"); }
    // Keepsake perks, one-off: all waiting perks are spent on this board.
    for (const perk of perks) {
      if (perk === "slot") state = { ...state, slotLimit: state.slotLimit + 1 };
      else if (perk === "power") state = { ...state, power: state.power + 1 };
      else if (perk === "trace") state = { ...state, tier: { ...state.tier, traceLimit: state.tier.traceLimit + 1 } };
      else if (perk === "programs") {
        // Two program tiles (Honeypots on the Honeypot Farm) shown faintly, as a Block Explorer shows them.
        const kind = state.tier.twist === "honeyfarm" ? "honeypot" : "program";
        const found = state.tiles.map((tile, index) => index).filter(index => !state.tiles[index].revealed && state.tiles[index].kind === kind).sort(() => Math.random() - 0.5).slice(0, 2);
        state = { ...state, explored: [...new Set([...state.explored, ...found])] };
      }
      notes.push(`Keepsake: ${PERK_TEXT[perk]}`);
    }
    if (perks.length) setPerks([]);
    if (programCards.length && state.slots.length < state.slotLimit) { const [card, ...rest] = programCards; state = { ...state, slots: [...state.slots, card] }; setProgramCards(rest); notes.push(`${PROGRAMS[card].name} card pre-loaded`); }
    return notes.length ? { ...state, text: `${notes.join(" · ")}.` } : state;
  }

  /** Open a sealed keepsake (the Fattening feed sack): it is used up and a random program card takes its place. */
  function openSack(name: string) {
    const card = CARD_PROGRAMS[Math.floor(Math.random() * CARD_PROGRAMS.length)];
    setKeepsakes(value => value.flatMap(item => (item.name !== name ? [item] : item.count > 1 ? [{ ...item, count: item.count - 1 }] : [])));
    setProgramCards(value => [...value, card]);
    setNote(`You tear open the ${name}: a ${PROGRAMS[card].name} program card. It is pre-loaded into your next hack.`);
  }

  /** Sell one keepsake at the Exchange for Dust (DUST_OP). */
  function sellKeepsake(name: string) {
    if (!keepsakes.some(item => item.name === name)) return;
    setKeepsakes(value => dropKeepsake(value, name)); setOp(value => value + DUST_OP);
    setNote(`Sold the ${name} for Dust: +${DUST_OP} OP.`);
  }

  /** Move one thing between the inventory and The Vault (`store` puts it away, otherwise it comes back out). */
  function moveVault(entry: VaultEntry, store: boolean) {
    const sign = store ? 1 : -1;
    if (entry.kind === "item") {
      const have = store ? owned[entry.id] : vault.items[entry.id] ?? 0; if (have <= 0) return;
      setOwned(value => ({ ...value, [entry.id]: value[entry.id] - sign }));
      setVault(value => ({ ...value, items: { ...value.items, [entry.id]: (value.items[entry.id] ?? 0) + sign } }));
      if (store && have === 1 && equipped === entry.id) setEquipped(hasLaser ? "laser" : null);
    } else if (entry.kind === "animal") {
      const have = store ? captured[entry.id] ?? 0 : vault.animals[entry.id] ?? 0; if (have <= 0) return;
      setCaptured(value => ({ ...value, [entry.id]: (value[entry.id] ?? 0) - sign }));
      setVault(value => ({ ...value, animals: { ...value.animals, [entry.id]: (value.animals[entry.id] ?? 0) + sign } }));
    } else if (entry.kind === "keepsake") {
      const from = store ? keepsakes : vault.keepsakes, item = from.find(keepsake => keepsake.name === entry.name); if (!item) return;
      if (store) { setKeepsakes(value => dropKeepsake(value, entry.name)); setVault(value => ({ ...value, keepsakes: addKeepsake(value.keepsakes, item) })); }
      else { setVault(value => ({ ...value, keepsakes: dropKeepsake(value.keepsakes, entry.name) })); setKeepsakes(value => addKeepsake(value, item)); }
    } else if (entry.kind === "card") {
      const from = store ? programCards : vault.cards, at = from.indexOf(entry.card); if (at < 0) return;
      const without = (list: readonly ProgramId[]) => { const index = list.indexOf(entry.card); return index < 0 ? [...list] : [...list.slice(0, index), ...list.slice(index + 1)]; };
      if (store) { setProgramCards(value => without(value)); setVault(value => ({ ...value, cards: [...value.cards, entry.card] })); }
      else { setVault(value => ({ ...value, cards: without(value.cards) })); setProgramCards(value => [...value, entry.card]); }
    } else {
      const field = entry.kind;
      const have = store ? (entry.kind === "gas" ? gasVouchers : intel) : vault[field]; if (have <= 0) return;
      const set = entry.kind === "gas" ? setGasVouchers : setIntel;
      set(value => value - sign); setVault(value => ({ ...value, [field]: value[field] + sign }));
    }
  }

  /** Use one Intel: every wanted outlaw on the map right now is marked on your minimap. */
  function useIntel() {
    if (intel <= 0) return;
    for (const npc of npcs.current) if (npc.kind === "outlaw" && !npc.fallenAt) discovered.current.outlaws.add(npc.id);
    setIntel(value => value - 1); setFeedback("Intel used: every wanted outlaw is now marked on your map.");
  }

  /** Summon a Temporary Trojan Horse from the inventory under the Friend and ride it at once; its 30 seconds start now. True when mounted. */
  function mountTempHorse(): boolean {
    const position = mover.current?.state.position;
    if (!position) return false;
    if (sceneRef.current !== "outside") { setNote("No room to ride in here. Mount it outside.", "bad"); return false; }
    if (ridden()) { setNote("You are already riding.", "bad"); return false; }
    if (live.current.owned["temp-horse"] <= 0) { setNote("No Temporary Trojan Horse left. The Exchange sells them for OP.", "bad"); return false; }
    const now = performance.now(), mount = newHorse("temporary", [...position]);
    mount.mounted = true; mount.expiresAt = now + HORSE_TEMP_MS; horses.current = [...horses.current, mount];
    mover.current?.setSpeed(HORSE.speed); setRiding(true);
    setOwned(value => ({ ...value, "temp-horse": value["temp-horse"] - 1 }));
    setNote("A Temporary Trojan Horse appears under you: 30 seconds of riding. Press R to dismount.");
    return true;
  }

  /** Space: swing the Butterfly Net at a butterfly right next to you, fire the Laser Gun, or swing the Cleaver. */
  function useItem() {
    const state = live.current;
    if (state.wallet) return;
    const position = mover.current?.state.position;
    if (!position) return;
    if (hasNet) {
      // Only butterflies are catchable for now, and only with the Butterfly Net.
      const nearby = npcs.current.filter(npc => npc.kind !== "outlaw" && !npc.fallenAt && npc.scene === sceneRef.current && distance(npc.position, position) <= NET_REACH)
        .sort((a, b) => distance(a.position, position) - distance(b.position, position));
      const target = nearby.find(npc => ANIMAL_BY_ID[npc.kind as AnimalId].net === "butterfly");
      if (!target) { setNote(nearby[0] ? `A ${ANIMAL_BY_ID[nearby[0].kind as AnimalId].name} cannot be netted; only butterflies can.` : "No butterfly in reach. Get right next to one and swing again.", "bad"); return; }
      const spec = ANIMAL_BY_ID[target.kind as AnimalId];
      removeNpc(target.id);
      setCaptured(value => ({ ...value, [spec.id]: (value[spec.id] ?? 0) + 1 }));
      setNote(`Animal Captured! A ${spec.name} joins your inventory.`);
    } else if (equipped === "laser") fireWorldShot(position);
    else if (equipped === "cleaver") swingCleaver(position);
    else setNote("Nothing equipped. Press Q to equip an item.", "bad");
  }

  /** The Cleaver: hit the nearest huntable animal in close reach for the damage of one laser shot; outlaws shrug it off. */
  function swingCleaver(position: WorldPoint) {
    const near = (npc: Npc) => !npc.fallenAt && npc.scene === sceneRef.current && distance(npc.position, position) <= CLEAVER_REACH;
    const target = npcs.current.filter(npc => npc.kind !== "outlaw" && near(npc) && ANIMAL_BY_ID[npc.kind as AnimalId].shots > 0)
      .sort((a, b) => distance(a.position, position) - distance(b.position, position))[0];
    if (!target) {
      const outlaw = npcs.current.find(npc => npc.kind === "outlaw" && npc.scene === sceneRef.current && distance(npc.position, position) <= CLEAVER_REACH);
      const other = npcs.current.find(npc => npc.kind !== "outlaw" && near(npc));
      setNote(outlaw ? `The Cleaver has no effect on outlaws. ${outlaw.name ?? "The hacker"} just laughs.` : other ? `You cannot hunt a ${ANIMAL_BY_ID[other.kind as AnimalId].name}.` : "Nothing in reach. Get right next to an animal and swing again.", "bad");
      return;
    }
    target.hp -= 1;
    if (target.hp <= 0) killAnimal(target, performance.now());
    else setNote(`${ANIMAL_BY_ID[target.kind as AnimalId].name} hit! ${target.hp} more to bring it down.`, "bad");
  }

  /** A laser bolt in the world: no prompt, one charge off the visible count, aimed along the facing with a small assist. */
  function fireWorldShot(position: WorldPoint) {
    if (charges === 0n) { setNote("Your Laser Gun is empty. Reload it at the Charging Station for OP.", "bad"); return; }
    const facing = mover.current?.state.facing ?? "down";
    let dir: [number, number] = [vectors[facing][0], vectors[facing][1]];
    const [px, py] = project(...position);
    let best = Infinity;
    for (const npc of npcs.current) {
      if (npc.kind !== "outlaw" || npc.scene !== sceneRef.current) continue;
      const [ox, oy] = project(...npc.position), dx = ox - px, dy = oy - py, far = Math.hypot(dx, dy);
      if (!far || far > SHOT_RANGE || far >= best) continue;
      const angle = Math.acos(Math.max(-1, Math.min(1, (dx * dir[0] + dy * dir[1]) / far)));
      if (angle <= AIM_CONE) { best = far; dir = [dx / far, dy / far]; }
    }
    shots.current.push({ position: [...position], dir, travelled: 0, muzzle: MUZZLE[facing] });
    audio.current?.play("laser");
    setStats(value => ({ ...value, shots: value.shots + 1 }));
    setShotsLeft(value => (value > 0n ? value - 1n : 0n));
  }

  /** The Permanent Trojan Horse: paid in OP (simulated), it appears beside the Friend and is yours for the session. */
  function buyPermanentHorse() {
    if (!canBuyHorse || paused) return;
    const position = mover.current?.state.position ?? spawn;
    setOp(value => value - PERMANENT_HORSE_OP); setPermanentHorse(true);
    horses.current = [...horses.current, newHorse("permanent", horseBeside(position))];
    setFeedback(`Bought a Permanent Trojan Horse for ${PERMANENT_HORSE_OP} OP. It waits outside the Exchange.`);
  }

  // Reloads cost OP (RELOAD_OP a shot), up to LASER_MAX shots in the gun; the gun needs an active licence.
  const reloadable = hasLaser && charges < LASER_MAX ? LASER_MAX - charges : 0n;
  const canReload = (amount: bigint) => !busy && hasLaser && amount > 0n && amount <= reloadable && op >= Number(amount) * RELOAD_OP;
  function reload(amount: bigint) {
    if (!canReload(amount) || paused) return;
    setOp(value => value - Number(amount) * RELOAD_OP); setShotsLeft(value => value + amount);
    setFeedback(`Reloaded ${amount.toString()} shot${amount === 1n ? "" : "s"} for ${Number(amount) * RELOAD_OP} OP.`);
  }

  async function buy(item: Item) {
    if (!canBuy(item) || paused) return;
    setBusy(true); setFeedback("");
    try {
      if (item.op) {
        const id = item.id as Durable;
        setOp(value => value - item.op!);
        setOwned(value => ({ ...value, [id]: value[id] + 1 }));
        setFeedback(`Bought a ${item.name} for ${item.op} OP (simulated).`);
        setBusy(false); return;
      }
      else {
        const id = item.id as Durable;
        setSpent(value => value + item.price);
        setOwned(value => ({ ...value, [id]: value[id] + 1 }));
      }
      setFeedback(`Bought ${item.name} for ${rf(item.price)} (simulated).`);
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "The purchase failed.");
    } finally {
      setBusy(false);
    }
  }

  async function redeem(outcomeId: number) {
    if (busy || paused) return;
    setBusy(true); setFeedback("");
    try { await client.redeem(outcomeId, 1n); setSnapshot(await client.read()); setFeedback("Reward redeemed to your simulated RF."); }
    catch (cause) { setFeedback(cause instanceof Error ? cause.message : "The redemption failed."); }
    finally { setBusy(false); }
  }

  const open = (next: Menu) => { if (!busy && !paused) { stop(); setMenu(next); setFeedback(""); } };
  const openRef = useRef(open); openRef.current = open;
  /** R, or the touch Dismount button: get off the horse you ride. */
  function dismount() {
    const mount = ridden(); if (!mount) return;
    mount.mounted = false; mount.cooldown = performance.now() + HORSE.cooldownMs; mover.current?.setSpeed(1); setRiding(false);
    setNote(mount.kind === "temporary" ? "You dismount. Its time keeps running." : "You dismount. Walk into the horse to ride again.");
  }
  const uiBlocked = paused || menu !== null;
  const inputBlocked = uiBlocked || Boolean(wallet) || Boolean(prompt) || Boolean(viewPoster) || Boolean(status);

  return (
    <section className="outlaw-game" aria-label="Rarefriend Outlaw" aria-busy={paused || busy}
      onPointerDownCapture={() => void audio.current?.unlock()} onKeyDownCapture={() => void audio.current?.unlock()}>
      <div className="outlaw-world" inert={uiBlocked || undefined}>
        <canvas ref={canvasRef} width={VIEW.width} height={VIEW.height} className="outlaw-canvas" tabIndex={inputBlocked ? -1 : 0}
          aria-label="Open country. WASD or arrows to walk. Tap a destination. Walk into the Centralised Exchange to shop. I opens the inventory, M the large map. Q switches what you hold. Space uses it."
          onBlur={stop}
          onKeyDown={event => {
            if (inputBlocked) return;
            const key = event.key.toLowerCase();
            if (keysForMovement.has(key) && mover.current?.setKey(event.key, true)) event.preventDefault();
            if (key === "r" && !event.repeat && ridden()) { event.preventDefault(); dismount(); }
          }}
          onKeyUp={event => { if (mover.current?.setKey(event.key, false)) event.preventDefault(); }}
          onPointerMove={event => {
            const rect = event.currentTarget.getBoundingClientRect();
            pointer.current = { x: (event.clientX - rect.left) * VIEW.width / rect.width, y: (event.clientY - rect.top) * VIEW.height / rect.height };
          }}
          onPointerLeave={() => { pointer.current = null; }}
          onPointerDown={event => {
            if (inputBlocked) return;
            event.preventDefault(); event.currentTarget.focus();
            const rect = event.currentTarget.getBoundingClientRect();
            const sx = (event.clientX - rect.left) * VIEW.width / rect.width, sy = (event.clientY - rect.top) * VIEW.height / rect.height;
            // A tap on a Data Center poster opens it in close-up instead of walking there.
            if (sceneRef.current === "datacenter") {
              const hit = posterRects.current.find(rect => sx >= rect.x && sx <= rect.x + rect.w && sy >= rect.y && sy <= rect.y + rect.h);
              const poster = hit && posters[hit.index];
              if (poster) { stop(); setViewPoster(poster); return; }
            }
            // A tap on the wanted signpost's board opens its poster instead of walking there.
            const sign = wantedSignRect.current;
            if (sign && sceneRef.current === "outside" && sx >= sign.x && sx <= sign.x + sign.w && sy >= sign.y && sy <= sign.y + sign.h) { stop(); setViewWanted(true); return; }
            // A tap on the minimap enlarges it (or shrinks it back) instead of walking there.
            if (sceneRef.current === "outside" && inBox(bigMap.current ? MINIMAP_BIG : MINIMAP, sx, sy)) { bigMap.current = !bigMap.current; return; }
            mover.current?.moveTo(unproject(camera.current.x + (sx - VIEW.width / 2) / SCALE, camera.current.y + (sy - VIEW.height / 2) / SCALE));
          }} />
        {/* Touch devices only (style.css): the keyboard's Space, Q and R as small buttons left of the minimap, while the country is in play. */}
        {!inputBlocked && <div className="outlaw-touch" role="group" aria-label="Touch controls">
          {equipped && <button type="button" onClick={() => useItem()}>Use</button>}
          <button type="button" onClick={() => cycleEquipped()}>Switch</button>
          {riding && <button type="button" onClick={() => dismount()}>Dismount</button>}
        </div>}
        {wallet && <WalletOverlay wallet={wallet.state} name={wallet.name ?? "The hacker"} busy={busy} reducedMotion={reducedMotion} onAct={walletAct} onClose={closeWallet} belowHud briefing={briefing} onBriefed={() => setBriefing(false)} />}
        {wallet && haul && rewardsOpen && <RewardsFrame items={haul.items} jackpot={haul.jackpot} outlaw={haul.outlaw} still={reducedMotion} onClose={() => setRewardsOpen(false)} />}
        <div className="outlaw-hud">
          {/* The status strip is hidden (but keeps its place, so the buttons stay put) while the hacking game is open. */}
          {/* Money first, then what you hold (the Laser Gun with its charges); Preview only when not on chain. */}
          <span style={wallet ? { visibility: "hidden" } : undefined}>{snapshot ? <>{rf(balance)} {"·"} {op} OP {"  |  "}{!run ? "No licence" : equipped === "laser" ? `Laser Gun · ${charges === 0n ? "empty" : `${charges.toString()} shots`}`
            : equipped ? `${ITEMS.find(item => item.id === equipped)?.name}${equipped in owned ? ` ×${owned[equipped as Durable]}` : ""}` : "Nothing in hand"}</> : "Loading…"}{client.mode === "chain" ? "" : <> {"·"} Preview</>}</span>
          <button type="button" disabled={uiBlocked || Boolean(status) || Boolean(wallet)} onClick={() => open("licence")}>Licence</button>
          <button type="button" disabled={uiBlocked || Boolean(status) || Boolean(wallet)} onClick={() => open("inventory")}>Inventory</button>
          <button type="button" disabled={paused} onClick={() => open("rules")}>Game Rules</button>
          <button type="button" disabled={paused} onClick={() => open("settings")}>Settings</button>
        </div>
        {!status && !wallet && <div className="outlaw-guide">
          <p>{inside ? <>Inside {INTERIORS[inside].label} {"·"} the door at the bottom leads back out {"·"} {nearPoster >= 0 && <>V views the poster {"·"} </>}</> : <>WASD / arrows or tap to walk {"·"} {riding && <>R dismounts {"·"} </>}M map {"·"} </>}I inventory {"·"} Q switches {"·"} Space uses it{wanted ? <> {"·"} Wanted: {wanted.name}</> : status ? null : <> {"·"} The country is clear</>}</p>
        </div>}
        {note && !wallet && <p className={`outlaw-toast outlaw-toast-${noteTone}`} role="status">{note}</p>}
      </div>
      <p className="outlaw-live" role="status" aria-live="polite">{wallet ? "Hardware wallet puzzle" : "Exploration mode"}{equipped ? `, equipped ${equipped}` : ""}</p>
      {status && <div className="outlaw-status" role={failed ? "alert" : "status"}><p>{status}</p>
        {failed && <button type="button" disabled={paused} onClick={() => setRevision(value => value + 1)}>Retry loading</button>}</div>}
      {prompt && (() => {
        const belongings: { wallet: boolean; half?: WalletHalf } = npcs.current.find(entry => entry.id === prompt.npcId)?.belongings ?? { wallet: false };
        const stolen = npcs.current.find(entry => entry.id === prompt.npcId)?.loot ?? [];
        const droppedKeepsake = npcs.current.find(entry => entry.id === prompt.npcId)?.keepsake;
        const net = npcs.current.find(entry => entry.id === prompt.npcId)?.net;
        return <GameMenu title={prompt.npcId === COMBINED_ID ? "Hardware Wallet combined" : `${prompt.name} is neutralized!`} onClose={prompt.step === "list" ? leaveWallet : prompt.step === "exited" ? () => setPrompt(null) : undefined}>
          {prompt.step === "list" && <>
            <p>Among {prompt.name === "Mrs. Sybil" ? "her" : "his"} belongings you find the following items:</p>
            {/* Each belonging in its colour, as on the REWARDS frame: the keepsake in its rarity's, stolen items in grey, the hardware wallet
                in red (unique). */}
            {droppedKeepsake && <div className="outlaw-item outlaw-rarity" style={{ ["--rarity" as string]: RARITY_COLOUR[KEEPSAKE_RARITY[droppedKeepsake.roll.rarity]] }}>
              <span><strong>{droppedKeepsake.roll.name}</strong> <em className="outlaw-rarity-tag">{droppedKeepsake.roll.rarity}</em>
                <small>Keepsake{droppedKeepsake.roll.detail ? ` · ${droppedKeepsake.roll.detail}` : ""}</small></span>
              <button type="button" className="rf-frame-primary" disabled={droppedKeepsake.taken} onClick={() => impound("keepsake")}>{droppedKeepsake.taken ? "Impounded" : "Impound"}</button></div>}
            {net && <div className="outlaw-item outlaw-rarity" style={{ ["--rarity" as string]: RARITY_COLOUR[KEEPSAKE_RARITY.Uncommon] }}>
              <span><strong>Butterfly Net</strong> <em className="outlaw-rarity-tag">Uncommon</em><small>Swing it next to a butterfly to catch it</small></span>
              <button type="button" className="rf-frame-primary" disabled={net === "taken"} onClick={() => impound("net")}>{net === "taken" ? "Impounded" : "Impound"}</button></div>}
            {/* What it stole from you, one row each, in grey. */}
            {stolen.map((item, index) => <div key={`${item}-${index}`} className="outlaw-item outlaw-rarity" style={{ ["--rarity" as string]: STOLEN_COLOUR }}>
              <span><strong>{ITEMS.find(entry => entry.id === item)?.name ?? lootName(item)}</strong> <em className="outlaw-rarity-tag">Stolen Item</em>
                <small>Yours: it robbed you of it</small></span>
              <button type="button" className="rf-frame-primary" onClick={() => impound({ stolen: index })}>Impound</button></div>)}
            {/* Last: impounding the wallet trips its kill switch and ends this list, so everything else comes first. */}
            <div className="outlaw-item outlaw-rarity" style={{ ["--rarity" as string]: UNIQUE_COLOUR }}>
              <span><strong>{belongings.half ? `${belongings.half === "top" ? "Top" : "Bottom"} Hardware Wallet` : "Hardware Wallet"}</strong> <em className="outlaw-rarity-tag">Unique</em>
                <small>{belongings.half ? `Not hackable on its own. ${belongings.half === "top" ? "Dumper" : "Pumper"} has the other half.` : "Impounding it trips its kill switch: you hack it on the spot."}</small></span>
              <button type="button" className="rf-frame-primary" disabled={!belongings.wallet} onClick={() => impound("wallet")}>{belongings.wallet ? "Impound" : "Impounded"}</button></div>
            {belongings.half && halves.top && halves.bottom && <div className="outlaw-item"><span><strong>Both halves impounded</strong><small>Put the wallet back together to hack it.</small></span>
              <button type="button" className="rf-frame-primary" onClick={combineHalves}>Combine</button></div>}
            <button type="button" className="outlaw-leave" onClick={leaveWallet}>Leave it {"·"} Esc</button>
          </>}
          {prompt.step === "killswitch" && <>
            <p className="outlaw-alert" role="alert">You take the hardware wallet but triggered a kill switch, hack the device now or lose everything on it.</p>
            <div className="outlaw-choice">
              <button type="button" className="rf-frame-primary" autoFocus onClick={hackNow}>Hack now</button>
              {prompt.name === EXIT_SCAMMER
                ? <button type="button" onClick={exitScammed}>Exit</button>
                : <button type="button" onClick={heckNo}>Heck no</button>}
            </div>
          </>}
          {prompt.step === "exited" && <>
            <p className="outlaw-alert" role="alert">You were exit scammed, what did you think was going to happen?!</p>
            <button type="button" onClick={() => setPrompt(null)}>Continue {"·"} Esc</button>
          </>}
          {prompt.step === "voice" && <p className="outlaw-alert" role="status">Voice command 'Hack Now' received, proceeding</p>}
        </GameMenu>;
      })()}
      {viewWanted && wanted && (
        <GameMenu title={`Wanted: ${wanted.name}`} onClose={() => setViewWanted(false)}>
          <WantedPoster wanted={wanted} scale={1.6} />
          <button type="button" onClick={() => setViewWanted(false)}>Back {"·"} Esc</button>
        </GameMenu>
      )}
      {viewPoster && (
        <GameMenu title={`Wanted: ${viewPoster.name}`} onClose={() => setViewPoster(null)}>
          <PosterView poster={viewPoster} />
          <button type="button" onClick={() => setViewPoster(null)}>Back {"·"} Esc</button>
        </GameMenu>
      )}
      {menu === "mint" && snapshot && <MintTerminal friendId={friendId} items={mintables} onClose={() => open(null)} />}
      {menu === "licence" && snapshot && (() => {
        const interrupted = !run && snapshot.plays.find(play => play.outcomeId === null);
        const jackpotEnd = Boolean(runEnd?.outcome && JACKPOT_OUTCOMES.includes(runEnd.outcome));
        return <GameMenu title="Bounty Hunter licence" onClose={busy ? undefined : () => open(null)}>
          {client.mode !== "chain" && <p className="outlaw-sim-note">Preview: the licence, its RF payout, OP and every reward are simulated. No real tokens are spent or paid out.</p>}
          {settling && <div className="outlaw-haul">
            <span>Run over. {settling.reason}</span>
            <span>Go to the Data Center: the Licence Settlement terminal in its top-right room settles your licence (its RF payout) and takes
              your seed words. The friendly locals point the way.</span>
          </div>}
          {settling ? <></> : runEnd && !run && <div className={jackpotEnd ? "outlaw-haul outlaw-haul-jackpot" : "outlaw-haul"}>
            {jackpotEnd && <strong className={reducedMotion ? "outlaw-jackpot outlaw-still" : "outlaw-jackpot"}>Jackpot licence</strong>}
            <span>Run over. {runEnd.reason}</span>
            {!runEnd.outcome && <button type="button" className="rf-frame-primary" disabled={busy || paused} onClick={() => void resolvePending()}>Reveal the payout</button>}
            {runEnd.outcome && <span>Licence payout: {runEnd.outcome}{runEnd.reward > 0n ? `, ${rf(runEnd.reward)}, kept in your inventory to redeem.` : ", nothing this time."}</span>}
          </div>}
          {settling ? <p>Your licence is waiting to be settled at the Data Center.</p> : interrupted ? <>
            <p>Your last licence run was interrupted when the game reloaded. Its payout is still due.</p>
            <button type="button" className="rf-frame-primary" disabled={busy || paused} onClick={() => void resolvePending()}>Resolve the payout</button>
          </> : run ? <>
            <p>Your licence is active ({run.lost} {run.lost === 1 ? "wallet" : "wallets"} wiped so far). The run ends when The Liquidator's wallet is settled, but you can retire any time: here, or straight at the Data Center's Licence Settlement terminal. The licence is settled there with the seed words you hold, so an early retirement pays smaller bonuses.</p>
            <button type="button" disabled={busy || paused} onClick={() => void endRun("You retired.")}>Retire now</button>
          </> : runEnd ? <>
            <p>A new licence starts a fresh country: the outlaws return and the hunt starts over.</p>
            <button type="button" className="rf-frame-primary" disabled={busy || paused} onClick={() => { setRunEnd(null); setRevision(value => value + 1); }}>Start a new hunt</button>
          </> : <>
            <p>A licence costs {rf(definition.price)} and covers one run: a Laser Gun with {LASER_CHARGES.toString()} shots (reload with in-game currency OP at the Charging Station), 12 criminals, each with their own lootable hardware wallet (OP and in-game items), and at the end an RF payout rolled by the game's table. The run lasts until The Liquidator's wallet is settled, or until you retire and settle with the seed words you hold.</p>
            <p>You have {rf(balance)}{snapshot.consumables > 0n ? " and an unused licence" : ""}.</p>
            <button type="button" className="rf-frame-primary" disabled={!(canBuyLicence || snapshot.consumables > 0n) || paused} onClick={() => void startRun()}>{snapshot.consumables > 0n ? "Start the run" : `Buy a licence (${rf(definition.price)}) and start`}</button>
          </>}
          {feedback && <p role="alert">{feedback}</p>}
          <button type="button" disabled={busy} onClick={() => open(null)}>Close</button>
        </GameMenu>;
      })()}
      {menu === "charger" && snapshot && (
        <GameMenu title="Charging terminal" onClose={busy ? undefined : () => open(null)}>
          <p>Charging Station {"·"} {op} OP {"·"} {RELOAD_OP} OP a shot, up to {LASER_MAX.toString()} in the gun</p>
          <div className="outlaw-item">
            <span><strong>Laser Gun</strong><small>{hasLaser ? `${charges.toString()} of ${LASER_MAX.toString()} shots` : "No gun: it comes with a Bounty Hunter licence."}</small></span>
            <strong>{hasLaser ? `${charges.toString()} / ${LASER_MAX.toString()}` : "—"}</strong>
          </div>
          {hasLaser && ([10n, reloadable] as const).filter((amount, index) => amount > 0n && (index === 0 ? amount < reloadable : true)).map(amount => <div className="outlaw-item" key={amount.toString()}>
            <span><strong>{amount === reloadable ? "Fill it up" : `Reload ${amount.toString()}`}</strong><small>{amount.toString()} shot{amount === 1n ? "" : "s"} for {Number(amount) * RELOAD_OP} OP</small></span>
            <button type="button" className="rf-frame-primary" disabled={!canReload(amount) || paused} onClick={() => reload(amount)}>Reload</button>
          </div>)}
          {hasLaser && reloadable === 0n && <p>The gun is full.</p>}
          {feedback && <p role="alert">{feedback}</p>}
          <button type="button" disabled={busy} onClick={() => open(null)}>Back to the Charging Station</button>
        </GameMenu>
      )}
      {menu === "achievements" && (
        <GameMenu title="Achievements" onClose={() => open(null)}>
          <p>Data Center terminal · this session</p>
          {([["Highest rank achieved", trophies > 0 ? `${TROPHIES[trophies - 1].title} (${trophies} of ${TROPHIES.length} trophies)` : "None yet"], ["Shots fired", stats.shots], ["Outlaws neutralized", posters.length], ["Bears killed", stats.bears], ["Lions killed", stats.lions], ["Jackpot wallets", stats.jackpots], ["Largest licence payout", rf(stats.biggest)]] as const).map(([label, value]) =>
            <div className="outlaw-item" key={label}><span><strong>{label}</strong></span><strong>{value}</strong></div>)}
          <button type="button" onClick={() => open(null)}>Back to the Data Center</button>
        </GameMenu>
      )}
      {menu === "shop" && snapshot && (
        <GameMenu title="Centralised Exchange" onClose={busy ? undefined : () => open(null)}>
          <p>{rf(balance)} {"·"} {op} OP</p>
          {!run && <div className="outlaw-item">
            <span><strong>Bounty Hunter licence</strong> {"·"} {rf(definition.price)}<small>One run with a Laser Gun, until The Liquidator's wallet is settled or you retire. Its RF payout is revealed at the end.</small></span>
            <button type="button" className="rf-frame-primary" disabled={paused} onClick={() => open("licence")}>Licence office</button>
          </div>}
          <div className="outlaw-item">
            <span><strong>Permanent Trojan Horse</strong> {"·"} {PERMANENT_HORSE_OP} OP<small>A mount for good: rides at twice walking speed and waits wherever you dismount. {permanentHorse ? "Owned." : "Not owned."}</small></span>
            <button type="button" className="rf-frame-primary" disabled={!canBuyHorse || paused} onClick={buyPermanentHorse}>{permanentHorse ? "Owned" : "Buy"}</button>
          </div>
          {ITEMS.filter(item => item.sold).map(item => <div className="outlaw-item" key={item.id}>
            <span><strong>{item.name}</strong> {"·"} {item.op ? `${item.op} OP` : rf(item.price)}<small>{item.blurb} Owned: {count(item.id).toString()}</small></span>
            <button type="button" className="rf-frame-primary" disabled={!canBuy(item) || paused} onClick={() => void buy(item)}>Buy</button>
          </div>)}
          {keepsakes.length > 0 && <>
            <h3>Sell keepsakes</h3>
            <p>The Exchange buys any keepsake for Dust: {DUST_OP} OP each.</p>
            {keepsakes.map(keepsake => <div className="outlaw-item" key={`sell-${keepsake.name}`}>
              <span><strong>{keepsake.name}</strong><small>{keepsake.rarity} keepsake from {keepsake.outlaw}{keepsake.count > 1 ? ` · ${keepsake.count} held` : ""}</small></span>
              <button type="button" disabled={paused} onClick={() => sellKeepsake(keepsake.name)}>Sell for Dust ({DUST_OP} OP)</button>
            </div>)}
          </>}
          {feedback && !feedback.startsWith("Bought") && <p role="alert">{feedback}</p>}
        </GameMenu>
      )}
      {/* Hidden while the Cold Wallet's REWARDS frame is open over it (its result page shows once that is collected). */}
      {menu === "settlement" && snapshot && !coldRewards && (() => {
        const held = SEED_WORDS.filter(word => seedWords.has(word)), placed = SEED_WORDS.filter(word => phrase.has(word) && seedWords.has(word)), n = placed.length;
        const best = trophies > 0 ? TROPHIES[trophies - 1] : null, preview = headStartFor(n);
        return <GameMenu title="Licence Settlement" onClose={busy ? undefined : () => open(null)}>
          {best && <p>Your title: <strong>{best.title}</strong> ({trophies} of {TROPHIES.length} trophies).</p>}
          {settling || run ? <>
            <p>{settling ? `Run over. ${settling.reason} Settle your licence here; RF payout rolls will still happen.` : `Your licence is still active (${run!.lost} ${run!.lost === 1 ? "wallet" : "wallets"} wiped so far). You can retire any time and settle with the seed words you hold so far; this cuts the game short. RF payout rolls will still happen.`} Fill
              in the seed phrase with the words you recovered: every word adds OP (more for each one), a head start for your next licenced
              hunt, and a trophy and a title. All twelve seed words open the Cold Wallet; fewer words don't, but can still give great loot.</p>
            <ol className="outlaw-phrase">
              {SEED_WORDS.map((word, index) => <li key={word}>
                <button type="button" disabled={busy || !phrase.has(word)} aria-label={phrase.has(word) ? `Word ${index + 1}: ${word}, remove` : `Word ${index + 1}: empty`}
                  onClick={() => setPhrase(value => new Set([...value].filter(entry => entry !== word)))}>
                  <small>{index + 1}</small>{phrase.has(word) ? word : "_____"}</button>
              </li>)}
            </ol>
            <p>Your seed words (click one to fill it in):</p>
            <div className="outlaw-phrase-words">
              {held.length === 0 && <span>You recovered no seed words this run.</span>}
              {held.map(word => <button type="button" key={word} disabled={busy || phrase.has(word)} onClick={() => setPhrase(value => new Set([...value, word]))}>{word}</button>)}
              {held.some(word => !phrase.has(word)) && <button type="button" className="rf-frame-primary" disabled={busy} onClick={() => setPhrase(new Set(held))}>Fill in all</button>}
            </div>
            <p><strong>{n} of {SEED_WORDS.length} words:</strong> +{seedOp(n)} OP now{n ? `; next licence: ${headStartText(preview)}` : ""}{n > trophies ? `; new trophies up to the ${TROPHIES[n - 1].name}` : ""}{n === SEED_WORDS.length ? "; the Cold Wallet opens" : ""}.</p>
            <button type="button" className="rf-frame-primary" disabled={busy || paused} onClick={() => void settleLicence()}>{settling ? "Settle the licence" : "Retire and settle the licence"}{n ? ` with ${n} word${n === 1 ? "" : "s"}` : ""}</button>
          </> : settled ? <>
            <p>Licence settled with {settled.words} seed word{settled.words === 1 ? "" : "s"}.{runEnd?.outcome ? ` RF payout: ${runEnd.outcome}${runEnd.reward > 0n ? `, ${rf(runEnd.reward)}, kept in your inventory to redeem` : ", nothing this time"}.` : ""}</p>
            <p>+{settled.op} OP.{headStartText(settled.head) ? ` Your next licence starts with ${headStartText(settled.head)}.` : ""}</p>
            {settled.trophies.length > 0 && <p>New {settled.trophies.length === 1 ? "trophy" : "trophies"} in the trophy hall (bottom-right room): {settled.trophies.map(index => TROPHIES[index].name).join(", ")}. Your title is now <strong>{TROPHIES[settled.trophies[settled.trophies.length - 1]].title}</strong>.</p>}
            {settled.cold && <p>All twelve words: the Cold Wallet opened{settled.hadGolden ? ", but its Golden Trojan Horse is already yours" : ". Your Permanent Shiny Golden Trojan Horse waits outside the Exchange, in every hunt from now on"}.</p>}
            <p>Start a new hunt from the licence office (the Licence button).</p>
          </> : <>
            <p>No licence to settle. When a run ends (The Liquidator's wallet settled, or you retire), come here to
              settle its licence and hand in the seed words you recovered.</p>
            {headStartText(headStart) && <p>Head start waiting for your next licence: {headStartText(headStart)}.</p>}
          </>}
          {feedback && <p role="alert">{feedback}</p>}
          <button type="button" disabled={busy} onClick={() => open(null)}>Close</button>
        </GameMenu>;
      })()}
      {coldRewards && <RewardsFrame items={coldRewards} jackpot outlaw="The Cold Wallet" subtitle="The Cold Wallet opens: all twelve seed words" still={reducedMotion} onClose={() => setColdRewards(null)} />}
      {menu === "vault" && snapshot && (() => {
        // Both sides of The Vault as rows: what you carry (Store) and what is put away (Take).
        type Row = { key: string; name: string; detail: string; entry: VaultEntry };
        const rows = (side: "carry" | "vault"): Row[] => {
          const items = side === "carry" ? owned : vault.items, animals = side === "carry" ? captured : vault.animals;
          const stack = side === "carry" ? keepsakes : vault.keepsakes, cards = side === "carry" ? programCards : vault.cards;
          const gas = side === "carry" ? gasVouchers : vault.gas, spies = side === "carry" ? intel : vault.intel;
          return [
            ...(Object.keys(startOwned) as Durable[]).filter(id => (items[id] ?? 0) > 0).map(id => ({ key: `item-${id}`, name: ITEMS.find(item => item.id === id)!.name, detail: `${items[id]}`, entry: { kind: "item" as const, id } })),
            ...ANIMALS.filter(spec => (animals[spec.id] ?? 0) > 0).map(spec => ({ key: `animal-${spec.id}`, name: `Captured ${spec.name}`, detail: `${animals[spec.id]}`, entry: { kind: "animal" as const, id: spec.id } })),
            ...stack.map(item => ({ key: `keepsake-${item.name}`, name: item.name, detail: `${item.count} · ${item.rarity} keepsake`, entry: { kind: "keepsake" as const, name: item.name } })),
            ...[...new Set(cards)].map(card => ({ key: `card-${card}`, name: `${PROGRAMS[card].name} card`, detail: `${cards.filter(other => other === card).length} · program card`, entry: { kind: "card" as const, card } })),
            ...(gas > 0 ? [{ key: "gas", name: "Gas voucher", detail: `${gas}`, entry: { kind: "gas" as const } }] : []),
            ...(spies > 0 ? [{ key: "intel", name: "Intel", detail: `${spies}`, entry: { kind: "intel" as const } }] : []),
          ];
        };
        const carried = rows("carry"), stored = rows("vault");
        return <GameMenu title="The Vault" onClose={() => open(null)}>
          <p>Deep under the Cold Storage. Whatever you store here is safe from outlaws, who rob only what you carry, and stays out of play until you take it out: a stored program card or gas voucher is not used by your next hack, and a stored cosmetic cannot be worn.</p>
          <h3>You carry</h3>
          {carried.length === 0 && <p>Nothing that can be stored.</p>}
          {carried.map(row => <div className="outlaw-item" key={`carry-${row.key}`}>
            <span><strong>{row.name}</strong><small>{row.detail} carried</small></span>
            <button type="button" className="rf-frame-primary" disabled={paused} onClick={() => moveVault(row.entry, true)}>Store</button>
          </div>)}
          <h3>In The Vault</h3>
          {stored.length === 0 && <p>The Vault is empty.</p>}
          {stored.map(row => <div className="outlaw-item" key={`vault-${row.key}`}>
            <span><strong>{row.name}</strong><small>{row.detail} stored</small></span>
            <button type="button" disabled={paused} onClick={() => moveVault(row.entry, false)}>Take</button>
          </div>)}
        </GameMenu>;
      })()}
      {menu === "inventory" && snapshot && (
        <GameMenu title="Inventory" onClose={busy ? undefined : () => open(null)}>
          {trophies > 0 && <p>Title: <strong>{TROPHIES[trophies - 1].title}</strong> ({trophies} of {TROPHIES.length} trophies in the Data Center's trophy hall).</p>}
          <p>{op} OP (Outlaw Points): each wallet you crack pays {OP_PER_TIER} × its tier, more for more stars; {OP_BIG_GAME} for a bear or lion, {OP_ANIMAL} for other animals.</p>
          <p>{run ? `Licence run in progress: ${run.lost} ${run.lost === 1 ? "wallet" : "wallets"} wiped so far.` : "No active licence: open the licence office (HUD button) to start a run."}{perks.length ? ` Keepsake perks waiting for your next hack: ${perks.map(perk => PERK_TEXT[perk]).join(", ")}.` : ""}</p>
          {ownedItems.length === 0 && capturedTotal === 0 && !halves.top && !halves.bottom && !permanentHorse && seedWords.size === 0 && programCards.length === 0 && keys.size === 0 && intel === 0 && gasVouchers === 0 && keepsakes.length === 0 && <p>Nothing yet.</p>}
          {ownedItems.map(item => <div className="outlaw-item" key={item.id}>
            <span><strong>{item.name}</strong><small>{item.id === "laser" ? (charges === 0n ? "Empty, 0 shots" : `${charges.toString()} shots`) : `${count(item.id).toString()} owned`} {"·"} {item.blurb}</small></span>
            {item.id === "temp-horse"
              ? <button type="button" className="rf-frame-primary" disabled={paused || riding} onClick={() => { if (mountTempHorse()) open(null); }}>{riding ? "Riding" : "Mount"}</button>
              : <button type="button" disabled={paused} aria-pressed={equipped === item.id} onClick={() => setEquipped(item.id)}>
              {equipped === item.id ? "Equipped" : "Equip"}</button>}
          </div>)}
          {keepsakes.filter(keepsake => !cosmeticForKeepsake(keepsake.name)).map(keepsake => <div className="outlaw-item" key={keepsake.name}>
            <span><strong>{keepsake.name}</strong><small>{keepsake.rarity} keepsake from {keepsake.outlaw}{keepsake.count > 1 ? ` · ${keepsake.count} held` : ""}{keepsake.detail ? ` · ${keepsake.detail}` : ""}</small></span>
            {keepsake.perk === "card" && <button type="button" className="rf-frame-primary" disabled={paused} onClick={() => openSack(keepsake.name)}>Open</button>}
          </div>)}
          {seedWords.size > 0 && <div className="outlaw-item">
            <span><strong>Seed phrase</strong><small>{seedWords.size} of {SEED_WORDS.length} words: {SEED_WORDS.filter(word => seedWords.has(word)).join(" ")}{seedWords.size === SEED_WORDS.length ? " · complete" : ""}</small></span>
          </div>}
          {programCards.length > 0 && <div className="outlaw-item">
            <span><strong>Program cards</strong><small>{programCards.map(card => PROGRAMS[card].name).join(", ")} · the first is pre-loaded into your next wallet</small></span>
          </div>}
          {[...keys].map(key => <div className="outlaw-item" key={key}>
            <span><strong>{BUILDING_KEYS[key].name}</strong><small>{BUILDING_KEYS[key].text}</small></span>
          </div>)}
          {intel > 0 && <div className="outlaw-item">
            <span><strong>Intel</strong><small>{intel} held · marks every wanted outlaw on your map</small></span>
            <button type="button" disabled={paused} onClick={useIntel}>Use one</button>
          </div>}
          {gasVouchers > 0 && <div className="outlaw-item">
            <span><strong>Gas vouchers</strong><small>{gasVouchers} held · one is spent on your next wallet for +1 trace</small></span>
          </div>}
          {goldenHorse && <div className="outlaw-item">
            <span><strong>Permanent Shiny Golden Trojan Horse</strong><small>{riding && ridden()?.kind === "golden" ? "You are riding it" : "Waiting where you left it"} {"·"} from the Cold Wallet {"·"} yours in every hunt {"·"} simulated</small></span>
          </div>}
          {permanentHorse && <div className="outlaw-item">
            <span><strong>Permanent Trojan Horse</strong><small>{riding && ridden()?.kind === "permanent" ? "You are riding it" : "Waiting where you left it"} {"·"} walk into it to ride, R to dismount {"·"} simulated</small></span>
          </div>}
          {ownedCosmetics.map(id => { const { slot, name } = COSMETICS[id], on = gear[slot] === id, [put, remove, label] = SLOT_ACTION[slot];
            return <div className="outlaw-item" key={id}>
              <span><strong>{name}</strong><small>{on ? "In use" : "Not in use"} {"·"} {label}, one at a time{slot === "gun-skin" ? " (shows when the Laser Gun is held)" : slot === "cleaver-skin" ? " (shows when the Cleaver is held)" : slot === "wall" ? " (in the Data Center)" : ""} {"·"} cosmetic</small></span>
              <button type="button" disabled={paused} aria-pressed={on} data-cosmetic={id} onClick={() => toggleCosmetic(id)}>{on ? remove : put}</button>
            </div>; })}
          {(["top", "bottom"] as const).filter(half => halves[half]).map(half => <div className="outlaw-item" key={half}>
            <span><strong>{half === "top" ? "Top" : "Bottom"} Hardware Wallet</strong><small>{halves.top && halves.bottom ? "Both halves found." : `Not hackable on its own. ${half === "top" ? "Dumper" : "Pumper"} has the other half.`}</small></span>
            {half === "top" && halves.bottom && <button type="button" className="rf-frame-primary" disabled={paused || Boolean(wallet)} onClick={combineHalves}>Combine</button>}
          </div>)}
          {ANIMALS.filter(spec => (captured[spec.id] ?? 0) > 0).map(spec => <div className="outlaw-item" key={spec.id}>
            <span><strong>Captured {spec.name}</strong><small>{captured[spec.id]} kept {"·"} simulated, not RF-backed</small></span>
          </div>)}
          {definition.outcomes.map((outcome, index) => outcome.reward >= RF / 1000n && snapshot.inventory[index] > 0n && <div className="outlaw-item" key={outcome.name}>
            <span><strong>{outcome.name} reward</strong><small>{snapshot.inventory[index].toString()} kept {"·"} {rf(outcome.reward)} each, SDK-backed</small></span>
            <button type="button" disabled={busy || paused || outcome.reward === 0n} onClick={() => void redeem(index + 1)}>Redeem one</button>
          </div>)}
          <p>{feedback || "Q switches what you hold. I opens and closes this list. Everything resets when you reload the game."}</p>
          <button type="button" disabled={busy} onClick={() => open(null)}>Back outside</button>
        </GameMenu>
      )}
      {menu === "settings" && (
        <GameMenu title="Rarefriend Outlaw settings" onClose={() => open(null)}>
          <label>
            <input type="checkbox" checked={reducedMotion} onChange={event => setReducedMotionOverride(event.target.checked)} /> Reduce motion
          </label>
          <p>Stills the decorative animation: bobbing and hopping animals, blinking lights, pulsing markers, the frozen Friends' bubbles, and
            in the hacking game the sweeps, sparks, floating numbers and flying programs (they land at once). It starts on when your device
            asks for reduced motion. The game plays the same either way.</p>
          <h3>Sound</h3>
          <label><input type="checkbox" checked={soundOn} onChange={event => setSoundOn(event.target.checked)} /> Sound on</label>
          <label className="outlaw-volume">Volume <input type="range" min={0} max={1} step={0.05} value={soundVolume} disabled={!soundOn && !musicOn}
            onChange={event => setSoundVolume(Number(event.target.value))} aria-label="Overall volume" /></label>
          <label><input type="checkbox" checked={musicOn} onChange={event => setMusicOn(event.target.checked)} /> Music on</label>
          <label className="outlaw-volume">Music volume <input type="range" min={0} max={0.65} step={0.01} value={musicVolume} disabled={!musicOn}
            onChange={event => setMusicVolume(Number(event.target.value))} aria-label="Music volume" /></label>
          <p>Spaghetti-Western sound effects and a soft Western ambience out in the country ("Lonesome Trail", quiet enough to hear the
            animals, and its faster and darker takes; the hacking game has its own digital track), all made in code. Sound and music start after your first click, tap or key press, and stop
            while the game's tab is hidden. Volume sets everything; Music volume sets the music against the sounds.</p>
          <h3>Credits</h3>
          <p><strong>Alley Cat</strong> · Lead Developer</p>
          <p>Built with Claude Code (Anthropic)</p>
          <button type="button" onClick={() => open(null)}>Back outside</button>
        </GameMenu>
      )}
      {menu === "rules" && (
        <GameMenu title="Game Rules" onClose={() => open(null)}>
          {client.mode !== "chain" && <p className="outlaw-sim-note">This preview's economy is simulated: RF, the licence payout, OP, keepsakes, horses and the Cold
            Wallet. No real tokens move, and nothing is saved when the page reloads.</p>}
          <h3>The licence</h3>
          <p>A Bounty Hunter licence ({rf(definition.price)}) starts a run: a Laser Gun with {LASER_CHARGES.toString()} shots and {START_OP} OP.
            The run ends when The Liquidator's wallet is settled, and then the licence's RF payout is revealed; a failed hack does not end it.
            You can retire at any time from the licence office (the Licence button) or the Data Center's Licence Settlement terminal, and
            settle with the seed words you have recovered so far.</p>
          <h3>Getting around</h3>
          <p>Walk with WASD or the arrow keys, or tap where to go. I opens the inventory, M the big map, Q switches what you hold, Space
            uses it (fire the Laser Gun, swing the Butterfly Net or the Cleaver), Esc closes things. Walk into a door to go in, and into a terminal to use it.
            Trojan Horses carry you at twice walking speed: a Temporary one lasts 30 seconds, R dismounts.</p>
          <h3>Outlaws</h3>
          <p>One wanted outlaw at a time (Pumper and Dumper come as a pair), shown on the WANTED signpost beside the Centralised Exchange.
            The friendly local beside each building points the way with the arrow over their head. Walk into an outlaw and it robs you of an item; neutralize them and it is among their belongings, with a
            keepsake of theirs, to impound. It takes {OUTLAW_HITS_BY_TIER[0]} hit to bring down the first outlaw, 2 for the next three, 3 after that and
            {" "}{OUTLAW_HITS_BY_TIER[OUTLAW_HITS_BY_TIER.length - 1]} for The Liquidator.</p>
          <h3>Belongings and the hack</h3>
          <p>A downed outlaw lists their belongings to impound. Taking the hardware wallet trips its kill switch: you hack it on the spot or
            lose it. Left alone, an outlaw gets back up after a minute; once you have taken anything, they stay down. Pumper and Dumper each
            carry half a wallet: combine the halves in your inventory, then hack it.</p>
          <p>The hack is a puzzle: find and break the Secure Chip before your Integrity or trace runs out. The ? button in the hacking game
            explains every tile. A cracked wallet opens its REWARDS: OP (more for harder wallets and more stars) and sometimes loot. A wiped wallet counts against your run. Either way you are back in front of the Exchange afterwards.</p>
          <h3>OP and the buildings</h3>
          <p>OP (Outlaw Points) come from cracked wallets and animals ({OP_BIG_GAME} for a bear or lion, {OP_ANIMAL} for others). They never
            turn into RF. Spend them on reloads at the Charging Station ({RELOAD_OP} OP a shot, up to {LASER_MAX.toString()} in the gun) and
            on Trojan Horses at the Exchange, which also buys keepsakes for Dust ({DUST_OP} OP each).</p>
          <h3>Settling your licence</h3>
          <p>When a run ends, or whenever you choose to retire, go to the Data Center: its Licence Settlement terminal settles the licence (its RF payout, rolled by the game's
            table) and takes the seed words you recovered. Each word pays more OP than the one before, gives your next licence a head start
            (Laser shots, Intel, gas vouchers, program cards) and earns a trophy with its hunter title, from the Rookie Trophy to the
            Ultimate Trophy. All twelve words open the Cold Wallet, which holds the Permanent Shiny Golden Trojan Horse. Trophies, the head
            start and the golden horse carry over to new hunts; seed words never change the RF.</p>
          <p>The Data Center hangs a poster of every outlaw you catch and holds the achievements terminal and the trophy hall. The Cold Storage has the mint
            terminal and The Vault, where things you store are safe from outlaws. The Mining Farm mines OP for you once you hold its key.</p>
          <button type="button" onClick={() => open(null)}>Back outside</button>
        </GameMenu>
      )}
    </section>
  );
}
