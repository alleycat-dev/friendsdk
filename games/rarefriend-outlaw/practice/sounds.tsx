// The sound preview page: every cue of audio.ts as a button (and a WAV download), to judge the sounds before they go into the game.
// Build: node games/rarefriend-outlaw/practice/build.mjs, then open practice/dist/sounds.html.
import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { createOutlawAudio, renderCue, renderMusic, renderSequence, wavBytes, SOUND_CUES, SOUND_IDS, type SoundId } from "../audio";

function SoundPreview() {
  const audio = useRef(createOutlawAudio({ volume: 0.8 })), [music, setMusic] = useState(false), [tense, setTense] = useState(false);
  useEffect(() => { audio.current.setMusic(music); }, [music]);
  useEffect(() => { audio.current.setMusicMood(tense ? "tense" : "calm"); }, [tense]);
  const [volume, setVolume] = useState(0.8), [muted, setMuted] = useState(false), [step, setStep] = useState(0), [note, setNote] = useState("");
  const play = async (id: SoundId, options?: { step?: number }) => {
    if (!(await audio.current.unlock())) { setNote("This browser cannot play Web Audio."); return; }
    audio.current.play(id, options);
  };
  const download = async (id: SoundId) => {
    const url = URL.createObjectURL(new Blob([wavBytes(await renderCue(id))], { type: "audio/wav" }));
    const link = document.createElement("a"); link.href = url; link.download = `outlaw-${id}.wav`; link.click(); URL.revokeObjectURL(url);
  };
  return <main>
    <h1>Rarefriend Outlaw · sound preview</h1>
    <p>Spaghetti-Western cues, synthesized in code (audio.ts). Click to play; the first click also switches audio on.</p>
    <p className="controls">
      <label><input type="checkbox" checked={muted} onChange={event => { setMuted(event.target.checked); audio.current.setMuted(event.target.checked); }} /> Mute</label>
      <label>Volume <input type="range" min={0} max={1} step={0.05} value={volume} onChange={event => { const v = Number(event.target.value); setVolume(v); audio.current.setVolume(v); }} /></label>
    </p>
    <table><tbody>{SOUND_IDS.map(id => <tr key={id}>
      <td><button type="button" onClick={() => void play(id, id === "flip" ? { step } : undefined)}>{id}</button></td>
      <td>{SOUND_CUES[id]}</td>
      <td><button type="button" className="small" onClick={() => void download(id)}>WAV</button></td>
    </tr>)}</tbody></table>
    <h2>Music</h2>
    <p><button type="button" onClick={async () => { if (await audio.current.unlock()) setMusic(value => !value); }}>{music ? "Stop" : "Play"} "Lonesome Trail"</button> The country's ambience, looping (a whistle every third pass, a bell every fourth).{" "}
      <button type="button" onClick={() => setTense(value => !value)}>{tense ? "Outlaw gone: calm" : "Outlaw near: Showdown Gallop"}</button></p>
    <h2>In a sequence</h2>
    <p>
      <button type="button" onClick={() => { void play("flip", { step }); setStep(value => value + 1); }}>Flip, chain grows (note {Math.min(step, 15) + 1} of 16)</button>{" "}
      <button type="button" onClick={() => void play("flip", { step: Math.max(0, step - 1) })}>Flip, chain stays</button>{" "}
      <button type="button" onClick={async () => { if (!(await audio.current.unlock())) return; for (let i = 0; i < 8; i++) setTimeout(() => audio.current.play("hoof"), i * 520); }}>Gallop (8 strides)</button>{" "}
      <button type="button" onClick={async () => { if (!(await audio.current.unlock())) return; [0, 1, 2, 3, 4].forEach((k, i) => setTimeout(() => audio.current.play("flip", { step: k }), i * 220)); setTimeout(() => audio.current.play("smash"), 1300); setTimeout(() => audio.current.play("smash", { heavy: true }), 2100); setTimeout(() => audio.current.play("win"), 3400); }}>A short hack</button>{" "}
      <button type="button" onClick={() => void play("smash", undefined)}>Smash</button>{" "}
      <button type="button" onClick={async () => { if (await audio.current.unlock()) audio.current.play("smash", { heavy: true }); }}>Smash and break</button>
    </p>
    {note && <p role="alert">{note}</p>}
  </main>;
}
// For tools that render the cues to WAV files headlessly (no speakers needed).
(window as unknown as { outlawSounds: unknown }).outlawSounds = { renderCue, renderMusic, renderSequence, wavBytes, SOUND_IDS };
createRoot(document.getElementById("root")!).render(<SoundPreview />);
