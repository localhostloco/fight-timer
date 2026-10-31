// Pure sound generators: sample rate in, Float32Array out. No Web Audio here,
// so every sound is unit-testable. The audio engine renders each once into an
// AudioBuffer. Modal synthesis (a set of decaying partials with a noise
// strike) gives bells and gongs their ring; a tanh limiter keeps peaks sane.

import type { Sound } from './plan';

type Partial = readonly [ratio: number, gain: number, decay: number]; // decay in seconds (time constant)

const TAU = 2 * Math.PI;

function render(sr: number, seconds: number, fn: (t: number, noise: () => number) => number): Float32Array<ArrayBuffer> {
  const n = Math.ceil(seconds * sr);
  const out = new Float32Array(n);
  let seed = 0x9e3779b9;
  const noise = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 0xffffffff) * 2 - 1; };
  for (let i = 0; i < n; i++) out[i] = Math.tanh(fn(i / sr, noise) * 1.2) * 0.97;
  // Short fade-out so no buffer ends on a click.
  const fade = Math.min(n, Math.floor(sr * 0.02));
  for (let i = 0; i < fade; i++) out[n - 1 - i]! *= i / fade;
  return out;
}

/** Two cascaded one-pole low-passes (12 dB/oct) on a noise source: a dull thud, not static. */
function lowpass(cutoffHz: number, sr: number) {
  const a = Math.exp(-TAU * cutoffHz / sr);
  let y1 = 0, y2 = 0;
  return (x: number) => { y1 = a * y1 + (1 - a) * x; y2 = a * y2 + (1 - a) * y1; return y2; };
}

/** A struck metal body: partials × exponential decay, plus a filtered-noise strike. */
function strike(t: number, f0: number, partials: readonly Partial[], attack = 0.002, detune = 0.0015): number {
  if (t < 0) return 0;
  let v = 0;
  for (const [ratio, gain, decay] of partials) {
    const f = f0 * ratio;
    // Two slightly detuned sines per partial give the slow beating of real bells.
    v += gain * Math.exp(-t / decay) * (Math.sin(TAU * f * t) + 0.6 * Math.sin(TAU * f * (1 + detune) * t + 0.3));
  }
  const env = t < attack ? t / attack : 1;
  return v * env;
}

// Partial sets. Ratios follow measured bell spectra (hum, prime, tierce, quint, nominal, ...).
const BOXING_BELL: Partial[] = [
  [0.5, 0.35, 1.6], [1, 1, 1.4], [1.19, 0.55, 1.0], [1.5, 0.35, 0.8], [2, 0.6, 0.7], [2.51, 0.3, 0.45], [2.99, 0.22, 0.35], [4.1, 0.12, 0.2], [5.4, 0.07, 0.12],
];
const GONG: Partial[] = [
  [1, 1, 2.8], [1.43, 0.55, 2.4], [1.89, 0.45, 2.0], [2.36, 0.4, 1.6], [2.81, 0.3, 1.3], [3.57, 0.25, 1.0], [4.3, 0.18, 0.8], [6.1, 0.1, 0.5],
];
const CHIME: Partial[] = [[1, 1, 1.8], [2.76, 0.4, 1.2], [5.4, 0.18, 0.6], [8.9, 0.08, 0.3]];

function bellHit(t: number, noise: () => number, lp: (x: number) => number): number {
  const body = strike(t, 880, BOXING_BELL);
  const clank = t >= 0 && t < 0.012 ? lp(noise()) * (1 - t / 0.012) * 0.35 : 0;
  return body * 0.45 + clank;
}

export const SOUND_SECONDS: Record<Sound, number> = {
  bell: 2.6, bell3: 3.4, gong: 4.5, horn: 1.4, buzzer: 1.1, whistle: 0.9, clack: 0.7, chime: 2.0, drum: 0.6, beep: 0.2, none: 0,
};

export function generate(sound: Sound, sr: number): Float32Array<ArrayBuffer> | null {
  switch (sound) {
    case 'bell': { // classic ring bell, struck twice
      const lp = lowpass(1800, sr);
      return render(sr, SOUND_SECONDS.bell, (t, n) => bellHit(t, n, lp) + bellHit(t - 0.22, n, lp));
    }
    case 'bell3': { // end of fight: three quick strikes
      const lp = lowpass(1800, sr);
      return render(sr, SOUND_SECONDS.bell3, (t, n) => bellHit(t, n, lp) + bellHit(t - 0.26, n, lp) + bellHit(t - 0.52, n, lp));
    }
    case 'gong': {
      const lp = lowpass(400, sr);
      return render(sr, SOUND_SECONDS.gong, (t, n) => {
        const swell = Math.min(1, t / 0.06);
        const body = strike(t, 98, GONG, 0.02, 0.004) * swell;
        const mallet = t < 0.04 ? lp(n()) * (1 - t / 0.04) * 0.25 : 0;
        return body * 0.5 + mallet;
      });
    }
    case 'horn': { // air horn: reedy stack with breath noise, pitch sag at the end
      const lp = lowpass(1200, sr);
      return render(sr, SOUND_SECONDS.horn, (t, n) => {
        const dur = SOUND_SECONDS.horn;
        const sag = t > dur - 0.15 ? 1 - (t - (dur - 0.15)) * 0.4 : 1;
        const f = 466 * sag * (1 + 0.006 * Math.sin(TAU * 5.5 * t));
        let v = 0;
        for (let h = 1; h <= 10; h++) v += Math.sin(TAU * f * h * t + h) / Math.pow(h, 0.8);
        const air = lp(n()) * 0.03;
        const env = t < 0.04 ? t / 0.04 : t > dur - 0.08 ? (dur - t) / 0.08 : 1;
        return (v * 0.22 + air) * env;
      });
    }
    case 'buzzer': { // arena buzzer: square-ish 50 Hz-modulated tone
      return render(sr, SOUND_SECONDS.buzzer, (t) => {
        const dur = SOUND_SECONDS.buzzer;
        const f = 185;
        let v = 0;
        for (let h = 1; h <= 15; h += 2) v += Math.sin(TAU * f * h * t) / h;
        const rattle = 0.7 + 0.3 * Math.sign(Math.sin(TAU * 50 * t));
        const env = t < 0.01 ? t / 0.01 : t > dur - 0.05 ? (dur - t) / 0.05 : 1;
        return v * rattle * env * 0.5;
      });
    }
    case 'whistle': { // referee pea whistle: fast amplitude trill on a bright tone
      const lp = lowpass(3000, sr);
      return render(sr, SOUND_SECONDS.whistle, (t, n) => {
        const dur = SOUND_SECONDS.whistle;
        const trill = 0.55 + 0.45 * Math.sin(TAU * 38 * t);
        const f = 2750 + 25 * Math.sin(TAU * 38 * t);
        const tone = Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2.01 * t);
        const breath = lp(n()) * 0.025;
        const env = t < 0.02 ? t / 0.02 : t > dur - 0.12 ? (dur - t) / 0.12 : 1;
        return (tone * 0.4 * trill + breath) * env;
      });
    }
    case 'clack': { // wooden clapper: two bright knocks with body resonance
      const lp = lowpass(2200, sr);
      const knock = (t: number, n: () => number) => {
        if (t < 0) return 0;
        const res = Math.sin(TAU * 1250 * t) * Math.exp(-t * 55) + 0.5 * Math.sin(TAU * 2900 * t) * Math.exp(-t * 90);
        const crack = t < 0.006 ? lp(n()) * (1 - t / 0.006) * 0.6 : 0;
        return res * 0.7 + crack;
      };
      return render(sr, SOUND_SECONDS.clack, (t, n) => knock(t, n) + knock(t - 0.28, n));
    }
    case 'chime': // soft bar chime for inner-round alerts
      return render(sr, SOUND_SECONDS.chime, (t) => strike(t, 1320, CHIME, 0.004, 0.001) * 0.35);
    case 'drum': { // floor tom hit: pitch drop + skin noise
      const lp = lowpass(500, sr);
      return render(sr, SOUND_SECONDS.drum, (t, n) => {
        const f = 70 + 110 * Math.exp(-t * 28);
        const body = Math.sin(TAU * f * t) * Math.exp(-t * 7);
        const skin = lp(n()) * Math.exp(-t * 60) * 0.3;
        return body * 0.9 + skin;
      });
    }
    case 'beep': // countdown pip
      return render(sr, SOUND_SECONDS.beep, (t) => {
        const dur = SOUND_SECONDS.beep;
        const env = t < 0.008 ? t / 0.008 : t > dur - 0.04 ? (dur - t) / 0.04 : 1;
        return (Math.sin(TAU * 1046 * t) + 0.25 * Math.sin(TAU * 2092 * t)) * env * 0.45;
      });
    case 'none':
      return null;
  }
}
