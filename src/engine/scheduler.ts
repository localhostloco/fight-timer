// Timestamp-based session scheduler. Never counts ticks: each phase has an
// absolute end time on an injected monotonic clock (performance.now in the
// browser, a fake in tests). Cues are handed out ahead of time so the audio
// engine can place them on the Web Audio clock.

import type { Phase, PhaseCue, SessionPlan } from './plan';
import { compile, finalCue } from './plan';

export type Status = 'idle' | 'running' | 'paused' | 'finished';

export interface Clock { now(): number } // milliseconds, monotonic

export interface Snapshot {
  status: Status;
  phase: Phase | null;
  next: Phase | null;
  current: number;
  phases: Phase[];
  remainingMs: number;
  elapsedPhaseMs: number;
  elapsedTotalMs: number;
  durationTotalMs: number;
}

export interface DueCue { cue: PhaseCue; at: number } // `at` in clock ms

export type SchedulerEvent =
  | { type: 'phase'; phase: Phase; index: number }
  | { type: 'finished' }
  | { type: 'status'; status: Status }
  | { type: 'late'; missedMs: number };

export class Scheduler {
  private phases: Phase[] = [];
  private plan: SessionPlan | null = null;
  private status: Status = 'idle';
  private current = -1;
  private phaseStartedAt = 0;
  private phaseEndsAt = 0;
  private pausedRemaining = 0;
  private pausedElapsedTotal = 0;
  private sessionStartedAt = 0;
  private cuePointer = 0;
  private finalFired = false;
  private listeners = new Set<(e: SchedulerEvent) => void>();

  constructor(private clock: Clock, private lookaheadMs = 1500) {}

  on(fn: (e: SchedulerEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(e: SchedulerEvent) { for (const fn of this.listeners) fn(e); }

  load(plan: SessionPlan): void {
    this.plan = plan;
    this.phases = compile(plan);
    this.status = 'idle';
    this.current = -1;
    this.finalFired = false;
    this.emit({ type: 'status', status: 'idle' });
  }

  get phaseList(): Phase[] { return this.phases; }
  get currentStatus(): Status { return this.status; }

  start(): void {
    if (!this.plan || this.phases.length === 0) return;
    const now = this.clock.now();
    this.sessionStartedAt = now;
    this.pausedElapsedTotal = 0;
    this.finalFired = false;
    this.status = 'running';
    this.emit({ type: 'status', status: 'running' });
    this.enterPhase(0, now);
  }

  private enterPhase(index: number, at: number): void {
    const phase = this.phases[index];
    if (!phase) { this.finish(); return; }
    this.current = index;
    this.phaseStartedAt = at;
    this.phaseEndsAt = at + phase.duration * 1000;
    this.cuePointer = 0;
    this.emit({ type: 'phase', phase, index });
  }

  private finish(): void {
    this.status = 'finished';
    this.current = this.phases.length;
    this.emit({ type: 'status', status: 'finished' });
    this.emit({ type: 'finished' });
  }

  pause(): void {
    if (this.status !== 'running') return;
    const now = this.clock.now();
    this.pausedRemaining = Math.max(0, this.phaseEndsAt - now);
    this.pausedElapsedTotal = this.elapsedTotalAt(now);
    this.status = 'paused';
    // Cues not yet reached replay after resume; cues already queued by the
    // audio engine are cancelled by the caller via cancelFrom().
    const elapsedS = (now - this.phaseStartedAt) / 1000;
    this.cuePointer = this.cuesBefore(elapsedS);
    this.emit({ type: 'status', status: 'paused' });
  }

  resume(): void {
    if (this.status !== 'paused') return;
    const now = this.clock.now();
    const phase = this.phases[this.current];
    if (!phase) return;
    this.phaseEndsAt = now + this.pausedRemaining;
    this.phaseStartedAt = this.phaseEndsAt - phase.duration * 1000;
    this.sessionStartedAt = now - this.pausedElapsedTotal;
    this.status = 'running';
    this.emit({ type: 'status', status: 'running' });
  }

  toggle(): void { this.status === 'running' ? this.pause() : this.resume(); }

  /** Jump to the next phase (or finish). Works while running or paused. */
  skip(): void {
    if (this.status !== 'running' && this.status !== 'paused') return;
    const now = this.clock.now();
    const consumed = this.elapsedTotalAt(now);
    const wasPaused = this.status === 'paused';
    this.sessionStartedAt = now - consumed;
    this.pausedElapsedTotal = consumed;
    if (this.current + 1 >= this.phases.length) { this.finish(); return; }
    this.enterPhase(this.current + 1, now);
    if (wasPaused) {
      this.pausedRemaining = this.phaseEndsAt - now;
    }
  }

  /** Restart the current phase from its full duration. */
  restartPhase(): void {
    if (this.status !== 'running' && this.status !== 'paused') return;
    const now = this.clock.now();
    const phase = this.phases[this.current];
    if (!phase) return;
    const consumed = this.elapsedTotalAt(now) - (now - this.phaseStartedAt);
    this.sessionStartedAt = now - consumed;
    this.pausedElapsedTotal = consumed;
    this.enterPhase(this.current, now);
    if (this.status === 'paused') this.pausedRemaining = phase.duration * 1000;
  }

  stop(): void {
    if (this.status === 'idle') return;
    this.status = 'idle';
    this.current = -1;
    this.emit({ type: 'status', status: 'idle' });
  }

  private cuesBefore(elapsedS: number): number {
    const phase = this.phases[this.current];
    if (!phase) return 0;
    let n = 0;
    while (n < phase.cues.length && (phase.cues[n]!.offset) <= elapsedS) n++;
    return n;
  }

  private elapsedTotalAt(now: number): number {
    if (this.status === 'paused') return this.pausedElapsedTotal;
    if (this.status === 'idle') return 0;
    return now - this.sessionStartedAt;
  }

  /**
   * Advance phase boundaries that `now` has passed. Call every frame while
   * running. Returns cues that fell due while the page was suspended, so the
   * caller can fire them immediately.
   */
  tick(now = this.clock.now()): DueCue[] {
    const late: DueCue[] = [];
    if (this.status !== 'running') return late;
    let latestMissed: PhaseCue | null = null;
    while (this.status === 'running' && now >= this.phaseEndsAt) {
      const phase = this.phases[this.current]!;
      const missedMs = now - this.phaseEndsAt;
      const onTime = missedMs <= this.lookaheadMs;
      const unfired = phase.cues.slice(this.cuePointer);
      if (onTime) {
        // A frame gap crossed the boundary: cues not handed out yet are still
        // within tolerance, play them at once.
        for (const cue of unfired) late.push({ cue, at: this.phaseStartedAt + cue.offset * 1000 });
      } else if (unfired.length) {
        latestMissed = unfired[unfired.length - 1]!;
      }
      const end = this.phaseEndsAt;
      if (this.current + 1 >= this.phases.length) {
        if (this.plan && !this.finalFired) {
          this.finalFired = true;
          if (onTime) late.push({ cue: finalCue(this.plan), at: end });
          else latestMissed = finalCue(this.plan);
        }
        this.finish();
        break;
      }
      this.enterPhase(this.current + 1, end);
      if (!onTime) {
        this.emit({ type: 'late', missedMs });
        const n = this.cuesBefore((now - this.phaseStartedAt) / 1000);
        if (n > 0) latestMissed = this.phases[this.current]!.cues[n - 1]!;
        this.cuePointer = n;
      }
    }
    // After a suspension only the most recent missed cue plays, once.
    if (latestMissed) late.push({ cue: latestMissed, at: now });
    return late;
  }

  /** Cues falling within the look-ahead window that have not been handed out yet. */
  dueCues(now = this.clock.now()): DueCue[] {
    const out: DueCue[] = [];
    if (this.status !== 'running') return out;
    const phase = this.phases[this.current];
    if (!phase) return out;
    const horizon = now + this.lookaheadMs;
    while (this.cuePointer < phase.cues.length) {
      const cue = phase.cues[this.cuePointer]!;
      const at = this.phaseStartedAt + cue.offset * 1000;
      if (at > horizon) break;
      out.push({ cue, at });
      this.cuePointer++;
    }
    if (!this.finalFired && this.plan && this.current === this.phases.length - 1 && this.phaseEndsAt <= horizon) {
      out.push({ cue: finalCue(this.plan), at: this.phaseEndsAt });
      this.finalFired = true;
    }
    return out;
  }

  snapshot(now = this.clock.now()): Snapshot {
    const phase = this.phases[this.current] ?? null;
    const next = this.phases[this.current + 1] ?? null;
    const durationTotalMs = this.phases.reduce((s, p) => s + p.duration * 1000, 0);
    let remainingMs = 0, elapsedPhaseMs = 0;
    if (phase && this.status === 'running') {
      remainingMs = Math.max(0, this.phaseEndsAt - now);
      elapsedPhaseMs = Math.min(phase.duration * 1000, now - this.phaseStartedAt);
    } else if (phase && this.status === 'paused') {
      remainingMs = this.pausedRemaining;
      elapsedPhaseMs = phase.duration * 1000 - this.pausedRemaining;
    }
    const elapsedTotalMs = this.status === 'finished' ? durationTotalMs : Math.min(durationTotalMs, this.elapsedTotalAt(now));
    return {
      status: this.status, phase, next, current: this.current, phases: this.phases,
      remainingMs, elapsedPhaseMs, elapsedTotalMs, durationTotalMs,
    };
  }
}
