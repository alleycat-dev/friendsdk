// The REWARDS frame shown when a hardware wallet is cracked: falling green code behind, the unlocked wallet in the middle and every
// item it held around it, each on a halo in its rarity's colour (common green, uncommon blue, rare purple, legendary gold).
import { useEffect, useRef } from "react";
import { paintGoldenHorseToken } from "./trophies";
import { drawWalletIcon } from "./wallet-icons";
import type { ProgramId } from "./wallet";

export type LootRarity = "common" | "uncommon" | "rare" | "legendary";
export type RewardIcon = "op" | "seed" | "card" | "key" | "intel" | "gas" | "horse" | "keepsake" | "sack" | "golden-horse";
export type RewardItem = { icon: RewardIcon; label: string; detail?: string; rarity: LootRarity; program?: ProgramId };
export const RARITY_COLOUR: Readonly<Record<LootRarity, string>> = { common: "#3fbf4f", uncommon: "#3d7bd9", rare: "#a35ce0", legendary: "#e0b030" };
export const RARITY_NAME: Readonly<Record<LootRarity, string>> = { common: "Common", uncommon: "Uncommon", rare: "Rare", legendary: "Legendary" };

type Ctx = CanvasRenderingContext2D;
const px = (ctx: Ctx, x: number, y: number, w: number, h: number, colour: string) => { ctx.fillStyle = colour; ctx.fillRect(x, y, w, h); };

/** An item's icon on a 64 x 64 canvas: flat pixel shapes with thin black outlines. */
function paintIcon(ctx: Ctx, item: RewardItem) {
  const tint = RARITY_COLOUR[item.rarity];
  ctx.clearRect(0, 0, 64, 64); ctx.lineJoin = "round";
  switch (item.icon) {
    case "op": {
      // A gold coin stamped OP.
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(32, 32, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e0b030"; ctx.beginPath(); ctx.arc(32, 32, 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#f5d76e"; ctx.beginPath(); ctx.arc(32, 32, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#7a5a10"; ctx.font = "bold 15px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("OP", 32, 33);
      break;
    }
    case "seed": {
      // A parchment scroll with lines of words.
      px(ctx, 12, 14, 40, 36, "#000"); px(ctx, 14, 16, 36, 32, "#f3e6c4"); px(ctx, 10, 12, 44, 6, "#000"); px(ctx, 12, 13, 40, 4, "#d8c28e");
      px(ctx, 10, 46, 44, 6, "#000"); px(ctx, 12, 47, 40, 4, "#d8c28e");
      for (const y of [22, 28, 34, 40]) px(ctx, 18, y, y === 40 ? 18 : 28, 2, "#7a6a4a");
      break;
    }
    case "card": {
      // A program card: a dark card with the program's own icon.
      px(ctx, 12, 6, 40, 52, "#000"); px(ctx, 14, 8, 36, 48, "#1c2430"); px(ctx, 14, 8, 36, 5, tint);
      if (item.program) drawWalletIcon(ctx, item.program, 32, 46, 30);
      break;
    }
    case "key": {
      // A gold building key.
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(20, 32, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e0b030"; ctx.beginPath(); ctx.arc(20, 32, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(20, 32, 4, 0, Math.PI * 2); ctx.fill();
      px(ctx, 29, 28, 26, 8, "#000"); px(ctx, 30, 29, 24, 6, "#e0b030"); px(ctx, 44, 35, 5, 9, "#000"); px(ctx, 45, 35, 3, 8, "#e0b030"); px(ctx, 51, 35, 4, 7, "#000"); px(ctx, 52, 35, 2, 6, "#e0b030");
      break;
    }
    case "intel": {
      // A manila folder with a red TOP SECRET stripe.
      px(ctx, 8, 14, 20, 8, "#000"); px(ctx, 10, 16, 16, 6, "#d8b46a"); px(ctx, 8, 20, 48, 32, "#000"); px(ctx, 10, 22, 44, 28, "#e8c47a");
      px(ctx, 14, 32, 36, 9, "#000"); px(ctx, 15, 33, 34, 7, "#c8322a");
      ctx.fillStyle = "#fff"; ctx.font = "bold 7px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("SECRET", 32, 37);
      break;
    }
    case "gas": {
      // A green voucher with a fuel pump.
      px(ctx, 6, 16, 52, 32, "#000"); px(ctx, 8, 18, 48, 28, "#3fbf4f"); px(ctx, 8, 30, 48, 2, "#2a8a38");
      px(ctx, 16, 22, 14, 20, "#000"); px(ctx, 18, 24, 10, 16, "#f0f0f0"); px(ctx, 19, 26, 8, 5, "#3fbf4f");
      px(ctx, 30, 26, 8, 3, "#000"); px(ctx, 36, 26, 3, 12, "#000");
      ctx.fillStyle = "#000"; ctx.font = "bold 10px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("+1", 48, 33);
      break;
    }
    case "horse": {
      // A brown token with a white horse head.
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(32, 32, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#8a5a2e"; ctx.beginPath(); ctx.arc(32, 32, 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(24, 46); ctx.lineTo(26, 30); ctx.lineTo(30, 18); ctx.lineTo(35, 22); ctx.lineTo(44, 30); ctx.lineTo(42, 35); ctx.lineTo(35, 32); ctx.lineTo(36, 46); ctx.closePath(); ctx.fill();
      px(ctx, 33, 24, 2, 2, "#000");
      break;
    }
    case "golden-horse": paintGoldenHorseToken(ctx); break;
    case "sack": {
      // A tied burlap feed sack stencilled FEED, bulging with something inside.
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.moveTo(24, 16); ctx.lineTo(40, 16); ctx.lineTo(52, 40); ctx.lineTo(50, 56); ctx.lineTo(14, 56); ctx.lineTo(12, 40); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#c8a468"; ctx.beginPath(); ctx.moveTo(25, 18); ctx.lineTo(39, 18); ctx.lineTo(50, 40); ctx.lineTo(48, 54); ctx.lineTo(16, 54); ctx.lineTo(14, 40); ctx.closePath(); ctx.fill();
      px(ctx, 16, 44, 32, 2, "#a8844a"); px(ctx, 20, 50, 26, 2, "#a8844a");
      px(ctx, 22, 8, 20, 10, "#000"); px(ctx, 24, 10, 16, 6, "#c8a468"); px(ctx, 22, 16, 20, 4, "#000"); px(ctx, 23, 17, 18, 2, tint);
      ctx.fillStyle = "#6b3a1a"; ctx.font = "bold 10px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("FEED", 32, 36);
      break;
    }
    case "keepsake": {
      // A faceted gem in the rarity's colour on a small pedestal.
      px(ctx, 18, 48, 28, 6, "#000"); px(ctx, 20, 49, 24, 4, "#6b4a2b");
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.moveTo(32, 8); ctx.lineTo(50, 24); ctx.lineTo(32, 48); ctx.lineTo(14, 24); ctx.closePath(); ctx.fill();
      ctx.fillStyle = tint; ctx.beginPath(); ctx.moveTo(32, 11); ctx.lineTo(47, 24); ctx.lineTo(32, 44); ctx.lineTo(17, 24); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)"; ctx.beginPath(); ctx.moveTo(32, 11); ctx.lineTo(40, 24); ctx.lineTo(32, 24); ctx.lineTo(24, 18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)"; ctx.beginPath(); ctx.moveTo(32, 44); ctx.lineTo(47, 24); ctx.lineTo(32, 28); ctx.closePath(); ctx.fill();
      break;
    }
  }
}

/** The unlocked hardware wallet: a dark device with a green screen, two buttons and a USB plug, on a 220 x 130 canvas. */
function paintWallet(ctx: Ctx, jackpot: boolean) {
  ctx.clearRect(0, 0, 220, 130);
  const round = (x: number, y: number, w: number, h: number, r: number, colour: string) => { ctx.fillStyle = colour; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); };
  px(ctx, 196, 52, 20, 26, "#000"); px(ctx, 198, 55, 16, 20, "#b8bcc4"); px(ctx, 202, 60, 8, 3, "#000"); px(ctx, 202, 67, 8, 3, "#000");
  round(8, 18, 192, 94, 18, "#000"); round(11, 21, 186, 88, 15, jackpot ? "#3a2f10" : "#2b2e36"); round(11, 21, 186, 10, 8, jackpot ? "#5a4a18" : "#3a3e48");
  round(30, 40, 120, 50, 6, "#000"); px(ctx, 33, 43, 114, 44, "#0a2a12");
  ctx.fillStyle = "#3fef6f"; ctx.font = "bold 13px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("UNLOCKED", 90, 58);
  ctx.font = "10px ui-monospace, monospace"; ctx.fillText(jackpot ? "JACKPOT" : "seed: ok", 90, 74);
  for (const x of [168, 168]) { ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(x, 50, 9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#6b7080"; ctx.beginPath(); ctx.arc(x, 50, 7, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(168, 80, 9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#6b7080"; ctx.beginPath(); ctx.arc(168, 80, 7, 0, Math.PI * 2); ctx.fill();
}

function IconCanvas({ paint, width, height, label }: { paint: (ctx: Ctx) => void; width: number; height: number; label: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => { const ctx = ref.current?.getContext("2d"); if (ctx) { ctx.setTransform(2, 0, 0, 2, 0, 0); paint(ctx); } });
  return <canvas ref={ref} width={width * 2} height={height * 2} style={{ width, height }} role="img" aria-label={label} />;
}

/** Falling columns of green code behind the frame (one still frame under reduced motion). */
function MatrixRain({ still }: { still: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
    const glyphs = "01アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF$RF₿Ξ", size = 16;
    let columns: number[] = [], frame = 0, last = 0;
    const resize = () => {
      const box = canvas.getBoundingClientRect(); canvas.width = Math.max(1, Math.round(box.width)); canvas.height = Math.max(1, Math.round(box.height));
      columns = Array.from({ length: Math.ceil(canvas.width / size) }, () => Math.floor(Math.random() * -40));
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    const step = () => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.14)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${size - 2}px ui-monospace, monospace`; ctx.textBaseline = "top";
      columns.forEach((row, col) => {
        const ch = glyphs[Math.floor(Math.random() * glyphs.length)], y = row * size;
        ctx.fillStyle = "#c8ffd4"; ctx.fillText(ch, col * size, y);
        ctx.fillStyle = "#1f8f3a"; ctx.fillText(glyphs[(row * 7 + col) % glyphs.length], col * size, y - size);
        columns[col] = y > canvas.height && Math.random() > 0.97 ? 0 : row + 1;
      });
    };
    resize();
    if (still) { for (let i = 0; i < 60; i++) step(); return; }
    const loop = (now: number) => { if (now - last > 55) { last = now; step(); } frame = requestAnimationFrame(loop); };
    frame = requestAnimationFrame(loop);
    const observer = new ResizeObserver(resize); observer.observe(canvas);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [still]);
  return <canvas ref={ref} className="outlaw-rewards-rain" aria-hidden="true" />;
}

/** The REWARDS frame: title, the wallet in the middle, the items on rarity halos in a ring around it, and a close button. */
export function RewardsFrame({ items, jackpot, outlaw, subtitle, still, onClose }: { items: readonly RewardItem[]; jackpot: boolean; outlaw: string; subtitle?: string; still: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  return <div className="outlaw-rewards" role="dialog" aria-label={`Rewards from ${outlaw}'s hardware wallet`}>
    <MatrixRain still={still} />
    <h2 className={still ? "outlaw-rewards-title outlaw-still" : "outlaw-rewards-title"}>REWARDS</h2>
    <p className="outlaw-rewards-sub">{subtitle ?? (jackpot ? "You hit the jackpot with this wallet" : `${outlaw}'s hardware wallet, cracked`)}</p>
    <div className="outlaw-rewards-stage">
      <div className={jackpot ? "outlaw-rewards-wallet outlaw-rewards-wallet-jackpot" : "outlaw-rewards-wallet"}>
        <IconCanvas paint={ctx => paintWallet(ctx, jackpot)} width={220} height={130} label="The unlocked hardware wallet" />
      </div>
      {items.map((item, index) => {
        // An ellipse around the wallet, starting at the top.
        const angle = -Math.PI / 2 + index * 2 * Math.PI / Math.max(1, items.length), x = Math.cos(angle) * 270, y = Math.sin(angle) * 148;
        return <figure key={`${item.label}-${index}`} className="outlaw-reward" style={{ transform: `translate(calc(${x.toFixed(1)}px - 50%), calc(${y.toFixed(1)}px - 50%))`, ["--halo" as string]: RARITY_COLOUR[item.rarity] }}>
          <div className="outlaw-reward-halo"><IconCanvas paint={ctx => paintIcon(ctx, item)} width={56} height={56} label={item.label} /></div>
          <figcaption><strong>{item.label}</strong><small>{RARITY_NAME[item.rarity]}{item.detail ? ` · ${item.detail}` : ""}</small></figcaption>
        </figure>;
      })}
    </div>
    <button ref={closeRef} type="button" className="rf-frame-primary outlaw-rewards-close" onClick={onClose}>Collect · Esc</button>
  </div>;
}
