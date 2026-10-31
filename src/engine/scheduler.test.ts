import { beforeEach, describe, expect, it } from 'vitest';
import { Scheduler, type SchedulerEvent } from './scheduler';
import { simplePlan } from './plan';

class FakeClock { t = 0; now() { return this.t; } advance(ms: number) { this.t += ms; } }

let clock: FakeClock;
let s: Scheduler;
let events: SchedulerEvent[];

beforeEach(() => {
  clock = new FakeClock();
  s = new Scheduler(clock, 1500);
  events = [];
  s.on((e) => events.push(e));
  s.load(simplePlan({ rounds: 2, work: 180, rest: 60, prep: 10 }));
});

const kinds = () => events.filter((e) => e.type === 'phase').map((e) => (e as { phase: { kind: string } }).phase.kind);

describe('Scheduler', () => {
  it('starts in prep and derives remaining time from the clock', () => {
    s.start();
    clock.advance(4000);
    const snap = s.snapshot();
    expect(snap.phase?.kind).toBe('prep');
    expect(snap.remainingMs).toBe(6000);
    expect(snap.elapsedTotalMs).toBe(4000);
  });

  it('crosses phase boundaries exactly on the timestamp, with no drift over a long session', () => {
    s.load(simplePlan({ rounds: 12, work: 180, rest: 60, prep: 10 }));
    s.start();
    // 60-minute session in uneven frames
    const total = (10 + 12 * 180 + 11 * 60) * 1000;
    let t = 0;
    while (t < total) { const step = 13 + (t % 17); clock.advance(step); t += step; s.tick(); }
    expect(s.snapshot().status).toBe('finished');
    expect(events.filter((e) => e.type === 'phase').length).toBe(1 + 12 + 11);
  });

  it('hands out cues within the look-ahead window exactly once', () => {
    s.start();
    expect(s.dueCues().map((c) => c.at)).toEqual([7000, 8000, 9000].filter((a) => a <= 1500)); // nothing yet
    clock.advance(6000); s.tick();
    expect(s.dueCues().map((c) => [c.cue.kind, c.at])).toEqual([['countdown', 7000]]);
    expect(s.dueCues()).toEqual([]);
    clock.advance(1000); s.tick();
    expect(s.dueCues().map((c) => c.at)).toEqual([8000]);
    clock.advance(3000); // a 3 s frame gap crosses into work: the 9000 cue is still within tolerance
    expect(s.tick().map((c) => [c.cue.kind, c.at])).toEqual([['countdown', 9000]]);
    expect(s.snapshot().phase?.kind).toBe('work');
    expect(s.dueCues().map((c) => [c.cue.kind, c.at])).toEqual([['start', 10000]]);
  });

  it('pause freezes remaining time and resume recomputes the end timestamp', () => {
    s.start();
    clock.advance(10000); s.tick();
    clock.advance(30000); s.tick();
    s.pause();
    clock.advance(99999);
    expect(s.snapshot().remainingMs).toBe(150000);
    expect(s.snapshot().elapsedTotalMs).toBe(40000);
    s.resume();
    clock.advance(150000 - 1); s.tick();
    expect(s.snapshot().phase?.kind).toBe('work');
    clock.advance(1); s.tick();
    expect(s.snapshot().phase?.kind).toBe('rest');
    expect(s.snapshot().elapsedTotalMs).toBe(190000);
  });

  it('re-hands cues that were queued but not reached before a pause', () => {
    s.start();
    clock.advance(10000); s.tick();
    clock.advance(169000); s.tick(); // 1 s before the clapper
    expect(s.dueCues().map((c) => c.cue.kind)).toEqual(['start', 'warning']);
    s.pause();
    clock.advance(5000);
    s.resume();
    expect(s.dueCues().map((c) => c.cue.kind)).toEqual(['warning']);
  });

  it('skip moves to the next phase and keeps total elapsed continuous', () => {
    s.start();
    clock.advance(5000); s.tick();
    s.skip();
    expect(s.snapshot().phase?.kind).toBe('work');
    expect(s.snapshot().remainingMs).toBe(180000);
    expect(s.snapshot().elapsedTotalMs).toBe(5000);
    s.skip(); s.skip(); s.skip();
    expect(s.snapshot().status).toBe('finished');
  });

  it('skip while paused stays paused with the full next phase', () => {
    s.start();
    clock.advance(3000); s.tick(); s.pause(); s.skip();
    expect(s.snapshot().status).toBe('paused');
    expect(s.snapshot().remainingMs).toBe(180000);
    s.resume(); clock.advance(1000); s.tick();
    expect(s.snapshot().remainingMs).toBe(179000);
  });

  it('restartPhase resets the current phase only', () => {
    s.start();
    clock.advance(10000); s.tick();
    clock.advance(50000); s.tick();
    s.restartPhase();
    expect(s.snapshot().remainingMs).toBe(180000);
    expect(s.snapshot().elapsedTotalMs).toBe(10000);
  });

  it('recovers from a suspended page: advances several phases and fires the missed cue once', () => {
    s.start();
    clock.advance(1000); s.tick(); s.dueCues();
    clock.advance(10 * 60 * 1000); // woke up 10 minutes later: session is 490 s long
    const late = s.tick();
    expect(s.snapshot().status).toBe('finished');
    expect(late.map((c) => c.cue.kind)).toContain('final');
    expect(late.filter((c) => c.cue.kind === 'final').length).toBe(1);
    expect(s.dueCues()).toEqual([]);
  });

  it('recovers mid-session: lands in the right phase with the right remaining time', () => {
    s.start();
    clock.advance(1000); s.tick();
    clock.advance(200000); // t = 201 s: prep 10 + work 180 = 190, rest until 250
    const late = s.tick();
    expect(s.snapshot().phase?.kind).toBe('rest');
    expect(s.snapshot().remainingMs).toBe(49000);
    expect(late.map((c) => c.cue.kind)).toEqual(['start']); // only the most recent missed cue: the rest bell
    expect(events.some((e) => e.type === 'late')).toBe(true);
  });

  it('final bell is scheduled once at the end of the last work phase', () => {
    s.load(simplePlan({ rounds: 1, work: 20, rest: 0, prep: 0 }));
    s.start();
    clock.advance(18600); s.tick();
    expect(s.dueCues().map((c) => [c.cue.kind, c.at])).toEqual([['start', 0], ['warning', 10000], ['final', 20000]]);
    clock.advance(1400); s.tick();
    expect(s.tick()).toEqual([]);
    expect(s.snapshot().status).toBe('finished');
  });

  it('stop returns to idle', () => {
    s.start(); clock.advance(500); s.stop();
    expect(s.snapshot().status).toBe('idle');
    expect(kinds()).toEqual(['prep']);
  });
});
