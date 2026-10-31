import { useMemo, useState } from 'preact/hooks';
import { navigate } from '../router';
import { t, fmtMinutes } from '../i18n';
import { findPreset, savePreset } from '../store/presets';
import { settings } from '../store/settings';
import { LIMITS, clamp, compile, formatShort, simplePlan, totals, type SessionPlan } from '../engine/plan';
import { startSession } from '../store/session';
import { planName } from './Home';
import { SoundGate } from './SoundGate';

interface Draft { name: string; rounds: number; work: number; rest: number; prep: number; warn: number }

function toDraft(p: SessionPlan): Draft {
  const b = p.blocks[0]!;
  return { name: p.builtIn ? planName(p) : p.name, rounds: b.count, work: b.work, rest: b.rest, prep: p.prep, warn: p.cues[0]?.at ?? 10 };
}

function toPlan(d: Draft, base?: SessionPlan): SessionPlan {
  const plan = simplePlan({ rounds: d.rounds, work: d.work, rest: d.rest, prep: d.prep, name: d.name, sport: base?.sport });
  if (base && !base.builtIn) plan.id = base.id;
  plan.sounds = base?.sounds ?? plan.sounds;
  plan.cues = d.warn > 0 ? [{ at: d.warn, sound: 'clack' }] : [];
  return plan;
}

/** Parse "m:ss", "mm:ss" or plain seconds typed into a stepper value. */
export function parseDuration(text: string): number | null {
  const m = text.trim().match(/^(\d{1,3})(?::(\d{1,2}))?$/);
  if (!m) return null;
  return m[2] === undefined ? Number(m[1]) : Number(m[1]) * 60 + Number(m[2]);
}

function Stepper(props: { label: string; value: number; display: string; step: number; limits: { min: number; max: number }; onChange: (v: number) => void; minus: string; plus: string; parse?: (s: string) => number | null }) {
  const set = (v: number) => props.onChange(clamp(v, props.limits));
  const parse = props.parse ?? ((s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : null));
  const id = props.label;
  return (
    <div class="stepper">
      <label class="stepper-label" for={id}>{props.label}</label>
      <div class="stepper-row">
        <button class="btn btn-step" aria-label={props.minus} onClick={() => set(props.value - props.step)}>−</button>
        <input id={id} class="stepper-value" type="text" inputmode="numeric" value={props.display}
          onChange={(e) => { const el = e.target as HTMLInputElement; const v = parse(el.value); if (v === null) el.value = props.display; else set(v); }} />
        <button class="btn btn-step" aria-label={props.plus} onClick={() => set(props.value + props.step)}>+</button>
      </div>
    </div>
  );
}

export function Editor({ id }: { id?: string }) {
  const base = id ? findPreset(id) : undefined;
  const [d, setD] = useState<Draft>(() => base ? toDraft(base) : { name: '', rounds: 3, work: 180, rest: 60, prep: 10, warn: 10 });
  const [saved, setSaved] = useState(false);
  const plan = useMemo(() => toPlan(d, base), [d, base]);
  const tot = totals(compile(plan));
  const patch = (p: Partial<Draft>) => { setD({ ...d, ...p }); setSaved(false); };

  const start = () => {
    settings.value = { ...settings.value, lastPlanId: base?.id ?? plan.id };
    startSession(plan);
    navigate('run');
  };
  const save = () => { const s = savePreset(plan); setSaved(true); if (!base || base.builtIn) navigate(`edit/${encodeURIComponent(s.id)}`); };

  return (
    <main class="screen editor">
      <header class="topbar">
        <button class="btn btn-ghost" onClick={() => navigate('')}>‹ {t('nav.back')}</button>
        <h1>{t('editor.title')}</h1>
      </header>
      <SoundGate />
      <div class="total-bar" aria-label={t('editor.total')}>
        <span class="seg prep" style={{ flex: tot.other }} />
        <span class="seg work" style={{ flex: tot.work }} />
        <span class="seg rest" style={{ flex: tot.rest }} />
      </div>
      <p class="total">{t('editor.total')}: <strong>{fmtMinutes(tot.total)}</strong> ({formatShort(tot.total)})</p>

      <label class="field">
        <span>{t('editor.name')}</span>
        <input type="text" value={d.name} placeholder={t('editor.name.placeholder')} onInput={(e) => patch({ name: (e.target as HTMLInputElement).value })} />
      </label>

      <Stepper label={t('editor.rounds')} value={d.rounds} display={String(d.rounds)} step={1} limits={LIMITS.rounds} onChange={(v) => patch({ rounds: v })} minus={t('editor.minus')} plus={t('editor.plus')} />
      <Stepper label={t('editor.work')} value={d.work} display={formatShort(d.work)} step={15} limits={LIMITS.work} onChange={(v) => patch({ work: v })} minus={t('editor.minus')} plus={t('editor.plus')} parse={parseDuration} />
      <Stepper label={t('editor.rest')} value={d.rest} display={formatShort(d.rest)} step={15} limits={LIMITS.rest} onChange={(v) => patch({ rest: v })} minus={t('editor.minus')} plus={t('editor.plus')} parse={parseDuration} />
      <Stepper label={t('editor.prep')} value={d.prep} display={String(d.prep)} step={5} limits={LIMITS.prep} onChange={(v) => patch({ prep: v })} minus={t('editor.minus')} plus={t('editor.plus')} />
      <Stepper label={t('editor.warning')} value={d.warn} display={String(d.warn)} step={5} limits={{ min: 0, max: 60 }} onChange={(v) => patch({ warn: v })} minus={t('editor.minus')} plus={t('editor.plus')} />

      <nav class="bottombar">
        <button class="btn" onClick={save}>{saved ? t('editor.saved') : t('editor.save')}</button>
        <button class="btn btn-primary btn-start" onClick={start}>{t('editor.start')}</button>
      </nav>
    </main>
  );
}
