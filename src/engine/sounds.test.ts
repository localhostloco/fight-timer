import { describe, expect, it } from 'vitest';
import { SOUNDS } from './plan';
import { SOUND_SECONDS, generate } from './sounds';

describe('sound generators', () => {
  const sr = 44100;
  for (const s of SOUNDS.filter((x) => x !== 'none')) {
    it(`${s} renders a finite, audible, non-clipping buffer that ends silently`, () => {
      const buf = generate(s, sr)!;
      expect(buf.length).toBe(Math.ceil(SOUND_SECONDS[s] * sr));
      let peak = 0, rms = 0;
      for (const v of buf) { expect(Number.isFinite(v)).toBe(true); peak = Math.max(peak, Math.abs(v)); rms += v * v; }
      rms = Math.sqrt(rms / buf.length);
      expect(peak).toBeLessThanOrEqual(1);
      expect(peak).toBeGreaterThan(0.3);
      expect(rms).toBeGreaterThan(0.01);
      expect(Math.abs(buf[buf.length - 1]!)).toBeLessThan(0.01);
    });
  }
  it('onsets are not louder than the tonal body (no static burst at the start)', () => {
    for (const s of ['bell', 'bell3', 'gong', 'drum', 'horn', 'whistle'] as const) {
      const buf = generate(s, sr)!;
      const rms = (from: number, to: number) => { let e = 0; for (let i = from; i < to; i++) e += buf[i]! ** 2; return Math.sqrt(e / (to - from)); };
      const onset = rms(0, Math.floor(sr * 0.01));
      const body = rms(Math.floor(sr * 0.02), Math.floor(sr * 0.12));
      expect(onset, s).toBeLessThan(body * 1.5);
    }
  });
  it('none renders nothing', () => { expect(generate('none', sr)).toBeNull(); });
  it('is deterministic', () => { expect(generate('clack', sr)).toEqual(generate('clack', sr)); });
});
