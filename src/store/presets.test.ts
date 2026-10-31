import { describe, expect, it } from 'vitest';
import { builtInPresets, loadUserPresets } from './presets';
import { compile, totalDuration } from '../engine/plan';
import en from '../locales/en.json';

describe('built-in presets', () => {
  it('match the blueprint table and have translated names', () => {
    const by = Object.fromEntries(builtInPresets().map((p) => [p.id, p]));
    expect(by['builtin.boxing_pro']!.blocks[0]).toMatchObject({ count: 12, work: 180, rest: 60 });
    expect(by['builtin.tabata']!.blocks[0]).toMatchObject({ count: 8, work: 20, rest: 10 });
    expect(compile(by['builtin.emom']!).map((p) => p.kind).every((k) => k !== 'rest')).toBe(true);
    expect(Math.round(totalDuration(by['builtin.boxing_pro']!) / 60)).toBe(47);
    for (const p of builtInPresets()) expect(p.name in en, p.name).toBe(true);
  });
});

describe('loadUserPresets', () => {
  const mem = (v: string | null): Storage => ({ getItem: () => v } as unknown as Storage);
  it('ignores corrupt storage', () => {
    expect(loadUserPresets(mem('{nope'))).toEqual([]);
    expect(loadUserPresets(mem('[{"id":1}]'))).toEqual([]);
    expect(loadUserPresets(null)).toEqual([]);
  });
});
