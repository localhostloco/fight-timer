// Web Audio engine. One AudioContext created on the first user gesture; every
// sound is synthesized into an AudioBuffer once, so a bell never fetches or
// decodes at play time. Cues are placed on the audio clock from clock-ms
// timestamps, which keeps them on time when the UI thread is throttled.

import type { Sound } from './plan';

type Ctx = AudioContext;

function synth(ctx: Ctx, sound: Sound): AudioBuffer | null {
  const sr = ctx.sampleRate;
  const make = (seconds: number, fn: (t: number, i: number) => number) => {
    const buf = ctx.createBuffer(1, Math.ceil(seconds * sr), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = fn(i / sr, i);
    return buf;
  };
  const env = (t: number, a: number, tau: number) => (t < a ? t / a : Math.exp(-(t - a) / tau));
  switch (sound) {
    case 'bell': // boxing bell: inharmonic partials, long decay, struck twice
      return make(2.2, (t) => {
        const strike = (t0: number) => {
          const x = t - t0; if (x < 0) return 0;
          const parts = [[520, 1], [1040, 0.55], [1560, 0.35], [2130, 0.22], [2800, 0.12]] as const;
          let v = 0; for (const [f, g] of parts) v += g * Math.sin(2 * Math.PI * f * x) * Math.exp(-x * (1.6 + f / 900));
          return v * env(x, 0.002, 0.9);
        };
        return (strike(0) + strike(0.18)) * 0.45;
      });
    case 'gong':
      return make(3.0, (t) => {
        const parts = [[110, 1], [165, 0.6], [247, 0.5], [330, 0.4], [495, 0.25]] as const;
        let v = 0; for (const [f, g] of parts) v += g * Math.sin(2 * Math.PI * f * t * (1 + 0.004 * Math.sin(3 * t)));
        return v * env(t, 0.01, 1.2) * 0.4;
      });
    case 'horn': // air horn: sawtooth-ish stack with slight vibrato
      return make(1.2, (t) => {
        const f = 311 * (1 + 0.01 * Math.sin(2 * Math.PI * 6 * t));
        let v = 0; for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * f * h * t) / h;
        return v * env(t, 0.03, 4) * (t > 0.95 ? (1.2 - t) / 0.25 : 1) * 0.5;
      });
    case 'whistle':
      return make(0.7, (t) => {
        const f = 2500 + 80 * Math.sin(2 * Math.PI * 25 * t);
        return Math.sin(2 * Math.PI * f * t) * env(t, 0.01, 2) * (t > 0.55 ? (0.7 - t) / 0.15 : 1) * 0.5;
      });
    case 'clack': // wood clapper: filtered noise burst + wooden knock, twice
      return make(0.6, (t, i) => {
        const hit = (t0: number) => {
          const x = t - t0; if (x < 0) return 0;
          const noise = (Math.sin(i * 12.9898) * 43758.5453) % 1;
          return (noise * 0.6 + Math.sin(2 * Math.PI * 1800 * x) * 0.4) * Math.exp(-x * 60);
        };
        return (hit(0) + hit(0.25)) * 0.9;
      });
    case 'beep':
      return make(0.18, (t) => Math.sin(2 * Math.PI * 1000 * t) * (t < 0.01 ? t / 0.01 : t > 0.15 ? (0.18 - t) / 0.03 : 1) * 0.5);
    case 'none':
      return null;
  }
}

export class AudioEngine {
  private ctx: Ctx | null = null;
  private gain: GainNode | null = null;
  private buffers = new Map<Sound, AudioBuffer | null>();
  private scheduled = new Set<AudioBufferSourceNode>();
  private volume = 1;

  get ready(): boolean { return this.ctx !== null && this.ctx.state === 'running'; }
  get state(): AudioContextState | 'none' { return this.ctx?.state ?? 'none'; }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  async unlock(): Promise<boolean> {
    if (typeof AudioContext === 'undefined') return false;
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.ctx.destination);
      for (const s of ['bell', 'gong', 'horn', 'whistle', 'clack', 'beep'] as Sound[]) this.buffers.set(s, synth(this.ctx, s));
    }
    if (this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch { /* blocked until a gesture */ } }
    return this.ready;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.gain) this.gain.gain.value = this.volume;
  }

  /** Play `sound` at clock time `atMs` (performance.now space). Past times play now. */
  schedule(sound: Sound, atMs: number, nowMs = performance.now()): void {
    if (!this.ctx || !this.gain || sound === 'none') return;
    const buf = this.buffers.get(sound);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    const delta = Math.max(0, (atMs - nowMs) / 1000);
    src.start(this.ctx.currentTime + delta);
    this.scheduled.add(src);
    src.onended = () => this.scheduled.delete(src);
  }

  play(sound: Sound): void { this.schedule(sound, 0, 1); }

  /** Cancel every queued-but-not-yet-started sound (pause, skip, stop). */
  cancelAll(): void {
    for (const s of this.scheduled) { try { s.stop(); } catch { /* already ended */ } }
    this.scheduled.clear();
  }
}
