// Rarefriend Outlaw's sound: spaghetti-Western cues synthesized from code with the Web Audio API (no recordings, no samples).
//
// The palette: a plucked, twangy guitar string (Karplus-Strong), a whistle with a slow vibrato, a whip crack, wood-block hoofbeats,
// a brassy mariachi trumpet, a low anvil thud, a hollow bump and a low laser blast with recoil and a canyon echo, all sent through a short spring-reverb
// echo. Like the SDK's sound kit: creating the player makes no AudioContext; `unlock()` must be called from a player gesture;
// muted, locked or hidden players drop cues instead of queueing them.

export const SOUND_IDS = ["laser", "hoof", "step", "bump", "showdown", "down", "flip", "smash", "strike", "twist", "wipe", "win",
  "meow", "bark", "moo", "oink", "crow", "cluck", "chirp", "caw", "ribbit", "snort", "thump", "boom", "hiss", "slither", "flutter", "buzz",
  "roar", "growl", "yip", "dragon", "wail",
  "blast", "lock", "coins", "trophy", "vault", "tick", "drumroll", "land", "tumbleweed", "sparks", "fireworks", "fanfare"] as const;
export type SoundId = (typeof SOUND_IDS)[number];
/** What each cue is for, for the preview page and the README. */
export const SOUND_CUES: Readonly<Record<SoundId, string>> = {
  laser: "Laser Gun shot: a low energy blast with the gun's recoil (a kick and a clack) and a canyon echo",
  hoof: "One galloping stride of a riding horse: four hoofbeats, ba-da-da-DUM (played stride after stride)",
  flip: "A hacking-game tile flip: a computer bleep whose note is the chain's size, rising only as the chain grows",
  showdown: "Tumbleweed time: the first time a new outlaw comes near (as its red arrow appears): wind, a distant bell, a lone whistle and a trembling twang",
  step: "A soft, light footstep thud (every step while walking)",
  down: "An outlaw shot down (his loot window opens): a small victory, a quick trumpet ta-da over a strummed chord",
  bump: "Walking into an outlaw (who robs you): like walking into something, a body thump and a hollow bonk",
  smash: "Hitting a defender in a hack, in its own sound (`species`; `heavy` when it breaks): the Firewall's brickwork, the Tamper Alarm's bell, the Validator's electric buzz, the Whale's splash and groan, the Secure Chip's crackle and shatter",
  strike: "Losing Integrity in a hack to a bomb, a bite or the like (a hit's instant strike-back is covered by the smash): an anvil thud under a low twang",
  twist: "A twist striking (RUGPULL!!!): an ominous discovery, ta-da-daaa: two low brass stabs, then a dark held chord with a cymbal swell",
  wipe: "A wiped wallet (the board lost): whip crack, a falling whistle and a trembling guitar chord",
  win: "A cracked wallet: a mariachi trumpet flourish over a strummed chord",
  meow: "Cat: a low, raspy tomcat's mrrrAOW, a little vicious",
  bark: "Dog: two full barks from the chest, woof, woof",
  moo: "Cow: a long, low moo",
  oink: "Pig: a few nasal grunts",
  crow: "Rooster: a proud, strained cock-a-doodle-doooo",
  cluck: "Hen: bok, bok, bok, ba-gawk",
  chirp: "Bird: a quick burst of tweets",
  caw: "Crow: a harsh, raspy Ra! Ra! (sometimes three)",
  ribbit: "Frog: rib-bit",
  snort: "Deer: a sharp alarm snort",
  thump: "Rabbit: a hind-foot thump and a sniff",
  boom: "Ostrich: its deep, booming call",
  hiss: "Snake: a long hiss",
  slither: "Snake: scales rustling over dry ground while it moves (repeats)",
  flutter: "Butterfly: the faintest flutter of wings (repeats)",
  buzz: "Bees: a low, oscillating hum, louder the nearer the swarm (repeats)",
  roar: "Lion: a rumbling roar",
  growl: "Bear: a deep growl",
  yip: "Golden Fox: a high, raspy yelp",
  dragon: "Dragon: a huge roar and a whoosh of fire",
  blast: "An attacker going off in a hack (`species`): a bomb's explosion, a Reentrancy Attack's echoing call-back loop, a Hard Fork's splitting crack or a Gas Spike's rising hiss",
  lock: "Settlement: a seed word locking into the vault door, a heavy clunk and a chime (a note higher for every word: `step`)",
  coins: "Settlement: coins pouring into the sack and a cash-register bell",
  trophy: "Settlement: a bright bell as a trophy is earned",
  vault: "Settlement: all twelve words, the vault door opens: gears grinding, steam hissing and a golden swell",
  tick: "Settlement: one peg of the Wheel of Fortune clicking past the pointer",
  drumroll: "Settlement: a snare drum roll building while the wheel spins",
  land: "Settlement: the wheel lands, a brass stab and a cymbal",
  tumbleweed: "Settlement, an empty payout: a gust of wind and a sad, falling harmonica",
  sparks: "Settlement, a small payout: a crackle of sparks and a bright strum",
  fireworks: "Settlement, a big payout: a rocket whistling up and bursting",
  fanfare: "Settlement, a Vault or Jackpot payout: a full mariachi fanfare with a ringing bell",
  wail: "A shot animal's pained cry, in its own voice (`species`: rabbit, deer, cow, pig, ostrich, snake, lion, bear or dragon)",
};

type Out = { ctx: BaseAudioContext; dry: AudioNode; wet: AudioNode };
const A4 = 440;
const hz = (semitonesFromA4: number) => A4 * 2 ** (semitonesFromA4 / 12);
/** The tile flip's notes: the A minor pentatonic (A C D E G) climbing three octaves from A3, in semitones from A4. The flip plays
 * the note of your chain's size, so it climbs only as the chain grows and holds at the top once a long chain runs past it. */
const FLIP_SCALE = [-12, -9, -7, -5, -2, 0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];

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
  // The rendered string can only sound at sampleRate / (period + 0.5) (a whole-sample delay line plus the half sample its averaging
  // filter adds), a little off the asked pitch; playing it back a touch faster or slower puts every note exactly in tune.
  const period = Math.max(2, Math.round(ctx.sampleRate / freq));
  src.playbackRate.value = freq / (ctx.sampleRate / (period + 0.5));
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
/** Demolishing a brick (the Firewall hit): a sharp crack, a low thud, then crumbling stone; `heavy` brings the wall down. */
function smashBrick(o: Out, t: number, heavy: boolean) {
  // Demolishing a brick: a sharp crack, a low thud, then crumbling stone, grains of grit falling fast and thinning out; a defender
  // that breaks brings the wall down, longer and heavier, with chunks of rubble bouncing after.
  const crumble = heavy ? 1.1 : 0.45, grains = heavy ? 55 : 22;
  noiseBand(o, t, 0.06, "bandpass", 2600, 1800, 1.5, 0.5, 0.002, 0.15);
  thud(o, t, heavy ? 65 : 85, heavy ? 0.55 : 0.4);
  noiseBand(o, t + 0.01, crumble, "bandpass", 1400, 700, 0.9, heavy ? 0.16 : 0.1, 0.01, 0.2);
  for (let k = 0; k < grains; k++) {
    const at = t + 0.015 + crumble * Math.pow(Math.random(), 1.8), size = Math.random();
    noiseBand(o, at, 0.012 + size * 0.03, "bandpass", 1500 + (1 - size) * 3500, 1200 + (1 - size) * 3000, 3, (0.04 + size * 0.08) * (1 - (at - t) / (crumble + 0.1)), 0.001, 0.1);
  }
  if (heavy) for (const at of [0.35, 0.52, 0.66, 0.82]) { woodBlock(o, t + at + Math.random() * 0.05, 300 + Math.random() * 180, 0.09); thud(o, t + at, 110, 0.12); }
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

/** `species`: whose cry a `wail` is. `heavy`: the bigger version of a cue (a defender that breaks). `step`: which note of a scale; `gain` (0-1) and `pan` (-1 left to 1 right) place a sound in the world (an animal's distance and
 * side of the screen). */
export type CueOptions = { step?: number; gain?: number; pan?: number; heavy?: boolean; species?: string; delay?: number };
/** Levels that bring the hacking game's hits and blasts up to the Firewall's, measured by their loudest tenth of a second. */
const SPECIES_LEVEL: Partial<Record<SoundId, Record<string, number>>> = {
  smash: { alarm: 3, validator: 2.6, whale: 0.8, chip: 4.5 },
  blast: { reentrancy: 4.5, gasspike: 4.5 },
};
function cue(base: Out, id: SoundId, t: number, options: CueOptions = {}) {
  const level = SPECIES_LEVEL[id]?.[options.species ?? ""] ?? 1;
  const o = placed(base, t, { ...options, gain: (options.gain ?? 1) * level }), { ctx } = o;
  switch (id) {
    case "laser": {
      // A low energy shot: the gun kicks back (a punchy low thump and a mechanical clack), a deep "vwum" of the beam dives down, and
      // the shot echoes off the canyon walls a few times, each repeat darker and quieter.
      const shot = ctx.createGain(), echo = ctx.createDelay(1), feedback = ctx.createGain(), dark = ctx.createBiquadFilter(), wetOut = ctx.createGain();
      echo.delayTime.value = 0.17; feedback.gain.value = 0.42; dark.type = "lowpass"; dark.frequency.value = 1400; wetOut.gain.value = 0.55;
      shot.connect(o.dry); shot.connect(echo); echo.connect(dark).connect(feedback).connect(echo); dark.connect(wetOut); send(o, wetOut, 0.3);
      const into: Out = { ctx, dry: shot, wet: o.wet };
      // Recoil: the kick and the clack of the mechanism.
      thud(into, t, 58, 0.4);
      const clack = noiseSource(ctx, 0.05), cf = ctx.createBiquadFilter(), cg = ctx.createGain();
      cf.type = "bandpass"; cf.frequency.value = 1900; cf.Q.value = 3;
      cg.gain.setValueAtTime(0.0001, t); cg.gain.exponentialRampToValueAtTime(0.22, t + 0.002); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      clack.connect(cf).connect(cg).connect(shot); clack.start(t); clack.stop(t + 0.05);
      // The beam: a sawtooth and a square a fifth apart, diving from a low whine to a growl through a closing filter.
      for (const [type, from, to, level] of [["sawtooth", 620, 110, 0.2], ["square", 930, 165, 0.1]] as const) {
        const osc = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
        osc.type = type; osc.frequency.setValueAtTime(from, t); osc.frequency.exponentialRampToValueAtTime(to, t + 0.22);
        lp.type = "lowpass"; lp.Q.value = 6; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(400, t + 0.24);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
        osc.connect(lp).connect(g).connect(shot); osc.start(t); osc.stop(t + 0.28);
      }
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
      // A tomcat's "mrrrAOW": a low growl rolling in, then the mouth opening wide and closing again, the voice low and full around
      // 400 Hz, raspy (a rattle in the throat and breath through it) and a bit vicious, trailing off in a hiss.
      const seconds = 0.85, mouth = ctx.createBiquadFilter(), g = ctx.createGain(), mix = ctx.createGain(), vib = ctx.createOscillator(), vibDepth = ctx.createGain();
      const pitch: [number, number][] = [[0, 300], [0.12, 360], [0.3, 480], [0.5, 450], [0.85, 290]];
      mouth.type = "lowpass"; mouth.Q.value = 1.4;
      mouth.frequency.setValueAtTime(420, t); mouth.frequency.linearRampToValueAtTime(700, t + 0.12); mouth.frequency.linearRampToValueAtTime(2400, t + 0.32);
      mouth.frequency.linearRampToValueAtTime(2000, t + 0.5); mouth.frequency.linearRampToValueAtTime(520, t + seconds);
      vib.frequency.value = 5; vibDepth.gain.value = 7; vib.connect(vibDepth);
      for (const [type, level] of [["sawtooth", 0.75], ["triangle", 0.5], ["square", 0.15]] as const) {
        const osc = ctx.createOscillator(), og = ctx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(pitch[0][1], t); for (const [at, f] of pitch.slice(1)) osc.frequency.linearRampToValueAtTime(f, t + at);
        vibDepth.connect(osc.frequency); og.gain.value = level; osc.connect(og).connect(mix); osc.start(t); osc.stop(t + seconds + 0.05);
      }
      // Breath through the throat, strongest in the growl and the hiss at the end.
      const air = noiseSource(ctx, seconds + 0.1), ag = ctx.createGain();
      ag.gain.setValueAtTime(0.35, t); ag.gain.linearRampToValueAtTime(0.18, t + 0.3); ag.gain.linearRampToValueAtTime(0.45, t + seconds);
      air.connect(ag).connect(mix); air.start(t); air.stop(t + seconds + 0.1);
      const direct = ctx.createGain(); direct.gain.value = 0.6; mix.connect(direct).connect(mouth);
      for (const [points, q, level] of [[[[0, 450], [0.3, 1100], [0.5, 1000], [0.85, 480]], 2, 1], [[[0, 1200], [0.3, 1800], [0.5, 1650], [0.85, 900]], 2.5, 0.45]] as const) {
        const band = ctx.createBiquadFilter(), bg = ctx.createGain();
        band.type = "bandpass"; band.Q.value = q; band.frequency.setValueAtTime(points[0][1], t); for (const [at, f] of points.slice(1)) band.frequency.linearRampToValueAtTime(f, t + at);
        bg.gain.value = level; mix.connect(band).connect(bg).connect(mouth);
      }
      // The rasp: the level rattles, hard in the growl, lighter as the mouth opens, then rough again as it closes.
      const rattle = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = 34; depth.gain.setValueAtTime(0.45, t); depth.gain.linearRampToValueAtTime(0.2, t + 0.35); depth.gain.linearRampToValueAtTime(0.4, t + seconds);
      rattle.gain.value = 0.6; lfo.connect(depth).connect(rattle.gain);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.05); g.gain.linearRampToValueAtTime(0.12, t + 0.3); g.gain.setValueAtTime(0.12, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      mouth.connect(rattle).connect(g); send(o, g, 0.2);
      for (const node of [vib, lfo]) { node.start(t); node.stop(t + seconds + 0.05); }
      break;
    }
    case "bark": {
      // Woof, woof: a full bark from the chest. The voice leaps up and falls away, with a low body resonance under the open "wo" of
      // the mouth, a rasp in the throat, a thump of the chest and a little room around it; the second bark a touch lower.
      for (const [at, lift] of [[0, 1], [0.34, 0.9]] as const) {
        voice(o, t + at, { seconds: 0.26, gain: 0.3, breath: 0.35, attack: 0.012, release: 0.14, rasp: 0.45, raspRate: 38, reverb: 0.3,
          pitch: [[0, 190 * lift], [0.04, 300 * lift], [0.26, 150 * lift]],
          formants: [{ f: [[0, 380], [0.26, 300]], q: 2, gain: 1 }, { f: [[0, 800], [0.06, 950], [0.26, 600]], q: 2.5, gain: 0.9 },
            { f: [[0, 1700], [0.26, 1400]], q: 3.5, gain: 0.45 }, { f: [[0, 2800], [0.26, 2500]], q: 5, gain: 0.15 }] });
        thud(o, t + at, 95 * lift, 0.15);
      }
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
      // Cock - a - doo - dle - doooo: four quick syllables climbing, each its own vowel, then the long, strained last note that rises,
      // wavers and falls away, all through a rasping, breathy throat.
      const syllables: [number, number, number, number, number, number][] = [
        // start, length, pitch from, pitch to, first formant, second formant
        [0, 0.1, 470, 520, 650, 1100],     // cock
        [0.13, 0.07, 560, 600, 850, 1400], // a
        [0.23, 0.14, 720, 780, 480, 950],  // doo
        [0.4, 0.09, 700, 690, 600, 1800],  // dle
      ];
      for (const [at, len, from, to, f1, f2] of syllables) voice(o, t + at, { seconds: len, gain: 0.4, breath: 0.35, attack: 0.012, release: len * 0.35,
        rasp: 0.45, raspRate: 85, reverb: 0.3, pitch: [[0, from], [len, to]],
        formants: [{ f: [[0, f1], [len, f1]], q: 4, gain: 1 }, { f: [[0, f2], [len, f2]], q: 5, gain: 0.55 }, { f: [[0, 2900], [len, 2900]], q: 6, gain: 0.15 }] });
      voice(o, t + 0.53, { seconds: 1.05, gain: 0.44, breath: 0.35, attack: 0.03, release: 0.35, rasp: 0.5, raspRate: 90, reverb: 0.35,
        pitch: [[0, 780], [0.2, 960], [0.45, 930], [0.6, 950], [0.85, 820], [1.05, 640]],
        formants: [{ f: [[0, 520], [0.3, 600], [1.05, 700]], q: 4, gain: 1 }, { f: [[0, 1000], [0.3, 1150], [1.05, 1300]], q: 5, gain: 0.55 }, { f: [[0, 2900], [1.05, 2700]], q: 6, gain: 0.15 }] });
      break;
    }
    case "caw": {
      // Ra! Ra!: harsh, noisy caws with a hard rattle in the throat, each dropping a little; sometimes a third.
      const caws = Math.random() < 0.35 ? 3 : 2;
      for (let k = 0; k < caws; k++) {
        const at = t + k * 0.3, drop = 1 - k * 0.04;
        voice(o, at, { seconds: 0.2, gain: 0.36, breath: 0.55, attack: 0.008, release: 0.08, rasp: 0.85, raspRate: 72, reverb: 0.25,
          pitch: [[0, 560 * drop], [0.05, 600 * drop], [0.2, 470 * drop]],
          formants: [{ f: [[0, 950], [0.2, 850]], q: 3, gain: 1 }, { f: [[0, 1650], [0.2, 1500]], q: 4, gain: 0.7 }, { f: [[0, 2800], [0.2, 2600]], q: 5, gain: 0.3 }] });
      }
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
      // A low, oscillating hum: a soft triangle-and-sawtooth drone around 150 Hz whose pitch and loudness swell and dip slowly as the
      // bee drifts about, through a mellow low-pass. Long, overlapping pieces fade in and out, so the hum runs on without seams.
      const seconds = 1, base = 140 + Math.random() * 30, lp = ctx.createBiquadFilter(), g = ctx.createGain(), wobble = ctx.createOscillator(), depth = ctx.createGain();
      const swell = ctx.createOscillator(), swellDepth = ctx.createGain(), level = ctx.createGain();
      lp.type = "lowpass"; lp.frequency.value = 850; lp.Q.value = 1.2;
      wobble.frequency.value = 3 + Math.random() * 2.5; depth.gain.value = base * 0.07;
      swell.frequency.value = 1.5 + Math.random(); swellDepth.gain.value = 0.35; level.gain.value = 0.65;
      swell.connect(swellDepth).connect(level.gain);
      for (const [type, ratio, amount] of [["triangle", 1, 0.7], ["sawtooth", 1.003, 0.3], ["triangle", 2, 0.15]] as const) {
        const osc = ctx.createOscillator(), og = ctx.createGain();
        osc.type = type; osc.frequency.value = base * ratio; og.gain.value = amount;
        wobble.connect(depth).connect(osc.frequency);
        osc.connect(og).connect(lp); osc.start(t); osc.stop(t + seconds + 0.05);
      }
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.11, t + 0.3); g.gain.setValueAtTime(0.11, t + seconds - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      lp.connect(level).connect(g); send(o, g, 0.05);
      for (const node of [wobble, swell]) { node.start(t); node.stop(t + seconds + 0.05); }
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
    case "wail": {
      // A shot animal cries out in its own voice: higher and more strained than its call, wavering, and falling away.
      const cry = (seconds: number, gain: number, pitch: [number, number][], formants: Voice["formants"], rasp: number, raspRate: number, breath = 0.3) =>
        voice(o, t, { seconds, gain, breath, attack: 0.01, release: seconds * 0.4, rasp, raspRate, reverb: 0.35, pitch, formants });
      switch (options.species) {
        case "rabbit": // a thin, high scream
          cry(0.45, 0.16, [[0, 1100], [0.08, 1400], [0.45, 850]], [{ f: [[0, 1400], [0.45, 1100]], q: 4, gain: 1 }, { f: [[0, 3000], [0.45, 2600]], q: 5, gain: 0.4 }], 0.4, 60); break;
        case "deer": // a nasal bawl
          cry(0.55, 0.22, [[0, 420], [0.1, 520], [0.55, 330]], [{ f: [[0, 700], [0.55, 550]], q: 5, gain: 1 }, { f: [[0, 1600], [0.55, 1300]], q: 7, gain: 0.5 }], 0.5, 40); break;
        case "cow": // a wavering, pained moo, higher than its call
          cry(1.0, 0.3, [[0, 150], [0.2, 210], [0.45, 180], [0.7, 205], [1.0, 115]], [{ f: [[0, 450], [0.3, 650], [1.0, 400]], q: 4, gain: 1 }, { f: [[0, 900], [1.0, 800]], q: 5, gain: 0.5 }], 0.35, 9); break;
        case "pig": // a shrill squeal
          cry(0.6, 0.2, [[0, 700], [0.1, 1150], [0.35, 1000], [0.6, 650]], [{ f: [[0, 1200], [0.6, 1000]], q: 5, gain: 1 }, { f: [[0, 2600], [0.6, 2300]], q: 7, gain: 0.5 }], 0.6, 55, 0.35); break;
        case "ostrich": // a rough honk and a hiss
          cry(0.5, 0.28, [[0, 260], [0.1, 320], [0.5, 180]], [{ f: [[0, 600], [0.5, 450]], q: 3, gain: 1 }, { f: [[0, 1300], [0.5, 1100]], q: 4, gain: 0.4 }], 0.7, 30, 0.45);
          noiseBand(o, t + 0.35, 0.5, "highpass", 3000, 4500, 0.7, 0.07, 0.03, 0.1); break;
        case "snake": // a sharp, angry hiss
          noiseBand(o, t, 0.6, "highpass", 2800, 5500, 0.8, 0.16, 0.01, 0.15); noiseBand(o, t, 0.25, "bandpass", 4200, 3500, 2, 0.06, 0.005, 0.1); break;
        case "lion": // a pained snarl, shorter and higher than its roar
          cry(0.9, 0.4, [[0, 150], [0.15, 230], [0.9, 95]], [{ f: [[0, 600], [0.2, 900], [0.9, 500]], q: 3, gain: 1 }, { f: [[0, 1400], [0.9, 1100]], q: 4, gain: 0.5 }], 0.6, 28, 0.45); break;
        case "bear": // a deep bellow
          cry(0.95, 0.4, [[0, 110], [0.2, 175], [0.95, 80]], [{ f: [[0, 420], [0.3, 600], [0.95, 360]], q: 3, gain: 1 }, { f: [[0, 900], [0.95, 750]], q: 4, gain: 0.45 }], 0.7, 22, 0.4); break;
        case "dragon": // a shattering shriek
          cry(1.4, 0.4, [[0, 260], [0.25, 520], [0.6, 440], [1.4, 170]], [{ f: [[0, 800], [0.3, 1300], [1.4, 600]], q: 3, gain: 1 }, { f: [[0, 2200], [1.4, 1700]], q: 4, gain: 0.5 }], 0.55, 17, 0.5); break;
      }
      break;
    }
    // ----- The licence settlement show -----
    case "lock": {
      // A heavy clunk of the bolt, a metallic ring, and a chime one step up the scale for every word locked in.
      thud(o, t, 60, 0.35);
      noiseBand(o, t, 0.05, "bandpass", 1400, 900, 2, 0.14, 0.002, 0.1);
      for (const [f, level] of [[820, 0.03], [1330, 0.02]] as const) { const ring = ctx.createOscillator(), rg = ctx.createGain(); ring.type = "sine"; ring.frequency.value = f;
        rg.gain.setValueAtTime(level, t); rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); ring.connect(rg); send(o, rg, 0.4); ring.start(t); ring.stop(t + 0.55); }
      const note = FLIP_SCALE[Math.max(0, Math.min(FLIP_SCALE.length - 1, options.step ?? 0))] + 12, chime = ctx.createOscillator(), cg = ctx.createGain();
      chime.type = "sine"; chime.frequency.value = hz(note);
      cg.gain.setValueAtTime(0.0001, t + 0.08); cg.gain.exponentialRampToValueAtTime(0.07, t + 0.09); cg.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      chime.connect(cg); send(o, cg, 0.6); chime.start(t + 0.08); chime.stop(t + 1.25);
      break;
    }
    case "coins": {
      for (let k = 0; k < 9; k++) { const at = t + k * 0.05 + Math.random() * 0.03, ping = ctx.createOscillator(), pg = ctx.createGain(), f = 2800 + Math.random() * 2400;
        ping.type = "sine"; ping.frequency.value = f; pg.gain.setValueAtTime(0.0001, at); pg.gain.exponentialRampToValueAtTime(0.03, at + 0.003); pg.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
        ping.connect(pg); send(o, pg, 0.3); ping.start(at); ping.stop(at + 0.2); }
      for (const f of [2637, 3951]) { const bell = ctx.createOscillator(), bg = ctx.createGain(); bell.type = "sine"; bell.frequency.value = f;
        bg.gain.setValueAtTime(0.0001, t + 0.45); bg.gain.exponentialRampToValueAtTime(0.045, t + 0.46); bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.1); bell.connect(bg); send(o, bg, 0.4); bell.start(t + 0.45); bell.stop(t + 1.15); }
      break;
    }
    case "trophy": {
      for (const [f, level, ring] of [[1318.5, 0.07, 1.8], [1318.5 * 2.01, 0.03, 1.2], [1318.5 * 3.2, 0.015, 0.8]] as const) { const bell = ctx.createOscillator(), bg = ctx.createGain(); bell.type = "sine"; bell.frequency.value = f;
        bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(level, t + 0.005); bg.gain.exponentialRampToValueAtTime(0.0001, t + ring); bell.connect(bg); send(o, bg, 0.6); bell.start(t); bell.stop(t + ring + 0.05); }
      break;
    }
    case "vault": {
      // Gears grinding as the bolts draw back, steam hissing out, and a golden chord swelling as the door swings open.
      const grind = noiseBand(o, t, 1.1, "bandpass", 260, 420, 3, 0.16, 0.1, 0.2);
      const shake = ctx.createOscillator(), depth = ctx.createGain(); shake.frequency.value = 17; depth.gain.value = 0.08; shake.connect(depth).connect(grind.gain); shake.start(t); shake.stop(t + 1.1);
      noiseBand(o, t + 0.7, 1.3, "highpass", 3000, 5000, 0.7, 0.09, 0.2, 0.3);
      for (const note of [-12, -5, 0, 4, 7]) { const pad = ctx.createOscillator(), lp = ctx.createBiquadFilter(), pg = ctx.createGain();
        pad.type = "sawtooth"; pad.frequency.value = hz(note); lp.type = "lowpass"; lp.frequency.setValueAtTime(400, t + 1); lp.frequency.exponentialRampToValueAtTime(3200, t + 2.2);
        pg.gain.setValueAtTime(0.0001, t + 1); pg.gain.exponentialRampToValueAtTime(0.03, t + 1.6); pg.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
        pad.connect(lp).connect(pg); send(o, pg, 0.6); pad.start(t + 1); pad.stop(t + 2.65); }
      break;
    }
    case "tick": {
      noiseBand(o, t, 0.02, "highpass", 3500, 4000, 1, 0.06, 0.001, 0);
      woodBlock(o, t, 1500, 0.05);
      break;
    }
    case "drumroll": {
      // A snare roll, quick strokes growing from soft to loud over the spin.
      const seconds = 4.6;
      for (let at = 0, k = 0; at < seconds; at += 0.034 + Math.random() * 0.006, k++) {
        const level = 0.012 + 0.05 * (at / seconds) ** 1.5 * (k % 2 ? 0.8 : 1);
        noiseBand(o, t + at, 0.05, "bandpass", 2600, 2200, 1.2, level, 0.002, 0.2);
      }
      break;
    }
    case "land": {
      trumpet(o, t, hz(-12), 0.35, 0.06); trumpet(o, t, hz(-5), 0.35, 0.05); trumpet(o, t, hz(0), 0.35, 0.05);
      thud(o, t, 70, 0.3);
      noiseBand(o, t, 1.4, "highpass", 5000, 7000, 0.7, 0.06, 0.003, 0.5);
      break;
    }
    case "tumbleweed": {
      // A lonely gust of wind, and a harmonica sighing down: nothing this time.
      noiseBand(o, t, 3.2, "bandpass", 400, 900, 3, 0.1, 1, 0.3);
      for (const [at, from, to, len] of [[0.4, 4, 4, 0.45], [0.9, 2, 2, 0.45], [1.4, 0, -2, 1.4]] as const)
        voice(o, t + at, { seconds: len, gain: 0.12, wave: "square", breath: 0.35, attack: 0.04, release: len * 0.5, pitch: [[0, hz(from)], [len, hz(to)]],
          formants: [{ f: [[0, 900], [len, 800]], q: 3, gain: 1 }, { f: [[0, 2000], [len, 1800]], q: 4, gain: 0.4 }], reverb: 0.4 });
      break;
    }
    case "sparks": {
      for (let k = 0; k < 14; k++) noiseBand(o, t + Math.random() * 0.5, 0.02, "highpass", 4000 + Math.random() * 3000, 6000, 1, 0.04, 0.001, 0.1);
      strum(o, t + 0.05, [-12, -5, 0, 4, 7], 0.1, 0.012, 1.2);
      break;
    }
    case "fireworks": {
      // A rocket whistling up, then the burst: a crack, a boom and a crackling tail.
      const rocket = ctx.createOscillator(), rg = ctx.createGain();
      rocket.type = "sine"; rocket.frequency.setValueAtTime(700, t); rocket.frequency.exponentialRampToValueAtTime(2600, t + 0.6);
      rg.gain.setValueAtTime(0.0001, t); rg.gain.exponentialRampToValueAtTime(0.03, t + 0.1); rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
      rocket.connect(rg); send(o, rg, 0.2); rocket.start(t); rocket.stop(t + 0.65);
      noiseBand(o, t + 0.62, 0.3, "lowpass", 3000, 600, 0.7, 0.25, 0.003, 0.5);
      thud(o, t + 0.62, 55, 0.3);
      for (let k = 0; k < 16; k++) noiseBand(o, t + 0.75 + Math.random() * 1.1, 0.015, "highpass", 5000, 7000, 1, 0.025, 0.001, 0.2);
      break;
    }
    case "fanfare": {
      // The mariachi flourish, a bright bell ringing out over it.
      const phrase: [number, number, number, number][] = [[0, -8, 0, 0.12], [4, -5, 0.13, 0.12], [7, 0, 0.26, 0.12], [12, 4, 0.39, 0.3], [7, 0, 0.72, 0.12], [12, 4, 0.85, 0.9]];
      for (const [lead, second, at, len] of phrase) { trumpet(o, t + at, hz(lead), len, 0.08); trumpet(o, t + at, hz(second), len, 0.05); }
      strum(o, t + 0.85, [-24, -17, -12, -8, -5, 0], 0.13, 0.02, 2);
      for (const f of [2637, 3951, 5274]) { const bell = ctx.createOscillator(), bg = ctx.createGain(); bell.type = "sine"; bell.frequency.value = f;
        bg.gain.setValueAtTime(0.0001, t + 0.85); bg.gain.exponentialRampToValueAtTime(0.03, t + 0.86); bg.gain.exponentialRampToValueAtTime(0.0001, t + 2.4); bell.connect(bg); send(o, bg, 0.5); bell.start(t + 0.85); bell.stop(t + 2.45); }
      break;
    }
    case "flip": {
      // A computer bleep: a plain square wave with a soft sine under it, on for a moment and off, square-edged like an old terminal's
      // beep, dry. Its note is the chain's size on the scale (`step`), an octave up, so it rises only when the chain grows and
      // otherwise repeats the last note.
      const note = FLIP_SCALE[Math.max(0, Math.min(FLIP_SCALE.length - 1, options.step ?? 0))] + 12, freq = hz(note);
      const lp = ctx.createBiquadFilter(), g = ctx.createGain(), length = 0.07;
      lp.type = "lowpass"; lp.frequency.value = 3000; lp.Q.value = 0.7;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.055, t + 0.003); g.gain.setValueAtTime(0.055, t + length - 0.006); g.gain.linearRampToValueAtTime(0, t + length);
      lp.connect(g); send(o, g, 0);
      for (const [type, level] of [["square", 0.35], ["sine", 0.8]] as const) {
        const osc = ctx.createOscillator(), og = ctx.createGain();
        osc.type = type; osc.frequency.value = freq; og.gain.value = level;
        osc.connect(og).connect(lp); osc.start(t); osc.stop(t + length + 0.01);
      }
      break;
    }
    case "smash": {
      const heavy = options.heavy ?? false;
      switch (options.species) {
        case "alarm": {
          // The Tamper Alarm: a clanging bell struck hard, ringing; broken, it rattles and dies away.
          for (const [f, level] of [[1480, 0.07], [1480 * 2.76, 0.03], [1480 * 5.4, 0.015]] as const) { const bell = ctx.createOscillator(), bg = ctx.createGain(); bell.type = "sine"; bell.frequency.value = f;
            bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(level, t + 0.003); bg.gain.exponentialRampToValueAtTime(0.0001, t + (heavy ? 0.5 : 1)); bell.connect(bg); send(o, bg, 0.4); bell.start(t); bell.stop(t + 1.05); }
          noiseBand(o, t, 0.04, "highpass", 3000, 4000, 1, 0.1, 0.001, 0.1);
          if (heavy) for (let k = 0; k < 8; k++) woodBlock(o, t + 0.25 + k * 0.06 * (1 + k * 0.15), 2400 - k * 150, 0.05 * (1 - k / 9));
          break;
        }
        case "validator": {
          // The Validator: an electric "denied" buzz with a zap; broken, its power whines down to nothing.
          const buzz = ctx.createOscillator(), bg = ctx.createGain(), lp = ctx.createBiquadFilter(); buzz.type = "square"; buzz.frequency.setValueAtTime(heavy ? 240 : 150, t);
          if (heavy) buzz.frequency.exponentialRampToValueAtTime(40, t + 0.9);
          lp.type = "lowpass"; lp.frequency.value = 1800; bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(0.07, t + 0.01); bg.gain.setValueAtTime(0.07, t + (heavy ? 0.6 : 0.18)); bg.gain.exponentialRampToValueAtTime(0.0001, t + (heavy ? 0.95 : 0.25));
          buzz.connect(lp).connect(bg); send(o, bg, 0.15); buzz.start(t); buzz.stop(t + 1);
          const zap = ctx.createOscillator(), zg = ctx.createGain(); zap.type = "sawtooth"; zap.frequency.setValueAtTime(2400, t); zap.frequency.exponentialRampToValueAtTime(300, t + 0.12);
          zg.gain.setValueAtTime(0.05, t); zg.gain.exponentialRampToValueAtTime(0.0001, t + 0.13); zap.connect(zg); send(o, zg, 0.2); zap.start(t); zap.stop(t + 0.14);
          break;
        }
        case "whale": {
          // The Whale: a humpback's call heard through the water, a slow, hollow whoop that glides up and sags back; broken, a big
          // splash and a long song that climbs and falls away into the deep. A pure tone with a soft octave above it, a slow vibrato,
          // muffled by a low-pass and left ringing in the reverb.
          noiseBand(o, t, heavy ? 0.9 : 0.35, "lowpass", 2200, 400, 0.8, heavy ? 0.14 : 0.08, 0.01, 0.3);
          const at = t + (heavy ? 0.12 : 0.03), len = heavy ? 1.25 : 0.6;
          const glide: readonly (readonly [number, number])[] = heavy ? [[0, 120], [0.35, 420], [0.55, 380], [1.25, 80]] : [[0, 150], [0.35, 360], [0.6, 300]];
          const lp = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
          lp.type = "lowpass"; lp.frequency.value = 1100; lp.Q.value = 2;
          lfo.frequency.value = 4.5; depth.gain.value = 6; lfo.connect(depth);
          for (const [mult, wave, level] of [[1, "sine", 1], [2, "triangle", 0.3]] as const) {
            const osc = ctx.createOscillator(), og = ctx.createGain(); osc.type = wave; og.gain.value = level;
            osc.frequency.setValueAtTime(glide[0][1] * mult, at); for (const [when, hz] of glide.slice(1)) osc.frequency.exponentialRampToValueAtTime(hz * mult, at + when);
            depth.connect(osc.frequency); osc.connect(og).connect(lp); osc.start(at); osc.stop(at + len + 0.05);
          }
          const peak = heavy ? 0.22 : 0.2;
          g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + 0.12);
          g.gain.setValueAtTime(peak, at + len * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
          lp.connect(g); send(o, g, 0.7); lfo.start(at); lfo.stop(at + len + 0.05);
          break;
        }
        case "chip": {
          // The Secure Chip: an electric crackle as the silicon cracks; broken, it shatters in a shower of sparks.
          for (let k = 0; k < (heavy ? 22 : 12); k++) noiseBand(o, t + Math.random() * (heavy ? 0.5 : 0.15), 0.012, "highpass", 5000, 7000, 1, heavy ? 0.07 : 0.09, 0.001, 0.2);
          const arc = ctx.createOscillator(), ag = ctx.createGain(); arc.type = "sawtooth"; arc.frequency.setValueAtTime(90, t); arc.frequency.linearRampToValueAtTime(70, t + 0.2);
          ag.gain.setValueAtTime(0.09, t); ag.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); arc.connect(ag); send(o, ag, 0.1); arc.start(t); arc.stop(t + 0.25);
          if (heavy) for (let k = 0; k < 10; k++) { const shard = ctx.createOscillator(), sg = ctx.createGain(), at = t + 0.03 + Math.random() * 0.25; shard.type = "sine"; shard.frequency.value = 3500 + Math.random() * 4000;
            sg.gain.setValueAtTime(0.0001, at); sg.gain.exponentialRampToValueAtTime(0.03, at + 0.002); sg.gain.exponentialRampToValueAtTime(0.0001, at + 0.3); shard.connect(sg); send(o, sg, 0.4); shard.start(at); shard.stop(at + 0.32); }
          break;
        }
        default: {
          // The Firewall (and any other): demolishing brickwork.
          smashBrick(o, t, heavy);
        }
      }
      break;
    }
    case "blast": {
      switch (options.species) {
        case "bomb": {
          // A Difficulty Bomb: a deep boom, a blast of air and debris raining down.
          thud(o, t, 42, 0.6); thud(o, t + 0.02, 70, 0.35);
          noiseBand(o, t, 0.9, "lowpass", 2500, 200, 0.7, 0.3, 0.004, 0.5);
          for (let k = 0; k < 14; k++) noiseBand(o, t + 0.2 + Math.random() * 0.9, 0.03, "bandpass", 1500 + Math.random() * 2000, 1200, 2, 0.03, 0.002, 0.2);
          break;
        }
        case "reentrancy": {
          // A Reentrancy Attack: the contract calls back into you: a zap, then a digital loop that echoes and re-enters itself,
          // each call quicker and fainter.
          const zap = ctx.createOscillator(), zg = ctx.createGain(); zap.type = "square"; zap.frequency.setValueAtTime(1800, t); zap.frequency.exponentialRampToValueAtTime(220, t + 0.15);
          zg.gain.setValueAtTime(0.13, t); zg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); zap.connect(zg); send(o, zg, 0.2); zap.start(t); zap.stop(t + 0.17);
          for (let k = 0, at = 0.16; k < 7; k++, at += 0.14 * 0.85 ** k) {
            const call = ctx.createOscillator(), cg = ctx.createGain(); call.type = "square"; call.frequency.setValueAtTime(880, t + at); call.frequency.exponentialRampToValueAtTime(440, t + at + 0.08);
            cg.gain.setValueAtTime(0.0001, t + at); cg.gain.exponentialRampToValueAtTime(0.1 * 0.8 ** k, t + at + 0.004); cg.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.09);
            call.connect(cg); send(o, cg, 0.35); call.start(t + at); call.stop(t + at + 0.1);
          }
          break;
        }
        case "fork": {
          // A Hard Fork: a ripping crack as the chain splits, two tones gliding apart.
          noiseBand(o, t, 0.25, "highpass", 1500, 6000, 0.8, 0.14, 0.004, 0.3); thud(o, t, 60, 0.3);
          for (const [to] of [[1400], [300]] as const) { const tone = ctx.createOscillator(), tg = ctx.createGain(); tone.type = "triangle"; tone.frequency.setValueAtTime(650, t + 0.05); tone.frequency.exponentialRampToValueAtTime(to, t + 0.7);
            tg.gain.setValueAtTime(0.0001, t + 0.05); tg.gain.exponentialRampToValueAtTime(0.06, t + 0.08); tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.75); tone.connect(tg); send(o, tg, 0.4); tone.start(t + 0.05); tone.stop(t + 0.8); }
          break;
        }
        case "gasspike": {
          // A Gas Spike: pressure hissing and rising into a whoosh.
          noiseBand(o, t, 1.1, "bandpass", 500, 5000, 2, 0.24, 0.6, 0.3);
          break;
        }
      }
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
    case "step": {
      // A soft, light step: mostly a gentle low thud of the foot landing, with only a hush of the ground under it (no gritty scuff).
      const tone = 0.9 + Math.random() * 0.2;
      thud(o, t, 95 * tone, 0.06);
      noiseBand(o, t, 0.05, "lowpass", 420 * tone, 220 * tone, 0.7, 0.03, 0.006, 0);
      break;
    }
    case "down": {
      // A small victory: a quick trumpet "ta-da!" (E5 to A5, a second trumpet a sixth below) over a bright strummed A chord.
      trumpet(o, t, hz(7), 0.12, 0.05); trumpet(o, t, hz(-2), 0.12, 0.03);
      trumpet(o, t + 0.14, hz(12), 0.55, 0.055); trumpet(o, t + 0.14, hz(4), 0.55, 0.035);
      strum(o, t + 0.14, [-24, -17, -12, -8, -5, 0], 0.08, 0.015, 1.3);
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
      // An ominous discovery, "ta-da-daaa": two short, low brass stabs on A with a timpani thump, then a big dark chord held (Bb, Db
      // and E, a diminished menace) in brass and tremolo strings, a timpani hit under it and a cymbal swelling up behind.
      const stab = (at: number, notes: readonly number[], len: number, level: number) => {
        for (const note of notes) trumpet(o, t + at, hz(note), len, level);
        const low = ctx.createOscillator(), lg = ctx.createGain(), lp = ctx.createBiquadFilter();
        low.type = "sawtooth"; low.frequency.value = hz(notes[0] - 12); lp.type = "lowpass"; lp.frequency.value = 500;
        lg.gain.setValueAtTime(0.0001, t + at); lg.gain.exponentialRampToValueAtTime(level * 1.4, t + at + 0.02); lg.gain.setValueAtTime(level * 1.2, t + at + len - 0.1); lg.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
        low.connect(lp).connect(lg); send(o, lg, 0.5); low.start(t + at); low.stop(t + at + len + 0.05);
      };
      const timpani = (at: number, note: number, level: number) => {
        const drum = ctx.createOscillator(), dg = ctx.createGain();
        drum.type = "sine"; drum.frequency.setValueAtTime(hz(note) * 1.25, t + at); drum.frequency.exponentialRampToValueAtTime(hz(note), t + at + 0.08);
        dg.gain.setValueAtTime(0.0001, t + at); dg.gain.exponentialRampToValueAtTime(level, t + at + 0.006); dg.gain.exponentialRampToValueAtTime(0.0001, t + at + 1.4);
        drum.connect(dg); send(o, dg, 0.5); drum.start(t + at); drum.stop(t + at + 1.5);
        thud(o, t + at, hz(note), level * 0.8);
      };
      stab(0, [-12, -24 + 12], 0.16, 0.039); timpani(0, -36, 0.14);
      stab(0.24, [-12, -24 + 12], 0.16, 0.039); timpani(0.24, -36, 0.13);
      stab(0.52, [-11, -8, -5], 1.9, 0.035); timpani(0.52, -35, 0.18);
      for (let k = 0; k < 18; k++) strum(o, t + 0.55 + k * 0.08, [-23, -20, -17], 0.025 * (1 - k / 22), 0.004, 0.3);
      noiseBand(o, t + 0.1, 0.9, "highpass", 4000, 7000, 0.7, 0.028, 0.8, 0.6);
      break;
    }
    case "wipe": {
      // The stinger: a whip crack, the falling "wah-wah" whistle, and an A-minor chord trembling on the strings.
      whip(o, t, 0.38);
      whistle(o, t + 0.12, hz(12), hz(7), 0.5, 0.12);   // A5 down to E5
      whistle(o, t + 0.66, hz(7), hz(0), 0.75, 0.12);   // E5 down to A4
      const chord = [-24, -17, -12, -9, -5]; // A2 E3 A3 C4 E4
      for (let k = 0; k < 10; k++) strum(o, t + 0.2 + k * 0.11, chord, 0.09 * (1 - k * 0.07), 0.006, 0.5);
      pluck(o, t + 1.3, hz(-24), 0.32, 2.2, 0.998, 0.6); // the low A left ringing
      break;
    }
    case "win": {
      // A mariachi flourish in A major, then a strummed A chord with the trumpets holding its top.
      // Two trumpets in sixths, the mariachi way: A-C#-E-A over C#-E-A-C#.
      const phrase: [number, number, number, number][] = [[0, -8, 0, 0.12], [4, -5, 0.13, 0.12], [7, 0, 0.26, 0.12], [12, 4, 0.39, 0.55]];
      for (const [lead, second, at, len] of phrase) { trumpet(o, t + at, hz(lead), len, 0.08); trumpet(o, t + at, hz(second), len, 0.05); }
      strum(o, t + 0.39, [-24, -17, -12, -8, -5, 0], 0.14, 0.02, 2.2); // A2 E3 A3 C#4 E4 A4
      trumpet(o, t + 0.95, hz(7), 0.6, 0.063); trumpet(o, t + 0.95, hz(12), 0.6, 0.075);
      break;
    }
  }
}
/** How long each cue rings, in seconds (for rendering previews). */
export const CUE_SECONDS: Readonly<Record<SoundId, number>> = {
  meow: 1, caw: 1.1, bark: 0.85, moo: 1.8, oink: 0.8, crow: 1.7, cluck: 1.2, chirp: 0.7, ribbit: 0.6, snort: 0.4, thump: 0.6, boom: 2.2, hiss: 1.2,
  slither: 0.6, flutter: 0.5, buzz: 1.1, roar: 2.2, growl: 1.4, yip: 0.6, dragon: 2.6, wail: 1.6, blast: 1.8, lock: 1.4, coins: 1.2, trophy: 2, vault: 2.6, tick: 0.08, drumroll: 4.8, land: 1.6, tumbleweed: 3.4, sparks: 1.4, fireworks: 2.2, fanfare: 3, laser: 1.3, hoof: 0.5, flip: 0.15, step: 0.15, bump: 0.45, showdown: 4.6, down: 1.6, smash: 1.4, strike: 1.3, twist: 3, wipe: 3.6, win: 2.9 };

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

// ---------------------------------------------------------------------------------------------------------------------------
// Music: "Lonesome Trail", the country's ambience
// ---------------------------------------------------------------------------------------------------------------------------

/** 66 beats a minute, four to a bar; the Western cadence Am - G - F - E, one chord a bar, as [root, chord tones] in semitones from A4. */
const MUSIC_BEAT = 60 / 66, MUSIC_BAR = MUSIC_BEAT * 4;
const MUSIC_CHORDS: readonly (readonly [number, readonly number[]])[] = [
  [-24, [-12, -5, 0, 3]],   // Am: A2 | A3 E4 A4 C5
  [-26, [-14, -7, -2, 2]],  // G:  G2 | G3 D4 G4 B4
  [-28, [-16, -9, -4, 0]],  // F:  F2 | F3 C4 F4 A4
  [-29, [-17, -8, -5, -1]], // E:  E2 | E3 G#3 B3 E4 (the major chord that pulls back home)
];
/** Arpeggio patterns: [beat, which chord tone], sparse so the country stays audible; one is picked for each pass. */
const MUSIC_PATTERNS: readonly (readonly [number, number][])[] = [
  [[0, 0], [1, 1], [1.5, 2], [2, 3], [3, 2]],
  [[0, 0], [0.5, 1], [1.5, 2], [2.5, 1], [3, 3]],
  [[0, 0], [1, 2], [2, 1], [2.5, 3], [3.5, 2]],
  [[0, 0], [1.5, 1], [2, 2], [3, 3]],
];
/** Whistled phrases over a pass, now and then: [bar, beat, note, beats long] (semitones from A4), clean separate notes that each
 * belong to their bar's chord or the A-minor scale (no slides between them). */
const MUSIC_WHISTLES: readonly (readonly [number, number, number, number][])[] = [
  [[0, 1, 7, 2], [0, 3, 5, 0.5], [0, 3.5, 3, 0.5], [1, 1, 2, 2.5], [2, 1, 0, 1.5], [2, 3, 3, 1], [3, 0, -1, 3]],
  [[0, 2, 12, 1.5], [1, 0, 10, 1], [1, 1, 7, 1.5], [2, 0, 8, 1], [2, 1, 3, 1.5], [3, 0, 7, 1], [3, 1, 2, 2.5]],
];
/** Schedule one bar of the ambience at time `t`: `bar` 0-3 in the cadence, `pass` counts the loops. */
function scheduleMusicBar(o: Out, t: number, bar: number, pass: number, pattern: number) {
  const { ctx } = o, [root, tones] = MUSIC_CHORDS[bar];
  // A soft drone on the root, a faint pad of the chord, and the guitar picking through it.
  const drone = ctx.createOscillator(), dg = ctx.createGain();
  drone.type = "sine"; drone.frequency.value = hz(root);
  dg.gain.setValueAtTime(0.0001, t); dg.gain.exponentialRampToValueAtTime(0.06, t + 0.6); dg.gain.setValueAtTime(0.06, t + MUSIC_BAR - 0.5); dg.gain.exponentialRampToValueAtTime(0.0001, t + MUSIC_BAR + 0.4);
  drone.connect(dg); send(o, dg, 0.3); drone.start(t); drone.stop(t + MUSIC_BAR + 0.5);
  for (const tone of tones.slice(0, 3)) {
    const pad = ctx.createOscillator(), lp = ctx.createBiquadFilter(), pg = ctx.createGain();
    pad.type = "sawtooth"; pad.frequency.value = hz(tone); pad.detune.value = (Math.random() - 0.5) * 12;
    lp.type = "lowpass"; lp.frequency.value = 700;
    pg.gain.setValueAtTime(0.0001, t); pg.gain.exponentialRampToValueAtTime(0.012, t + 1.2); pg.gain.setValueAtTime(0.012, t + MUSIC_BAR - 0.8); pg.gain.exponentialRampToValueAtTime(0.0001, t + MUSIC_BAR + 0.6);
    pad.connect(lp).connect(pg); send(o, pg, 0.6); pad.start(t); pad.stop(t + MUSIC_BAR + 0.7);
  }
  pluck(o, t, hz(root + 12), 0.16, 3, 0.997, 0.7);
  for (const [beat, which] of MUSIC_PATTERNS[pattern]) {
    const human = (Math.random() - 0.5) * 0.02;
    pluck(o, t + beat * MUSIC_BEAT + human, hz(tones[which]), 0.09 + Math.random() * 0.03, 2.4, 0.997, 0.7);
  }
  // Every third pass a distant whistle sings a phrase over the cadence; every fourth, a bell tolls far off at the top of it.
  if (pass % 3 === 2) for (const [atBar, beat, note, beats] of MUSIC_WHISTLES[Math.floor(pass / 3) % MUSIC_WHISTLES.length])
    if (atBar === bar) whistle(o, t + beat * MUSIC_BEAT, hz(note), hz(note), beats * MUSIC_BEAT * 0.95, 0.05);
  if (pass % 4 === 3 && bar === 0) for (const [f, level, ring] of [[hz(-24), 0.04, 3.5], [hz(-24) * 2.4, 0.02, 2.5]] as const) {
    const bell = ctx.createOscillator(), bg = ctx.createGain();
    bell.type = "sine"; bell.frequency.value = f;
    bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(level, t + 0.02); bg.gain.exponentialRampToValueAtTime(0.0001, t + ring);
    bell.connect(bg); send(o, bg, 0.9); bell.start(t); bell.stop(t + ring + 0.1);
  }
}
/** "Trail Gallop", the riding music: the same cadence at 112 beats a minute, a bass on the beat, short damped strums on the
 * off-beats, a galloping shaker, and now and then a trumpet line. */
const RIDE_BEAT = 60 / 112, RIDE_BAR = RIDE_BEAT * 4;
/** The trumpet line over a riding pass: [bar, beat, note, beats long], semitones from A4. */
const RIDE_RIFF: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 0, 0.5], [0, 0.5, 3, 0.5], [0, 1, 7, 1.5], [1, 0, 5, 0.5], [1, 0.5, 2, 1.5], [2, 0, 3, 0.5], [2, 0.5, 0, 1.5],
  [3, 0, -1, 0.5], [3, 0.5, 2, 0.5], [3, 1, 7, 2],
];
function scheduleRideBar(o: Out, t: number, bar: number, pass: number) {
  const [root, tones] = MUSIC_CHORDS[bar], beat = RIDE_BEAT;
  // Bass: the root on beats 1 and 3, the fifth on 2 and 4, picked short.
  for (const [at, note] of [[0, root + 12], [1, root + 19], [2, root + 12], [3, root + 19]] as const) pluck(o, t + at * beat, hz(note), 0.2, 0.5, 0.985, 0.2);
  // Damped strums on the off-beats and a push into the next bar.
  for (const at of [0.5, 1.5, 2.5, 3.5, 3.75]) strum(o, t + at * beat, tones.slice(1, 4), at === 3.75 ? 0.05 : 0.08, 0.008, 0.22);
  // The galloping shaker: ta-ta-TA on every beat.
  for (let k = 0; k < 4; k++) for (const [sub, level] of [[0, 0.03], [1 / 3, 0.02], [2 / 3, 0.045]] as const)
    noiseBand(o, t + (k + sub) * beat, 0.05, "highpass", 5000, 7000, 0.8, level, 0.002, 0.05);
  // Every other pass, a trumpet line over it.
  if (pass % 2 === 1) for (const [atBar, at, note, beats] of RIDE_RIFF) if (atBar === bar) trumpet(o, t + at * beat, hz(note), beats * beat * 0.9, 0.05);
}
/** "The Standoff", while an outlaw is near: ominous and panicky, a toreador's standoff at 112 beats a minute over Am - Bb - Am - E
 * (the half-step up to Bb the menace, Phrygian and Spanish). A trembling tremolo guitar, a racing heartbeat, a dark drone, castanets
 * rattling into every beat and flamenco strums on 1 and 3; a toreador's trumpet call every other pass, the low whistle now and then,
 * and a bell tolling at the end of each. */
const STANDOFF_BEAT = 60 / 112, STANDOFF_BAR = STANDOFF_BEAT * 4;
const STANDOFF_CHORDS: readonly (readonly [number, readonly number[]])[] = [
  [-24, [-12, -9, -5, 0]],  // Am: A2 | A3 C4 E4 A4
  [-23, [-11, -7, -4, 1]],  // Bb: Bb2 | Bb3 D4 F4 Bb4
  [-24, [-12, -9, -5, 0]],  // Am
  [-29, [-17, -13, -10, -5]], // E: E2 | E3 G#3 B3 E4
];
/** The whistle over a standoff pass: [bar, beat, note, beats long], leaning on the half-step. */
const STANDOFF_WHISTLE: readonly (readonly [number, number, number, number])[] = [[0, 0, 7, 3.5], [1, 0, 8, 3.5], [2, 0, 7, 2], [2, 2, 3, 1.5], [3, 0, -1, 3.5]];
/** The toreador's trumpet call over a standoff pass: [bar, beat, note, beats long], a bullfight fanfare in the Phrygian mode. */
const STANDOFF_TRUMPET: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 7, 0.75], [0, 0.75, 7, 0.25], [0, 1, 12, 1], [0, 2, 10, 0.5], [0, 2.5, 8, 0.5], [0, 3, 7, 1],
  [1, 0, 8, 0.75], [1, 0.75, 5, 0.25], [1, 1, 8, 1], [1, 2, 13, 2],
  [2, 0, 7, 0.75], [2, 0.75, 3, 0.25], [2, 1, 7, 1], [2, 2, 5, 0.5], [2, 2.5, 3, 0.5], [2, 3, 2, 1],
  [3, 0, -1, 1.5], [3, 1.5, 2, 0.5], [3, 2, 7, 2],
];
/** A snare drum: a burst of bright rattling noise over a short, dropping tone from the drum head. */
function snare(o: Out, t: number, gain: number) {
  noiseBand(o, t, 0.13, "bandpass", 2400, 1600, 0.7, gain, 0.001, 0.2);
  const { ctx } = o, head = ctx.createOscillator(), g = ctx.createGain();
  head.type = "triangle"; head.frequency.setValueAtTime(230, t); head.frequency.exponentialRampToValueAtTime(170, t + 0.05);
  g.gain.setValueAtTime(gain * 0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  head.connect(g); send(o, g, 0.1); head.start(t); head.stop(t + 0.08);
}
/** A floor tom: a boomy, dropping tone that rings a little longer than a thud, with a slap of noise on top. */
function tom(o: Out, t: number, freq: number, gain: number) {
  const { ctx } = o, osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = "sine"; osc.frequency.setValueAtTime(freq * 1.5, t); osc.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  osc.connect(g); send(o, g, 0.15); osc.start(t); osc.stop(t + 0.32);
  noiseBand(o, t, 0.03, "lowpass", 1400, 600, 0.7, gain * 0.35, 0.001, 0.05);
}
function scheduleStandoffBar(o: Out, t: number, bar: number, pass: number) {
  const { ctx } = o, [root, tones] = STANDOFF_CHORDS[bar], beat = STANDOFF_BEAT;
  // The dark drone on the root, and the bass struck at the top of the bar.
  const drone = ctx.createOscillator(), dg = ctx.createGain();
  drone.type = "triangle"; drone.frequency.value = hz(root);
  dg.gain.setValueAtTime(0.0001, t); dg.gain.exponentialRampToValueAtTime(0.07, t + 0.3); dg.gain.setValueAtTime(0.07, t + STANDOFF_BAR - 0.3); dg.gain.exponentialRampToValueAtTime(0.0001, t + STANDOFF_BAR + 0.3);
  drone.connect(dg); send(o, dg, 0.3); drone.start(t); drone.stop(t + STANDOFF_BAR + 0.4);
  pluck(o, t, hz(root + 12), 0.2, 2.2, 0.996, 0.5);
  // The heartbeat: lub-dub on beats 1 and 3.
  for (const at of [0, 2]) { thud(o, t + at * beat, 52, 0.26); thud(o, t + (at + 0.32) * beat, 48, 0.17); }
  // The tremolo: the chord's tones picked fast and soft, sixteenths, rising and falling through the chord.
  const order = [1, 2, 3, 2];
  for (let k = 0; k < 16; k++) pluck(o, t + k * beat / 4, hz(tones[order[k % 4]]), 0.035 + (k % 4 === 0 ? 0.015 : 0), 0.35, 0.99, 0.5);
  // The toreador: castanets rattling "tr-r-RA" into every beat, and flamenco strums rolled hard on beats 1 and 3.
  for (let k = 0; k < 4; k++) {
    for (const [sub, level] of [[-0.25, 0.018], [-0.17, 0.02], [-0.09, 0.024], [0, 0.04]] as const) if (k + sub >= 0) {
      noiseBand(o, t + (k + sub) * beat, 0.018, "bandpass", 3200, 2800, 3, level, 0.001, 0.1); woodBlock(o, t + (k + sub) * beat, 1900, level * 0.8);
    }
  }
  for (const at of [0, 2]) { strum(o, t + at * beat, [root + 12, ...tones], 0.06, 0.011, 0.5); strum(o, t + (at + 0.5) * beat, [...tones].reverse(), 0.035, 0.009, 0.35); }
  // Every other pass the toreador's trumpet calls out; on the others the low, uneasy whistle.
  if (pass % 2 === 1) for (const [atBar, at, note, beats] of STANDOFF_TRUMPET) { if (atBar === bar) { trumpet(o, t + at * beat, hz(note), beats * beat * 0.9, 0.05); trumpet(o, t + at * beat, hz(note - 12), beats * beat * 0.9, 0.025); } }
  else if (pass % 4 === 2) for (const [atBar, at, note, beats] of STANDOFF_WHISTLE) if (atBar === bar) whistle(o, t + at * beat, hz(note), hz(note), beats * beat * 0.95, 0.045);
  // The drums, driving it on: toms pounding the eighths (low on the beat, higher off it, the offbeat before 2 and 4 pushed), the
  // snare cracking on 2 and 4 with ghost notes skittering between; the last bar ends in a snare roll that swells into a crash,
  // louder with every pass.
  for (let k = 0; k < 8; k++) tom(o, t + k * beat / 2, k % 2 ? 110 : 82, k % 2 ? (k === 1 || k === 5 ? 0.17 : 0.1) : 0.21);
  for (const at of [1, 3]) snare(o, t + at * beat, 0.14);
  for (const at of [0.75, 1.5, 2.25, 2.75, 3.5]) if (bar !== 3 || at < 2) snare(o, t + at * beat, 0.025);
  if (bar === 3) {
    const swell = Math.min(1, 0.6 + 0.2 * (pass % 3));
    for (let k = 0; k < 16; k++) snare(o, t + (2 + k / 8) * beat, (0.02 + 0.07 * k / 15) * swell);
    noiseBand(o, t + 4 * beat, 1.2, "highpass", 6000, 3500, 0.5, 0.07 * swell, 0.003, 0.5);
  }
  if (bar === 3) for (const [f, level, ring] of [[hz(-24), 0.035, 3.5], [hz(-24) * 2.4, 0.018, 2.5]] as const) {
    const bell = ctx.createOscillator(), bg = ctx.createGain(), at = t + 2 * beat;
    bell.type = "sine"; bell.frequency.value = f;
    bg.gain.setValueAtTime(0.0001, at); bg.gain.exponentialRampToValueAtTime(level, at + 0.02); bg.gain.exponentialRampToValueAtTime(0.0001, at + ring);
    bell.connect(bg); send(o, bg, 0.9); bell.start(at); bell.stop(at + ring + 0.1);
  }
}
/** "Trace", the hacking game's music: digital and slightly anxious, at 104 beats a minute over Am - F - Dm - E. A pulse-wave
 * arpeggio streams through each chord in sixteenths, a sub-bass pulses on the eighths, a soft tick keeps time like the trace
 * counting, a faintly detuned pad sits uneasily under it, little glitch blips flicker at random, and every fourth bar a rising
 * filter sweep builds. */
const HACK_BEAT = 60 / 104, HACK_BAR = HACK_BEAT * 4;
const HACK_CHORDS: readonly (readonly [number, readonly number[]])[] = [
  [-24, [0, 3, 7, 12]],  // Am: A4 C5 E5 A5 over A2
  [-28, [-4, 0, 3, 8]],  // F:  F4 A4 C5 F5 over F2
  [-31, [-7, -4, 0, 5]], // Dm: D4 F4 A4 D5 over D2
  [-29, [-5, -1, 2, 7]], // E:  E4 G#4 B4 E5 over E2
];
/** The arpeggio's path through a chord's four tones over sixteen sixteenths. */
const HACK_ARP = [0, 1, 2, 3, 2, 1, 0, 2, 1, 3, 2, 1, 3, 2, 1, 2];
function pulse(o: Out, t: number, freq: number, seconds: number, gain: number, cutoff: number, type: OscillatorType = "square", reverb = 0.15) {
  const { ctx } = o, osc = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  osc.type = type; osc.frequency.value = freq; lp.type = "lowpass"; lp.frequency.value = cutoff; lp.Q.value = 2;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  osc.connect(lp).connect(g); send(o, g, reverb); osc.start(t); osc.stop(t + seconds + 0.02);
}
function scheduleHackBar(o: Out, t: number, bar: number, pass: number) {
  const { ctx } = o, [root, tones] = HACK_CHORDS[bar], beat = HACK_BEAT, sixteenth = beat / 4;
  // The stream: sixteenths through the chord, brighter on the beat.
  HACK_ARP.forEach((which, k) => pulse(o, t + k * sixteenth, hz(tones[which]), 0.09, k % 4 === 0 ? 0.1 : 0.065, k % 4 === 0 ? 3200 : 2200));
  // The sub-bass on every eighth, the root with an octave jump on the off-beats.
  for (let k = 0; k < 8; k++) pulse(o, t + k * beat / 2, hz(root + (k % 2 ? 12 : 0)), 0.16, k % 2 ? 0.13 : 0.2, 700, "triangle", 0.05);
  // The tick: soft and dry on every eighth, a little stronger off the beat, like a counter ticking over.
  for (let k = 0; k < 8; k++) noiseBand(o, t + k * beat / 2, 0.025, "highpass", 6500, 8000, 1, k % 2 ? 0.045 : 0.028, 0.001, 0);
  // The uneasy pad: two sawtooths a few cents apart that drift against each other.
  for (const [detune, tone] of [[-9, tones[0]], [11, tones[2]]] as const) {
    const pad = ctx.createOscillator(), lp = ctx.createBiquadFilter(), pg = ctx.createGain();
    pad.type = "sawtooth"; pad.frequency.value = hz(tone - 12); pad.detune.setValueAtTime(detune, t); pad.detune.linearRampToValueAtTime(-detune, t + HACK_BAR);
    lp.type = "lowpass"; lp.frequency.value = 900;
    pg.gain.setValueAtTime(0.0001, t); pg.gain.exponentialRampToValueAtTime(0.03, t + 0.8); pg.gain.setValueAtTime(0.03, t + HACK_BAR - 0.4); pg.gain.exponentialRampToValueAtTime(0.0001, t + HACK_BAR + 0.3);
    pad.connect(lp).connect(pg); send(o, pg, 0.5); pad.start(t); pad.stop(t + HACK_BAR + 0.4);
  }
  // Glitches: two or three blips at random sixteenths, high and short.
  const glitches = 2 + Math.floor(Math.random() * 2);
  for (let k = 0; k < glitches; k++) pulse(o, t + Math.floor(Math.random() * 16) * sixteenth, 1400 + Math.random() * 2400, 0.03, 0.03, 6000, Math.random() < 0.5 ? "square" : "sawtooth", 0.3);
  // Every fourth bar a sweep rises into the next pass.
  if (bar === 3) noiseBand(o, t, HACK_BAR, "bandpass", 300, 5000, 3, 0.045, HACK_BAR * 0.8, 0.3);
  void pass;
}
/** Which track plays: Lonesome Trail, Trail Gallop (riding), The Standoff (an outlaw near) or Trace (the hacking game). */
export type MusicMood = "calm" | "ride" | "tense" | "hack";
const MOOD_BAR: Readonly<Record<MusicMood, number>> = { calm: MUSIC_BAR, ride: RIDE_BAR, tense: STANDOFF_BAR, hack: HACK_BAR };
function scheduleMoodBar(o: Out, mood: MusicMood, t: number, bar: number, pass: number, pattern: number) {
  if (mood === "ride") scheduleRideBar(o, t, bar, pass); else if (mood === "tense") scheduleStandoffBar(o, t, bar, pass);
  else if (mood === "hack") scheduleHackBar(o, t, bar, pass); else scheduleMusicBar(o, t, bar, pass, pattern);
}
/** The music's level against the sound effects at music volume 0.5 (the slider's middle): well under the animals and cues. */
const MUSIC_LEVEL = 0.35;

export type OutlawAudio = {
  /** Create or resume the AudioContext; call from a click, tap or key press. Resolves false where audio is unavailable. */
  unlock(): Promise<boolean>;
  /** Play a cue now; returns whether it started (false while locked, muted or hidden). */
  play(id: SoundId, options?: CueOptions): boolean;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  /** Music on or off (Settings), and whether the moment allows it (off during a hack): it fades in and out. */
  setMusic(on: boolean): void;
  setMusicAllowed(allowed: boolean): void;
  /** The track: "calm" (Lonesome Trail), "ride" (Trail Gallop, on a horse), "tense" (The Standoff, an outlaw near) or "hack" (Trace,
   * the hacking game); it changes at the next bar. */
  setMusicMood(mood: MusicMood): void;
  /** The music's own volume (0-1), on top of the overall volume. */
  setMusicVolume(volume: number): void;
  dispose(): void;
};
export function createOutlawAudio({ volume = 0.7, muted = false } = {}): OutlawAudio {
  let ctx: AudioContext | null = null, master: GainNode | null = null, out: Out | null = null;
  let level = volume, silent = muted, disposed = false;
  let musicMaster: GainNode | null = null, musicOut: Out | null = null, musicOn = true, musicAllowed = true, timer = 0, nextBar = 0, bar = 0, pass = 0, pattern = 0;
  let mood: MusicMood = "calm", playing: MusicMood = "calm", musicLevel = 0.5;
  /** The bars laid down ahead, each through its own gain, so a change of track can fade out what is already queued. */
  let queued: { dry: GainNode; wet: GainNode; end: number }[] = [];
  const audible = () => musicOn && musicAllowed && !disposed;
  const apply = () => {
    if (master && ctx) master.gain.setTargetAtTime(silent ? 0 : level * 0.8, ctx.currentTime, 0.02);
    // The music has its own bus (so "Sound on" and "Music on" are separate) and fades over a second or two.
    if (musicMaster && ctx) musicMaster.gain.setTargetAtTime(audible() ? level * 0.8 * MUSIC_LEVEL * musicLevel * 2 : 0, ctx.currentTime, 0.6);
    if (ctx && musicOut && audible() && !timer) { nextBar = Math.max(nextBar, ctx.currentTime + 0.3); timer = window.setInterval(tick, 250); }
  };
  // A look-ahead scheduler: bars are laid down a second before they sound; it stops once the music has faded out.
  const tick = () => {
    if (!ctx || !musicOut) return;
    if (!audible()) { if (ctx.currentTime > nextBar) { clearInterval(timer); timer = 0; } return; }
    queued = queued.filter(entry => entry.end > ctx!.currentTime);
    while (nextBar < ctx.currentTime + 1.2) {
      playing = mood;
      if (bar === 0) pattern = Math.floor(Math.random() * MUSIC_PATTERNS.length);
      const dry = ctx.createGain(), wet = ctx.createGain(); dry.connect(musicOut.dry); wet.connect(musicOut.wet);
      queued.push({ dry, wet, end: nextBar + MOOD_BAR[playing] + 4 });
      scheduleMoodBar({ ctx, dry, wet }, playing, nextBar, bar, pass, pattern);
      nextBar += MOOD_BAR[playing]; bar = (bar + 1) % MUSIC_CHORDS.length; if (bar === 0) pass++;
    }
  };
  const onHidden = () => { if (document.hidden && ctx?.state === "running") void ctx.suspend(); else if (!document.hidden && ctx?.state === "suspended" && !silent) void ctx.resume(); };
  document.addEventListener("visibilitychange", onHidden);
  return {
    async unlock() {
      if (disposed) return false;
      try {
        if (!ctx) {
          const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!Context) return false;
          ctx = new Context(); master = ctx.createGain(); master.gain.value = 0; out = outputChain(ctx, ctx.destination, master);
          musicMaster = ctx.createGain(); musicMaster.gain.value = 0; musicOut = outputChain(ctx, ctx.destination, musicMaster); apply();
        }
        if (ctx.state !== "running") await ctx.resume();
        return ctx.state === "running";
      } catch { return false; }
    },
    play(id, options) {
      if (disposed || silent || !ctx || !out || ctx.state !== "running" || document.hidden) return false;
      cue(out, id, ctx.currentTime + 0.01 + (options?.delay ?? 0), options);
      return true;
    },
    setMuted(value) { silent = value; apply(); },
    setVolume(value) { level = Math.max(0, Math.min(1, value)); apply(); },
    setMusic(on) { musicOn = on; apply(); },
    setMusicAllowed(allowed) { musicAllowed = allowed; apply(); },
    setMusicMood(value) {
      if (value === mood) return;
      mood = value;
      // Cut over at once: what is queued fades out in about a third of a second, and the new track starts now, from the top of its
      // phrase (not at the next bar, which in Lonesome Trail could be seconds away).
      if (!ctx || !musicOut || !timer) return;
      const now = ctx.currentTime;
      for (const entry of queued) for (const node of [entry.dry, entry.wet]) { node.gain.cancelScheduledValues(now); node.gain.setTargetAtTime(0, now, 0.1); }
      queued = []; nextBar = now + 0.12; bar = 0;
      tick();
    },
    setMusicVolume(value) { musicLevel = Math.max(0, Math.min(1, value)); apply(); },
    dispose() { disposed = true; clearInterval(timer); document.removeEventListener("visibilitychange", onHidden); void ctx?.close(); ctx = null; },
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
/** Render `passes` loops of the ambience offline, for listening without the game. */
export async function renderMusic(passes = 4, sampleRate = 44100, mood: MusicMood = "calm"): Promise<AudioBuffer> {
  const seconds = passes * MUSIC_CHORDS.length * MOOD_BAR[mood] + 3;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate), master = ctx.createGain(); master.gain.value = 0.56 * MUSIC_LEVEL;
  const out = outputChain(ctx, ctx.destination, master);
  for (let pass = 0, t = 0.05; pass < passes; pass++) {
    const pattern = Math.floor(Math.random() * MUSIC_PATTERNS.length);
    for (let bar = 0; bar < MUSIC_CHORDS.length; bar++, t += MOOD_BAR[mood]) scheduleMoodBar(out, mood, t, bar, pass, pattern);
  }
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
