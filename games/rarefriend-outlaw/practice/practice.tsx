/**
 * Hardware Wallet practice: the Hack the Hardware Wallet puzzle on its own, for testing the tiers.
 *
 * A local developer tool, not part of the game or a playable submission: no world, no Friend, no economy, and no wallet
 * connection. It reuses the game's own WalletOverlay and the rules in wallet.ts, so every board plays exactly like the real one.
 * Each finished board, won, lost or given up, moves on to the next tier; after Boss, use the tier buttons or New board.
 * Build it with `node games/rarefriend-outlaw/practice/build.mjs` and open practice/dist/index.html.
 */
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { WalletOverlay } from "../index";
import { WALLET, newWallet, walletReduce, walletStars, starText, type WalletAction, type WalletState } from "../wallet";
import "./practice.css";

type Result = { tier: string; outcome: "won" | "lost" | "gave up"; grit: number; flips: number; stars: number; text: string };
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const tierSummary = (index: number) => {
  const tier = WALLET[index];
  const c = tier.counts, defenders = c.wall + c.alarm + c.validator + c.gasspike + c.whale;
  return `${tier.size} × ${tier.size} · Integrity ${tier.grit} · trace ${tier.traceLimit} · ${plural(defenders, "defender")} · ${plural(c.program, "program")} · ${tier.slots} slots`;
};

function Practice() {
  const [level, setLevel] = useState(0);
  const [board, setBoard] = useState<WalletState>(() => newWallet(WALLET[0]));
  const [results, setResults] = useState<Result[]>([]);
  const [serial, setSerial] = useState(0); // remounts the overlay per board, so each board gets a fresh circuit pattern
  const recorded = useRef<WalletState | null>(null);
  const live = useRef({ board, level }); live.current = { board, level };

  const start = (index: number) => { recorded.current = null; setLevel(index); setBoard(newWallet(WALLET[index])); setSerial(value => value + 1); };
  const act = (action: WalletAction) => setBoard(current => walletReduce(current, action));
  // Finishing a board, whatever the outcome, moves on to the next tier.
  // On the last tier there is no next: a finished Boss board stays up until a tier button or New board deals another.
  const next = () => { if (live.current.level + 1 < WALLET.length) start(live.current.level + 1); };

  // Log each board's outcome once, the moment it ends.
  useEffect(() => {
    if (board.phase === "open" || recorded.current === board) return;
    recorded.current = board;
    const flips = board.tiles.filter(tile => tile.revealed).length - 1;
    const outcome: Result["outcome"] = board.phase === "won" ? "won" : board.text.startsWith("You back out") ? "gave up" : "lost";
    setResults(value => [{ tier: board.tier.name, outcome, stars: walletStars(board), grit: board.grit, flips, text: board.text }, ...value].slice(0, 30));
  }, [board]);

  // The game's keyboard play: arrows or WASD move the cursor, Enter or Space acts, 1-3 run a program, Esc puts one away, gives up or moves on.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const current = live.current.board;
      if (event.code === "Escape") { event.preventDefault(); if (current.phase === "open") act(current.targeting ? { type: "cancel" } : { type: "giveUp" }); else next(); return; }
      if (current.phase !== "open") { if ((event.code === "Enter" || event.code === "Space") && !event.repeat) { event.preventDefault(); next(); } return; }
      const n = current.tier.size, col = current.cursor % n, row = Math.floor(current.cursor / n);
      const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] };
      if (moves[event.code]) { event.preventDefault(); const [dx, dy] = moves[event.code]; act({ type: "cursor", index: Math.max(0, Math.min(n - 1, row + dy)) * n + Math.max(0, Math.min(n - 1, col + dx)) }); }
      else if ((event.code === "Enter" || event.code === "Space") && !event.repeat) { event.preventDefault(); act({ type: "act", index: current.cursor }); }
      else if (/^Digit[1-3]$/.test(event.code) && !event.repeat) { event.preventDefault(); act({ type: "run", slot: Number(event.code.slice(5)) - 1 }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const wins = results.filter(result => result.outcome === "won").length;
  return <main className="practice">
    <header>
      <h1>Hardware Wallet practice</h1>
      <p>Developer test page. Each finished board moves on to the next tier. Nothing here is saved or connected to the game.</p>
    </header>
    <nav aria-label="Tier">
      {WALLET.map((tier, index) => <button type="button" key={tier.name} aria-pressed={index === level} onClick={() => start(index)}>{index + 1}. {tier.name}</button>)}
      <button type="button" onClick={() => start(level)}>New board</button>
    </nav>
    <p className="practice-tier"><strong>Tier {level + 1} of {WALLET.length}: {WALLET[level].name}</strong> · {tierSummary(level)}</p>
    <div className="practice-scroll"><div className="practice-stage outlaw-game">
      <WalletOverlay key={serial} wallet={board} name={`The ${WALLET[level].name} outlaw`} busy={false} reducedMotion={false}
        onAct={act} onClose={next} closeLabel={level + 1 < WALLET.length ? `Next tier: ${WALLET[level + 1].name}` : null} />
    </div></div>
    <section className="practice-log" aria-label="Results">
      <h2>Results {results.length > 0 && <small>{wins} won of {results.length}</small>}</h2>
      {results.length === 0 ? <p>No boards finished yet.</p> : <ol>
        {results.map((result, index) => <li key={results.length - index} className={result.outcome === "won" ? "won" : "lost"}>
          <strong>{result.tier}</strong> {result.outcome}{result.stars ? ` ${starText(result.stars)}` : ""} · {plural(result.flips, "flip")} · Integrity {result.grit} left<small>{result.text}</small>
        </li>)}
      </ol>}
    </section>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Practice />);
