import { describe, expect, it } from 'vitest';
import { compile, formatClock, groupPlan, mulberry32, simplePlan, totalDuration, totals } from './plan';

describe('compile', () => {
  it('flattens a simple plan into prep, work and rest phases without trailing rest', () => {
    const phases = compile(simplePlan({ rounds: 3, work: 180, rest: 60, prep: 10 }));
    expect(phases.map((p) => p.kind)).toEqual(['prep', 'work', 'rest', 'work', 'rest', 'work']);
    expect(phases.map((p) => p.index)).toEqual([0, 1, 1, 2, 2, 3]);
    expect(totalDuration(simplePlan({ rounds: 3, work: 180, rest: 60, prep: 10 }))).toBe(10 + 3 * 180 + 2 * 60);
  });

  it('puts the start bell at offset 0 and the clapper 10 s before the end of work', () => {
    const [, work] = compile(simplePlan({ rounds: 2, work: 180, rest: 60 }));
    expect(work!.cues).toEqual([
      { offset: 0, sound: 'bell', kind: 'start' },
      { offset: 170, sound: 'clack', kind: 'warning' },
    ]);
  });

  it('gives rest the end bell, seconds-out warning and a 3-2-1 countdown', () => {
    const [, , rest] = compile(simplePlan({ rounds: 2, work: 180, rest: 60 }));
    expect(rest!.cues.map((c) => [c.offset, c.sound, c.kind, c.voice])).toEqual([
      [0, 'bell', 'start', undefined], [50, 'beep', 'warning', 'voice.seconds_out'], [57, 'beep', 'countdown', '3'], [58, 'beep', 'countdown', '2'], [59, 'beep', 'countdown', '1'],
    ]);
  });

  it('drops warnings that would land before the phase starts', () => {
    const phases = compile(simplePlan({ rounds: 8, work: 20, rest: 10, prep: 0 }));
    const work = phases.find((p) => p.kind === 'work')!;
    expect(work.cues).toEqual([{ offset: 0, sound: 'bell', kind: 'start' }, { offset: 10, sound: 'clack', kind: 'warning' }]);
    const rest = phases.find((p) => p.kind === 'rest')!;
    expect(rest.cues.map((c) => c.offset)).toEqual([0, 7, 8, 9]);
  });

  it('skips rest phases when rest is zero (EMOM)', () => {
    const phases = compile(simplePlan({ rounds: 3, work: 60, rest: 0, prep: 0 }));
    expect(phases.map((p) => p.kind)).toEqual(['work', 'work', 'work']);
  });

  it('expands repeating inner-round alerts', () => {
    const plan = simplePlan({ rounds: 1, work: 120, rest: 0, prep: 0 });
    plan.cues = [{ at: 10, sound: 'clack' }, { at: 0, sound: 'beep', repeatEvery: 30 }];
    const [work] = compile(plan);
    expect(work!.cues.map((c) => c.offset)).toEqual([0, 30, 60, 90, 110]);
  });

  it('merges cues within 300 ms keeping the higher priority one', () => {
    const plan = simplePlan({ rounds: 1, work: 60, rest: 0, prep: 0 });
    plan.cues = [{ at: 30, sound: 'clack' }, { at: 0, sound: 'beep', repeatEvery: 30 }];
    const [work] = compile(plan);
    expect(work!.cues).toEqual([{ offset: 0, sound: 'bell', kind: 'start' }, { offset: 30, sound: 'clack', kind: 'warning' }]);
  });

  it('speaks the block label and note at round start', () => {
    const plan = simplePlan({ rounds: 1, work: 60, rest: 0, prep: 0 });
    plan.blocks[0]!.label = 'Sparring'; plan.blocks[0]!.note = 'Southpaw';
    expect(compile(plan)[0]!.cues[0]).toMatchObject({ kind: 'start', voice: 'Sparring. Southpaw' });
  });

  it('clamps out-of-range inputs', () => {
    const plan = simplePlan({ rounds: 500, work: 1, rest: -5, prep: 99 });
    expect(plan.blocks[0]).toMatchObject({ count: 99, work: 5, rest: 0 });
    expect(plan.prep).toBe(60);
  });

  it('computes totals', () => {
    const t = totals(compile(simplePlan({ rounds: 3, work: 180, rest: 60, prep: 10 })));
    expect(t).toEqual({ work: 540, rest: 120, other: 10, total: 670, rounds: 3 });
  });
});

describe('v2 cues', () => {
  it('random cues fall inside the configured gap window and never in the last second', () => {
    const plan = simplePlan({ rounds: 1, work: 120, rest: 0, prep: 0 });
    plan.blocks[0]!.random = { minGap: 4, maxGap: 9, sound: 'whistle', hideClock: true };
    for (const seed of [1, 2, 3, 42]) {
      const [work] = compile(plan, seed);
      const offs = work!.cues.filter((c) => c.kind === 'random').map((c) => c.offset);
      expect(offs.length).toBeGreaterThan(10);
      let prev = 0;
      for (const o of offs) { const gap = o - prev; expect(gap).toBeGreaterThanOrEqual(3.9); expect(gap).toBeLessThanOrEqual(9.1); prev = o; }
      expect(offs[offs.length - 1]).toBeLessThan(119);
      expect(work!.hideClock).toBe(true);
    }
    expect(compile(plan, 7)).toEqual(compile(plan, 7)); // reproducible per seed
    expect(compile(plan, 7)).not.toEqual(compile(plan, 8));
  });

  it('callouts are spoken every N seconds, in sequence across rounds, away from the clapper', () => {
    const plan = simplePlan({ rounds: 2, work: 60, rest: 10, prep: 0 });
    plan.blocks[0]!.callouts = ['1 2', '1 2 3'];
    plan.calloutEvery = 20; plan.calloutOrder = 'sequence';
    const [r1, , r2] = compile(plan);
    const pick = (p: typeof r1) => p!.cues.filter((c) => c.kind === 'callout').map((c) => [c.offset, c.voice]);
    expect(pick(r1)).toEqual([[5, '1 2'], [25, '1 2 3'], [45, '1 2']]);
    expect(pick(r2)).toEqual([[5, '1 2 3'], [25, '1 2'], [45, '1 2 3']]);
    expect(r1!.cues.every((c) => c.kind !== 'callout' || c.offset < 55)).toBe(true);
  });

  it('a callout landing on a bell yields to it', () => {
    const plan = simplePlan({ rounds: 1, work: 60, rest: 0, prep: 0 });
    plan.blocks[0]!.callouts = ['1 2']; plan.calloutEvery = 45; // 5, 50 -> 50 collides with the clapper
    const [work] = compile(plan);
    expect(work!.cues.filter((c) => c.offset === 50)).toEqual([{ offset: 50, sound: 'clack', kind: 'warning', voice: '1 2' }]);
  });

  it('staggered groups start offset×k later and share everything else', () => {
    const plan = simplePlan({ rounds: 3, work: 60, rest: 30, prep: 10 });
    plan.groups = { count: 3, offset: 15 };
    expect(groupPlan(plan, 0)).toBe(plan);
    expect(compile(groupPlan(plan, 1))[0]).toMatchObject({ kind: 'prep', duration: 25 });
    expect(compile(groupPlan(plan, 2))[0]).toMatchObject({ kind: 'prep', duration: 40 });
    expect(totalDuration(groupPlan(plan, 2))).toBe(totalDuration(plan) + 30);
  });

  it('mulberry32 is deterministic and uniform-ish', () => {
    const a = mulberry32(5), b = mulberry32(5);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.45); expect(mean).toBeLessThan(0.55);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe('formatClock', () => {
  it('rounds up so the display never shows 0:00 while time remains', () => {
    expect(formatClock(180)).toBe('03:00');
    expect(formatClock(179.2)).toBe('03:00');
    expect(formatClock(59.01)).toBe('01:00');
    expect(formatClock(0.4)).toBe('00:01');
    expect(formatClock(0)).toBe('00:00');
  });
  it('shows tenths under 10 s when enabled', () => {
    expect(formatClock(9.87, true)).toBe('9.8');
    expect(formatClock(12, true)).toBe('00:12');
  });
});
