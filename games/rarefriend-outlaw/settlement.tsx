// The licence settlement show: a short finale in three acts over the game once a licence is settled.
//
//   1. The Seed Phrase Lock: the words handed in fly one by one into a vault door's combination ring, each locking with a clunk and a
//      chime a note higher than the last; OP counts up and a bell rings for every trophy earned. With all twelve the door opens.
//   2. The Wheel of Fortune: a wheel whose wedges are sized by the payout table's real odds spins down to the payout the SDK already
//      rolled (the show only reveals it; it decides nothing).
//   3. The celebration, sized to the payout: a tumbleweed for nothing, sparks, confetti, fireworks, and for a Vault or Jackpot a gold
//      flash, a fireworks show and raining coins.
//
// It can be skipped at any time. Under reduced motion nothing flies, spins or shakes: each act shows its end state, with the sounds.
import { useEffect, useRef, useState } from "react";
import type { SoundId, CueOptions } from "./audio";

export type SettlementShowData = {
  /** The seed words handed in, in order. */
  words: readonly string[];
  /** OP the words paid, and the trophies earned (names) at each word count reached. */
  op: number; trophies: readonly { at: number; name: string }[];
  /** All twelve: the Cold Wallet's vault door opens. */
  cold: boolean;
  /** The payout table (names and chances, in basis points) and the outcome the SDK rolled (its index), with its reward in words. */
  outcomes: readonly { name: string; chanceBps: number }[]; outcome: number; reward: string;
};

const W = 960, H = 640, CX = 480, CY = 300, TOTAL_WORDS = 12;
/** The line for tallies and results, clear of the runtime's toolbar along the bottom-left. */
const FOOT = H - 92;
/** Wedge colours by outcome, from Empty to Jackpot, in the game's faded Western palette (the Jackpot gold). */
const WEDGE_COLOURS = ["#7d7d84", "#c9a878", "#6f86a0", "#7f9a78", "#b5543a", "#9a6a7a", "#e0b030"];
const PEGS = 36;
/** Timings (seconds): each word's flight, the gap between words, the spin, and each celebration's length by outcome. */
const WORD_EVERY = 0.4, WORD_FLIGHT = 0.3, SPIN = 4.6, CELEBRATION = [3.2, 2.6, 2.6, 3.2, 3.8, 4.8, 4.8];
const easeOut = (t: number) => 1 - (1 - t) ** 3;

type Particle = { x: number; y: number; vx: number; vy: number; life: number; colour: string; size: number; kind: "spark" | "confetti" | "coin" };

export function SettlementShow({ data, still, play, onDone }: {
  data: SettlementShowData; still: boolean; play: (id: SoundId, options?: CueOptions) => void; onDone: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [finished, setFinished] = useState(false);
  const skip = useRef(false);
  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const n = data.words.length;
    // The timeline: act 1 (the lock), act 2 (the wheel), act 3 (the celebration).
    const lockEnd = n === 0 ? 1.4 : 0.5 + n * WORD_EVERY + 0.5, act1End = lockEnd + (data.cold ? 2.2 : 0.3);
    const spinStart = act1End + 0.5, landAt = spinStart + SPIN, act2End = landAt + 0.6, end = act2End + CELEBRATION[Math.min(6, data.outcome)];
    // Where the wheel lands: the pointer (at the top) over the middle of the rolled wedge, after five full turns.
    const total = data.outcomes.reduce((sum, outcome) => sum + outcome.chanceBps, 0) || 1;
    const wedges = data.outcomes.map((outcome, index) => {
      const from = data.outcomes.slice(0, index).reduce((sum, o) => sum + o.chanceBps, 0) / total * Math.PI * 2;
      return { name: outcome.name, from, to: from + outcome.chanceBps / total * Math.PI * 2, colour: WEDGE_COLOURS[Math.min(6, index)] };
    });
    const target = wedges[Math.min(wedges.length - 1, data.outcome)];
    const finalAngle = -Math.PI / 2 - (target.from + target.to) / 2 + Math.PI * 2 * 5;
    // Sounds are fired once as the clock passes their time.
    const cues: { at: number; id: SoundId; options?: CueOptions; done?: boolean }[] = [];
    data.words.forEach((_, k) => cues.push({ at: 0.5 + k * WORD_EVERY + WORD_FLIGHT, id: "lock", options: { step: k } }));
    if (n) cues.push({ at: lockEnd - 0.3, id: "coins" });
    for (const trophy of data.trophies) cues.push({ at: 0.5 + (trophy.at - 1) * WORD_EVERY + WORD_FLIGHT + 0.15, id: "trophy" });
    if (data.cold) cues.push({ at: lockEnd, id: "vault" });
    cues.push({ at: spinStart, id: "drumroll" }, { at: landAt, id: "land" });
    const big = data.outcome >= 5, mid = data.outcome === 4;
    if (data.outcome === 0) cues.push({ at: act2End, id: "tumbleweed" });
    else if (data.outcome <= 2) cues.push({ at: act2End, id: "sparks" });
    else if (data.outcome === 3) cues.push({ at: act2End, id: "down" });
    if (mid || big) for (let k = 0; k < (big ? 7 : 4); k++) cues.push({ at: act2End + 0.1 + k * (big ? 0.45 : 0.6), id: "fireworks", options: { pan: (k % 3 - 1) * 0.6, gain: 0.8 } });
    if (big) cues.push({ at: act2End, id: "fanfare" });
    let particles: Particle[] = [], lastPeg = 0, frame = 0, clock = 0, previous = 0, spawned = new Set<string>();
    const burst = (x: number, y: number, count: number, colours: readonly string[], kind: Particle["kind"], speed = 5) => {
      for (let k = 0; k < count; k++) { const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
        particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (kind === "confetti" ? 2 : 0), life: 1, colour: colours[k % colours.length], size: kind === "coin" ? 7 : kind === "confetti" ? 5 : 3, kind }); }
    };
    const draw = (t: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // Screen shake for a Vault or Jackpot, for a moment after landing.
      if (big && !still && t > act2End && t < act2End + 0.6) ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
      ctx.fillStyle = "rgba(14, 8, 5, 0.94)"; ctx.fillRect(-10, -10, W + 20, H + 20);
      ctx.textAlign = "center"; ctx.fillStyle = "#f5e9d0"; ctx.font = "bold 26px ui-monospace, monospace"; ctx.fillText("LICENCE SETTLEMENT", CX, 56);
      if (t < act1End + 0.3) drawLock(t);
      else { ctx.globalAlpha = t >= act2End ? Math.max(0.28, 1 - (t - act2End) * 2) : 1; drawWheel(t); ctx.globalAlpha = 1; }
      if (t >= act2End) drawCelebration(t - act2End);
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.colour;
        if (p.kind === "coin") { ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size, p.size * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#8a6a12"; ctx.lineWidth = 1.5; ctx.stroke(); }
        else ctx.fillRect(p.x, p.y, p.size, p.kind === "confetti" ? p.size * 1.6 : p.size);
      }
      ctx.globalAlpha = 1;
    };
    const drawLock = (t: number) => {
      // The vault door: a steel disc with rivets, a combination ring of twelve slots, each with a lamp.
      const opening = data.cold && t > lockEnd + 0.9 ? Math.min(1, (t - lockEnd - 0.9) / 1.1) : 0, open = still ? (opening > 0 ? 1 : 0) : easeOut(opening);
      if (open > 0) {
        // Golden light pouring out behind the swinging door.
        const glow = ctx.createRadialGradient(CX, CY, 10, CX, CY, 260); glow.addColorStop(0, `rgba(255, 220, 120, ${0.9 * open})`); glow.addColorStop(1, "rgba(255, 200, 80, 0)");
        ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
        for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2 + t * 0.2; ctx.strokeStyle = `rgba(255, 230, 150, ${0.35 * open})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(CX + Math.cos(a) * 420, CY + Math.sin(a) * 420); ctx.stroke(); }
      }
      ctx.save(); ctx.translate(CX, CY); ctx.scale(1 - open * 0.85, 1);
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(0, 0, 176, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#5d6570"; ctx.beginPath(); ctx.arc(0, 0, 172, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#4a5059"; ctx.beginPath(); ctx.arc(0, 0, 120, 0, Math.PI * 2); ctx.fill();
      for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; ctx.fillStyle = "#2c3036"; ctx.beginPath(); ctx.arc(Math.cos(a) * 160, Math.sin(a) * 160, 3, 0, Math.PI * 2); ctx.fill(); }
      // The handle: three spokes, turning as the door opens.
      ctx.save(); ctx.rotate(open * Math.PI * 1.5); ctx.strokeStyle = "#2c3036"; ctx.lineWidth = 10; ctx.lineCap = "round";
      for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 70, Math.sin(a) * 70); ctx.stroke(); }
      ctx.fillStyle = "#c9a878"; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      for (let k = 0; k < TOTAL_WORDS; k++) {
        const a = -Math.PI / 2 + k / TOTAL_WORDS * Math.PI * 2, sx = Math.cos(a) * 142, sy = Math.sin(a) * 142;
        const lockedAt = 0.5 + k * WORD_EVERY + WORD_FLIGHT, lit = k < n && t >= lockedAt;
        ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(sx, sy, 15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = lit ? "#ffd34d" : "#262a30"; ctx.beginPath(); ctx.arc(sx, sy, 12, 0, Math.PI * 2); ctx.fill();
        if (lit && !still) { const pulse = Math.max(0, 1 - (t - lockedAt) * 2); if (pulse > 0) { ctx.strokeStyle = `rgba(255, 211, 77, ${pulse})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, 15 + (1 - pulse) * 16, 0, Math.PI * 2); ctx.stroke(); } }
        ctx.fillStyle = lit ? "#2b1d12" : "#6c7883"; ctx.font = "bold 12px ui-monospace, monospace"; ctx.fillText(String(k + 1), sx, sy + 4);
      }
      ctx.restore();
      // The words: each flies from the tray below into its slot, then its name stays by the ring.
      data.words.forEach((word, k) => {
        const start = 0.5 + k * WORD_EVERY, a = -Math.PI / 2 + k / TOTAL_WORDS * Math.PI * 2, tx = CX + Math.cos(a) * 214, ty = CY + Math.sin(a) * 196 + 4;
        if (t < start || open > 0.2) return;
        const f = still ? 1 : Math.min(1, (t - start) / WORD_FLIGHT), e = easeOut(f), fx = CX, fy = FOOT + 30;
        ctx.font = "bold 14px ui-monospace, monospace"; ctx.fillStyle = f < 1 ? "#ffd34d" : "#f5e9d0";
        ctx.fillText(word, fx + (tx - fx) * e, fy + (ty - fy) * e);
      });
      // The tally: OP counting up as words lock in, and the trophies earned.
      const counted = n === 0 ? 0 : Math.min(n, Math.floor(Math.max(0, t - 0.5 - WORD_FLIGHT) / WORD_EVERY) + 1), op = n ? Math.round(data.op * counted / n) : 0;
      ctx.font = "bold 20px ui-monospace, monospace"; ctx.fillStyle = "#ffd34d";
      ctx.fillText(n === 0 ? "No seed words handed in" : `${counted} of ${TOTAL_WORDS} words  ·  +${still ? data.op : op} OP`, CX, FOOT);
      const shown = data.trophies.filter(trophy => t >= 0.5 + (trophy.at - 1) * WORD_EVERY + WORD_FLIGHT);
      if (shown.length && open === 0) { ctx.font = "bold 14px ui-monospace, monospace"; ctx.fillStyle = "#f5e9d0"; ctx.textAlign = "right"; ctx.fillText(`Trophy: ${shown[shown.length - 1].name}`, W - 30, 100); ctx.textAlign = "center"; }
      if (open > 0.5) { ctx.font = "bold 30px ui-monospace, monospace"; ctx.fillStyle = "#fff2b0"; ctx.fillText("THE COLD WALLET OPENS", CX, CY + 10); }
    };
    const drawWheel = (t: number) => {
      const spun = t < spinStart ? 0 : still ? 1 : easeOut(Math.min(1, (t - spinStart) / SPIN)), angle = finalAngle * spun, R = 200;
      // A peg passing the pointer clicks.
      const peg = Math.floor(angle / (Math.PI * 2 / PEGS));
      if (!still && peg !== lastPeg && t < landAt) { lastPeg = peg; play("tick"); }
      ctx.save(); ctx.translate(CX, CY + 20);
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(0, 0, R + 10, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(angle);
      for (const wedge of wedges) {
        ctx.fillStyle = wedge.colour; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, wedge.from, wedge.to); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.stroke();
        // Names on the wedges wide enough to hold them.
        if (wedge.to - wedge.from > 0.3) {
          // Along the wedge's middle, turned over on the left half of the screen so it always reads the right way up.
          const middle = (wedge.from + wedge.to) / 2, facing = (((middle + angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), left = facing > Math.PI / 2 && facing < Math.PI * 1.5;
          ctx.save(); ctx.rotate(middle); if (left) { ctx.translate(R - 16, 0); ctx.rotate(Math.PI); ctx.translate(-(R - 16), 0); }
          ctx.textAlign = left ? "left" : "right"; ctx.fillStyle = "#1a120c"; ctx.font = "bold 16px ui-monospace, monospace";
          ctx.fillText(wedge.name.toUpperCase(), R - 16, left ? -6 + 12 : 6); ctx.restore();
        }
      }
      for (let k = 0; k < PEGS; k++) { const a = k / PEGS * Math.PI * 2; ctx.fillStyle = "#f5e9d0"; ctx.beginPath(); ctx.arc(Math.cos(a) * (R - 4), Math.sin(a) * (R - 4), 3, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = "#1a120c"; ctx.beginPath(); ctx.arc(CX, CY + 20, 26, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#c9a878"; ctx.beginPath(); ctx.arc(CX, CY + 20, 20, 0, Math.PI * 2); ctx.fill();
      // The pointer at the top, and the landed wedge glowing.
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.moveTo(CX - 16, CY + 20 - R - 22); ctx.lineTo(CX + 16, CY + 20 - R - 22); ctx.lineTo(CX, CY + 20 - R + 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffd34d"; ctx.beginPath(); ctx.moveTo(CX - 11, CY + 20 - R - 19); ctx.lineTo(CX + 11, CY + 20 - R - 19); ctx.lineTo(CX, CY + 20 - R + 1); ctx.closePath(); ctx.fill();
      if (t < spinStart) { ctx.font = "bold 18px ui-monospace, monospace"; ctx.fillStyle = "#f5e9d0"; ctx.fillText("The Wheel of Fortune: your licence's RF payout", CX, FOOT); }
      if (t >= landAt) { ctx.font = "bold 18px ui-monospace, monospace"; ctx.fillStyle = "#f5e9d0"; ctx.fillText(`${target.name}`, CX, FOOT); }
    };
    const drawCelebration = (c: number) => {
      const W2 = W / 2;
      if (data.outcome === 0) {
        // A tumbleweed rolls across: nothing this time.
        const x = still ? W2 : -60 + c / 2.6 * (W + 120), y = H - 90 - Math.abs(Math.sin(c * 5)) * (still ? 0 : 26), spin = still ? 0 : c * 7;
        ctx.save(); ctx.translate(x, y); ctx.rotate(spin); ctx.strokeStyle = "#8a6a3a"; ctx.lineWidth = 2;
        for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.ellipse(0, 0, 26, 18, k * 0.45, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
        text("NOTHING THIS TIME", "#c9c2b6", `Empty · ${data.reward}`);
        return;
      }
      if (!still) {
        // Sparks for Dust and Coins, confetti for a Stack, fireworks for a Cache, a gold flash and a show for a Vault or Jackpot.
        const once = (key: string, fn: () => void) => { if (!spawned.has(key)) { spawned.add(key); fn(); } };
        if (data.outcome <= 2) once("sparks", () => burst(CX, CY - 180, 40, ["#ffd34d", "#fff2b0", "#f07a3a"], "spark", 6));
        if (data.outcome === 3) for (let k = 0; k < 3; k++) once(`confetti${k}`, () => { if (c > k * 0.4) burst(200 + k * 280, -10, 50, ["#d94f3c", "#3d7bd9", "#ffd34d", "#3c8f5a", "#b04fd9"], "confetti", 4); });
        if (mid || big) for (let k = 0; k < (big ? 7 : 4); k++) { const at = 0.1 + k * (big ? 0.45 : 0.6) + 0.62; if (c >= at) once(`rocket${k}`, () => burst(180 + (k * 211) % 600, 120 + (k * 97) % 160, 70, k % 2 ? ["#ffd34d", "#fff2b0"] : ["#d94f3c", "#3d7bd9", "#f5e9d0"], "spark", 7)); }
        if (big) { for (let k = 0; k < 6; k++) if (c >= k * 0.5) once(`coins${k}`, () => burst(80 + Math.random() * 800, -20, 14, ["#e0b030"], "coin", 3)); }
      }
      if (big && c < 0.8) { ctx.fillStyle = `rgba(255, 215, 90, ${still ? 0.25 : 0.6 * (1 - c / 0.8)})`; ctx.fillRect(-10, -10, W + 20, H + 20); }
      const title = big ? (data.outcome === 6 ? "JACKPOT!" : "THE VAULT!") : mid ? "A CACHE!" : data.outcome === 3 ? "A STACK!" : data.outcome === 2 ? "COINS" : "DUST";
      text(title, big ? "#ffd34d" : "#f5e9d0", `${target.name} · ${data.reward}`);
    };
    const text = (title: string, colour: string, detail: string) => {
      ctx.textAlign = "center"; ctx.lineJoin = "round";
      ctx.font = `900 ${title.length > 12 ? 56 : 72}px system-ui, sans-serif`; ctx.lineWidth = 10; ctx.strokeStyle = "#000"; ctx.strokeText(title, CX, CY + 20); ctx.fillStyle = colour; ctx.fillText(title, CX, CY + 20);
      ctx.font = "bold 22px ui-monospace, monospace"; ctx.lineWidth = 6; ctx.strokeText(detail, CX, CY + 64); ctx.fillStyle = "#f5e9d0"; ctx.fillText(detail, CX, CY + 64);
    };
    const loop = (now: number) => {
      const delta = previous ? Math.min(0.05, (now - previous) / 1000) : 0; previous = now;
      clock = skip.current ? end : clock + delta;
      for (const cue of cues) if (!cue.done && clock >= cue.at) { cue.done = true; if (!skip.current || cue.at >= end - 0.01) play(cue.id, cue.options); }
      particles = particles.filter(p => p.life > 0 && p.y < H + 40);
      for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += p.kind === "confetti" ? 0.06 : p.kind === "coin" ? 0.18 : 0.12; p.vx *= 0.99; p.life -= p.kind === "spark" ? 0.012 : 0.004; }
      draw(clock);
      if (clock >= end) setFinished(true);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [data, still, play]);
  return <div className="outlaw-show" role="dialog" aria-label="Licence settlement">
    <canvas ref={canvasRef} width={W} height={H} />
    <button type="button" className={finished ? "rf-frame-primary" : undefined} autoFocus onClick={() => { if (finished) onDone(); else skip.current = true; }}>
      {finished ? "Continue" : "Skip"}</button>
  </div>;
}
