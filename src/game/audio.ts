// ---------------------------------------------------------------------------
// KekeVerse Audio Engine — 100% procedural Web Audio API synthesizer.
// Zero external file dependencies. Character-specific African-inspired arcade
// loops (Yoruba / Igbo / Hausa), dynamic keke engine simulation, and a full
// SFX suite with envelope shaping to prevent clicks.
// ---------------------------------------------------------------------------

export type HeroId = "tobi" | "chinedu" | "sani";

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

// --- shared audio graph ------------------------------------------------------

let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let sfxBus: GainNode | null = null;
let comp: DynamicsCompressorNode | null = null;

function graph(): boolean {
  const c = ac();
  if (!c) return false;
  if (!master) {
    master = c.createGain();
    master.gain.value = 0.9;
    comp = c.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    master.connect(comp).connect(c.destination);
    musicBus = c.createGain();
    musicBus.gain.value = 0.5;
    musicBus.connect(master);
    sfxBus = c.createGain();
    sfxBus.gain.value = 0.85;
    sfxBus.connect(master);
  }
  return true;
}

// --- noise buffer ------------------------------------------------------------

let noiseBuf: AudioBuffer | null = null;
function noise(): AudioBuffer | null {
  const c = ac();
  if (!c) return null;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

// --- small synth helpers -----------------------------------------------------

function tone(
  dest: AudioNode,
  freq: number,
  t: number,
  dur: number,
  type: OscillatorType = "sine",
  peak = 0.2,
  attack = 0.006,
  detune = 0,
): void {
  const c = ac();
  if (!c || !dest) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  if (detune) o.detune.value = detune;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noiseHit(
  dest: AudioNode,
  t: number,
  dur: number,
  peak: number,
  filterFreq: number,
  q = 1,
  type: BiquadFilterType = "bandpass",
): void {
  const c = ac();
  if (!c || !dest) return;
  const buf = noise();
  if (!buf) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t);
  src.stop(t + dur + 0.05);
}

/** talking-drum / kalangu pitch bend */
function drumBend(
  dest: AudioNode,
  f0: number,
  f1: number,
  t: number,
  dur: number,
  peak = 0.35,
  type: OscillatorType = "sine",
): void {
  const c = ac();
  if (!c || !dest) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur * 0.85);
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// --- Male vocal formant chant synthesizer ------------------------------------
// Simulates a male voice (~130-150Hz fundamental) through a 3-formant vocal
// tract filter bank. Very light mix level so chants sit beneath instruments.

interface FormantSpec {
  f1: number;
  f2: number;
  f3: number;
}

// Vowel formant tables for male voice
const VOWELS: Record<string, FormantSpec> = {
  a: { f1: 730, f2: 1090, f3: 2440 },
  e: { f1: 530, f2: 1840, f3: 2480 },
  i: { f1: 270, f2: 2290, f3: 3010 },
  o: { f1: 570, f2: 840, f3: 2410 },
  u: { f1: 300, f2: 870, f3: 2240 },
};

function vocalFormant(
  dest: AudioNode,
  t: number,
  dur: number,
  vowel: string,
  fundamental = 140,
  peak = 0.07,
): void {
  const c = ac();
  if (!c || !dest) return;
  const spec = VOWELS[vowel] || VOWELS["a"];

  // Glottal source: sawtooth at male fundamental with slight vibrato
  const src = c.createOscillator();
  src.type = "sawtooth";
  src.frequency.setValueAtTime(fundamental, t);
  const vibLfo = c.createOscillator();
  vibLfo.type = "sine";
  vibLfo.frequency.value = 5.5;
  const vibGain = c.createGain();
  vibGain.gain.value = 3;
  vibLfo.connect(vibGain).connect(src.frequency);

  // Formant filter bank: 3 parallel bandpass resonators
  const formants: { freq: number; q: number; gain: number }[] = [
    { freq: spec.f1, q: 8, gain: 1.0 },
    { freq: spec.f2, q: 10, gain: 0.6 },
    { freq: spec.f3, q: 12, gain: 0.25 },
  ];

  const mixGain = c.createGain();
  mixGain.gain.value = 0;

  formants.forEach((f) => {
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f.freq;
    bp.Q.value = f.q;
    const fg = c.createGain();
    fg.gain.value = f.gain;
    src.connect(bp).connect(fg).connect(mixGain);
  });

  // Envelope: attack, sustain, release — click-free
  mixGain.gain.setValueAtTime(0.0001, t);
  mixGain.gain.linearRampToValueAtTime(peak, t + 0.025);
  mixGain.gain.setValueAtTime(peak, t + dur * 0.7);
  mixGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  mixGain.connect(dest);
  src.start(t);
  vibLfo.start(t);
  src.stop(t + dur + 0.05);
  vibLfo.stop(t + dur + 0.05);
}

interface ChantSyllable {
  v: string; // vowel key
  o: number; // offset in steps from phrase start
  d: number; // duration in steps
  f?: number; // optional fundamental override
}

function chantPhrase(
  dest: AudioNode,
  t: number,
  stepDur: number,
  syllables: ChantSyllable[],
  fundamental = 140,
  peak = 0.065,
): void {
  syllables.forEach((s) => {
    vocalFormant(
      dest,
      t + s.o * stepDur,
      s.d * stepDur * 0.85,
      s.v,
      s.f ?? fundamental,
      peak,
    );
  });
}

// --- Character chant phrase definitions (rhythmic syllable patterns) ---

// Tobi Yoruba: "Kẹ́kẹ́ ń lọ! Ẹ jẹ́ ká lọ, a ò dúró. Ọ̀nà wa ṣí, a ń lọ síwájú. Gba ìró, gba agbára. A ó ṣẹ́gun."
const TOBI_CHANTS: ChantSyllable[][] = [
  // Bar 1: "Kẹ́kẹ́ ń lọ!"
  [{ v: "e", o: 0, d: 1 }, { v: "e", o: 2, d: 1 }, { v: "o", o: 5, d: 2 }],
  // Bar 2: "Ẹ jẹ́ ká lọ"
  [{ v: "e", o: 0, d: 1 }, { v: "e", o: 2, d: 1 }, { v: "a", o: 4, d: 2 }, { v: "o", o: 7, d: 1.5 }],
  // Bar 3: "a ò dúró"
  [{ v: "a", o: 0, d: 1 }, { v: "o", o: 2, d: 1.5 }, { v: "u", o: 5, d: 1 }, { v: "o", o: 7, d: 2 }],
  // Bar 4: "Ọ̀nà wa ṣí"
  [{ v: "o", o: 0, d: 1.5 }, { v: "a", o: 2, d: 1 }, { v: "a", o: 4, d: 1.5 }, { v: "i", o: 7, d: 1 }],
  // Bar 5: "a ń lọ síwájú"
  [{ v: "a", o: 0, d: 1 }, { v: "o", o: 2, d: 1 }, { v: "i", o: 4, d: 1 }, { v: "a", o: 6, d: 1 }, { v: "u", o: 8, d: 1.5 }],
  // Bar 6: "Gba ìró"
  [{ v: "a", o: 0, d: 1.5 }, { v: "i", o: 3, d: 1 }, { v: "o", o: 5, d: 2 }],
  // Bar 7: "gba agbára"
  [{ v: "a", o: 0, d: 1 }, { v: "a", o: 2, d: 1 }, { v: "a", o: 4, d: 1.5 }, { v: "a", o: 7, d: 1.5 }],
  // Bar 8: "A ó ṣẹ́gun"
  [{ v: "a", o: 0, d: 1 }, { v: "o", o: 2, d: 1.5 }, { v: "e", o: 5, d: 1 }, { v: "u", o: 7, d: 2 }],
];

// Chinedu Igbo: "Ka anyị gaa! Anyị agaghị akwụsị. Ụzọ anyị ghe oghe, anyị na-aga n'ihu. Kẹ́kẹ́ na-aga, egwu na-akụ. Anyị ga-emeri."
const CHIN_CHANTS: ChantSyllable[][] = [
  // Bar 1: "Ka anyị gaa!"
  [{ v: "a", o: 0, d: 1 }, { v: "a", o: 2, d: 1 }, { v: "i", o: 3, d: 1 }, { v: "a", o: 5, d: 2.5 }],
  // Bar 2: "Anyị agaghị akwụsị"
  [{ v: "a", o: 0, d: 1 }, { v: "i", o: 1, d: 1 }, { v: "a", o: 3, d: 1 }, { v: "i", o: 4, d: 1 }, { v: "a", o: 6, d: 1 }, { v: "i", o: 8, d: 1.5 }],
  // Bar 3: "Ụzọ anyị ghe oghe"
  [{ v: "u", o: 0, d: 1 }, { v: "o", o: 2, d: 1 }, { v: "a", o: 4, d: 1 }, { v: "i", o: 5, d: 1 }, { v: "e", o: 7, d: 1 }, { v: "e", o: 9, d: 1.5 }],
  // Bar 4: "anyị na-aga n'ihu"
  [{ v: "a", o: 0, d: 1 }, { v: "i", o: 1, d: 1 }, { v: "a", o: 3, d: 1 }, { v: "a", o: 5, d: 1 }, { v: "i", o: 7, d: 1 }, { v: "u", o: 9, d: 1.5 }],
  // Bar 5: "Kẹ́kẹ́ na-aga"
  [{ v: "e", o: 0, d: 1 }, { v: "e", o: 2, d: 1 }, { v: "a", o: 4, d: 1 }, { v: "a", o: 6, d: 1 }, { v: "a", o: 8, d: 2 }],
  // Bar 6: "egwu na-akụ"
  [{ v: "e", o: 0, d: 1 }, { v: "u", o: 2, d: 1 }, { v: "a", o: 4, d: 1 }, { v: "a", o: 6, d: 1 }, { v: "u", o: 8, d: 2 }],
  // Bar 7: "Anyị ga-emeri"
  [{ v: "a", o: 0, d: 1 }, { v: "i", o: 1, d: 1 }, { v: "a", o: 3, d: 1 }, { v: "e", o: 5, d: 1 }, { v: "e", o: 7, d: 1 }, { v: "i", o: 9, d: 1.5 }],
  // Bar 8: "Anyị ga-emeri" (resolve)
  [{ v: "a", o: 0, d: 1 }, { v: "i", o: 1, d: 1 }, { v: "a", o: 3, d: 1.5 }, { v: "e", o: 6, d: 1 }, { v: "i", o: 8, d: 2.5 }],
];

// Sani Hausa: "Mu tafi! Ba za mu tsaya ba. Hanya a buɗe, muna gaba. Keke na tafiya, kiɗa na ƙara. Za mu ci nasara."
const SANI_CHANTS: ChantSyllable[][] = [
  // Bar 1: "Mu tafi!"
  [{ v: "u", o: 0, d: 1.5 }, { v: "a", o: 3, d: 1 }, { v: "i", o: 5, d: 2 }],
  // Bar 2: "Ba za mu tsaya ba"
  [{ v: "a", o: 0, d: 1 }, { v: "a", o: 2, d: 1 }, { v: "u", o: 4, d: 1 }, { v: "a", o: 6, d: 1 }, { v: "a", o: 8, d: 1 }, { v: "a", o: 10, d: 1.5 }],
  // Bar 3: "Hanya a buɗe"
  [{ v: "a", o: 0, d: 1 }, { v: "a", o: 2, d: 1 }, { v: "a", o: 4, d: 1 }, { v: "u", o: 6, d: 1 }, { v: "e", o: 8, d: 2 }],
  // Bar 4: "muna gaba"
  [{ v: "u", o: 0, d: 1 }, { v: "a", o: 2, d: 1 }, { v: "a", o: 4, d: 1 }, { v: "a", o: 6, d: 2 }],
  // Bar 5: "Keke na tafiya"
  [{ v: "e", o: 0, d: 1 }, { v: "e", o: 2, d: 1 }, { v: "a", o: 4, d: 1 }, { v: "a", o: 6, d: 1 }, { v: "i", o: 8, d: 1 }, { v: "a", o: 10, d: 1.5 }],
  // Bar 6: "kiɗa na ƙara"
  [{ v: "i", o: 0, d: 1 }, { v: "a", o: 2, d: 1 }, { v: "a", o: 4, d: 1 }, { v: "a", o: 6, d: 1 }, { v: "a", o: 8, d: 2 }],
  // Bar 7: "Za mu ci nasara"
  [{ v: "a", o: 0, d: 1 }, { v: "u", o: 2, d: 1 }, { v: "i", o: 4, d: 1 }, { v: "a", o: 6, d: 1 }, { v: "a", o: 8, d: 1 }, { v: "a", o: 10, d: 1.5 }],
  // Bar 8: "Za mu ci nasara" (resolve)
  [{ v: "a", o: 0, d: 1 }, { v: "u", o: 2, d: 1 }, { v: "i", o: 4, d: 1 }, { v: "a", o: 6, d: 1 }, { v: "a", o: 8, d: 1 }, { v: "a", o: 10, d: 2.5 }],
];

// --- music loop scheduler ----------------------------------------------------

const LOOKAHEAD = 0.35; // seconds scheduled per tick
const TICK = 0.12; // scheduler interval (s)

interface Loop {
  timer: number;
  step: number;
  stepDur: number;
  nextTime: number;
  pattern: (s: number, t: number, bus: GainNode) => void;
}

let loop: Loop | null = null;
let currentHero: HeroId | null = null;
let musicMuted = false;
let sfxMuted = false;

function stopLoop(): void {
  if (loop) {
    window.clearInterval(loop.timer);
    loop = null;
  }
  currentHero = null;
}

function schedule(): void {
  const c = ac();
  if (!c || !loop || !musicBus) return;
  while (loop.nextTime < c.currentTime + LOOKAHEAD) {
    loop.pattern(loop.step, loop.nextTime, musicBus);
    loop.step = (loop.step + 1) % 64;
    loop.nextTime += loop.stepDur;
  }
}

function startLoop(
  hero: HeroId,
  stepsPerBeat: number,
  bpm: number,
  pattern: Loop["pattern"],
): void {
  if (!graph()) return;
  stopLoop();
  const c = ac()!;
  const stepDur = 60 / bpm / stepsPerBeat;
  loop = {
    step: 0,
    stepDur,
    nextTime: c.currentTime + 0.08,
    pattern,
    timer: window.setInterval(schedule, TICK * 1000),
  };
  currentHero = hero;
  schedule();
}

// --- Tobi: Yoruba highlife / fuji arcade groove (128 BPM, 4/4, 8th steps) ----
// Pentatonic C-D-E-G-A. Agogo bell double-gong, shekere, talking-drum fills,
// punchy bass, cheerful marimba-ish arpeggio lead.

const TOBI_BASS = [55, 0, 82.41, 0, 65.41, 0, 82.41, 0, 55, 0, 98, 0, 82.41, 0, 65.41, 0];
const TOBI_LEAD = [
  523.25, 0, 440, 587.33, 0, 523.25, 0, 659.25, 587.33, 0, 523.25, 0, 440, 523.25, 0, 392,
  440, 0, 523.25, 587.33, 0, 523.25, 0, 440, 392, 0, 440, 523.25, 0, 392, 0, 329.63,
];
const TOBI_ARP = [261.63, 329.63, 392, 329.63, 220, 329.63, 392, 440, 261.63, 392, 440, 392, 220, 329.63, 392, 329.63];

function tobiPattern(s: number, t: number, bus: GainNode): void {
  const b = s % 16;
  // kick on 1 & 3, fuji pulse on the "a" of 2
  if (b === 0 || b === 8) drumBend(bus, 150, 42, t, 0.16, 0.5);
  if (b === 6) drumBend(bus, 120, 48, t, 0.1, 0.28);
  // snare/clap backbeat
  if (b === 4 || b === 12) {
    noiseHit(bus, t, 0.12, 0.22, 1900, 0.8);
    tone(bus, 190, t, 0.05, "triangle", 0.12);
  }
  // agogo bell: 7-stroke highlife pattern (gankagi/gongui alternation)
  const agogo = [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0][b];
  if (agogo) {
    const hi = b % 8 < 4;
    tone(bus, hi ? 1245 : 831, t, 0.09, "sine", 0.07);
    tone(bus, hi ? 1245 : 831, t, 0.05, "square", 0.02);
  }
  // shekere: 16ths, accent on offbeats
  noiseHit(bus, t, 0.03, b % 2 === 1 ? 0.07 : 0.03, 6200, 0.6);
  // talking-drum fill every 4th bar
  if (s >= 48 && [0, 2, 5, 7, 10, 13].includes(b)) {
    drumBend(bus, 330, 200, t, 0.09, 0.16);
  } else if (b === 14 && s % 32 === 30) {
    drumBend(bus, 260, 150, t, 0.14, 0.2);
  }
  // bass
  const bf = TOBI_BASS[b];
  if (bf) tone(bus, bf, t, 0.22, "sawtooth", 0.16, 0.008);
  // lead arpeggio (every other 16th)
  if (b % 2 === 0) {
    const lf = TOBI_LEAD[s % 32];
    if (lf) {
      tone(bus, lf, t, 0.16, "triangle", 0.11);
      tone(bus, lf * 2, t, 0.1, "sine", 0.03);
    }
  }
  // brassy pad chord stabs on bar starts
  if (b === 0 || b === 8) {
    const root = TOBI_ARP[(s / 8) % 16 | 0] ?? 261.63;
    [1, 1.26, 1.5].forEach((r, i) =>
      tone(bus, root * r, t, 0.3, "sawtooth", 0.035, 0.02, i * 6),
    );
  }
  // Male vocal formant chants — triggered at bar boundaries (every 16 steps)
  if (b === 0) {
    const barIdx = Math.floor(s / 16) % 8;
    const stepDur = 60 / 128 / 8; // seconds per 8th-note step at 128 BPM
    chantPhrase(bus, t, stepDur, TOBI_CHANTS[barIdx], 138, 0.06);
  }
}

// --- Chinedu: Igbo ogene/ekwe high-energy (134 BPM, 4/4, 16th steps) ---------
// Driving ogene metal bell ostinato, ekwe woodblock, double-beat bass,
// soaring pentatonic flute lead.

const CHIN_BASS = [73.42, 0, 0, 73.42, 0, 98, 0, 73.42, 0, 0, 82.41, 0, 98, 0, 0, 65.41];
const CHIN_LEAD = [
  659.25, 0, 0, 587.33, 0, 659.25, 784, 0, 659.25, 0, 587.33, 0, 523.25, 0, 0, 0,
  587.33, 0, 0, 659.25, 0, 587.33, 523.25, 0, 440, 0, 523.25, 0, 587.33, 0, 0, 0,
];

function chineduPattern(s: number, t: number, bus: GainNode): void {
  const b = s % 16;
  // kick: four-on-the-floor + pickup
  if (b % 4 === 0 || b === 14) drumBend(bus, 160, 45, t, 0.14, 0.5);
  // clap on 2 & 4
  if (b === 4 || b === 12) {
    noiseHit(bus, t, 0.1, 0.24, 2200, 0.8);
    tone(bus, 210, t, 0.05, "triangle", 0.12);
  }
  // ogene: classic 12-stroke bell pattern (16th grid)
  if ([0, 2, 4, 6, 8, 10, 11, 12, 14].includes(b)) {
    const hi = b < 8;
    tone(bus, hi ? 1046 : 784, t, 0.07, "sine", 0.09);
    tone(bus, (hi ? 1046 : 784) * 2.02, t, 0.05, "sine", 0.03);
    noiseHit(bus, t, 0.03, 0.02, 5000, 2);
  }
  // ekwe woodblock interlock
  if ([3, 7, 11, 15].includes(b)) {
    tone(bus, 420, t, 0.06, "triangle", 0.16);
    noiseHit(bus, t, 0.03, 0.05, 1500, 1.5);
  }
  // shaker 16ths
  noiseHit(bus, t, 0.025, b % 2 ? 0.05 : 0.025, 7000, 0.7);
  // talking-drum response phrase every 4th bar
  if (s >= 48 && [1, 5, 9, 13].includes(b)) drumBend(bus, 300, 180, t, 0.08, 0.14);
  // bass double-beat drive
  const bf = CHIN_BASS[b];
  if (bf) {
    tone(bus, bf, t, 0.16, "sawtooth", 0.18, 0.006);
    if (b === 5 || b === 12) tone(bus, bf * 1.5, t + 0.05, 0.08, "sawtooth", 0.1);
  }
  // soaring flute lead
  const lf = CHIN_LEAD[s % 32];
  if (lf) {
    tone(bus, lf, t, 0.22, "sine", 0.12, 0.02);
    tone(bus, lf * 1.005, t, 0.2, "sine", 0.05, 0.02);
  }
  // Male vocal formant chants — triggered at bar boundaries
  if (b === 0) {
    const barIdx = Math.floor(s / 16) % 8;
    const stepDur = 60 / 134 / 16; // seconds per 16th step at 134 BPM
    chantPhrase(bus, t, stepDur, CHIN_CHANTS[barIdx], 145, 0.06);
  }
}

// --- Sani: Hausa kalangu/goje desert pulse (122 BPM, 4/4, 16th steps) --------
// Hypnotic steady groove: deep drone bass, kalangu talking-drum conversation,
// goje-style modal (minor) violin-ish lead.

const SANI_BASS = [49, 0, 0, 0, 49, 0, 58.27, 0, 0, 0, 49, 0, 65.41, 0, 0, 0];
const SANI_LEAD = [
  440, 0, 0, 523.25, 0, 0, 587.33, 0, 523.25, 0, 440, 0, 0, 349.23, 0, 0,
  392, 0, 0, 440, 0, 0, 523.25, 0, 440, 0, 392, 0, 0, 349.23, 0, 0,
];

function saniPattern(s: number, t: number, bus: GainNode): void {
  const b = s % 16;
  // steady hypnotic kick
  if (b === 0 || b === 8) drumBend(bus, 130, 40, t, 0.2, 0.45);
  if (b === 11) drumBend(bus, 110, 45, t, 0.1, 0.2);
  // soft hand-clap backbeat
  if (b === 4 || b === 12) noiseHit(bus, t, 0.09, 0.16, 1600, 0.9);
  // kalangu talking-drum conversation (call & response)
  if ([2, 6, 10, 14].includes(b)) {
    const call = b === 2 || b === 10;
    drumBend(bus, call ? 280 : 360, call ? 190 : 240, t, 0.12, 0.18);
  }
  if (b === 7 && s % 32 === 7) drumBend(bus, 420, 250, t, 0.16, 0.14);
  // gourd shaker (goge) 8ths
  if (b % 2 === 0) noiseHit(bus, t, 0.04, b % 4 === 2 ? 0.06 : 0.03, 5500, 0.6);
  // deep drone bass
  const bf = SANI_BASS[b];
  if (bf) {
    tone(bus, bf, t, 0.4, "sawtooth", 0.14, 0.02);
    tone(bus, bf, t, 0.3, "sine", 0.08, 0.02);
  }
  // goje modal lead (slightly detuned twin strings)
  const lf = SANI_LEAD[s % 32];
  if (lf) {
    tone(bus, lf, t, 0.3, "sawtooth", 0.05, 0.04);
    tone(bus, lf * 1.008, t, 0.28, "sawtooth", 0.04, 0.04);
    tone(bus, lf / 2, t, 0.2, "triangle", 0.04);
  }
  // Male vocal formant chants — triggered at bar boundaries
  if (b === 0) {
    const barIdx = Math.floor(s / 16) % 8;
    const stepDur = 60 / 122 / 16; // seconds per 16th step at 122 BPM
    chantPhrase(bus, t, stepDur, SANI_CHANTS[barIdx], 132, 0.06);
  }
}

// --- public music API ----------------------------------------------------------

export function playCharacterMusic(hero: HeroId): void {
  if (currentHero === hero && loop) return; // strict mutual exclusion
  if (hero === "tobi") startLoop("tobi", 8, 128, tobiPattern);
  else if (hero === "chinedu") startLoop("chinedu", 16, 134, chineduPattern);
  else startLoop("sani", 16, 122, saniPattern);
}

export function pauseMusic(): void {
  const c = ac();
  if (!c || !musicBus || !loop) return;
  musicBus.gain.cancelScheduledValues(c.currentTime);
  musicBus.gain.setValueAtTime(musicBus.gain.value, c.currentTime);
  musicBus.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.25);
}

export function resumeMusic(): void {
  const c = ac();
  if (!c || !musicBus) return;
  musicBus.gain.cancelScheduledValues(c.currentTime);
  musicBus.gain.setValueAtTime(0.0001, c.currentTime);
  musicBus.gain.linearRampToValueAtTime(musicMuted ? 0.0001 : 0.5, c.currentTime + 0.3);
}

export function stopMusic(): void {
  stopLoop();
  const c = ac();
  if (c && musicBus) {
    musicBus.gain.cancelScheduledValues(c.currentTime);
    musicBus.gain.value = musicMuted ? 0.0001 : 0.5;
  }
}

// --- keke engine loop ----------------------------------------------------------

interface Engine {
  osc: OscillatorNode;
  osc2: OscillatorNode;
  lfo: OscillatorNode;
  sub: OscillatorNode;
  noiseSrc: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}
let engine: Engine | null = null;

export function startEngineLoop(): void {
  const c = ac();
  if (!c || !sfxBus || engine) return;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.linearRampToValueAtTime(sfxMuted ? 0.0001 : 0.12, c.currentTime + 0.4);
  g.connect(sfxBus);

  const osc = c.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = 62;
  const osc2 = c.createOscillator();
  osc2.type = "square";
  osc2.frequency.value = 62 * 1.5;

  const lfo = c.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 7; // two-stroke idle wobble
  const lfoGain = c.createGain();
  lfoGain.gain.value = 14;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  lfoGain.connect(osc2.frequency);

  const sub = c.createOscillator();
  sub.type = "sine";
  sub.frequency.value = 44;

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 420;
  filter.Q.value = 6;

  const buf = noise();
  const noiseSrc = c.createBufferSource();
  if (buf) {
    noiseSrc.buffer = buf;
    noiseSrc.loop = true;
    const ng = c.createGain();
    ng.gain.value = 0.04;
    noiseSrc.connect(ng).connect(filter);
  }

  osc.connect(filter);
  osc2.connect(filter);
  sub.connect(g);
  filter.connect(g);

  osc.start();
  osc2.start();
  lfo.start();
  sub.start();
  if (buf) noiseSrc.start();
  engine = { osc, osc2, lfo, sub, noiseSrc, filter, gain: g };
}

/** intensity 0..1 tracks runner speed */
export function setEngineIntensity(intensity: number): void {
  const c = ac();
  if (!c || !engine) return;
  const v = Math.min(1, Math.max(0, intensity));
  const t = c.currentTime;
  engine.osc.frequency.setTargetAtTime(58 + v * 30, t, 0.3);
  engine.osc2.frequency.setTargetAtTime((58 + v * 30) * 1.5, t, 0.3);
  engine.lfo.frequency.setTargetAtTime(6 + v * 8, t, 0.3);
  engine.filter.frequency.setTargetAtTime(380 + v * 500, t, 0.3);
}

export function stopEngine(): void {
  const c = ac();
  if (!c || !engine) return;
  const e = engine;
  engine = null;
  try {
    e.gain.gain.cancelScheduledValues(c.currentTime);
    e.gain.gain.setValueAtTime(e.gain.gain.value, c.currentTime);
    e.gain.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.2);
    const stop = () => {
      try {
        e.osc.stop();
        e.osc2.stop();
        e.lfo.stop();
        e.sub.stop();
        e.noiseSrc.stop();
      } catch {
        /* already stopped */
      }
    };
    window.setTimeout(stop, 300);
  } catch {
    /* context closed */
  }
}

// --- SFX -----------------------------------------------------------------------

function sfx(fn: (c: AudioContext, bus: GainNode) => void): void {
  if (sfxMuted) return;
  if (!graph()) return;
  const c = ac();
  if (!c || !sfxBus) return;
  fn(c, sfxBus);
}

/** Crisp tactile UI click for all buttons */
export function buttonTapSound(): void {
  sfx((c, bus) => {
    tone(bus, 880, c.currentTime, 0.05, "sine", 0.12, 0.002);
    tone(bus, 1760, c.currentTime, 0.03, "sine", 0.05, 0.002);
    noiseHit(bus, c.currentTime, 0.02, 0.04, 4000, 1);
  });
}

/** Snappy lane-change whoosh */
export function laneChangeSwish(): void {
  sfx((c, bus) => {
    const t = c.currentTime;
    const buf = noise();
    if (!buf) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.09);
    f.Q.value = 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    src.connect(f).connect(g).connect(bus);
    src.start(t);
    src.stop(t + 0.2);
  });
}

/** Crystal/bell shard pickup chime — rising pitch with streak, debounced
 *  so rapid multi-shard pickups never stack into a wall of sound. */
let lastChimeAt = 0;
export function soundShardChime(streak = 0): void {
  const c = ac();
  if (!c) return;
  const now = c.currentTime;
  if (now - lastChimeAt < 0.05) return;
  lastChimeAt = now;
  const shift = 1 + Math.min(streak, 20) * 0.012; // gentle rising harmonic
  sfx((cc, bus) => {
    const t = cc.currentTime;
    tone(bus, 1318.5 * shift, t, 0.35, "sine", 0.14, 0.004);
    tone(bus, 1975.5 * shift, t + 0.02, 0.3, "sine", 0.08, 0.004);
    tone(bus, 2637 * shift, t + 0.04, 0.22, "sine", 0.05, 0.004);
    tone(bus, 3951 * shift, t + 0.06, 0.15, "sine", 0.03, 0.004);
  });
}

/** Uplifting chord sweep for 5-streak combos */
export function soundStreakPulse(): void {
  sfx((c, bus) => {
    const t = c.currentTime;
    [523.25, 659.25, 784, 1046.5, 1318.5].forEach((f, i) => {
      tone(bus, f, t + i * 0.05, 0.4, "triangle", 0.1, 0.01);
      tone(bus, f * 2, t + i * 0.05, 0.25, "sine", 0.03, 0.01);
    });
    noiseHit(bus, t, 0.3, 0.04, 8000, 0.8);
  });
}

/** Deep metallic crunch + sub thud (plays once on crash) */
export function collisionSound(): void {
  sfx((c, bus) => {
    const t = c.currentTime;
    drumBend(bus, 180, 32, t, 0.5, 0.55);
    tone(bus, 46, t, 0.6, "sine", 0.5, 0.005);
    noiseHit(bus, t, 0.35, 0.3, 900, 0.4, "lowpass");
    [210, 340, 520, 760].forEach((f, i) =>
      noiseHit(bus, t + i * 0.02, 0.18, 0.08, f, 8),
    );
    tone(bus, 95, t, 0.25, "sawtooth", 0.2, 0.003);
  });
}

/** Low-mid pulsating klaxon when gridlock clusters approach */
export function gridmasterWarning(): void {
  sfx((c, bus) => {
    const t = c.currentTime;
    [0, 0.18, 0.36].forEach((d) => {
      tone(bus, 233, t + d, 0.14, "square", 0.09, 0.01);
      tone(bus, 175, t + d, 0.14, "sawtooth", 0.06, 0.01);
    });
  });
}

/** Celebratory high-score fanfare */
export function victorySound(): void {
  sfx((c, bus) => {
    const t = c.currentTime;
    const seq = [523.25, 659.25, 784, 1046.5, 784, 1046.5, 1318.5];
    seq.forEach((f, i) => {
      tone(bus, f, t + i * 0.11, 0.3, "triangle", 0.14, 0.008);
      tone(bus, f * 2, t + i * 0.11, 0.2, "sine", 0.04, 0.008);
    });
    tone(bus, 1318.5, t + seq.length * 0.11, 0.6, "sine", 0.16, 0.01);
    tone(bus, 659.25, t + seq.length * 0.11, 0.6, "sine", 0.1, 0.01);
  });
}

// --- mute / config -------------------------------------------------------------

export function setAudioConfig(music: boolean, sfxOn: boolean): void {
  musicMuted = !music;
  sfxMuted = !sfxOn;
  if (!graph()) return;
  const c = ac();
  if (!c || !musicBus || !sfxBus) return;
  musicBus.gain.setTargetAtTime(musicMuted ? 0.0001 : 0.5, c.currentTime, 0.05);
  sfxBus.gain.setTargetAtTime(sfxMuted ? 0.0001 : 0.85, c.currentTime, 0.05);
}

/** unlock the AudioContext from a user gesture (LET'S GO tap) */
export function unlockAudio(): void {
  if (!graph()) return;
  const c = ac();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}