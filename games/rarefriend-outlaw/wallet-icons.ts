/**
 * Vector icons for Hack the Hardware Wallet: the defenders, the programs, the USB port, the Honeypot and the Virus. Flat fills with a
 * black outline and a white halo (the vector form of the world's one-bit sprites), drawn with canvas paths so they stay sharp at any
 * size and can carry more detail than the old 8 x 8 masks.
 *
 * Every icon is drawn in a 32 x 32 box, feet at the bottom middle, and placed with its feet at (x, y).
 */

export type WalletIconId =
  | "wall" | "alarm" | "validator" | "gasspike" | "whale" | "bomb" | "fork" | "reentrancy" | "cold" | "chip" | "honeypot" | "usb" | "drainer" | "fakechip"
  | "rollback" | "flashloan" | "halving" | "lowentropy" | "multisig" | "staking" | "explorer" | "airdrop" | "antivirus" | "checksum" | "lowslippage"
  | "investors" | "ico" | "sandwichbot" | "liquidator";

type Ctx = CanvasRenderingContext2D;
/** Paints an icon's parts. Each part is drawn twice: once as a thick white halo, then filled and outlined in black. */
type Painter = {
  /** A filled shape with a black outline (or none, for details inside another shape). */
  shape: (path: (c: Ctx) => void, fill: string, outline?: boolean) => void;
  /** An open stroke, like a hose or a check mark. */
  line: (path: (c: Ctx) => void, colour: string, width: number) => void;
};

const OUTLINE = 2.2, HALO = 3.2;
const greyOf = (colour: string) => {
  const hex = colour.replace("#", ""), v = parseInt(hex.length === 3 ? hex.split("").map(ch => ch + ch).join("") : hex, 16);
  const lum = 0.3 * (v >> 16 & 255) + 0.59 * (v >> 8 & 255) + 0.11 * (v & 255), g = Math.round(110 + lum * 0.45);
  return `rgb(${g}, ${g}, ${g})`;
};

function paint(ctx: Ctx, art: (p: Painter) => void, dead: boolean) {
  const colour = (c: string) => (dead ? greyOf(c) : c);
  // The halo: every part stroked wide in white, so the icon lifts off the navy circuit and the white tiles alike.
  art({
    shape: (path, _fill, outline = true) => { if (!outline) return; ctx.beginPath(); path(ctx); ctx.lineWidth = OUTLINE + HALO * 2; ctx.strokeStyle = "#fff"; ctx.stroke(); ctx.fillStyle = "#fff"; ctx.fill(); },
    line: (path, c, width) => { ctx.beginPath(); path(ctx); ctx.lineWidth = width + (c === "#000" ? 0 : OUTLINE * 2) + HALO * 2; ctx.strokeStyle = "#fff"; ctx.stroke(); },
  });
  art({
    shape: (path, fill, outline = true) => { ctx.beginPath(); path(ctx); ctx.fillStyle = colour(fill); ctx.fill(); if (outline) { ctx.lineWidth = OUTLINE; ctx.strokeStyle = "#000"; ctx.stroke(); } },
    // A black line is drawn at its own width (mortar, cords, legs); a coloured one gets a black outline round it.
    line: (path, c, width) => {
      if (c === "#000") { ctx.beginPath(); path(ctx); ctx.lineWidth = width; ctx.strokeStyle = "#000"; ctx.stroke(); return; }
      ctx.beginPath(); path(ctx); ctx.lineWidth = width + OUTLINE * 2; ctx.strokeStyle = "#000"; ctx.stroke();
      ctx.beginPath(); path(ctx); ctx.lineWidth = width; ctx.strokeStyle = colour(c); ctx.stroke();
    },
  });
}

const rect = (x: number, y: number, w: number, h: number, r = 0) => (c: Ctx) => { if (r) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
const circle = (x: number, y: number, r: number) => (c: Ctx) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, Math.PI * 2); };
const poly = (...pts: number[]) => (c: Ctx) => { c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); };
const polyline = (...pts: number[]) => (c: Ctx) => { c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); };

const ICONS: Record<WalletIconId, (p: Painter) => void> = {
  // Firewall: a red brick wall with black mortar, flames licking over the top.
  wall: p => {
    p.shape(c => { c.moveTo(6, 16); c.bezierCurveTo(4, 10, 9, 8, 8, 2); c.bezierCurveTo(13, 6, 13, 10, 15, 11); c.bezierCurveTo(15, 7, 18, 5, 17, 1); c.bezierCurveTo(23, 5, 22, 10, 23, 12); c.bezierCurveTo(24, 9, 27, 8, 27, 5); c.bezierCurveTo(30, 10, 28, 14, 27, 16); c.closePath(); }, "#ff8a2a");
    p.shape(c => { c.moveTo(10, 16); c.bezierCurveTo(9, 13, 12, 12, 12, 8); c.bezierCurveTo(15, 11, 15, 13, 17, 13); c.bezierCurveTo(18, 11, 20, 10, 20, 7); c.bezierCurveTo(24, 11, 24, 14, 23, 16); c.closePath(); }, "#ffd23c", false);
    p.shape(rect(3, 15, 26, 16), "#c0452a");
    p.line(c => { for (const y of [20.3, 25.6]) { c.moveTo(3.5, y); c.lineTo(28.5, y); } for (const [x, y0, y1] of [[11, 15, 20.3], [21, 15, 20.3], [7, 20.3, 25.6], [16, 20.3, 25.6], [25, 20.3, 25.6], [11, 25.6, 31], [21, 25.6, 31]]) { c.moveTo(x, y0); c.lineTo(x, y1); } }, "#000", 1.3);
    p.shape(rect(4.5, 16.5, 5, 2), "#e07050", false);
    p.shape(rect(17.5, 22, 5, 2), "#e07050", false);
  },
  // Tamper Alarm: a white bell with a red band and a red light on top.
  alarm: p => {
    p.shape(circle(16, 4, 2.6), "#d94f3c");
    p.shape(c => { c.moveTo(6, 24); c.bezierCurveTo(7, 20, 7, 9, 16, 7); c.bezierCurveTo(25, 9, 25, 20, 26, 24); c.closePath(); }, "#f5f2ea");
    p.shape(c => { c.moveTo(7.2, 19); c.lineTo(24.8, 19); c.lineTo(25.6, 22.5); c.lineTo(6.4, 22.5); c.closePath(); }, "#d94f3c", false);
    p.shape(rect(3, 23.5, 26, 3.6, 1.8), "#d9d4c8");
    p.shape(circle(16, 29, 2.6), "#d9b048");
    p.line(c => { c.moveTo(11, 11); c.quadraticCurveTo(9.5, 14, 9.6, 17); }, "#fff", 1.6);
  },
  // Validator: a white block with a bold green check mark.
  validator: p => {
    p.shape(rect(4, 6, 24, 24, 4), "#f5f2ea");
    p.shape(rect(4, 6, 24, 5, 0), "#3fbf4f", false);
    p.line(c => { c.moveTo(4, 11); c.lineTo(28, 11); }, "#000", 1.3);
    p.line(polyline(9, 20, 14, 25, 23, 14.5), "#3fbf4f", 3.4);
  },
  // Gas Spike: a fuel pump with a lit display and an orange hose to its nozzle.
  gasspike: p => {
    p.line(c => { c.moveTo(20, 12); c.bezierCurveTo(29, 12, 29, 20, 27, 26); }, "#ff8a2a", 2.4);
    p.shape(poly(24.5, 24, 29.5, 24, 28.5, 29, 25.5, 29), "#555");
    p.shape(rect(6, 5, 15, 25, 2), "#f5f2ea");
    p.shape(rect(8.5, 8, 10, 7, 1), "#1b2f55");
    p.line(c => { c.moveTo(10.5, 11.5); c.lineTo(16.5, 11.5); }, "#ff8a2a", 1.4);
    p.shape(rect(8.5, 18, 10, 3, 1), "#ff8a2a", false);
    p.shape(rect(3.5, 29, 20, 2.5, 1), "#555");
  },
  // Difficulty Bomb: a black round bomb with a grey cap, a short fuse and an orange spark.
  bomb: p => {
    p.shape(c => { c.moveTo(27, 19); c.arc(16, 19, 11, 0, Math.PI * 2); }, "#222222");
    p.shape(c => { c.moveTo(13, 6); c.lineTo(19, 6); c.lineTo(19, 10); c.lineTo(13, 10); c.closePath(); }, "#8a8a8a");
    p.line(c => { c.moveTo(16, 6); c.quadraticCurveTo(18, 2, 23, 3); }, "#d9b048", 2);
    p.shape(c => { c.moveTo(26.5, 3); c.arc(24, 3, 2.5, 0, Math.PI * 2); }, "#ff8a2a");
    p.shape(c => { c.moveTo(13, 15); c.arc(11.5, 15, 1.5, 0, Math.PI * 2); }, "#6a6a6a", false);
  },
  // Hard Fork: a purple chain that splits in two, one branch gold, with a red virus dot at the end of the new branch.
  fork: p => {
    p.line(c => { c.moveTo(16, 31); c.lineTo(16, 18); c.lineTo(8, 8); c.moveTo(16, 18); c.lineTo(24, 8); }, "#7a4fd9", 4);
    p.line(c => { c.moveTo(16, 18); c.lineTo(24, 8); }, "#d9b048", 4);
    for (const [x, y] of [[16, 31], [16, 24], [16, 18], [11, 12], [21, 12]] as const) p.shape(c => { c.moveTo(x + 2.4, y); c.arc(x, y, 2.4, 0, Math.PI * 2); }, "#f5f2ea", false);
    p.shape(c => { c.moveTo(28.5, 6); c.arc(25.5, 6, 3, 0, Math.PI * 2); }, "#d94f3c");
  },
  // Reentrancy Attack: a red contract scroll with a purple arrow curling out of it and back in.
  reentrancy: p => {
    p.shape(c => { c.moveTo(8, 5); c.lineTo(22, 5); c.lineTo(22, 29); c.lineTo(8, 29); c.closePath(); }, "#e0473c");
    p.line(c => { for (const y of [11, 15, 19]) { c.moveTo(11, y); c.lineTo(19, y); } }, "#8a1f18", 1.2);
    p.line(c => { c.moveTo(19, 24); c.bezierCurveTo(31, 24, 31, 8, 22, 9); }, "#7a4fd9", 2.6);
    p.shape(poly(24.5, 5, 19, 9, 24.5, 13), "#7a4fd9");
  },
  // Cold Storage: an ice-blue safe with a white dial, frost crystals on its top corners.
  cold: p => {
    p.shape(c => { c.moveTo(6, 8); c.lineTo(26, 8); c.lineTo(26, 30); c.lineTo(6, 30); c.closePath(); }, "#7fb2d9");
    p.shape(c => { c.moveTo(21, 19); c.arc(16, 19, 5, 0, Math.PI * 2); }, "#f5f2ea", false);
    p.shape(c => { c.moveTo(18, 19); c.arc(16, 19, 2, 0, Math.PI * 2); }, "#2b5a80", false);
    p.line(c => { c.moveTo(16, 14); c.lineTo(16, 16); c.moveTo(21, 19); c.lineTo(23, 19); c.moveTo(16, 22); c.lineTo(16, 24); c.moveTo(9, 19); c.lineTo(11, 19); }, "#2b5a80", 1.4);
    p.line(c => { for (const [x, y] of [[8, 5], [24, 5]] as const) { c.moveTo(x - 3, y); c.lineTo(x + 3, y); c.moveTo(x, y - 3); c.lineTo(x, y + 3); c.moveTo(x - 2, y - 2); c.lineTo(x + 2, y + 2); c.moveTo(x - 2, y + 2); c.lineTo(x + 2, y - 2); } }, "#e8f4ff", 1.2);
  },
  // Whale: a blue whale with a spout, a cream belly and a raised tail.
  whale: p => {
    p.line(c => { c.moveTo(11, 11); c.quadraticCurveTo(10, 6, 7, 4); c.moveTo(11, 11); c.quadraticCurveTo(12, 6, 15, 4); }, "#8fd0ff", 1.4);
    p.shape(c => { c.moveTo(3, 21); c.bezierCurveTo(3, 13, 12, 11, 19, 13); c.bezierCurveTo(24, 14, 25, 17, 27, 13); c.lineTo(30, 9); c.lineTo(30.5, 15); c.lineTo(28.5, 18); c.bezierCurveTo(27, 25, 21, 29, 12, 29); c.bezierCurveTo(6, 29, 3, 26, 3, 21); c.closePath(); }, "#5aa0ff");
    p.shape(c => { c.moveTo(5, 24); c.bezierCurveTo(9, 27, 17, 27, 22, 24); c.bezierCurveTo(18, 28.5, 9, 29, 5, 24); c.closePath(); }, "#f5e9d0", false);
    p.shape(circle(9, 19, 1.6), "#000", false);
    p.line(c => { c.moveTo(13, 23); c.quadraticCurveTo(16, 25, 19, 22.5); }, "#1b3f8a", 1.1);
  },
  // Secure Chip: a dark chip with gold pins on every side and a lime core with a keyhole.
  chip: p => {
    p.line(c => { for (let i = 0; i < 4; i++) { const v = 10 + i * 4; c.moveTo(v, 3); c.lineTo(v, 29); c.moveTo(3, v); c.lineTo(29, v); } }, "#d9b048", 1.6);
    p.shape(rect(6, 6, 20, 20, 2.5), "#2a2f3a");
    p.shape(rect(10, 10, 12, 12, 2), "#ccff00");
    p.shape(c => { c.moveTo(18, 14.5); c.arc(16, 14.5, 2, 0, Math.PI * 2); c.moveTo(15.2, 16); c.lineTo(16.8, 16); c.lineTo(17.4, 19.5); c.lineTo(14.6, 19.5); c.closePath(); }, "#000", false);
    p.shape(circle(8.5, 8.5, 0.9), "#d9b048", false);
  },
  // Red Chip: the Secure Chip's shape in reds, a Sybil fake.
  fakechip: p => {
    p.line(c => { for (let i = 0; i < 4; i++) { const v = 10 + i * 4; c.moveTo(v, 3); c.lineTo(v, 29); c.moveTo(3, v); c.lineTo(29, v); } }, "#d94f3c", 1.6);
    p.shape(rect(6, 6, 20, 20, 2.5), "#3a1f1f");
    p.shape(rect(10, 10, 12, 12, 2), "#ff6b5c");
    p.shape(c => { c.moveTo(18, 14.5); c.arc(16, 14.5, 2, 0, Math.PI * 2); c.moveTo(15.2, 16); c.lineTo(16.8, 16); c.lineTo(17.4, 19.5); c.lineTo(14.6, 19.5); c.closePath(); }, "#000", false);
    p.shape(circle(8.5, 8.5, 0.9), "#d94f3c", false);
  },
  // Honeypot: a round gold pot with a lid and honey dripping over the rim.
  honeypot: p => {
    p.shape(c => { c.moveTo(7, 12); c.bezierCurveTo(1, 16, 3, 30, 16, 30); c.bezierCurveTo(29, 30, 31, 16, 25, 12); c.closePath(); }, "#d9b048");
    p.shape(rect(6, 8.5, 20, 4.5, 2), "#b8862a");
    p.shape(c => { c.moveTo(7, 13); c.lineTo(25, 13); c.lineTo(24, 16); c.quadraticCurveTo(22.5, 20, 21, 16); c.quadraticCurveTo(18, 15.5, 15, 16); c.quadraticCurveTo(13.5, 22, 12, 16); c.lineTo(8, 16); c.closePath(); }, "#ffd23c", false);
    p.shape(rect(13.5, 5.5, 5, 3.5, 1.5), "#b8862a");
    p.line(c => { c.moveTo(8.5, 21); c.quadraticCurveTo(9, 26, 13, 27.5); }, "#fff2b0", 1.4);
  },
  // Wallet Drainer: a brown wallet tipped upside down, gold coins spilling from it into a dark drain funnel below.
  drainer: p => {
    p.shape(c => { c.moveTo(4, 22); c.lineTo(28, 22); c.lineTo(20, 30); c.lineTo(12, 30); c.closePath(); }, "#3a3f4a");
    p.shape(rect(13, 28, 6, 3), "#1f232b", false);
    p.shape(rect(7, 3, 18, 10, 3), "#8a5a2b");
    p.shape(rect(9, 9, 14, 3, 1), "#5f3d1c", false);
    p.shape(rect(20, 5.5, 4, 3, 1), "#d9b048");
    p.shape(circle(11.5, 16.5, 2.4), "#ffd23c");
    p.shape(circle(17, 19.5, 2.4), "#ffd23c");
    p.shape(circle(21.5, 15.5, 2.4), "#ffd23c");
  },
  // USB port: a plug with its metal shell and two blue contacts.
  usb: p => {
    p.shape(rect(9.5, 3, 13, 10, 1), "#d9dde4");
    p.shape(rect(12, 6, 3, 3), "#3d7bd9", false);
    p.shape(rect(17, 6, 3, 3), "#3d7bd9", false);
    p.shape(rect(6, 12.5, 20, 17, 3), "#f5f2ea");
    p.line(c => { c.moveTo(16, 16); c.lineTo(16, 26); c.moveTo(16, 19.5); c.lineTo(12, 17); c.moveTo(16, 22); c.lineTo(20, 19.5); }, "#3d7bd9", 1.5);
    p.shape(circle(16, 26.5, 1.6), "#3d7bd9", false);
  },
  // Rollback: a blue arrow turning back round a clock face.
  rollback: p => {
    p.shape(circle(16, 17, 11), "#f5f2ea");
    p.line(c => { c.arc(16, 17, 7.5, Math.PI * 0.95, Math.PI * 2.55); }, "#5aa0ff", 2.8);
    p.shape(poly(4.5, 13.5, 12.5, 13.5, 8.5, 20), "#5aa0ff");
    p.line(c => { c.moveTo(16, 17); c.lineTo(16, 12); c.moveTo(16, 17); c.lineTo(19.5, 19); }, "#000", 1.4);
  },
  // Flash Loan: a gold lightning bolt over a coin.
  flashloan: p => {
    p.shape(circle(16, 18, 11.5), "#f5f2ea");
    p.shape(circle(16, 18, 8.5), "#e8c65a", false);
    p.shape(poly(19, 3, 9, 19, 15, 19, 12, 31, 24, 14, 17.5, 14), "#e0b030");
  },
  // Halving: a coin cut in two, one half gold and one half white, slightly apart.
  halving: p => {
    p.shape(c => { c.moveTo(14.5, 5); c.arc(14.5, 17, 12, -Math.PI / 2, Math.PI / 2, true); c.closePath(); }, "#d9b048");
    p.shape(c => { c.moveTo(17.5, 5); c.arc(17.5, 17, 12, -Math.PI / 2, Math.PI / 2); c.closePath(); }, "#f5f2ea");
    p.line(c => { c.moveTo(7, 17); c.lineTo(12, 17); }, "#8a6a1a", 1.4);
    p.line(c => { c.moveTo(20, 17); c.lineTo(25, 17); }, "#8a8a8a", 1.4);
  },
  // Low Entropy: a white die showing a single faded pip, with a red arrow pointing down beside it (the randomness draining away).
  lowentropy: p => {
    p.shape(c => { c.moveTo(6, 8); c.lineTo(20, 8); c.lineTo(20, 22); c.lineTo(6, 22); c.closePath(); }, "#f5f2ea");
    p.shape(c => { c.moveTo(16, 15); c.arc(13, 15, 3, 0, Math.PI * 2); }, "#bdb8ac");
    p.shape(poly(24, 6, 28, 6, 28, 18, 31, 18, 26, 25, 21, 18, 24, 18), "#e0473c");
  },
  // Low Slippage: a price line that dips only a little and levels off, green, on a white card.
  lowslippage: p => {
    p.shape(c => { c.moveTo(4, 6); c.lineTo(28, 6); c.lineTo(28, 28); c.lineTo(4, 28); c.closePath(); }, "#f5f2ea");
    p.line(polyline(7, 12, 14, 12, 18, 17, 25, 17), "#3fbf4f", 3);
    p.line(c => { c.moveTo(7, 23); c.lineTo(25, 23); }, "#8a8a8a", 1.4);
  },
  // Rob Peter to pay Paul: Dr. Ponzi's gold pyramid with three small green figures (heads on bodies) lined up along its base.
  investors: p => {
    p.shape(poly(16, 4, 29, 24, 3, 24), "#d9b048");
    p.line(c => { c.moveTo(9.5, 14); c.lineTo(22.5, 14); c.moveTo(6.5, 19); c.lineTo(25.5, 19); }, "#8a6a1a", 1.2);
    for (const x of [8, 16, 24]) {
      p.shape(c => { c.moveTo(x + 2.2, 23); c.arc(x, 23, 2.2, 0, Math.PI * 2); }, "#3fbf4f");
      p.shape(c => { c.moveTo(x - 3, 31); c.lineTo(x + 3, 31); c.lineTo(x + 2.2, 25.5); c.lineTo(x - 2.2, 25.5); c.closePath(); }, "#3fbf4f");
    }
  },
  // The Liquidator: a hulking figure in a dark suit and red tie, blue droplets flying from one raised hand.
  liquidator: p => {
    p.shape(c => { c.moveTo(7, 31); c.lineTo(7, 15); c.quadraticCurveTo(7, 10, 12, 10); c.lineTo(20, 10); c.quadraticCurveTo(25, 10, 25, 15); c.lineTo(25, 31); c.closePath(); }, "#2b2b3a");
    p.shape(c => { c.moveTo(16, 11); c.lineTo(18, 20); c.lineTo(16, 25); c.lineTo(14, 20); c.closePath(); }, "#d94f3c");
    p.shape(c => { c.moveTo(20.5, 6); c.arc(16, 6, 4.5, 0, Math.PI * 2); }, "#e8c0a0");
    p.shape(c => { c.moveTo(25, 14); c.lineTo(30, 6); c.lineTo(32, 8); c.lineTo(27, 16); c.closePath(); }, "#2b2b3a");
    for (const [x, y] of [[29, 2], [32, 4], [30.5, 0.5]] as const) p.shape(c => { c.moveTo(x + 1.5, y); c.arc(x, y, 1.5, 0, Math.PI * 2); }, "#3d7bd9");
  },
  // Sandwich Bot: a grey robot, gold antenna, two dark eyes and a gold-filled sandwich across its chest.
  sandwichbot: p => {
    p.line(c => { c.moveTo(16, 3); c.lineTo(16, 8); }, "#d4af37", 2.2);
    p.shape(c => { c.moveTo(18.5, 3); c.arc(16, 3, 2.5, 0, Math.PI * 2); }, "#d4af37");
    p.shape(c => { c.moveTo(7, 8); c.lineTo(25, 8); c.lineTo(25, 30); c.lineTo(7, 30); c.closePath(); }, "#a9a9b4");
    p.shape(c => { c.moveTo(13.5, 13); c.arc(11.5, 13, 2, 0, Math.PI * 2); c.moveTo(22.5, 13); c.arc(20.5, 13, 2, 0, Math.PI * 2); }, "#1a1a1a");
    p.shape(c => { c.moveTo(9, 19); c.lineTo(23, 19); c.lineTo(23, 22); c.lineTo(9, 22); c.closePath(); }, "#e8c65a");
    p.shape(c => { c.moveTo(9, 22); c.lineTo(23, 22); c.lineTo(23, 25); c.lineTo(9, 25); c.closePath(); }, "#d4af37");
    p.shape(c => { c.moveTo(9, 25); c.lineTo(23, 25); c.lineTo(23, 27.5); c.lineTo(9, 27.5); c.closePath(); }, "#e8c65a");
  },
  // ICO: a gold token with a rising green bar chart beside it (the raise).
  ico: p => {
    p.shape(c => { c.moveTo(19, 11); c.arc(11, 11, 8, 0, Math.PI * 2); }, "#e8c65a");
    p.shape(c => { c.moveTo(15, 11); c.arc(11, 11, 4, 0, Math.PI * 2); }, "#d9b048", false);
    p.shape(c => { c.moveTo(17, 30); c.lineTo(21, 30); c.lineTo(21, 22); c.lineTo(17, 22); c.closePath(); }, "#3fbf4f");
    p.shape(c => { c.moveTo(22.5, 30); c.lineTo(26.5, 30); c.lineTo(26.5, 16); c.lineTo(22.5, 16); c.closePath(); }, "#3fbf4f");
    p.shape(c => { c.moveTo(28, 30); c.lineTo(32, 30); c.lineTo(32, 9); c.lineTo(28, 9); c.closePath(); }, "#3fbf4f");
    p.shape(c => { c.moveTo(4, 30); c.lineTo(15.5, 30); c.lineTo(15.5, 26); c.lineTo(4, 26); c.closePath(); }, "#3fbf4f");
  },
  // Multisig: two purple keys crossed.
  multisig: p => {
    const key = (sign: number) => {
      p.shape(c => { c.save(); c.translate(16, 17); c.rotate(sign * Math.PI / 4); c.rect(-1.8, -3, 3.6, 16); c.rect(1.8, 7, 3.2, 2.4); c.rect(1.8, 10.6, 2.4, 2.4); c.restore(); }, "#b04fd9");
      p.shape(c => { c.save(); c.translate(16, 17); c.rotate(sign * Math.PI / 4); c.moveTo(5, -8); c.arc(0, -8, 5, 0, Math.PI * 2); c.moveTo(2, -8); c.arc(0, -8, 2, 0, Math.PI * 2, true); c.restore(); }, "#b04fd9");
    };
    key(-1); key(1);
  },
  // Staking: a stack of three green coins.
  staking: p => {
    for (const y of [24, 17.5, 11]) {
      p.shape(c => { c.ellipse(16, y + 3, 11, 4, 0, 0, Math.PI); c.lineTo(5, y); c.ellipse(16, y, 11, 4, 0, Math.PI, Math.PI * 2); c.lineTo(27, y + 3); }, "#3fbf4f");
      p.shape(c => c.ellipse(16, y, 11, 4, 0, 0, Math.PI * 2), "#7ee08a");
      p.shape(c => c.ellipse(16, y, 5, 1.6, 0, 0, Math.PI * 2), "#3fbf4f", false);
    }
  },
  // Block Explorer: a magnifying glass over a block.
  explorer: p => {
    p.line(c => { c.moveTo(20.5, 20.5); c.lineTo(28, 28); }, "#555", 3.6);
    p.shape(circle(14, 14, 10), "#bdf2f2");
    p.shape(poly(14, 8.5, 19, 11, 19, 17, 14, 19.5, 9, 17, 9, 11), "#3fbfbf");
    p.line(c => { c.moveTo(9, 11); c.lineTo(14, 13.5); c.lineTo(19, 11); c.moveTo(14, 13.5); c.lineTo(14, 19.5); }, "#000", 1.3);
    p.line(c => { c.arc(14, 14, 7, Math.PI * 1.1, Math.PI * 1.4); }, "#fff", 1.5);
  },
  // Airdrop: a parachute carrying a gold coin.
  airdrop: p => {
    p.line(c => { c.moveTo(5, 12); c.lineTo(16, 24); c.lineTo(27, 12); c.moveTo(12, 12); c.lineTo(16, 24); c.lineTo(20, 12); }, "#000", 1.1);
    p.shape(c => { c.moveTo(4, 12); c.bezierCurveTo(4, 1, 28, 1, 28, 12); c.quadraticCurveTo(24, 9.5, 20, 12); c.quadraticCurveTo(16, 9.5, 12, 12); c.quadraticCurveTo(8, 9.5, 4, 12); c.closePath(); }, "#f5f2ea");
    p.shape(c => { c.moveTo(12, 12); c.quadraticCurveTo(13, 3.5, 16, 3); c.quadraticCurveTo(19, 3.5, 20, 12); c.quadraticCurveTo(16, 9.5, 12, 12); c.closePath(); }, "#d94f3c", false);
    p.shape(circle(16, 26.5, 5), "#d9b048");
    p.line(c => { c.moveTo(16, 24); c.lineTo(16, 29); }, "#8a6a1a", 1.2);
  },
  // Antivirus: a red no-entry ring struck through a small bug.
  antivirus: p => {
    p.shape(circle(16, 17, 12.5), "#d94f3c");
    p.shape(circle(16, 17, 8.8), "#f5f2ea");
    p.shape(c => c.ellipse(16, 17.5, 3.6, 4.6, 0, 0, Math.PI * 2), "#e2583e", false);
    p.line(c => { c.moveTo(12.5, 15); c.lineTo(10, 13.5); c.moveTo(19.5, 15); c.lineTo(22, 13.5); c.moveTo(12.5, 20); c.lineTo(10, 21.5); c.moveTo(19.5, 20); c.lineTo(22, 21.5); }, "#000", 1.4);
    p.line(c => { c.moveTo(7.5, 25.5); c.lineTo(24.5, 8.5); }, "#d94f3c", 3.4);
  },
  // Checksum: a page of hashes with an orange check mark.
  checksum: p => {
    p.shape(c => { c.moveTo(6, 3); c.lineTo(21, 3); c.lineTo(27, 9); c.lineTo(27, 31); c.lineTo(6, 31); c.closePath(); }, "#f5f2ea");
    p.shape(poly(21, 3, 21, 9, 27, 9), "#d9d4c8");
    p.line(c => { for (const y of [12, 16, 20]) { c.moveTo(9.5, y); c.lineTo(19, y); } }, "#8a8a8a", 1.2);
    p.line(polyline(11, 24, 15, 28, 24, 17.5), "#ff8a2a", 3);
  },
};

/** Draw a wallet icon with its feet at (x, y), `size` px across (the icons were 24 px masks; 28 is the board size). A beaten
 * defender (`dead`) is drawn in greys. */
export function drawWalletIcon(ctx: Ctx, id: WalletIconId, x: number, y: number, size = 28, dead = false) {
  const s = size / 32;
  ctx.save(); ctx.translate(x - 16 * s, y + 3 - 32 * s); ctx.scale(s, s);
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  paint(ctx, ICONS[id], dead);
  ctx.restore();
}

// The Virus: a coral red circuit bug seen from above, head up, gold eyes and black circuit lines ending in gold pads on its back.
// Two frames swing its six legs as it crawls.
export const VIRUS_COLOURS = { body: "#e2583e", accent: "#d9b048" };
/** Draw the Virus centred on (x, y), `size` px long, in leg frame `frame`; `down` turns it head down, `squash` < 1 lays it flat on
 * the isometric floor so it fits inside one tile. */
export function drawVirusIcon(ctx: Ctx, x: number, y: number, down: boolean, frame: number, size = 30, squash = 1) {
  const s = size / 32, swing = frame % 2 ? 1 : -1;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s * squash); if (down) ctx.scale(1, -1); ctx.translate(-16, -16);
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  paint(ctx, p => {
    // Legs: three a side, the middle pair swinging against the others.
    p.line(c => {
      for (const side of [-1, 1]) for (const [k, y0] of [[0, 13], [1, 18], [2, 23]] as const) {
        const sw = (k === 1 ? -swing : swing) * 2.2, x0 = 16 + side * 6;
        c.moveTo(x0, y0); c.lineTo(16 + side * 11, y0 - 2 + sw); c.lineTo(16 + side * 14, y0 + 2 + sw);
      }
    }, "#000", 1.8);
    // Antennae.
    p.line(c => { c.moveTo(13.5, 6); c.quadraticCurveTo(11, 2, 8, 1.5); c.moveTo(18.5, 6); c.quadraticCurveTo(21, 2, 24, 1.5); }, "#000", 1.4);
    // Body and head.
    p.shape(c => c.ellipse(16, 20, 8, 10, 0, 0, Math.PI * 2), VIRUS_COLOURS.body);
    p.shape(c => c.ellipse(16, 8, 5.5, 4.5, 0, 0, Math.PI * 2), VIRUS_COLOURS.body);
    p.shape(circle(13.8, 7.6, 1.6), VIRUS_COLOURS.accent, false);
    p.shape(circle(18.2, 7.6, 1.6), VIRUS_COLOURS.accent, false);
    // Circuit lines on its back, ending in gold pads.
    p.line(c => { c.moveTo(16, 12); c.lineTo(16, 27); c.moveTo(16, 16); c.lineTo(12, 19); c.lineTo(12, 24); c.moveTo(16, 21); c.lineTo(20, 18); c.lineTo(20, 15); }, "#000", 1.3);
    for (const [px, py] of [[12, 24.5], [20, 14.5], [16, 27.5]] as const) p.shape(circle(px, py, 1.4), VIRUS_COLOURS.accent, false);
  }, false);
  ctx.restore();
}
