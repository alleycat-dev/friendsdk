// Rarefriend Outlaw's sound: spaghetti-Western cues synthesized from code with the Web Audio API (no recordings, no samples).
//
// The palette: a plucked, twangy guitar string (Karplus-Strong), a whistle with a slow vibrato, a whip crack, wood-block hoofbeats,
// a brassy mariachi trumpet, a low anvil thud, a hollow bump and a laser "pew" with a whistling ricochet, all sent through a short spring-reverb
// echo. Like the SDK's sound kit: creating the player makes no AudioContext; `unlock()` must be called from a player gesture;
// muted, locked or hidden players drop cues instead of queueing them.

export const SOUND_IDS = ["laser", "hoof", "bump", "showdown", "flip", "smash", "strike", "twist", "win",
  "meow", "bark", "moo", "oink", "crow", "cluck", "chirp", "ribbit", "snort", "thump", "boom", "hiss", "slither", "flutter", "buzz",
  "roar", "growl", "yip", "dragon"] as const;
export type SoundId = (typeof SOUND_IDS)[number];
/** What each cue is for, for the preview page and the README. */
export const SOUND_CUES: Readonly<Record<SoundId, string>> = {
  laser: "Laser Gun shot: a pew with a whistling ricochet",
  hoof: "One galloping stride of a riding horse: four hoofbeats, ba-da-da-DUM (played stride after stride)",
  flip: "A hacking-game tile flip: a guitar pluck, stepping through an A-minor scale",
  showdown: "Tumbleweed time: the first time a new outlaw comes near (as its red arrow appears): wind, a distant bell, a lone whistle and a trembling twang",
  bump: "Walking into an outlaw (who robs you): like walking into something, a body thump and a hollow bonk",
  smash: "Hitting a defender in a hack: demolishing brickwork, a crack, crumbling stone and a thud (a bigger collapse when it breaks)",
  strike: "Losing Integrity in a hack to a bomb, a bite or the like (a hit's instant strike-back is covered by the smash): an anvil thud under a low twang",
  twist: "A twist striking (RUGPULL!!!): whip crack, a falling whistle and a trembling guitar chord",
  win: "A cracked wallet: a mariachi trumpet flourish over a strummed chord",
  meow: "Cat: a meow, rising then falling (mi-aow)",
  bark: "Dog: two gruff barks",
  moo: "Cow: a long, low moo",
  oink: "Pig: a few nasal grunts",
  crow: "Rooster: cock-a-doodle-doo",
  cluck: "Hen: bok, bok, bok, ba-gawk",
  chirp: "Bird: a quick burst of tweets",
  ribbit: "Frog: rib-bit",
  snort: "Deer: a sharp alarm snort",
  thump: "Rabbit: a hind-foot thump and a sniff",
  boom: "Ostrich: its deep, booming call",
  hiss: "Snake: a long hiss",
  slither: "Snake: scales rustling over dry ground while it moves (repeats)",
  flutter: "Butterfly: the faintest flutter of wings (repeats)",
  buzz: "Bees: a buzz, louder the nearer the swarm (repeats)",
  roar: "Lion: a rumbling roar",
  growl: "Bear: a deep growl",
  yip: "Golden Fox: a high, raspy yelp",
  dragon: "Dragon: a huge roar and a whoosh of fire",
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
/** An animal voice: a buzzing source (sawtooth, and breath noise) shaped by vowel-like formant filters, the way a throat, mouth or
 * beak shapes it. `pitch` and each formant's frequency are [seconds, Hz] points, glided between; `rasp` shakes the level (a growl or
 * a croak) at `raspRate` times a second. */
type Voice = { seconds: number; pitch: readonly (readonly [number, number])[]; formants: readonly { f: readonly (readonly [number, number])[]; q: number; gain: number }[];
  gain: number; wave?: OscillatorType; breath?: number; rasp?: number; raspRate?: number; attack?: number; release?: number; reverb?: number };
function voice(o: Out, t: number, v: Voice) {
  const { ctx } = o, end = t + v.seconds, source = ctx.createGain(), env = ctx.createGain();
  const osc = ctx.createOscillator(); osc.type = v.wave ?? "sawtooth";
  const glide = (param: AudioParam, points: readonly (readonly [number, number])[]) => {
    param.setValueAtTime(points[0][1], t); for (const [at, value] of points.slice(1)) param.linearRampToValueAtTime(value, t + at);
  };
  glide(osc.frequency, v.pitch);
  const tone = ctx.createGain(); tone.gain.value = 1 - (v.breath ?? 0); osc.connect(tone).connect(source);
  const air = noiseSource(ctx, v.seconds + 0.05);
  if (v.breath) { const ag = ctx.createGain(); ag.gain.value = v.breath; air.connect(ag).connect(source); }
  for (const formant of v.formants) {
    const band = ctx.createBiquadFilter(), fg = ctx.createGain();
    band.type = "bandpass"; band.Q.value = formant.q; glide(band.frequency, formant.f); fg.gain.value = formant.gain;
    source.connect(band).connect(fg).connect(env);
  }
  const attack = v.attack ?? 0.03, release = v.release ?? 0.12;
  env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(v.gain, t + attack);
  env.gain.setValueAtTime(v.gain, Math.max(t + attack, end - release)); env.gain.exponentialRampToValueAtTime(0.0001, end);
  let tail: AudioNode = env;
  if (v.rasp) {
    const shake = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
    shake.gain.value = 1 - v.rasp / 2; lfo.frequency.value = v.raspRate ?? 28; depth.gain.value = v.rasp / 2;
    lfo.connect(depth).connect(shake.gain); env.connect(shake); tail = shake; lfo.start(t); lfo.stop(end + 0.05);
  }
  send(o, tail, v.reverb ?? 0.2);
  osc.start(t); osc.stop(end + 0.05); air.start(t); air.stop(end + 0.05);
}
/** A band of filtered noise with a level envelope: the building block of hisses, rustles, buzzes and fire. */
function noiseBand(o: Out, t: number, seconds: number, type: BiquadFilterType, from: number, to: number, q: number, gain: number, attack = 0.02, reverb = 0.15) {
  const { ctx } = o, n = noiseSource(ctx, seconds + 0.05), filter = ctx.createBiquadFilter(), g = ctx.createGain();
  filter.type = type; filter.Q.value = q; filter.frequency.setValueAtTime(from, t); filter.frequency.exponentialRampToValueAtTime(to, t + seconds);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.setValueAtTime(gain, t + Math.max(attack, seconds * 0.6));
  g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  n.connect(filter).connect(g); send(o, g, reverb); n.start(t); n.stop(t + seconds + 0.05);
  return g;
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
/** A cue placed in the world: its own level and stereo position in front of the buses (the reverb stays centred, like a room). */
function placed(o: Out, t: number, { gain = 1, pan = 0 }: CueOptions): Out {
  if (gain === 1 && pan === 0) return o;
  const { ctx } = o, level = ctx.createGain(), wet = ctx.createGain(), panner = ctx.createStereoPanner();
  level.gain.setValueAtTime(gain, t); wet.gain.setValueAtTime(gain, t); panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t);
  level.connect(panner).connect(o.dry); wet.connect(o.wet);
  return { ctx, dry: level, wet };
}
/** Route a voice to the dry bus and, by `amount`, to the spring reverb. */
function send(o: Out, node: AudioNode, amount: number) {
  node.connect(o.dry);
  if (amount > 0) { const g = o.ctx.createGain(); g.gain.value = amount; node.connect(g).connect(o.wet); }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Cues
// ---------------------------------------------------------------------------------------------------------------------------

/** `heavy`: the bigger version of a cue (a defender that breaks). `step`: which note of a scale; `gain` (0-1) and `pan` (-1 left to 1 right) place a sound in the world (an animal's distance and
 * side of the screen). */
export type CueOptions = { step?: number; gain?: number; pan?: number; heavy?: boolean };
function cue(base: Out, id: SoundId, t: number, options: CueOptions = {}) {
  const o = placed(base, t, options), { ctx } = o;
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
      const beats: [number, number, number][] = [[0, 0.55, 1.08], [0.085, 0.45, 0.94], [0.153, 0.62, 1.02], [0.25, 1, 0.88]];
      for (const [at, weight, pitch] of beats) {
        const when = t + at + (Math.random() - 0.5) * 0.012, level = weight * jitter(0.15);
        woodBlock(o, when, 470 * pitch * jitter(0.07), 0.15 * level);
        thud(o, when, 80 * pitch * jitter(0.1), 0.19 * level);
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
    // ----- Animals: each as it sounds in life -----
    case "meow": {
      voice(o, t, { seconds: 0.75, gain: 0.19, breath: 0.1, pitch: [[0, 560], [0.25, 820], [0.55, 700], [0.75, 480]],
        formants: [{ f: [[0, 350], [0.3, 900], [0.75, 450]], q: 5, gain: 1 }, { f: [[0, 2300], [0.3, 1500], [0.75, 900]], q: 7, gain: 0.7 }, { f: [[0, 3200], [0.75, 2600]], q: 8, gain: 0.3 }] });
      break;
    }
    case "bark": {
      for (const at of [0, 0.28]) voice(o, t + at, { seconds: 0.2, gain: 0.34, breath: 0.45, attack: 0.008, release: 0.1, pitch: [[0, 290], [0.2, 190]],
        formants: [{ f: [[0, 750], [0.2, 550]], q: 3, gain: 1 }, { f: [[0, 1600], [0.2, 1300]], q: 5, gain: 0.6 }, { f: [[0, 2700], [0.2, 2500]], q: 6, gain: 0.3 }] });
      break;
    }
    case "moo": {
      voice(o, t, { seconds: 1.6, gain: 0.34, breath: 0.08, attack: 0.18, release: 0.4, pitch: [[0, 105], [0.5, 128], [1.2, 118], [1.6, 92]],
        formants: [{ f: [[0, 280], [0.4, 520], [1.6, 380]], q: 4, gain: 1 }, { f: [[0, 700], [0.4, 1000], [1.6, 760]], q: 5, gain: 0.55 }, { f: [[0, 2400], [1.6, 2300]], q: 6, gain: 0.12 }] });
      break;
    }
    case "oink": {
      for (const [at, f] of [[0, 190], [0.2, 170], [0.42, 205]] as const) voice(o, t + at, { seconds: 0.14, gain: 0.3, breath: 0.35, attack: 0.01, release: 0.06,
        pitch: [[0, f], [0.14, f * 0.78]], rasp: 0.7, raspRate: 45,
        formants: [{ f: [[0, 420], [0.14, 380]], q: 6, gain: 1 }, { f: [[0, 1150], [0.14, 1000]], q: 9, gain: 0.7 }, { f: [[0, 2600], [0.14, 2500]], q: 10, gain: 0.25 }] });
      break;
    }
    case "crow": {
      // Cock - a - doodle - dooo.
      const notes: [number, number, number, number][] = [[0, 0.16, 720, 760], [0.2, 0.12, 820, 860], [0.36, 0.16, 780, 900], [0.58, 1.1, 980, 640]];
      for (const [at, len, from, to] of notes) voice(o, t + at, { seconds: len, gain: 0.24, breath: 0.2, wave: "square", attack: 0.015, release: Math.min(0.3, len * 0.4),
        pitch: [[0, from], [len * 0.3, (from + to) / 2 * 1.06], [len, to]], rasp: 0.25, raspRate: 60,
        formants: [{ f: [[0, 1200], [len, 1000]], q: 4, gain: 1 }, { f: [[0, 2800], [len, 2400]], q: 6, gain: 0.6 }] });
      break;
    }
    case "cluck": {
      for (const at of [0, 0.19, 0.36]) voice(o, t + at, { seconds: 0.07, gain: 0.24, breath: 0.3, attack: 0.005, release: 0.04, pitch: [[0, 380], [0.07, 290]],
        formants: [{ f: [[0, 650], [0.07, 520]], q: 5, gain: 1 }, { f: [[0, 1800], [0.07, 1500]], q: 7, gain: 0.5 }] });
      voice(o, t + 0.62, { seconds: 0.42, gain: 0.26, breath: 0.25, attack: 0.02, release: 0.12, pitch: [[0, 360], [0.12, 330], [0.2, 520], [0.42, 470]], rasp: 0.2, raspRate: 50,
        formants: [{ f: [[0, 600], [0.2, 900], [0.42, 800]], q: 5, gain: 1 }, { f: [[0, 1700], [0.42, 1900]], q: 7, gain: 0.5 }] });
      break;
    }
    case "chirp": {
      const tweets = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < tweets; k++) {
        const at = t + k * 0.11, osc = ctx.createOscillator(), g = ctx.createGain(), base = 3200 + Math.random() * 900;
        osc.type = "sine"; osc.frequency.setValueAtTime(base, at); osc.frequency.exponentialRampToValueAtTime(base * 1.45, at + 0.035); osc.frequency.exponentialRampToValueAtTime(base * 1.1, at + 0.06);
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.11, at + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.065);
        osc.connect(g); send(o, g, 0.35); osc.start(at); osc.stop(at + 0.08);
      }
      break;
    }
    case "ribbit": {
      for (const [at, len] of [[0, 0.13], [0.2, 0.09]] as const) voice(o, t + at, { seconds: len, gain: 0.3, breath: 0.1, attack: 0.008, release: 0.03, pitch: [[0, 120], [len, 108]],
        rasp: 1, raspRate: 34, formants: [{ f: [[0, 650], [len, 850]], q: 6, gain: 1 }, { f: [[0, 1500], [len, 1700]], q: 8, gain: 0.4 }] });
      break;
    }
    case "snort": {
      noiseBand(o, t, 0.22, "lowpass", 1400, 500, 1, 0.3, 0.006, 0.1);
      noiseBand(o, t, 0.16, "bandpass", 900, 700, 3, 0.14, 0.006, 0.1);
      break;
    }
    case "thump": {
      thud(o, t, 75, 0.35);
      for (const at of [0.22, 0.3, 0.38]) noiseBand(o, t + at, 0.05, "bandpass", 4200, 3800, 4, 0.03, 0.005, 0);
      break;
    }
    case "boom": {
      for (const at of [0, 0.75]) voice(o, t + at, { seconds: 0.62, gain: 0.24, wave: "sine", breath: 0.05, attack: 0.08, release: 0.25, pitch: [[0, 62], [0.3, 70], [0.62, 55]],
        formants: [{ f: [[0, 120], [0.62, 110]], q: 1, gain: 1 }, { f: [[0, 260], [0.62, 240]], q: 2, gain: 0.35 }], reverb: 0.3 });
      break;
    }
    case "hiss": noiseBand(o, t, 1.05, "highpass", 3500, 5200, 0.7, 0.075, 0.15, 0.1); break;
    case "slither": {
      // Dry scales on dirt: a soft rustle that swells and ebbs as the body pushes, with tiny grains of grit.
      noiseBand(o, t, 0.55, "bandpass", 1600, 2300, 1.2, 0.07, 0.12, 0.05);
      for (let k = 0; k < 5; k++) noiseBand(o, t + 0.05 + Math.random() * 0.45, 0.03, "highpass", 5000, 6000, 1, 0.02, 0.003, 0);
      break;
    }
    case "flutter": {
      noiseBand(o, t, 0.45, "bandpass", 500, 450, 1, 0.05, 0.05, 0);
      const beat = ctx.createOscillator(), depth = ctx.createGain(), shaped = ctx.createGain();
      beat.frequency.value = 11; depth.gain.value = 0.03; beat.connect(depth).connect(shaped.gain); shaped.gain.value = 0.03;
      const air = noiseSource(ctx, 0.5), lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700;
      air.connect(lp).connect(shaped); send(o, shaped, 0); air.start(t); air.stop(t + 0.45); beat.start(t); beat.stop(t + 0.45);
      break;
    }
    case "buzz": {
      voice(o, t, { seconds: 0.55, gain: 0.07, attack: 0.15, release: 0.18, pitch: [[0, 225 + Math.random() * 20], [0.55, 235 + Math.random() * 20]], rasp: 0.35, raspRate: 180,
        formants: [{ f: [[0, 500], [0.55, 520]], q: 2, gain: 1 }, { f: [[0, 1500], [0.55, 1400]], q: 3, gain: 0.5 }], reverb: 0.05 });
      break;
    }
    case "roar": {
      voice(o, t, { seconds: 1.9, gain: 0.45, breath: 0.45, attack: 0.25, release: 0.7, pitch: [[0, 95], [0.6, 150], [1.9, 75]], rasp: 0.6, raspRate: 26,
        formants: [{ f: [[0, 400], [0.6, 750], [1.9, 450]], q: 3, gain: 1 }, { f: [[0, 1000], [0.6, 1300], [1.9, 900]], q: 4, gain: 0.5 }, { f: [[0, 2400], [1.9, 2200]], q: 5, gain: 0.2 }], reverb: 0.4 });
      break;
    }
    case "growl": {
      voice(o, t, { seconds: 1.2, gain: 0.42, breath: 0.35, attack: 0.15, release: 0.4, pitch: [[0, 70], [0.5, 88], [1.2, 64]], rasp: 0.8, raspRate: 22,
        formants: [{ f: [[0, 320], [0.6, 420], [1.2, 300]], q: 4, gain: 1 }, { f: [[0, 750], [1.2, 680]], q: 5, gain: 0.4 }], reverb: 0.3 });
      break;
    }
    case "yip": {
      voice(o, t, { seconds: 0.32, gain: 0.3, breath: 0.35, attack: 0.01, release: 0.12, pitch: [[0, 900], [0.08, 1400], [0.32, 700]], rasp: 0.3, raspRate: 70,
        formants: [{ f: [[0, 1100], [0.1, 1500], [0.32, 900]], q: 5, gain: 1 }, { f: [[0, 2600], [0.32, 2200]], q: 6, gain: 0.5 }], reverb: 0.3 });
      break;
    }
    case "dragon": {
      voice(o, t, { seconds: 1.6, gain: 0.5, breath: 0.5, attack: 0.2, release: 0.6, pitch: [[0, 60], [0.5, 105], [1.6, 50]], rasp: 0.7, raspRate: 19,
        formants: [{ f: [[0, 300], [0.5, 600], [1.6, 350]], q: 3, gain: 1 }, { f: [[0, 800], [1.6, 700]], q: 4, gain: 0.5 }], reverb: 0.6 });
      // The fire: a roaring whoosh of noise that opens up and dies away.
      noiseBand(o, t + 0.5, 1.9, "lowpass", 500, 3500, 0.8, 0.28, 0.25, 0.4);
      break;
    }
    case "flip": {
      // A bright pluck; successive flips walk the A-minor scale, so a run of flips plays a little tune.
      const note = FLIP_SCALE[((options.step ?? 0) % FLIP_SCALE.length + FLIP_SCALE.length) % FLIP_SCALE.length];
      pluck(o, t, hz(note + 12), 0.35, 0.9, 0.994, 0.3);
      break;
    }
    case "smash": {
      // Demolishing a brick: a sharp crack, a low thud, then crumbling stone, grains of grit falling fast and thinning out; a defender
      // that breaks brings the wall down, longer and heavier, with chunks of rubble bouncing after.
      const heavy = options.heavy ?? false, crumble = heavy ? 1.1 : 0.45, grains = heavy ? 55 : 22;
      noiseBand(o, t, 0.06, "bandpass", 2600, 1800, 1.5, 0.5, 0.002, 0.15);
      thud(o, t, heavy ? 65 : 85, heavy ? 0.55 : 0.4);
      noiseBand(o, t + 0.01, crumble, "bandpass", 1400, 700, 0.9, heavy ? 0.16 : 0.1, 0.01, 0.2);
      for (let k = 0; k < grains; k++) {
        const at = t + 0.015 + crumble * Math.pow(Math.random(), 1.8), size = Math.random();
        noiseBand(o, at, 0.012 + size * 0.03, "bandpass", 1500 + (1 - size) * 3500, 1200 + (1 - size) * 3000, 3, (0.04 + size * 0.08) * (1 - (at - t) / (crumble + 0.1)), 0.001, 0.1);
      }
      if (heavy) for (const at of [0.35, 0.52, 0.66, 0.82]) { woodBlock(o, t + at + Math.random() * 0.05, 300 + Math.random() * 180, 0.09); thud(o, t + at, 110, 0.12); }
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
export const CUE_SECONDS: Readonly<Record<SoundId, number>> = {
  meow: 0.9, bark: 0.7, moo: 1.8, oink: 0.8, crow: 1.9, cluck: 1.2, chirp: 0.7, ribbit: 0.6, snort: 0.4, thump: 0.6, boom: 2.2, hiss: 1.2,
  slither: 0.6, flutter: 0.5, buzz: 0.6, roar: 2.2, growl: 1.4, yip: 0.6, dragon: 2.6, laser: 0.7, hoof: 0.5, flip: 1, bump: 0.45, showdown: 4.6, smash: 1.4, strike: 1.3, twist: 3.6, win: 2.9 };

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
