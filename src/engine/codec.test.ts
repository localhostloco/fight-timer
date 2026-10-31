import { describe, expect, it } from 'vitest';
import { decodePlan, encodePlan } from './codec';
import { compile, simplePlan, type SessionPlan } from './plan';

describe('share codec', () => {
  it('round-trips a three-block plan with labels, notes, sounds and warm-up unchanged', () => {
    const plan: SessionPlan = {
      ...simplePlan({ rounds: 1, work: 180, rest: 60, prep: 10, name: 'Pad class', sport: 'boxing' }),
      warmup: 120, cooldown: 60,
      blocks: [
        { id: 'a', count: 3, work: 180, rest: 60, label: 'Technique' },
        { id: 'b', count: 3, work: 120, rest: 45, label: 'Sparring', note: 'Body shots only' },
        { id: 'c', count: 2, work: 30, rest: 15 },
      ],
      cues: [{ at: 15, sound: 'whistle' }],
      sounds: { start: 'gong', end: 'bell', restEnd: 'beep', countdown: 'none', warning: 'whistle', final: 'horn' },
    };
    const payload = encodePlan(plan);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = decodePlan(payload)!;
    expect(back.blocks.map(({ id: _id, ...b }) => b)).toEqual(plan.blocks.map(({ id: _id, ...b }) => b));
    expect(back).toMatchObject({ name: 'Pad class', sport: 'boxing', prep: 10, warmup: 120, cooldown: 60, cues: [{ at: 15, sound: 'whistle' }] });
    expect(back.sounds).toEqual(plan.sounds);
    expect(compile(back).map((p) => [p.kind, p.duration])).toEqual(compile(plan).map((p) => [p.kind, p.duration]));
  });

  it('round-trips random cues, callouts and groups', () => {
    const plan = simplePlan({ rounds: 2, work: 120, rest: 30, name: 'Reaction' });
    plan.blocks[0]!.random = { minGap: 3, maxGap: 8, sound: 'whistle', hideClock: true };
    plan.blocks[0]!.callouts = ['1 2', '1 2 3 2'];
    plan.calloutEvery = 15; plan.calloutOrder = 'sequence';
    plan.groups = { count: 2, offset: 20 };
    const back = decodePlan(encodePlan(plan))!;
    expect(back.blocks[0]!.random).toEqual(plan.blocks[0]!.random);
    expect(back.blocks[0]!.callouts).toEqual(plan.blocks[0]!.callouts);
    expect(back).toMatchObject({ calloutEvery: 15, calloutOrder: 'sequence', groups: { count: 2, offset: 20 } });
    const hostile = decodePlan(btoa('{"v":1,"b":[{"c":1,"w":60,"r":0,"rd":[0,9999,"x",1],"co":[1,"ok"]}],"g":[5,1]}'))!;
    expect(hostile.blocks[0]!.random).toEqual({ minGap: 2, maxGap: 120, sound: 'whistle', hideClock: true });
    expect(hostile.blocks[0]!.callouts).toEqual(['ok']);
    expect(hostile.groups).toBeUndefined();
  });

  it('keeps a default simple plan short', () => {
    expect(encodePlan(simplePlan({ rounds: 12, work: 180, rest: 60 })).length).toBeLessThan(80);
  });

  it('handles unicode names', () => {
    const p = simplePlan({ rounds: 3, work: 60, rest: 30, name: 'Sparring de terça — 🥊' });
    expect(decodePlan(encodePlan(p))!.name).toBe('Sparring de terça — 🥊');
  });

  it('rejects garbage and clamps hostile values', () => {
    expect(decodePlan('not-base64!')).toBeNull();
    expect(decodePlan(btoa('{"v":2}'))).toBeNull();
    expect(decodePlan(btoa('{"v":1,"b":[]}'))).toBeNull();
    const p = decodePlan(btoa('{"v":1,"p":999,"b":[{"c":9999,"w":-1,"r":"x","l":"' + 'a'.repeat(500) + '"}],"s":{"st":"evil"}}'))!;
    expect(p.prep).toBe(60);
    expect(p.blocks[0]).toMatchObject({ count: 99, work: 5, rest: 60 });
    expect(p.blocks[0]!.label!.length).toBe(80);
    expect(p.sounds.start).toBe('bell');
  });
});
