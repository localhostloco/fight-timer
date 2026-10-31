import { beforeEach, describe, expect, it } from 'vitest';
import { exportPresets, importPresets } from './transfer';
import { userPresets } from './presets';
import { simplePlan } from '../engine/plan';

describe('import/export', () => {
  beforeEach(() => { userPresets.value = []; });
  it('round-trips presets through the export file', () => {
    userPresets.value = [simplePlan({ rounds: 5, work: 120, rest: 30, name: 'A' }), simplePlan({ rounds: 2, work: 60, rest: 0, name: 'B' })];
    const text = exportPresets();
    const saved = userPresets.value;
    userPresets.value = [];
    expect(importPresets(text)).toBe(2);
    expect(userPresets.value.map((p) => p.name)).toEqual(['A', 'B']);
    expect(userPresets.value[0]!.blocks[0]).toEqual(saved[0]!.blocks[0]);
  });
  it('gives colliding ids a new id and rejects foreign files', () => {
    const p = simplePlan({ rounds: 1, work: 60, rest: 0, name: 'A' });
    userPresets.value = [p];
    expect(importPresets(JSON.stringify([p]))).toBe(1);
    expect(userPresets.value.length).toBe(2);
    expect(new Set(userPresets.value.map((x) => x.id)).size).toBe(2);
    expect(importPresets('{"foo":1}')).toBeNull();
    expect(importPresets('garbage')).toBeNull();
  });
});
