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
  it('none renders nothing', () => { expect(generate('none', sr)).toBeNull(); });
  it('is deterministic', () => { expect(generate('clack', sr)).toEqual(generate('clack', sr)); });
});
