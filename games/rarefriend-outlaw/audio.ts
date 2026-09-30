// Rarefriend Outlaw's sound: spaghetti-Western cues synthesized from code with the Web Audio API (no recordings, no samples).
//
// The palette: a plucked, twangy guitar string (Karplus-Strong), a whistle with a slow vibrato, a whip crack, wood-block hoofbeats,
// a brassy mariachi trumpet, a low anvil thud, a hollow bump and a laser "pew" with a whistling ricochet, all sent through a short spring-reverb
// echo. Like the SDK's sound kit: creating the player makes no AudioContext; `unlock()` must be called from a player gesture;
// muted, locked or hidden players drop cues instead of queueing them.

export const SOUND_IDS = ["laser", "hoof", "bump", "showdown", "flip", "strike", "twist", "win"] as const;
export type SoundId = (typeof SOUND_IDS)[number];
/** What each cue is for, for the preview page and the README. */
export const SOUND_CUES: Readonly<Record<SoundId, string>> = {
  laser: "Laser Gun shot: a pew with a whistling ricochet",
  hoof: "One galloping stride of a riding horse: four hoofbeats, ba-da-da-DUM (played stride after stride)",
  flip: "A hacking-game tile flip: a guitar pluck, stepping through an A-minor scale",
  showdown: "Tumbleweed time: the first time a new outlaw comes near (as its red arrow appears): wind, a distant bell, a lone whistle and a trembling twang",
  bump: "Walking into an outlaw (who robs you): like walking into something, a body thump and a hollow bonk",
  strike: "Losing Integrity in a hack (a strike-back, a bomb, a bite): an anvil thud under a low twang",
  twist: "A twist striking (RUGPULL!!!): whip crack, a falling whistle and a trembling guitar chord",
  win: "A cracked wallet: a mariachi trumpet flourish over a strummed chord",
};

type Out = { ctx: BaseAudioContext; dry: AudioNode; wet: AudioNode };
const A4 = 440;
const hz = (semitonesFromA4: number) => A4 * 2 ** (semitonesFromA4 / 12);
/** A minor pentatonic-ish scale (A C D E G, two octaves) for the tile flips, in semitones from A4. */
const FLIP_SCALE = [-12, -9, -7, -5, -2, 0, 3, 5, 7, 10];

// ---------------------------------------------------------------------------------------------------------------------------
// Instruments. Each schedules its voices at time `t` into the dry and reverb buses and cleans up after itself.
// ---------------------------------------------------------------------------------------------------------------------------

/** Karplus-Strong string, rendered once per pitch and cached: noise through a damped delay line, bright at first then mellow. */
const stringCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
function stringBuffer(ctx: BaseAudioContext, freq: number, seconds: number, damping: number) {
  const key = `${freq.toFixed(2)}:${seconds}:${damping}`;
  let cache = stringCache.get(ctx); if (!cache) stringCache.set(ctx, cache = new Map());
  const cached = cache.get(key); if (cached) return cached;
  const rate = ctx.sampleRate, length = Math.floor(rate * seconds), period = Math.max(2, Math.round(rate / freq));
  const buffer = ctx.createBuffer(1, length, rate), data = buffer.getChannelData(0), line = new Float32Array(period);
  let seed = 12345; const noise = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 0x7fffffff - 1; };
  for (let i = 0; i < period; i++) line[i] = noise();
  for (let i = 0, j = 0; i < length; i++, j = (j + 1) % period) {
    const next = line[(j + 1) % period];
    data[i] = line[j];
    line[j] = damping * 0.5 * (line[j] + next);
  }
  cache.set(key, buffer);
  return buffer;
}
function pluck(o: Out, t: number, freq: number, gain = 0.5, seconds = 1.6, damping = 0.996, reverb = 0.35) {
  const { ctx } = o, src = ctx.createBufferSource(), g = ctx.createGain(), tone = ctx.createBiquadFilter();
  src.buffer = stringBuffer(ctx, freq, seconds, damping);
  // A touch of body: a gentle low-pass keeps the twang from turning harsh.
  tone.type = "lowpass"; tone.frequency.value = Math.min(9000, freq * 14); tone.Q.value = 0.7;
  g.gain.setValueAtTime(gain, t); g.gain.setTargetAtTime(0, t + seconds * 0.7, seconds * 0.12);
  src.connect(tone).connect(g); send(o, g, reverb);
  src.start(t); src.stop(t + seconds);
}
/** A strummed chord: its strings a few milliseconds apart, low to high. */
function strum(o: Out, t: number, notes: readonly number[], gain = 0.3, spread = 0.018, seconds = 2) {
  notes.forEach((note, i) => pluck(o, t + i * spread, hz(note), gain, seconds, 0.997, 0.45));
}
/** The whistle: a sine with a breathy edge and a vibrato that swells in, gliding from `from` to `to`. */
function whistle(o: Out, t: number, from: number, to: number, seconds: number, gain = 0.18) {
  const { ctx } = o, osc = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
  osc.type = "sine"; osc.frequency.setValueAtTime(from, t); osc.frequency.exponentialRampToValueAtTime(to, t + seconds * 0.85);
  lfo.frequency.value = 5.6; depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(from * 0.012, t + seconds * 0.5);
  lfo.connect(depth).connect(osc.frequency);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.06);
  g.gain.setValueAtTime(gain, t + seconds * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  osc.connect(g); send(o, g, 0.6);
  const breath = noiseSource(ctx, seconds), band = ctx.createBiquadFilter(), bg = ctx.createGain();
  band.type = "bandpass"; band.frequency.setValueAtTime(from, t); band.frequency.exponentialRampToValueAtTime(to, t + seconds * 0.85); band.Q.value = 12;
  bg.gain.setValueAtTime(gain * 0.25, t); bg.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  breath.connect(band).connect(bg); send(o, bg, 0.6);
  for (const node of [osc, lfo, breath]) { node.start(t); node.stop(t + seconds + 0.05); }
}
/** Shared white noise, one second, looped when a longer burst is needed. */
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseSource(ctx: BaseAudioContext, seconds: number) {
  let buffer = noiseCache.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0); let seed = 99;
    for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed / 0x7fffffff - 1; }
    noiseCache.set(ctx, buffer);
  }
  const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = seconds > 1; return src;
}
/** A whip crack: a snap of high noise with a sharp tick in front. */
function whip(o: Out, t: number, gain = 0.6) {
  const { ctx } = o, n = noiseSource(ctx, 0.25), hp = ctx.createBiquadFilter(), g = ctx.createGain();
  hp.type = "highpass"; hp.frequency.setValueAtTime(1800, t); hp.frequency.exponentialRampToValueAtTime(5000, t + 0.08);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  n.connect(hp).connect(g); send(o, g, 0.5); n.start(t); n.stop(t + 0.25);
  const tick = ctx.createOscillator(), tg = ctx.createGain();
  tick.type = "square"; tick.frequency.setValueAtTime(3200, t); tick.frequency.exponentialRampToValueAtTime(900, t + 0.02);
  tg.gain.setValueAtTime(gain * 0.4, t); tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  tick.connect(tg); send(o, tg, 0.2); tick.start(t); tick.stop(t + 0.04);
}
/** A wood block: a short, hollow knock (for hoofbeats). */
function woodBlock(o: Out, t: number, freq: number, gain = 0.35) {
  const { ctx } = o, osc = ctx.createOscillator(), g = ctx.createGain(), bp = ctx.createBiquadFilter();
  osc.type = "triangle"; osc.frequency.setValueAtTime(freq * 1.5, t); osc.frequency.exponentialRampToValueAtTime(freq, t + 0.01);
  bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = 6;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  osc.connect(bp).connect(g); send(o, g, 0.15); osc.start(t); osc.stop(t + 0.1);
  const click = noiseSource(ctx, 0.03), cf = ctx.createBiquadFilter(), cg = ctx.createGain();
  cf.type = "bandpass"; cf.frequency.value = freq * 3; cf.Q.value = 2;
  cg.gain.setValueAtTime(gain * 0.5, t); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
  click.connect(cf).connect(cg); send(o, cg, 0.1); click.start(t); click.stop(t + 0.03);
}
/** A dull thud of a hoof on dirt: a short low sine that drops in pitch, and a puff of muffled noise. */
function thud(o: Out, t: number, freq: number, gain = 0.3) {
  const { ctx } = o, osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = "sine"; osc.frequency.setValueAtTime(freq * 1.6, t); osc.frequency.exponentialRampToValueAtTime(freq, t + 0.03);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(g); send(o, g, 0.05); osc.start(t); osc.stop(t + 0.14);
  const dirt = noiseSource(ctx, 0.08), lp = ctx.createBiquadFilter(), dg = ctx.createGain();
  lp.type = "lowpass"; lp.frequency.value = 700;
  dg.gain.setValueAtTime(gain * 0.6, t); dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  dirt.connect(lp).connect(dg); send(o, dg, 0); dirt.start(t); dirt.stop(t + 0.08);
}
/** The mariachi trumpet: a bright sawtooth through a swelling low-pass, with a vibrato that arrives late on long notes. */
function trumpet(o: Out, t: number, freq: number, seconds: number, gain = 0.16) {
  const { ctx } = o, a = ctx.createOscillator(), b = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  const lfo = ctx.createOscillator(), depth = ctx.createGain();
  a.type = "sawtooth"; b.type = "square"; a.frequency.value = freq; b.frequency.value = freq; b.detune.value = 6;
  lfo.frequency.value = 6; depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(seconds > 0.3 ? freq * 0.01 : 0, t + Math.min(0.35, seconds));
  lfo.connect(depth); depth.connect(a.frequency); depth.connect(b.frequency);
  lp.type = "lowpass"; lp.Q.value = 1.5; lp.frequency.setValueAtTime(freq * 1.5, t); lp.frequency.linearRampToValueAtTime(freq * 6, t + 0.05);
  lp.frequency.setTargetAtTime(freq * 3.5, t + 0.08, 0.1);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.025);
  g.gain.setValueAtTime(gain * 0.85, t + Math.max(0.03, seconds - 0.06)); g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  a.connect(lp); b.connect(lp); lp.connect(g); send(o, g, 0.35);
  for (const node of [a, b, lfo]) { node.start(t); node.stop(t + seconds + 0.02); }
}
/** Route a voice to the dry bus and, by `amount`, to the spring reverb. */
function send(o: Out, node: AudioNode, amount: number) {
  node.connect(o.dry);
  if (amount > 0) { const g = o.ctx.createGain(); g.gain.value = amount; node.connect(g).connect(o.wet); }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Cues
// ---------------------------------------------------------------------------------------------------------------------------

export type CueOptions = { step?: number };
function cue(o: Out, id: SoundId, t: number, options: CueOptions = {}) {
  const { ctx } = o;
  switch (id) {
    case "laser": {
      // The pew: a square wave diving from high to low...
      const osc = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      osc.type = "square"; osc.frequency.setValueAtTime(1900, t); osc.frequency.exponentialRampToValueAtTime(260, t + 0.16);
      lp.type = "lowpass"; lp.frequency.value = 3500;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(lp).connect(g); send(o, g, 0.25); osc.start(t); osc.stop(t + 0.2);
      // ...then the ricochet, the classic Western "pee-yoo" whistling off a rock.
      whistle(o, t + 0.07, 3100, 1500, 0.42, 0.09);
      break;
    }
    case "hoof": {
      // One galloping stride: four hooves land in a quick, uneven "ba-da-da-DUM", the last the heaviest, each a hard knock on top of
      // a dull thud of dirt. Every hit is a little different in pitch, weight and timing, so stride after stride never repeats.
      const jitter = (spread: number) => 1 + (Math.random() * 2 - 1) * spread;
      const beats: [number, number, number][] = [[0, 0.55, 1.08], [0.068, 0.45, 0.94], [0.122, 0.62, 1.02], [0.2, 1, 0.88]];
      for (const [at, weight, pitch] of beats) {
        const when = t + at + (Math.random() - 0.5) * 0.012, level = weight * jitter(0.15);
        woodBlock(o, when, 560 * pitch * jitter(0.07), 0.15 * level);
        thud(o, when, 95 * pitch * jitter(0.1), 0.19 * level);
      }
      break;
    }
    case "showdown": {
      // The desert goes quiet: a gust of wind rises and falls, dry tumbleweed rustles past, a distant bell tolls once, and a lone
      // whistle answers over a low, trembling guitar. An original phrase in E minor.
      const wind = noiseSource(ctx, 4.5), band = ctx.createBiquadFilter(), wg = ctx.createGain();
      band.type = "bandpass"; band.Q.value = 4;
      band.frequency.setValueAtTime(380, t); band.frequency.linearRampToValueAtTime(1150, t + 1.6); band.frequency.linearRampToValueAtTime(520, t + 4.3);
      wg.gain.setValueAtTime(0.0001, t); wg.gain.exponentialRampToValueAtTime(0.16, t + 1.2); wg.gain.setValueAtTime(0.16, t + 2.2); wg.gain.exponentialRampToValueAtTime(0.0001, t + 4.4);
      wind.connect(band).connect(wg); send(o, wg, 0.2); wind.start(t); wind.stop(t + 4.5);
      // Tumbleweed: soft, scratchy crackles tumbling by.
      for (let k = 0; k < 9; k++) {
        const at = t + 0.5 + k * 0.17 + Math.random() * 0.06, crackle = noiseSource(ctx, 0.05), hp = ctx.createBiquadFilter(), cg = ctx.createGain();
        hp.type = "highpass"; hp.frequency.value = 2500 + Math.random() * 1500;
        cg.gain.setValueAtTime(0.0001, at); cg.gain.exponentialRampToValueAtTime(0.045 * (1 - Math.abs(k - 4) / 6), at + 0.004); cg.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
        crackle.connect(hp).connect(cg); send(o, cg, 0.1); crackle.start(at); crackle.stop(at + 0.05);
      }
      // The distant bell: a low toll with inharmonic partials, mostly reverb.
      for (const [f, level, ring] of [[196, 0.09, 3.2], [392 * 1.19, 0.05, 2.4], [196 * 2.76, 0.035, 1.8], [196 * 5.4, 0.02, 1.1]] as const) {
        const bell = ctx.createOscillator(), bg = ctx.createGain();
        bell.type = "sine"; bell.frequency.value = f;
        bg.gain.setValueAtTime(0.0001, t + 0.15); bg.gain.exponentialRampToValueAtTime(level, t + 0.17); bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.15 + ring);
        bell.connect(bg); send(o, bg, 0.9); bell.start(t + 0.15); bell.stop(t + 0.2 + ring);
      }
      // The whistle: E5 held, falling to B4; a lift to G5 and F#5; home on E5 with the vibrato swelling.
      whistle(o, t + 1.2, hz(7), hz(7), 0.7, 0.15);
      whistle(o, t + 1.9, hz(7), hz(2), 0.45, 0.14);
      whistle(o, t + 2.45, hz(10), hz(10), 0.22, 0.13);
      whistle(o, t + 2.68, hz(9), hz(9), 0.22, 0.13);
      whistle(o, t + 2.92, hz(7), hz(7), 1.3, 0.15);
      // Under it, the guitar's low E trembling, then left to ring.
      for (let k = 0; k < 8; k++) pluck(o, t + 1.2 + k * 0.12, hz(-29), 0.2 * (1 - k * 0.08), 0.4, 0.99, 0.4);
      pluck(o, t + 2.92, hz(-29), 0.3, 1.7, 0.997, 0.5);
      break;
    }
    case "flip": {
      // A bright pluck; successive flips walk the A-minor scale, so a run of flips plays a little tune.
      const note = FLIP_SCALE[((options.step ?? 0) % FLIP_SCALE.length + FLIP_SCALE.length) % FLIP_SCALE.length];
      pluck(o, t, hz(note + 12), 0.35, 0.9, 0.994, 0.3);
      break;
    }
    case "strike": {
      // The anvil: a low sine that drops in pitch, a metallic ring on top, and the guitar's low E hit hard underneath.
      const body = ctx.createOscillator(), g = ctx.createGain();
      body.type = "sine"; body.frequency.setValueAtTime(150, t); body.frequency.exponentialRampToValueAtTime(55, t + 0.25);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      body.connect(g); send(o, g, 0.2); body.start(t); body.stop(t + 0.4);
      for (const [f, level] of [[1180, 0.07], [1710, 0.05], [2630, 0.035]] as const) {
        const ring = ctx.createOscillator(), rg = ctx.createGain();
        ring.type = "sine"; ring.frequency.value = f;
        rg.gain.setValueAtTime(level, t); rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        ring.connect(rg); send(o, rg, 0.5); ring.start(t); ring.stop(t + 0.65);
      }
      pluck(o, t + 0.01, hz(-29), 0.5, 1.2, 0.992, 0.3); // E2
      break;
    }
    case "bump": {
      // Walking into something: a soft, heavy body thump, a muffled knock of wood, and a short hollow "bonk" that bounces once.
      thud(o, t, 85, 0.5);
      const knock = noiseSource(ctx, 0.1), lp = ctx.createBiquadFilter(), kg = ctx.createGain();
      lp.type = "lowpass"; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.06);
      kg.gain.setValueAtTime(0.0001, t); kg.gain.exponentialRampToValueAtTime(0.35, t + 0.003); kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      knock.connect(lp).connect(kg); send(o, kg, 0.05); knock.start(t); knock.stop(t + 0.1);
      for (const [at, from, to, level] of [[0, 330, 190, 0.26], [0.1, 250, 170, 0.1]] as const) {
        const bonk = ctx.createOscillator(), bg = ctx.createGain(), body = ctx.createBiquadFilter();
        bonk.type = "triangle"; bonk.frequency.setValueAtTime(from, t + at); bonk.frequency.exponentialRampToValueAtTime(to, t + at + 0.09);
        body.type = "lowpass"; body.frequency.value = 1200;
        bg.gain.setValueAtTime(0.0001, t + at); bg.gain.exponentialRampToValueAtTime(level, t + at + 0.005); bg.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.13);
        bonk.connect(body).connect(bg); send(o, bg, 0.08); bonk.start(t + at); bonk.stop(t + at + 0.15);
      }
      break;
    }
    case "twist": {
      // The stinger: a whip crack, the falling "wah-wah" whistle, and an A-minor chord trembling on the strings.
      whip(o, t, 0.55);
      whistle(o, t + 0.12, hz(12), hz(7), 0.5, 0.17);   // A5 down to E5
      whistle(o, t + 0.66, hz(7), hz(0), 0.75, 0.17);   // E5 down to A4
      const chord = [-24, -17, -12, -9, -5]; // A2 E3 A3 C4 E4
      for (let k = 0; k < 10; k++) strum(o, t + 0.2 + k * 0.11, chord, 0.13 * (1 - k * 0.07), 0.006, 0.5);
      pluck(o, t + 1.3, hz(-24), 0.45, 2.2, 0.998, 0.6); // the low A left ringing
      break;
    }
    case "win": {
      // A mariachi flourish in A major, then a strummed A chord with the trumpets holding its top.
      // Two trumpets in sixths, the mariachi way: A-C#-E-A over C#-E-A-C#.
      const phrase: [number, number, number, number][] = [[0, -8, 0, 0.12], [4, -5, 0.13, 0.12], [7, 0, 0.26, 0.12], [12, 4, 0.39, 0.55]];
      for (const [lead, second, at, len] of phrase) { trumpet(o, t + at, hz(lead), len, 0.13); trumpet(o, t + at, hz(second), len, 0.08); }
      strum(o, t + 0.39, [-24, -17, -12, -8, -5, 0], 0.22, 0.02, 2.2); // A2 E3 A3 C#4 E4 A4
      trumpet(o, t + 0.95, hz(7), 0.6, 0.1); trumpet(o, t + 0.95, hz(12), 0.6, 0.12);
      break;
    }
  }
}
/** How long each cue rings, in seconds (for rendering previews). */
export const CUE_SECONDS: Readonly<Record<SoundId, number>> = { laser: 0.7, hoof: 0.45, flip: 1, bump: 0.45, showdown: 4.6, strike: 1.3, twist: 3.6, win: 2.9 };

/** The spring reverb: a short, bright, metallic tail (noise with a fast decay and a little flutter), like a guitar amp's spring. */
function springImpulse(ctx: BaseAudioContext) {
  const seconds = 1.4, length = Math.floor(ctx.sampleRate * seconds), buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel); let seed = 7 + channel * 31;
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const time = i / ctx.sampleRate, flutter = 1 + 0.35 * Math.sin(time * 2 * Math.PI * 23);
      data[i] = (seed / 0x7fffffff - 1) * Math.exp(-time * 4.2) * flutter * 0.5;
    }
  }
  return buffer;
}
/** The output chain on a context: dry and reverb buses into a master gain and a gentle limiter. */
function outputChain(ctx: BaseAudioContext, destination: AudioNode, master: GainNode): Out {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10; limiter.knee.value = 6; limiter.ratio.value = 8; limiter.attack.value = 0.003; limiter.release.value = 0.2;
  master.connect(limiter).connect(destination);
  const dry = ctx.createGain(), wet = ctx.createGain(), reverb = ctx.createConvolver(), tone = ctx.createBiquadFilter();
  reverb.buffer = springImpulse(ctx); tone.type = "highpass"; tone.frequency.value = 350; wet.gain.value = 0.45;
  dry.connect(master); wet.connect(tone).connect(reverb).connect(master);
  return { ctx, dry, wet };
}

// ---------------------------------------------------------------------------------------------------------------------------
// The player
// ---------------------------------------------------------------------------------------------------------------------------

export type OutlawAudio = {
  /** Create or resume the AudioContext; call from a click, tap or key press. Resolves false where audio is unavailable. */
  unlock(): Promise<boolean>;
  /** Play a cue now; returns whether it started (false while locked, muted or hidden). */
  play(id: SoundId, options?: CueOptions): boolean;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  dispose(): void;
};
export function createOutlawAudio({ volume = 0.7, muted = false } = {}): OutlawAudio {
  let ctx: AudioContext | null = null, master: GainNode | null = null, out: Out | null = null;
  let level = volume, silent = muted, disposed = false;
  const apply = () => { if (master && ctx) master.gain.setTargetAtTime(silent ? 0 : level * 0.8, ctx.currentTime, 0.02); };
  const onHidden = () => { if (document.hidden && ctx?.state === "running") void ctx.suspend(); else if (!document.hidden && ctx?.state === "suspended" && !silent) void ctx.resume(); };
  document.addEventListener("visibilitychange", onHidden);
  return {
    async unlock() {
      if (disposed) return false;
      try {
        if (!ctx) {
          const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!Context) return false;
          ctx = new Context(); master = ctx.createGain(); master.gain.value = 0; out = outputChain(ctx, ctx.destination, master); apply();
        }
        if (ctx.state !== "running") await ctx.resume();
        return ctx.state === "running";
      } catch { return false; }
    },
    play(id, options) {
      if (disposed || silent || !ctx || !out || ctx.state !== "running" || document.hidden) return false;
      cue(out, id, ctx.currentTime + 0.01, options);
      return true;
    },
    setMuted(value) { silent = value; apply(); },
    setVolume(value) { level = Math.max(0, Math.min(1, value)); apply(); },
    dispose() { disposed = true; document.removeEventListener("visibilitychange", onHidden); void ctx?.close(); ctx = null; },
  };
}

/** Render one cue offline (no speakers, no gesture needed): for the preview page's downloads and for checking levels. */
export async function renderCue(id: SoundId, options: CueOptions = {}, sampleRate = 44100): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(CUE_SECONDS[id] * sampleRate), sampleRate);
  const master = ctx.createGain(); master.gain.value = 0.56;
  cue(outputChain(ctx, ctx.destination, master), id, 0.01, options);
  return ctx.startRendering();
}
/** Render a sequence of cues offline, each at its own time in seconds: for previews of rhythms such as a gallop. */
export async function renderSequence(steps: readonly { id: SoundId; at: number; options?: CueOptions }[], sampleRate = 44100): Promise<AudioBuffer> {
  const seconds = Math.max(...steps.map(step => step.at + CUE_SECONDS[step.id])) + 0.1;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate), master = ctx.createGain(); master.gain.value = 0.56;
  const out = outputChain(ctx, ctx.destination, master);
  for (const step of steps) cue(out, step.id, 0.01 + step.at, step.options);
  return ctx.startRendering();
}
/** 16-bit stereo WAV bytes of a rendered buffer. */
export function wavBytes(buffer: AudioBuffer): Uint8Array<ArrayBuffer> {
  const channels = buffer.numberOfChannels, frames = buffer.length, bytes = new DataView(new ArrayBuffer(44 + frames * channels * 2));
  const text = (at: number, value: string) => [...value].forEach((c, i) => bytes.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF"); bytes.setUint32(4, 36 + frames * channels * 2, true); text(8, "WAVE"); text(12, "fmt ");
  bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, channels, true); bytes.setUint32(24, buffer.sampleRate, true);
  bytes.setUint32(28, buffer.sampleRate * channels * 2, true); bytes.setUint16(32, channels * 2, true); bytes.setUint16(34, 16, true);
  text(36, "data"); bytes.setUint32(40, frames * channels * 2, true);
  const data = [...Array(channels)].map((_, c) => buffer.getChannelData(c));
  for (let i = 0, at = 44; i < frames; i++) for (let c = 0; c < channels; c++, at += 2) bytes.setInt16(at, Math.max(-1, Math.min(1, data[c][i])) * 0x7fff, true);
  return new Uint8Array(bytes.buffer);
}
