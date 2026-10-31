// Web Audio engine. One AudioContext created on the first user gesture; every
// sound is synthesized into an AudioBuffer once, so a bell never fetches or
// decodes at play time. Cues are placed on the audio clock from clock-ms
// timestamps, which keeps them on time when the UI thread is throttled.

import { SOUNDS, type Sound } from './plan';
import { generate } from './sounds';
import { getCustom, listCustom } from '../store/customSounds';

type Ctx = AudioContext;

function synth(ctx: Ctx, sound: Sound): AudioBuffer | null {
  const data = generate(sound, ctx.sampleRate);
  if (!data) return null;
  const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buf.copyToChannel(data, 0);
  return buf;
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
      for (const s of SOUNDS) this.buffers.set(s, synth(this.ctx, s));
      void this.loadSamples().then(() => this.loadCustom());
    }
    if (this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch { /* blocked until a gesture */ } }
    return this.ready;
  }

  /**
   * Recorded samples override the synthesized sounds when present under
   * public/sounds/<id>.(mp3|ogg|wav). Missing files are the normal case and
   * fall back silently; the service worker precaches the folder, so the
   * fetch is local after the first visit.
   */
  private async loadSamples(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || typeof fetch === 'undefined') return;
    const base = import.meta.env.BASE_URL;
    await Promise.all(SOUNDS.filter((s) => s !== 'none').map(async (s) => {
      for (const ext of ['mp3', 'ogg', 'wav']) {
        try {
          const res = await fetch(`${base}sounds/${s}.${ext}`, { cache: 'force-cache' });
          if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('audio/')) continue;
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(s, buf);
          return;
        } catch { /* try next extension, then keep the synth */ }
      }
    }));
  }

  /** Custom uploads win over shipped samples and synth. Called on unlock and after an upload. */
  async loadCustom(ids?: Sound[]): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const list = ids ?? (await listCustom());
    await Promise.all(list.map(async (id) => {
      const c = await getCustom(id);
      if (!c) { this.buffers.set(id, synth(ctx, id)); return; }
      try { this.buffers.set(id, await ctx.decodeAudioData(c.data.slice(0))); } catch { /* keep current buffer */ }
    }));
  }

  /** Decode a file to prove it plays before storing it. */
  async canDecode(data: ArrayBuffer): Promise<boolean> {
    if (!this.ctx) return false;
    try { await this.ctx.decodeAudioData(data.slice(0)); return true; } catch { return false; }
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
