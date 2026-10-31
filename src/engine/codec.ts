// Share-link codec: a SessionPlan (minus id/builtIn) to a compact base64url
// string and back. Short keys keep the URL small; unknown keys are ignored so
// older links stay readable.

import { DEFAULT_SOUNDS, LIMITS, SOUNDS, clamp, newId, type Cue, type RoundBlock, type SessionPlan, type Sound } from './plan';

interface WireBlock { c: number; w: number; r: number; l?: string; n?: string }
interface Wire {
  v: 1; n?: string; sp?: string; p: number; wu?: number; cd?: number;
  b: WireBlock[]; wa?: number; ws?: Sound;
  s?: { st?: Sound; en?: Sound; re?: Sound; cd?: Sound; wa?: Sound; fi?: Sound };
}

const toB64url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

export function encodePlan(plan: SessionPlan): string {
  const warn = plan.cues[0];
  const w: Wire = {
    v: 1, p: plan.prep,
    b: plan.blocks.map((b) => { const x: WireBlock = { c: b.count, w: b.work, r: b.rest }; if (b.label) x.l = b.label; if (b.note) x.n = b.note; return x; }),
  };
  if (plan.name) w.n = plan.name;
  if (plan.sport && plan.sport !== 'custom') w.sp = plan.sport;
  if (plan.warmup) w.wu = plan.warmup;
  if (plan.cooldown) w.cd = plan.cooldown;
  if (warn) { w.wa = warn.at; if (warn.sound !== 'clack') w.ws = warn.sound; } else w.wa = 0;
  const s = plan.sounds, d = DEFAULT_SOUNDS;
  const ws: NonNullable<Wire['s']> = {};
  if (s.start !== d.start) ws.st = s.start;
  if (s.end !== d.end) ws.en = s.end;
  if (s.restEnd !== d.restEnd) ws.re = s.restEnd;
  if (s.countdown !== d.countdown) ws.cd = s.countdown;
  if (s.final && s.final !== d.final) ws.fi = s.final;
  if (Object.keys(ws).length) w.s = ws;
  return toB64url(JSON.stringify(w));
}

const isSound = (x: unknown): x is Sound => typeof x === 'string' && (SOUNDS as string[]).includes(x);
const num = (x: unknown, lim: { min: number; max: number }, dflt: number) => (typeof x === 'number' && Number.isFinite(x) ? clamp(x, lim) : dflt);
const str = (x: unknown, max = 80) => (typeof x === 'string' ? x.slice(0, max) : undefined);

export function decodePlan(payload: string): SessionPlan | null {
  let w: Partial<Wire>;
  try { w = JSON.parse(fromB64url(payload)) as Partial<Wire>; } catch { return null; }
  if (!w || w.v !== 1 || !Array.isArray(w.b) || w.b.length === 0) return null;
  const blocks: RoundBlock[] = [];
  for (const x of w.b.slice(0, 20)) {
    if (!x || typeof x !== 'object') return null;
    const b: RoundBlock = { id: newId(), count: num(x.c, LIMITS.rounds, 1), work: num(x.w, LIMITS.work, 180), rest: num(x.r, LIMITS.rest, 60) };
    const l = str(x.l), n = str(x.n, 200);
    if (l) b.label = l; if (n) b.note = n;
    blocks.push(b);
  }
  const warnAt = num(w.wa, { min: 0, max: 60 }, 10);
  const cues: Cue[] = warnAt > 0 ? [{ at: warnAt, sound: isSound(w.ws) ? w.ws : 'clack' }] : [];
  const s = w.s ?? {};
  const plan: SessionPlan = {
    version: 1, id: newId(), name: str(w.n) ?? '', prep: num(w.p, LIMITS.prep, 10), blocks, cues,
    restCues: [{ at: 10, sound: 'beep', voice: 'voice.seconds_out' }],
    sounds: {
      start: isSound(s.st) ? s.st : DEFAULT_SOUNDS.start, end: isSound(s.en) ? s.en : DEFAULT_SOUNDS.end,
      restEnd: isSound(s.re) ? s.re : DEFAULT_SOUNDS.restEnd, countdown: isSound(s.cd) ? s.cd : DEFAULT_SOUNDS.countdown,
      warning: cues[0]?.sound ?? 'clack', final: isSound(s.fi) ? s.fi : DEFAULT_SOUNDS.final,
    },
  };
  const sport = str(w.sp);
  if (sport) plan.sport = sport as SessionPlan['sport'];
  const wu = num(w.wu, { min: 0, max: 3600 }, 0), cd = num(w.cd, { min: 0, max: 3600 }, 0);
  if (wu) plan.warmup = wu; if (cd) plan.cooldown = cd;
  return plan;
}

/** Full share URL for the current origin and base. */
export function shareUrl(plan: SessionPlan, href = location.href): string {
  const u = new URL(href);
  u.hash = `#/s/${encodePlan(plan)}`;
  return u.toString();
}
