// Session plan types (blueprint §Data model) and the compiler that flattens a
// plan into timed phases. Framework-free; the scheduler reads only `Phase[]`.

export type Sound = 'bell' | 'gong' | 'horn' | 'whistle' | 'clack' | 'beep' | 'none';
export const SOUNDS: Sound[] = ['bell', 'gong', 'horn', 'whistle', 'clack', 'beep', 'none'];

export type Sport =
  | 'boxing' | 'mma' | 'muaythai' | 'kickboxing' | 'bjj' | 'wrestling' | 'hiit' | 'custom';

export interface Cue {
  at: number;            // seconds before the END of the phase
  sound: Sound;
  voice?: string;        // i18n key to speak (reserved for v1 voice)
  repeatEvery?: number;  // inner-round alert: every N s from phase start
}

export interface RoundBlock {
  id: string;
  label?: string;
  note?: string;
  count: number;
  work: number;
  rest: number;
  cues?: Cue[];
}

export interface SessionPlan {
  version: 1;
  id: string;
  name: string;
  sport?: Sport;
  prep: number;
  warmup?: number;
  cooldown?: number;
  blocks: RoundBlock[];
  cues: Cue[];
  restCues?: Cue[];
  sounds: { start: Sound; end: Sound; restEnd: Sound; countdown: Sound };
  builtIn?: boolean;
}

export type PhaseKind = 'prep' | 'warmup' | 'work' | 'rest' | 'cooldown';

export interface PhaseCue {
  offset: number;  // seconds from phase start
  sound: Sound;
  voice?: string;
  kind: 'start' | 'warning' | 'inner' | 'countdown' | 'final';
}

export interface Phase {
  kind: PhaseKind;
  index: number;   // 1-based round number for work/rest, 0 otherwise
  total: number;   // total rounds in the session
  duration: number;
  label?: string;
  note?: string;
  cues: PhaseCue[];
}

export const DEFAULT_SOUNDS: SessionPlan['sounds'] = {
  start: 'bell',
  end: 'bell',
  restEnd: 'beep',
  countdown: 'beep',
};

export const DEFAULT_CUES: Cue[] = [{ at: 10, sound: 'clack' }];

export const LIMITS = {
  rounds: { min: 1, max: 99 },
  work: { min: 5, max: 3600 },
  rest: { min: 0, max: 3600 },
  prep: { min: 0, max: 60 },
} as const;

export function clamp(n: number, { min, max }: { min: number; max: number }): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** A simple-mode plan: one block, default cues and sounds. */
export function simplePlan(
  p: { rounds: number; work: number; rest: number; prep?: number; name?: string; sport?: Sport },
): SessionPlan {
  return {
    version: 1,
    id: newId(),
    name: p.name ?? '',
    sport: p.sport ?? 'custom',
    prep: clamp(p.prep ?? 10, LIMITS.prep),
    blocks: [{ id: newId(), count: clamp(p.rounds, LIMITS.rounds), work: clamp(p.work, LIMITS.work), rest: clamp(p.rest, LIMITS.rest) }],
    cues: DEFAULT_CUES.map((c) => ({ ...c })),
    restCues: [{ at: 10, sound: 'beep', voice: 'voice.seconds_out' }],
    sounds: { ...DEFAULT_SOUNDS },
  };
}

export function totalRounds(plan: SessionPlan): number {
  return plan.blocks.reduce((n, b) => n + b.count, 0);
}

/** Total seconds the plan will run, including prep, warm-up and cool-down. */
export function totalDuration(plan: SessionPlan): number {
  return compile(plan).reduce((s, p) => s + p.duration, 0);
}

export interface Totals { work: number; rest: number; other: number; total: number; rounds: number }

export function totals(phases: Phase[], upTo = phases.length): Totals {
  const t: Totals = { work: 0, rest: 0, other: 0, total: 0, rounds: 0 };
  for (const p of phases.slice(0, upTo)) {
    t.total += p.duration;
    if (p.kind === 'work') { t.work += p.duration; t.rounds += 1; }
    else if (p.kind === 'rest') t.rest += p.duration;
    else t.other += p.duration;
  }
  return t;
}

function expandCues(cues: Cue[], duration: number, kind: PhaseCue['kind']): PhaseCue[] {
  const out: PhaseCue[] = [];
  for (const c of cues) {
    if (c.sound === 'none' && !c.voice) continue;
    if (c.repeatEvery && c.repeatEvery > 0) {
      for (let off = c.repeatEvery; off < duration; off += c.repeatEvery) {
        out.push({ offset: off, sound: c.sound, kind: 'inner' });
      }
    } else if (c.at > 0 && c.at < duration) {
      out.push({ offset: duration - c.at, sound: c.sound, voice: c.voice, kind });
    }
  }
  return out;
}

/** 3-2-1 countdown beeps at the end of a phase that leads into work. */
function countdownCues(duration: number, sound: Sound): PhaseCue[] {
  const out: PhaseCue[] = [];
  if (sound === 'none') return out;
  for (const s of [3, 2, 1]) if (s < duration) out.push({ offset: duration - s, sound, kind: 'countdown' });
  return out;
}

function sortCues(cues: PhaseCue[]): PhaseCue[] {
  // Merge cues landing within 300 ms: priority final > start > warning > inner > countdown.
  const prio: Record<PhaseCue['kind'], number> = { final: 5, start: 4, warning: 3, inner: 2, countdown: 1 };
  const sorted = [...cues].sort((a, b) => a.offset - b.offset || prio[b.kind] - prio[a.kind]);
  const merged: PhaseCue[] = [];
  for (const c of sorted) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.offset - c.offset) < 0.3) {
      if (prio[c.kind] > prio[last.kind]) merged[merged.length - 1] = c;
      continue;
    }
    merged.push(c);
  }
  return merged;
}

/**
 * Flatten a plan into phases with cue offsets from phase start.
 * Bell convention: each work phase opens with `sounds.start`; each rest phase
 * opens with `sounds.end` (the end-of-round bell); the last work phase is
 * followed by a `final` cue at its end. Rest/prep phases get countdown beeps
 * into the next round so a bell never doubles with a countdown.
 */
export function compile(plan: SessionPlan): Phase[] {
  const phases: Phase[] = [];
  const total = totalRounds(plan);
  const s = plan.sounds;

  if (plan.warmup && plan.warmup > 0) {
    phases.push({ kind: 'warmup', index: 0, total, duration: plan.warmup, cues: [] });
  }
  if (plan.prep > 0) {
    phases.push({ kind: 'prep', index: 0, total, duration: plan.prep, cues: sortCues(countdownCues(plan.prep, s.countdown)) });
  }

  let round = 0;
  for (const block of plan.blocks) {
    for (let i = 0; i < block.count; i++) {
      round += 1;
      const isLast = round === total;
      const workCues: PhaseCue[] = [{ offset: 0, sound: s.start, kind: 'start' }];
      workCues.push(...expandCues(block.cues ?? plan.cues, block.work, 'warning'));
      phases.push({
        kind: 'work', index: round, total, duration: block.work,
        label: block.label, note: block.note, cues: sortCues(workCues),
      });
      if (isLast) break;
      if (block.rest > 0) {
        const restCues: PhaseCue[] = [{ offset: 0, sound: s.end, kind: 'start' }];
        restCues.push(...expandCues(plan.restCues ?? [], block.rest, 'warning'));
        restCues.push(...countdownCues(block.rest, s.countdown));
        phases.push({ kind: 'rest', index: round, total, duration: block.rest, cues: sortCues(restCues) });
      }
    }
  }

  if (plan.cooldown && plan.cooldown > 0) {
    phases.push({ kind: 'cooldown', index: 0, total, duration: plan.cooldown, cues: [{ offset: 0, sound: s.end, kind: 'start' }] });
  }
  return phases;
}

/** The cue to play when the whole session ends (after the last phase). */
export function finalCue(plan: SessionPlan): PhaseCue {
  return { offset: 0, sound: plan.sounds.end, kind: 'final' };
}

export function formatClock(seconds: number, tenths = false): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  if (tenths && s < 10) return `${Math.floor(s)}.${Math.floor((s % 1) * 10)}`;
  const whole = Math.ceil(r);
  if (whole === 60) return `${String(m + 1).padStart(2, '0')}:00`;
  return `${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}`;
}

export function formatShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
