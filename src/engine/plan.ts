// Session plan types (blueprint §Data model) and the compiler that flattens a
// plan into timed phases. Framework-free; the scheduler reads only `Phase[]`.

export type Sound = 'bell' | 'bell3' | 'gong' | 'horn' | 'buzzer' | 'whistle' | 'clack' | 'chime' | 'drum' | 'beep' | 'none';
export const SOUNDS: Sound[] = ['bell', 'bell3', 'gong', 'horn', 'buzzer', 'whistle', 'clack', 'chime', 'drum', 'beep', 'none'];

export type Sport =
  | 'boxing' | 'mma' | 'muaythai' | 'kickboxing' | 'bjj' | 'wrestling' | 'hiit' | 'custom';

export interface Cue {
  at: number;            // seconds before the END of the phase
  sound: Sound;
  voice?: string;        // i18n key to speak (reserved for v1 voice)
  repeatEvery?: number;  // inner-round alert: every N s from phase start
}

export interface RandomCues { minGap: number; maxGap: number; sound: Sound; hideClock?: boolean }

export interface RoundBlock {
  id: string;
  label?: string;
  note?: string;
  count: number;
  work: number;
  rest: number;
  cues?: Cue[];
  random?: RandomCues;
  callouts?: string[];     // combo list spoken during work, picked per `calloutOrder`
}

export interface Groups { count: 2 | 3; offset: number } // staggered groups, offset in seconds

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
  sounds: { start: Sound; end: Sound; restEnd: Sound; countdown: Sound; warning?: Sound; final?: Sound };
  calloutEvery?: number;   // seconds between combo callouts (default 20)
  calloutOrder?: 'random' | 'sequence';
  groups?: Groups;
  builtIn?: boolean;
}

export type PhaseKind = 'prep' | 'warmup' | 'work' | 'rest' | 'cooldown';

export interface PhaseCue {
  offset: number;  // seconds from phase start
  sound: Sound;
  voice?: string;
  kind: 'start' | 'warning' | 'inner' | 'countdown' | 'final' | 'random' | 'callout';
}

export interface Phase {
  kind: PhaseKind;
  index: number;   // 1-based round number for work/rest, 0 otherwise
  total: number;   // total rounds in the session
  duration: number;
  label?: string;
  note?: string;
  hideClock?: boolean;     // random-cue drills can hide the countdown
  cues: PhaseCue[];
}

export const DEFAULT_SOUNDS: SessionPlan['sounds'] = {
  start: 'bell',
  end: 'bell',
  restEnd: 'beep',
  countdown: 'beep',
  warning: 'clack',
  final: 'bell3',
};

export const DEFAULT_CUES: Cue[] = [{ at: 10, sound: 'clack' }];

export const CALLOUT_LIMITS = { every: { min: 5, max: 120 } } as const;
export const RANDOM_LIMITS = { gap: { min: 2, max: 120 } } as const;
export const GROUP_LIMITS = { offset: { min: 5, max: 300 } } as const;

/** Built-in numbered combo lists; digits are language-neutral for TTS. */
export const COMBO_SETS: Record<'basic' | 'intermediate' | 'advanced', string[]> = {
  basic: ['1', '2', '1 2', '1 1 2', '1 2 1', '2 3'],
  intermediate: ['1 2 3', '1 2 3 2', '1 2 5 2', '2 3 2', '1 6 3 2', '1 2 slip 2', '3 2 3'],
  advanced: ['1 2 3 2 1', '1 1 2 3 2', '2 3 2 1 2', '1 2 roll 3 2', '1 6 3 2 1 2', '5 2 3 6', '1 2 3 4 5 6'],
};

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
  for (const s of [3, 2, 1]) if (s < duration) out.push({ offset: duration - s, sound, kind: 'countdown', voice: String(s) });
  return out;
}

/** Small deterministic PRNG so a compiled plan is reproducible for a given seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomCues(r: RandomCues, duration: number, rnd: () => number): PhaseCue[] {
  const out: PhaseCue[] = [];
  const min = Math.min(r.minGap, r.maxGap), max = Math.max(r.minGap, r.maxGap);
  let t = min + rnd() * (max - min);
  while (t < duration - 1) {
    out.push({ offset: Math.round(t * 10) / 10, sound: r.sound, kind: 'random' });
    t += min + rnd() * (max - min);
  }
  return out;
}

function calloutCues(list: string[], every: number, order: 'random' | 'sequence', duration: number, rnd: () => number, startIndex: number): { cues: PhaseCue[]; next: number } {
  const cues: PhaseCue[] = [];
  const items = list.map((x) => x.trim()).filter(Boolean);
  let i = startIndex;
  if (items.length === 0) return { cues, next: i };
  // First callout a few seconds in, then every `every` s, never inside the last 5 s.
  for (let t = Math.min(5, every); t < duration - 5; t += every) {
    const text = order === 'sequence' ? items[i % items.length]! : items[Math.floor(rnd() * items.length)]!;
    i++;
    cues.push({ offset: t, sound: 'none', voice: text, kind: 'callout' });
  }
  return { cues, next: i };
}

function sortCues(cues: PhaseCue[]): PhaseCue[] {
  // Merge cues landing within 300 ms: priority final > start > warning > inner > countdown.
  const prio: Record<PhaseCue['kind'], number> = { final: 7, start: 6, warning: 5, inner: 4, countdown: 3, random: 2, callout: 1 };
  const sorted = [...cues].sort((a, b) => a.offset - b.offset || prio[b.kind] - prio[a.kind]);
  const merged: PhaseCue[] = [];
  for (const c of sorted) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.offset - c.offset) < 0.3) {
      const keep = prio[c.kind] > prio[last.kind] ? c : last;
      const drop = keep === c ? last : c;
      merged[merged.length - 1] = keep.voice || !drop.voice ? keep : { ...keep, voice: drop.voice };
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
export function compile(plan: SessionPlan, seed = 1): Phase[] {
  const phases: Phase[] = [];
  const total = totalRounds(plan);
  const s = plan.sounds;
  const rnd = mulberry32(seed);
  const every = clamp(plan.calloutEvery ?? 20, CALLOUT_LIMITS.every);
  const order = plan.calloutOrder ?? 'random';
  let calloutIndex = 0;

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
      const startVoice = [block.label, block.note].filter(Boolean).join('. ');
      const workCues: PhaseCue[] = [{ offset: 0, sound: s.start, kind: 'start', voice: startVoice || undefined }];
      workCues.push(...expandCues(block.cues ?? plan.cues, block.work, 'warning'));
      if (block.random) workCues.push(...randomCues(block.random, block.work, rnd));
      if (block.callouts?.length) {
        const c = calloutCues(block.callouts, every, order, block.work, rnd, calloutIndex);
        workCues.push(...c.cues); calloutIndex = c.next;
      }
      phases.push({
        kind: 'work', index: round, total, duration: block.work,
        label: block.label, note: block.note, hideClock: block.random?.hideClock || undefined, cues: sortCues(workCues),
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

/** Group k of a staggered session: the same plan, started offset×k seconds later. */
export function groupPlan(plan: SessionPlan, k: number): SessionPlan {
  if (!plan.groups || k === 0) return plan;
  return { ...plan, prep: plan.prep + plan.groups.offset * k };
}

/** The cue to play when the whole session ends (after the last phase). */
export function finalCue(plan: SessionPlan): PhaseCue {
  return { offset: 0, sound: plan.sounds.final ?? plan.sounds.end, kind: 'final' };
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
