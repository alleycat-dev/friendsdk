// The twelve seed phrase trophies: handing in n seed words at the Data Center's Licence Settlement terminal earns trophies 1 to n,
// each with its hunter title, and they stand on the pedestals of the Data Center's trophy hall (bottom-right room).

/** The trophies in order: settle a licence with n seed words to earn the first n. The best one earned gives your title. */
export const TROPHIES: readonly { name: string; title: string }[] = [
  { name: "Rookie Trophy", title: "Rookie Hunter" },
  { name: "Novice Trophy", title: "Novice Hunter" },
  { name: "Seasoned Trophy", title: "Seasoned Hunter" },
  { name: "Hardened Trophy", title: "Hardened Hunter" },
  { name: "Veteran Trophy", title: "Veteran Hunter" },
  { name: "Expert Trophy", title: "Expert Hunter" },
  { name: "Elite Trophy", title: "Elite Hunter" },
  { name: "Master Trophy", title: "Master Hunter" },
  { name: "Champion's Trophy", title: "Champion Hunter" },
  { name: "Legendary Trophy", title: "Legendary Hunter" },
  { name: "Mythical Trophy", title: "Mythical Hunter" },
  { name: "Ultimate Trophy", title: "Ultimate Hunter" },
];

/** A material: its body colour, highlight and shade. */
type Material = { main: string; light: string; dark: string };
const WOOD: Material = { main: "#9a6a38", light: "#c89058", dark: "#5e3b1c" };
const TIN: Material = { main: "#9aa3ab", light: "#d6dce0", dark: "#5d666e" };
const COPPER: Material = { main: "#b8652e", light: "#e8a066", dark: "#7a3d16" };
const IRON: Material = { main: "#5a6068", light: "#949ca4", dark: "#2e3238" };
const BRONZE: Material = { main: "#a8732a", light: "#dcaa5c", dark: "#6b4514" };
const SILVER: Material = { main: "#c0c6cc", light: "#f4f6f8", dark: "#7c848c" };
const GOLD: Material = { main: "#e0b030", light: "#fff0a0", dark: "#9a7414" };
const AMETHYST: Material = { main: "#a35ce0", light: "#e2c2ff", dark: "#5e2a8a" };
const GHOST: Material = { main: "#c8c8c8", light: "#c8c8c8", dark: "#b0b0b0" };

type Ctx = CanvasRenderingContext2D;
const OUTLINE = "#000";

function shape(ctx: Ctx, fill: string, draw: () => void, line = 0.7) {
  ctx.beginPath(); draw(); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = line; ctx.stroke();
}
/** The plinth every trophy stands on, `w` units wide, with a small plate. */
function plinth(ctx: Ctx, m: Material, w: number) {
  shape(ctx, m.dark, () => ctx.rect(-w / 2, -3, w, 3));
  ctx.fillStyle = m.light; ctx.fillRect(-w / 2 + 1, -2.2, w - 2, 0.8);
}
/** A cup: a stem from the plinth up to a bowl `w` wide and `h` tall, optionally with handles and a lid. */
function cup(ctx: Ctx, m: Material, w: number, h: number, stem: number, handles: boolean, lid: boolean) {
  const bottom = -3 - stem, top = bottom - h;
  shape(ctx, m.main, () => ctx.rect(-1.2, bottom, 2.4, stem));
  if (handles) {
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.4;
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * (w / 2), top + h * 0.4, h * 0.28, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, side < 0 ? Math.PI * 1.5 : Math.PI * 0.5); ctx.stroke(); }
    ctx.strokeStyle = m.main; ctx.lineWidth = 1.1;
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * (w / 2), top + h * 0.4, h * 0.28, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, side < 0 ? Math.PI * 1.5 : Math.PI * 0.5); ctx.stroke(); }
  }
  shape(ctx, m.main, () => { ctx.moveTo(-w / 2, top); ctx.lineTo(w / 2, top); ctx.quadraticCurveTo(w / 2, bottom, 0, bottom); ctx.quadraticCurveTo(-w / 2, bottom, -w / 2, top); });
  ctx.fillStyle = m.light; ctx.fillRect(-w / 2 + 1.1, top + 0.8, 1.1, h * 0.45);
  ctx.fillStyle = m.dark; ctx.fillRect(-w / 2, top, w, 0.8);
  if (lid) {
    shape(ctx, m.main, () => { ctx.moveTo(-w / 2 + 0.5, top); ctx.quadraticCurveTo(0, top - 4, w / 2 - 0.5, top); });
    shape(ctx, m.light, () => ctx.arc(0, top - 3.6, 1.1, 0, Math.PI * 2));
  }
  return top;
}
/** A five-pointed star centred at (x, y). */
function star(ctx: Ctx, fill: string, x: number, y: number, r: number) {
  shape(ctx, fill, () => { for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, d = k % 2 ? r * 0.45 : r; const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); } }, 0.5);
}
/** A laurel sprig curling up one side of a cup. */
function laurel(ctx: Ctx, fill: string, side: number, y: number) {
  for (let k = 0; k < 3; k++) shape(ctx, fill, () => ctx.ellipse(side * (4.8 + k * 0.4), y - k * 2.2, 0.9, 1.6, side * 0.6, 0, Math.PI * 2), 0.4);
}

/** Paint trophy `index` standing on a pedestal top at screen (x, y), 3 screen px to a unit. A `ghost` is the faint silhouette of one
 * not earned yet. `glint` (0-1, or null under reduced motion) sweeps a sparkle over the gold and crystal ones. */
export function drawTrophy(ctx: Ctx, index: number, x: number, y: number, ghost: boolean, glint: number | null) {
  const pick = (m: Material) => (ghost ? GHOST : m);
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(3, 3);
  if (ghost) ctx.globalAlpha = 0.45;
  let top = -10;
  switch (index) {
    case 0: plinth(ctx, pick(WOOD), 8); top = cup(ctx, pick(WOOD), 6, 5, 2, false, false); break; // Rookie: a small wooden cup
    case 1: plinth(ctx, pick(TIN), 8); top = cup(ctx, pick(TIN), 6, 6, 2, true, false); break; // Novice: a tin cup with handles
    case 2: plinth(ctx, pick(COPPER), 9); top = cup(ctx, pick(COPPER), 7, 6, 3, true, false); star(ctx, pick(GOLD).main, 0, top + 3.2, 1.6); break; // Seasoned: copper, a star
    case 3: { // Hardened: an iron shield on a post, crossed with a bolt
      const m = pick(IRON); plinth(ctx, m, 9); shape(ctx, m.main, () => ctx.rect(-0.9, -6, 1.8, 3));
      shape(ctx, m.main, () => { ctx.moveTo(-4, -16); ctx.lineTo(4, -16); ctx.lineTo(4, -10); ctx.quadraticCurveTo(4, -6.5, 0, -5.5); ctx.quadraticCurveTo(-4, -6.5, -4, -10); });
      ctx.fillStyle = m.light; ctx.fillRect(-3, -15, 1, 5); ctx.fillStyle = pick(COPPER).main; ctx.fillRect(-0.6, -15, 1.2, 8.5); ctx.fillRect(-3, -12.6, 6, 1.2);
      top = -16; break;
    }
    case 4: plinth(ctx, pick(BRONZE), 10); top = cup(ctx, pick(BRONZE), 7, 7, 3, true, false); laurel(ctx, pick(SILVER).dark, -1, top + 6); laurel(ctx, pick(SILVER).dark, 1, top + 6); break; // Veteran: bronze, laurels
    case 5: plinth(ctx, pick(SILVER), 9); top = cup(ctx, pick(SILVER), 6, 9, 4, false, false); break; // Expert: a tall silver cup
    case 6: { // Elite: a silver star on a fluted column
      const m = pick(SILVER); plinth(ctx, m, 9); shape(ctx, m.main, () => ctx.rect(-1.6, -12, 3.2, 9));
      ctx.fillStyle = m.dark; ctx.fillRect(-0.4, -11.5, 0.8, 8); star(ctx, m.light, 0, -15.5, 4.2); top = -19.5; break;
    }
    case 7: plinth(ctx, pick(GOLD), 9); top = cup(ctx, pick(GOLD), 7, 6, 3, true, false); break; // Master: the first gold cup
    case 8: plinth(ctx, pick(GOLD), 11); top = cup(ctx, pick(GOLD), 9, 9, 3, true, true); break; // Champion's: a big lidded gold cup
    case 9: { // Legendary: a gold hunter's hat on a stand
      const m = pick(GOLD); plinth(ctx, m, 10); shape(ctx, m.dark, () => ctx.rect(-1, -7, 2, 4));
      shape(ctx, m.main, () => ctx.ellipse(0, -8, 6.5, 1.8, 0, 0, Math.PI * 2));
      shape(ctx, m.main, () => { ctx.moveTo(-3.6, -8.4); ctx.lineTo(-3, -14); ctx.quadraticCurveTo(0, -15.6, 3, -14); ctx.lineTo(3.6, -8.4); });
      ctx.fillStyle = "#000"; ctx.fillRect(-3.4, -10.6, 6.8, 1.4); ctx.fillStyle = m.light; ctx.fillRect(-2.4, -13.4, 1, 2.6); top = -15.6; break;
    }
    case 10: { // Mythical: an amethyst crystal held in a gold claw
      const g = pick(GOLD), a = pick(AMETHYST); plinth(ctx, g, 10);
      shape(ctx, g.main, () => { ctx.moveTo(-3, -3); ctx.lineTo(3, -3); ctx.lineTo(2, -6.5); ctx.lineTo(-2, -6.5); });
      shape(ctx, a.main, () => { ctx.moveTo(0, -19); ctx.lineTo(3.4, -14); ctx.lineTo(2.6, -7); ctx.lineTo(-2.6, -7); ctx.lineTo(-3.4, -14); });
      ctx.fillStyle = a.light; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(-1.6, -14); ctx.lineTo(-1.2, -8); ctx.lineTo(0, -8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = a.dark; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(2.8, -14); ctx.lineTo(2.2, -8); ctx.lineTo(1, -8); ctx.closePath(); ctx.fill();
      shape(ctx, g.main, () => { ctx.moveTo(-3.2, -9); ctx.lineTo(-2.2, -6.5); ctx.lineTo(-1.4, -9.5); }, 0.4); shape(ctx, g.main, () => { ctx.moveTo(3.2, -9); ctx.lineTo(2.2, -6.5); ctx.lineTo(1.4, -9.5); }, 0.4);
      top = -19; break;
    }
    default: { // Ultimate: a grand lidded gold trophy crowned with a diamond, on a stepped plinth
      const g = pick(GOLD); plinth(ctx, g, 13); shape(ctx, g.dark, () => ctx.rect(-4.5, -5, 9, 2));
      ctx.save(); ctx.translate(0, -2); top = cup(ctx, g, 10, 10, 3, true, true) - 2; ctx.restore();
      laurel(ctx, g.light, -1, top + 10); laurel(ctx, g.light, 1, top + 10);
      const d = ghost ? GHOST : { main: "#bff4ff", light: "#ffffff", dark: "#5fb8d6" };
      shape(ctx, d.main, () => { ctx.moveTo(0, top - 9.5); ctx.lineTo(2.4, top - 6.5); ctx.lineTo(0, top - 3.6); ctx.lineTo(-2.4, top - 6.5); });
      ctx.fillStyle = d.light; ctx.fillRect(-1, top - 7.6, 1, 1.6);
      top -= 9.5; break;
    }
  }
  // Gold and crystal trophies catch the light: a small four-pointed sparkle that sweeps up them.
  if (!ghost && index >= 7) {
    const t = glint ?? 0.35, sy = -4 + (top + 4) * t, sx = (index % 2 ? 1 : -1) * 2.2;
    ctx.globalAlpha = glint === null ? 0.9 : Math.sin(t * Math.PI);
    ctx.fillStyle = "#fff"; ctx.fillRect(sx - 0.4, sy - 2, 0.8, 4); ctx.fillRect(sx - 2, sy - 0.4, 4, 0.8);
  }
  ctx.restore();
}

/** The Permanent Shiny Golden Trojan Horse's token for the REWARDS frame: a gold coin with a white horse head, 64 x 64. */
export function paintGoldenHorseToken(ctx: Ctx) {
  ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(32, 32, 24, 0, Math.PI * 2); ctx.fill();
  const shine = ctx.createRadialGradient(24, 22, 4, 32, 32, 24); shine.addColorStop(0, "#fff6c8"); shine.addColorStop(0.5, "#e0b030"); shine.addColorStop(1, "#9a7414");
  ctx.fillStyle = shine; ctx.beginPath(); ctx.arc(32, 32, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(24, 47); ctx.lineTo(26, 30); ctx.lineTo(30, 17); ctx.lineTo(35, 21); ctx.lineTo(45, 30); ctx.lineTo(43, 35); ctx.lineTo(35, 32); ctx.lineTo(36, 47); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#9a7414"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = "#000"; ctx.fillRect(33, 23, 2, 2);
  ctx.fillStyle = "#fff"; for (const [x, y] of [[14, 18], [49, 44]] as const) { ctx.fillRect(x - 1, y - 4, 2, 8); ctx.fillRect(x - 4, y - 1, 8, 2); }
}
