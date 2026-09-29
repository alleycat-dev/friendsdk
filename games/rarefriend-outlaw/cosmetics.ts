// Cosmetic keepsakes: what the Friend can wear, hold in the off hand, apply as a weapon skin, summon as a pet or hang on a wall.
// All drawn in the world's pixel style with thin black outlines and no white halo. Body pieces recolour the Friend's own pixels,
// so they fit any Friend's shape; headwear and masks are placed from the Friend's head row.
import { spriteFrame, type GenerationSprites, type SpriteFacing } from "@rarefriends/friendsdk/sprites";

export type CosmeticSlot = "head" | "face" | "body" | "back" | "feet" | "offhand" | "gun-skin" | "cleaver-skin" | "pet" | "wall";
export type CosmeticId =
  | "black-hat" | "sweatband" | "gold-hat" | "honey-crown"
  | "pig-snout" | "paper-mask" | "sybil-faces"
  | "apron" | "hoodie" | "rug-cape" | "running-shoes"
  | "red-candle" | "sprinter-baton" | "stethoscope" | "briefcase"
  | "liquidator-gun" | "diamond-cleaver" | "bee-pet" | "robot-pet" | "diploma";
/** Every cosmetic: its name, slot, and the keepsake (KEEPSAKES.md name) that gives it. */
export const COSMETICS: Readonly<Record<CosmeticId, { name: string; slot: CosmeticSlot; keepsake?: string }>> = {
  "black-hat": { name: "Simple Black Hat", slot: "head", keepsake: "Simple Black hat" },
  sweatband: { name: "Red Sweatband", slot: "head", keepsake: "Red Sweatband" },
  "gold-hat": { name: "Black Hat with Gold Band", slot: "head", keepsake: "Black Hat with gold band" },
  "honey-crown": { name: "Honeycomb Crown", slot: "head", keepsake: "Honeycomb Crown" },
  "pig-snout": { name: "Pig snout mask", slot: "face", keepsake: "Pig snout mask" },
  "paper-mask": { name: "Paper mask", slot: "face", keepsake: "Paper mask" },
  "sybil-faces": { name: "Sybil's hundred faces", slot: "face", keepsake: "Sybil's hundred faces" },
  apron: { name: "Butcher's apron", slot: "body", keepsake: "Butcher's apron" },
  hoodie: { name: "Black Hoodie", slot: "body", keepsake: "Black Hoodie" },
  "rug-cape": { name: "The Original Rug", slot: "back", keepsake: "The Original Rug" },
  "running-shoes": { name: "Running shoes", slot: "feet", keepsake: "Running shoe" },
  "red-candle": { name: "Red Candle", slot: "offhand", keepsake: "Red Candle" },
  "sprinter-baton": { name: "Golden sprinter's baton", slot: "offhand", keepsake: "Golden sprinter's baton" },
  stethoscope: { name: "Doctor's stethoscope", slot: "offhand", keepsake: "Doctor's stethoscope" },
  briefcase: { name: "The Liquidator's briefcase", slot: "offhand", keepsake: "The Liquidator's briefcase" },
  "liquidator-gun": { name: "The Liquidator", slot: "gun-skin", keepsake: "The Liquidator" },
  "diamond-cleaver": { name: "Diamond cleaver skin", slot: "cleaver-skin", keepsake: "Diamond cleaver skin" },
  "bee-pet": { name: "Bee Pet", slot: "pet", keepsake: "Bee Pet" },
  "robot-pet": { name: "Robot Pet", slot: "pet", keepsake: "Robot Pet" },
  diploma: { name: "Dr. Ponzi's Medical Diploma", slot: "wall", keepsake: "Dr. Ponzi's Medical Diploma" },
};
export const COSMETIC_IDS = Object.keys(COSMETICS) as CosmeticId[];
export const cosmeticForKeepsake = (name: string) => COSMETIC_IDS.find(id => COSMETICS[id].keepsake === name) ?? null;
/** What the inventory button says for each slot. */
export const SLOT_ACTION: Readonly<Record<CosmeticSlot, [string, string, string]>> = {
  head: ["Wear", "Take off", "headwear"], face: ["Wear", "Take off", "mask"], body: ["Wear", "Take off", "clothing"],
  back: ["Wear", "Take off", "cape"], feet: ["Wear", "Take off", "footwear"], offhand: ["Hold", "Put away", "off hand"],
  "gun-skin": ["Apply", "Remove", "Laser Gun skin"], "cleaver-skin": ["Apply", "Remove", "Cleaver skin"],
  pet: ["Summon", "Dismiss", "pet"], wall: ["Hang", "Take down", "Data Center wall"],
};
/** What the Friend has on: at most one cosmetic per slot. */
export type Gear = Partial<Record<CosmeticSlot, CosmeticId>>;

type Ctx = CanvasRenderingContext2D;
const CELL = 5;
/** Paint a small mask of coloured cells: each character maps to a colour ('.' and ' ' are clear). The mask's bottom row sits at y,
 * centred on x, like the game's own sprite painter. */
function cells(ctx: Ctx, rows: readonly string[], x: number, y: number, palette: Readonly<Record<string, string>>, cell = CELL) {
  const width = rows[0].length, left = Math.round(x) - Math.round(width / 2) * cell, top = Math.round(y) - (rows.length - 1) * cell;
  rows.forEach((row, r) => [...row].forEach((ch, c) => { const colour = palette[ch]; if (colour) { ctx.fillStyle = colour; ctx.fillRect(left + c * cell, top + r * cell, cell, cell); } }));
}

/** The Friend's shape in this frame: its rows, where they sit on screen, the first and last drawn rows, and the head row (the first
 * row with a solid run of four cells: ears and tufts stick up above the skull) with that run. */
function friendShape(sprites: GenerationSprites, facing: SpriteFacing, walking: boolean, frame: number, side: "left" | "right", x: number, y: number) {
  const rows = spriteFrame(sprites, facing, walking, frame, side).frame.rows;
  const left = Math.round(x) - Math.round(rows[0].length / 2) * CELL, top = Math.round(y) - (rows.length - 1) * CELL;
  let first = -1, last = -1, headRow = -1, run = { from: 0, to: 0 };
  rows.forEach((row, r) => {
    if (/[^.]/.test(row)) { if (first < 0) first = r; last = r; }
    const match = headRow < 0 ? /[^.]{4,}/.exec(row) : null;
    if (match) { headRow = r; run = { from: match.index, to: match.index + match[0].length - 1 }; }
  });
  if (headRow < 0) headRow = Math.max(0, first);
  // Many Friends have a shadow dash under their feet, a row apart from the body: the body ends above that gap.
  if (last > 0 && !/[^.]/.test(rows[last - 1] ?? "")) { last -= 2; while (last > 0 && !/[^.]/.test(rows[last])) last--; }
  const centre = left + ((run.from + run.to) / 2 + 0.5) * CELL;
  // The torso starts about halfway between the head row and the feet; the last two drawn rows are the feet.
  const torso = headRow + Math.max(2, Math.round((last - headRow) * 0.5));
  return { rows, left, top, first, last, headRow, run, centre, torso };
}
type Shape = ReturnType<typeof friendShape>;
/** Recolour the cells inside the Friend's silhouette in rows from..to (every drawn cell whose four neighbours are drawn too, so the
 * outer edge stays black, whether the Friend is drawn mostly in white fill or mostly in black); `colour` picks a colour or leaves it. */
function recolour(ctx: Ctx, shape: Shape, from: number, to: number, colour: (row: number, col: number, span: { from: number; to: number }) => string | null) {
  for (let r = Math.max(0, from); r <= Math.min(shape.rows.length - 1, to); r++) {
    const row = shape.rows[r], filled = [...row].map((ch, c) => (ch !== "." ? c : -1)).filter(c => c >= 0);
    if (!filled.length) continue;
    const span = { from: filled[0], to: filled[filled.length - 1] };
    const drawn = (rr: number, cc: number) => (shape.rows[rr]?.[cc] ?? ".") !== ".";
    [...row].forEach((ch, c) => {
      if (ch === "." || !(drawn(r - 1, c) && drawn(r + 1, c) && drawn(r, c - 1) && drawn(r, c + 1))) return;
      const fill = colour(r, c, span); if (!fill) return;
      ctx.fillStyle = fill; ctx.fillRect(shape.left + c * CELL, shape.top + r * CELL, CELL, CELL);
    });
  }
}

// ---- Held items, in local pixels with the hand at (0, 0), drawn upright ----
function offhandArt(ctx: Ctx, id: CosmeticId) {
  const px = (x: number, y: number, w: number, h: number, colour: string) => { ctx.fillStyle = colour; ctx.fillRect(x, y, w, h); };
  if (id === "red-candle") {
    // A red chart candle: a wick above and below a filled red body, outlined black.
    px(0, -24, 2, 5, "#000"); px(-3, -19, 8, 15, "#000"); px(-2, -18, 6, 13, "#d8322a"); px(-1, -17, 1, 9, "#f07a6a"); px(0, -4, 2, 5, "#000");
  } else if (id === "sprinter-baton") {
    // A gold relay baton: a tube with darker bands at the ends.
    px(-3, -22, 7, 22, "#000"); px(-2, -21, 5, 20, "#e0b030"); px(-2, -21, 5, 3, "#9a7412"); px(-2, -4, 5, 3, "#9a7412"); px(-1, -17, 1, 11, "#fff2b0");
  } else if (id === "stethoscope") {
    // A stethoscope: grey tubing in a loop down to a silver chest piece.
    ctx.strokeStyle = "#000"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-6, -22); ctx.quadraticCurveTo(-8, -6, 0, -4); ctx.quadraticCurveTo(8, -6, 6, -22); ctx.stroke();
    ctx.strokeStyle = "#6b7480"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, -22); ctx.quadraticCurveTo(-8, -6, 0, -4); ctx.quadraticCurveTo(8, -6, 6, -22); ctx.stroke();
    ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(0, 1, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#c8d0d8"; ctx.beginPath(); ctx.arc(0, 1, 3.5, 0, Math.PI * 2); ctx.fill();
  } else if (id === "briefcase") {
    // The Liquidator's briefcase: dark brown with a handle and a gold clasp.
    px(-4, -18, 8, 2, "#000"); px(-4, -18, 2, 5, "#000"); px(2, -18, 2, 5, "#000");
    px(-10, -14, 20, 15, "#000"); px(-9, -13, 18, 13, "#5b3a1e"); px(-9, -13, 18, 2, "#7a5230"); px(-2, -9, 4, 3, "#d9b048");
  }
}
/** The off-hand item, on the other side from the main hand: behind the Friend facing up, left or right, in front facing down. */
export function drawOffhand(ctx: Ctx, id: CosmeticId, x: number, y: number, facing: SpriteFacing, side: "left" | "right") {
  const at = facing === "down" ? { x: x + 26, y: y - 22 } : facing === "up" ? { x: x - 26, y: y - 30 } : side === "right" ? { x: x - 16, y: y - 28 } : { x: x + 16, y: y - 28 };
  ctx.save(); ctx.translate(Math.round(at.x), Math.round(at.y)); offhandArt(ctx, id); ctx.restore();
}
/** Whether the off-hand item draws before the Friend (hidden partly behind them) for this facing. */
export const offhandBehind = (facing: SpriteFacing) => facing !== "down";

// ---- Weapon skins, in the same local frame as the game's held items (barrel along +x) ----
/** The Liquidator: a huge dark cannon with a blue energy cell and droplets at the muzzle, in place of the Laser Gun. */
export function drawLiquidatorGun(ctx: Ctx) {
  const px = (x: number, y: number, w: number, h: number, colour: string) => { ctx.fillStyle = colour; ctx.fillRect(x, y, w, h); };
  px(-4, 1, 32, 11, "#000"); px(-3, 2, 30, 9, "#2b2b3a"); px(26, 3, 8, 7, "#000"); px(27, 4, 6, 5, "#3d7bd9");
  px(4, 3, 10, 5, "#3d7bd9"); px(5, 4, 4, 3, "#9fd4ff"); px(2, 11, 7, 9, "#000"); px(3, 11, 5, 8, "#44444f");
  px(35, 3, 2, 2, "#3d7bd9"); px(36, 7, 2, 2, "#3d7bd9"); px(38, 5, 2, 2, "#9fd4ff");
}
/** The Diamond cleaver: the Cleaver's shape with a faceted ice-blue diamond blade. */
export function drawDiamondCleaver(ctx: Ctx) {
  const px = (x: number, y: number, w: number, h: number, colour: string) => { ctx.fillStyle = colour; ctx.fillRect(x, y, w, h); };
  px(0, 9, 10, 4, "#6e4520"); px(9, 0, 13, 14, "#000"); px(10, 1, 11, 11, "#9fe6f7");
  px(10, 1, 5, 5, "#e8fbff"); px(15, 6, 6, 6, "#5fc8e8"); px(12, 8, 3, 3, "#c8f4ff"); px(17, 3, 2, 2, "#000");
}

// ---- Worn pieces ----
const HAT_ROWS = ["..######..", "..######..", "..#gggg#..", "##########"];
const CROWN_ROWS = [".#..#..#.", "#y##y##y#", "#yhyyyhy#", "#hyhyhyh#", "#########"];
function drawHead(ctx: Ctx, id: CosmeticId, shape: Shape) {
  const y = shape.top + shape.headRow * CELL;
  if (id === "black-hat") cells(ctx, HAT_ROWS, shape.centre, y, { "#": "#000", g: "#fff" });
  else if (id === "gold-hat") cells(ctx, HAT_ROWS, shape.centre, y, { "#": "#000", g: "#e0b030" });
  else if (id === "honey-crown") cells(ctx, CROWN_ROWS, shape.centre, y, { "#": "#000", y: "#f2c200", h: "#c98a12" });
  else if (id === "sweatband") {
    const width = shape.run.to - shape.run.from + 1;
    cells(ctx, ["#" + "r".repeat(width) + "#"], shape.centre, shape.top + (shape.headRow + 1) * CELL, { "#": "#000", r: "#d91a1a" });
  }
}
/** Sybil's hundred faces: a new face every 0.7 s (the first one only under reduced motion). */
const SYBIL_FACES = [{ skin: "#f2c9a0", mouth: "k" }, { skin: "#b8d8f5", mouth: "k" }, { skin: "#f7b0c8", mouth: "r" }, { skin: "#c8ecb0", mouth: "k" }, { skin: "#f5e08a", mouth: "r" }] as const;
function drawFace(ctx: Ctx, id: CosmeticId, shape: Shape, facing: SpriteFacing, now: number, still: boolean) {
  if (facing === "up") return;
  // Facing sideways the mask sits on the side of the face the Friend looks toward.
  const shift = facing === "left" ? -CELL : facing === "right" ? CELL : 0, x = shape.centre + shift;
  if (id === "pig-snout") {
    cells(ctx, [".###.", "#pdp#", "#pdp#", ".###."], x, shape.top + (shape.headRow + 4) * CELL, { "#": "#000", p: "#f2a0b8", d: "#8a3a55" }, 4);
    return;
  }
  const width = Math.max(5, Math.min(9, shape.run.to - shape.run.from - 1)) | 1, inner = width - 2;
  const face = id === "sybil-faces" ? SYBIL_FACES[still ? 0 : Math.floor(now / 700) % SYBIL_FACES.length] : { skin: "#f4efe4", mouth: "k" as const };
  const eyes = "w".repeat(Math.max(0, Math.floor((inner - 3) / 2))), gap = "w".repeat(inner - 2 - eyes.length * 2);
  // Four rows over the eyes and mouth: an outline, the eye holes, the mouth, an outline.
  const rows = ["#".repeat(width), "#" + eyes + "k" + gap + "k" + eyes + "#", "#" + "w" + (face.mouth === "r" ? "r" : "k").repeat(Math.max(1, inner - 2)) + "w" + "#", "#".repeat(width)];
  cells(ctx, rows, x, shape.top + (shape.headRow + 4) * CELL, { "#": "#000", w: face.skin, k: "#000", r: "#c8322a" });
}
function drawBody(ctx: Ctx, id: CosmeticId, shape: Shape, facing: SpriteFacing) {
  const to = shape.last - 2;
  if (id === "hoodie") {
    // A black hoodie: the torso dark, and the hood's rim around the top and edges of the head.
    recolour(ctx, shape, shape.torso, to, (_, c, span) => (c <= span.from + 1 || c >= span.to - 1 ? "#3a3a48" : "#4f4f60"));
    recolour(ctx, shape, shape.headRow, shape.torso - 1, (r, c, span) => (r === shape.headRow || c <= span.from + 1 || c >= span.to - 1 ? (facing === "down" && r > shape.headRow && c > span.from + 1 && c < span.to - 1 ? null : "#4f4f60") : null));
    if (facing === "down") {
      // A lighter front pocket, and white drawstrings hanging from the neck.
      recolour(ctx, shape, shape.torso + 2, shape.torso + 2, (_, c, span) => (Math.abs(c + 0.5 - (span.from + span.to + 1) / 2) < 1.6 ? "#5a5a6a" : null));
      recolour(ctx, shape, shape.torso, shape.torso + 1, (_, c, span) => { const middle = (span.from + span.to + 1) / 2; return Math.abs(c + 0.5 - (middle - 1)) < 0.6 || Math.abs(c + 0.5 - (middle + 1)) < 0.6 ? "#f0f0f0" : null; });
    }
  } else if (id === "apron") {
    // A butcher's apron: blue and white stripes down the front, with a neck strap; only its edge shows from behind.
    if (facing === "up") { recolour(ctx, shape, shape.torso + 1, shape.torso + 1, () => "#3d5f99"); return; }
    recolour(ctx, shape, shape.torso, to, (_, c, span) => { const middle = (span.from + span.to) / 2, half = Math.max(1, (span.to - span.from) * 0.35); return Math.abs(c + 0.5 - middle - 0.5) <= half ? (c % 2 === 0 ? "#3d5f99" : "#e8eef8") : null; });
    recolour(ctx, shape, shape.torso - 2, shape.torso - 1, (_, c, span) => (Math.abs(c + 0.5 - (span.from + span.to + 1) / 2) < 1.1 ? "#3d5f99" : null));
  }
}
function drawFeet(ctx: Ctx, shape: Shape) {
  // Red running shoes with a white stripe: every drawn cell of the bottom two rows (feet are often one cell wide, so there is no
  // inside to recolour), a darker sole along the bottom.
  for (const r of [shape.last - 1, shape.last]) [...(shape.rows[r] ?? "")].forEach((ch, c) => {
    if (ch === ".") return;
    ctx.fillStyle = r === shape.last ? "#8a2a20" : c % 3 === 1 ? "#fff" : "#d94f3c";
    ctx.fillRect(shape.left + c * CELL, shape.top + r * CELL, CELL, CELL);
  });
}
/** The Original Rug as a cape: a red and orange striped rug with a cream fringe, from the shoulders to the feet. */
function drawCape(ctx: Ctx, shape: Shape, facing: SpriteFacing, walking: boolean, frame: number) {
  const sway = walking ? (frame % 2) * 2 : 0;
  const top = shape.top + (shape.torso - 1) * CELL, bottom = shape.top + (shape.last + 1) * CELL;
  const span = shape.run.to - shape.run.from + 1, width = (facing === "left" || facing === "right" ? 4 : span + 2) * CELL;
  const back = facing === "right" ? -3 * CELL : facing === "left" ? 3 * CELL : 0;
  const left = Math.round(shape.centre - width / 2 + back + sway);
  ctx.fillStyle = "#000"; ctx.fillRect(left - 1, top - 1, width + 2, bottom - top + 2);
  for (let y = top; y < bottom - 4; y += 4) { ctx.fillStyle = Math.floor((y - top) / 4) % 3 === 1 ? "#d9853b" : "#a8322a"; ctx.fillRect(left, y, width, Math.min(4, bottom - 4 - y)); }
  for (let x = left; x < left + width; x += 3) { ctx.fillStyle = "#efe3cf"; ctx.fillRect(x, bottom - 4, 2, 5); }
}

/** Worn pieces drawn before the Friend: the cape (unless facing away) and the off-hand item when it sits behind them. */
export function drawGearBehind(ctx: Ctx, gear: Gear, sprites: GenerationSprites, x: number, y: number, facing: SpriteFacing, walking: boolean, frame: number, side: "left" | "right") {
  const shape = friendShape(sprites, facing, walking, frame, side, x, y);
  if (gear.back === "rug-cape" && facing !== "up") drawCape(ctx, shape, facing, walking, frame);
  if (gear.offhand && offhandBehind(facing)) drawOffhand(ctx, gear.offhand, x, y, facing, side);
}
/** Worn pieces drawn over the Friend: clothing, shoes, mask, headwear, the cape facing away, the off-hand item facing down. */
export function drawGearFront(ctx: Ctx, gear: Gear, sprites: GenerationSprites, x: number, y: number, facing: SpriteFacing, walking: boolean, frame: number, side: "left" | "right", now: number, still: boolean) {
  const shape = friendShape(sprites, facing, walking, frame, side, x, y);
  ctx.save(); ctx.beginPath(); ctx.rect(Math.round(x) - 40, Math.round(y) - 75, 80, 80); ctx.clip();
  if (gear.body) drawBody(ctx, gear.body, shape, facing);
  if (gear.feet === "running-shoes") drawFeet(ctx, shape);
  ctx.restore();
  if (gear.back === "rug-cape" && facing === "up") drawCape(ctx, shape, facing, walking, frame);
  if (gear.face) drawFace(ctx, gear.face, shape, facing, now, still);
  if (gear.head) drawHead(ctx, gear.head, shape);
  if (gear.offhand && !offhandBehind(facing)) drawOffhand(ctx, gear.offhand, x, y, facing, side);
}

// ---- Pets and the diploma ----
/** A pet at its screen spot (its feet, or for the bee the spot below it), facing left or right. */
export function drawPet(ctx: Ctx, id: CosmeticId, x: number, y: number, now: number, still: boolean, flip: boolean, moving: boolean) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); if (flip) ctx.scale(-1, 1);
  if (id === "bee-pet") {
    const bob = still ? 0 : Math.sin(now / 160) * 3, flap = still ? 0 : Math.floor(now / 70) % 2;
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)"; ctx.beginPath(); ctx.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(0, -26 + bob);
    ctx.fillStyle = "#000"; ctx.fillRect(-2 - flap, -11, 7, 6 + flap);
    ctx.fillStyle = "rgba(220, 240, 255, 0.9)"; ctx.fillRect(-1 - flap, -10, 5, 4 + flap);
    ctx.fillStyle = "#000"; ctx.fillRect(-9, -6, 18, 11);
    ctx.fillStyle = "#f2c200"; ctx.fillRect(-8, -5, 16, 9);
    ctx.fillStyle = "#000"; ctx.fillRect(-3, -5, 3, 9); ctx.fillRect(3, -5, 2, 9); ctx.fillRect(6, -2, 1, 1); ctx.fillRect(9, -1, 3, 2);
  } else if (id === "robot-pet") {
    const step = moving && !still ? Math.floor(now / 140) % 2 : 0;
    const px = (x: number, y: number, w: number, h: number, colour: string) => { ctx.fillStyle = colour; ctx.fillRect(x, y, w, h); };
    px(-6, -1 - step, 4, 3, "#000"); px(2, -3 + step, 4, 3, "#000");
    px(-9, -22, 18, 20, "#000"); px(-8, -21, 16, 18, "#a9a9b4");
    px(-6, -18, 3, 3, "#000"); px(3, -18, 3, 3, "#000");
    px(-7, -11, 14, 2, "#e8c65a"); px(-7, -9, 14, 2, "#d4af37"); px(-7, -7, 14, 2, "#e8c65a");
    px(-1, -28, 2, 6, "#000"); px(-2, -30, 4, 3, "#d4af37");
  }
  ctx.restore();
}
/** Dr. Ponzi's Medical Diploma, framed, as a bitmap for the Data Center wall (96 x 120, like the posters). */
let diploma: HTMLCanvasElement | null = null;
export function diplomaBitmap(): HTMLCanvasElement {
  if (diploma) return diploma;
  const canvas = document.createElement("canvas"); canvas.width = 96; canvas.height = 120;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#5b3a1e"; g.fillRect(0, 0, 96, 120); g.fillStyle = "#d9b048"; g.fillRect(4, 4, 88, 112);
  g.fillStyle = "#f7f0dc"; g.fillRect(8, 8, 80, 104);
  g.fillStyle = "#000"; g.textAlign = "center"; g.font = "bold 11px serif"; g.fillText("DIPLOMA", 48, 28);
  g.font = "8px serif"; g.fillText("Doctor of", 48, 42); g.fillText("Pyramid Medicine", 48, 52);
  g.fillStyle = "#8a8a8a"; for (const y of [64, 71, 78]) g.fillRect(20, y, 56, 1);
  g.fillStyle = "#c8322a"; g.beginPath(); g.arc(66, 96, 9, 0, Math.PI * 2); g.fill(); g.fillRect(60, 102, 4, 10); g.fillRect(68, 102, 4, 10);
  g.fillStyle = "#e0b030"; g.beginPath(); g.arc(66, 96, 5, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#000"; g.font = "italic 8px serif"; g.fillText("Dr. Ponzi", 32, 100);
  diploma = canvas; return canvas;
}
