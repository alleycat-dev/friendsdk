// Renders every sound cue (audio.ts) to a WAV file in practice/dist/wav/ with headless Chromium, and prints each one's length and
// levels, so the sounds can be listened to and checked without running the game. Build the practice pages first:
//
//   node games/rarefriend-outlaw/practice/build.mjs
//   node games/rarefriend-outlaw/tools/sounds.mjs
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../practice/dist"), out = resolve(dist, "wav");
await mkdir(out, { recursive: true });
const browser = await chromium.launch(), page = await browser.newPage(), errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.goto("file://" + resolve(dist, "sounds.html"));
await page.waitForFunction(() => "outlawSounds" in window);
const cues = await page.evaluate(async () => {
  const { renderCue, wavBytes, SOUND_IDS } = window.outlawSounds, rendered = [];
  const base64 = bytes => { let text = ""; for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(text); };
  for (const id of SOUND_IDS) {
    const buffer = await renderCue(id, { step: 2 });
    let peak = 0, sum = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) for (const value of buffer.getChannelData(c)) { peak = Math.max(peak, Math.abs(value)); sum += value * value; }
    rendered.push({ id, seconds: buffer.duration, peak, rms: Math.sqrt(sum / (buffer.length * buffer.numberOfChannels)), wav: base64(wavBytes(buffer)) });
  }
  // Sequences, to hear the cues as they come in play: eight galloping strides, and a run of flips into a strike-back and a win.
  const sequences = {
    gallop: [...Array(8)].map((_, i) => ({ id: "hoof", at: i * 0.52 })),
    "short-hack": [...[0, 1, 2, 3, 4].map(k => ({ id: "flip", at: k * 0.22, options: { step: k } })), { id: "smash", at: 1.3 }, { id: "smash", at: 2.1, options: { heavy: true } }, { id: "win", at: 3.4 }],
    "smash-break": [{ id: "smash", at: 0, options: { heavy: true } }],
    // Flips as a chain grows and stalls: the note climbs only when the chain does.
    chain: [0, 1, 1, 2, 3, 3, 3, 4, 5, 5, 6, 7].map((step, k) => ({ id: "flip", at: k * 0.3, options: { step } })),
  };
  for (const [id, steps] of Object.entries(sequences)) {
    const buffer = await window.outlawSounds.renderSequence(steps);
    let peak = 0, sum = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) for (const value of buffer.getChannelData(c)) { peak = Math.max(peak, Math.abs(value)); sum += value * value; }
    rendered.push({ id: `sequence-${id}`, seconds: buffer.duration, peak, rms: Math.sqrt(sum / (buffer.length * buffer.numberOfChannels)), wav: base64(wavBytes(buffer)) });
  }
  return rendered;
});
await browser.close();
const db = value => (20 * Math.log10(value)).toFixed(1);
for (const cue of cues) {
  await writeFile(resolve(out, `outlaw-${cue.id}.wav`), Buffer.from(cue.wav, "base64"));
  console.log(`${cue.id.padEnd(8)} ${cue.seconds.toFixed(2)} s   peak ${db(cue.peak)} dBFS   rms ${db(cue.rms)} dBFS${cue.peak >= 1 ? "   CLIPS" : ""}`);
}
if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
console.log(`WAV files in ${out}`);
