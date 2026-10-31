import { useMemo, useState } from 'preact/hooks';
import { renderSVG } from 'uqr';
import { navigate } from '../router';
import { t, fmtMinutes } from '../i18n';
import { findPreset, savePreset } from '../store/presets';
import { settings } from '../store/settings';
import { CALLOUT_LIMITS, COMBO_SETS, DEFAULT_SOUNDS, GROUP_LIMITS, LIMITS, RANDOM_LIMITS, SOUNDS, clamp, compile, formatShort, newId, simplePlan, totals, type Groups, type RoundBlock, type SessionPlan, type Sound, type Sport } from '../engine/plan';
import { shareUrl } from '../engine/codec';
import { audio, enableSound, startSession } from '../store/session';
import { planName } from './Home';
import { SoundGate } from './SoundGate';
import { SPORTS, SportIcon } from './SportIcon';

type Sounds = Required<SessionPlan['sounds']>;
interface Draft { name: string; sport: Sport; prep: number; warn: number; warmup: number; cooldown: number; blocks: RoundBlock[]; sounds: Sounds; advanced: boolean; calloutEvery: number; calloutOrder: 'random' | 'sequence'; groups?: Groups }

const SOUND_EVENTS = ['start', 'end', 'warning', 'countdown', 'final'] as const;
const DEFAULT_DRAFT_SOUNDS = DEFAULT_SOUNDS as Sounds;
const BLOCK_LIMIT = { min: 0, max: 3600 };

function toDraft(p: SessionPlan): Draft {
  const sounds: Sounds = { ...DEFAULT_DRAFT_SOUNDS, ...p.sounds, warning: p.cues[0]?.sound ?? p.sounds.warning ?? 'clack' };
  const advanced = p.blocks.length > 1 || !!p.warmup || !!p.cooldown || !!p.groups || p.blocks.some((b) => b.label || b.note || b.random || b.callouts?.length);
  return { name: p.builtIn ? planName(p) : p.name, sport: p.sport ?? 'custom', prep: p.prep, warn: p.cues[0]?.at ?? 10, warmup: p.warmup ?? 0, cooldown: p.cooldown ?? 0, blocks: p.blocks.map((b) => ({ ...b, callouts: b.callouts ? [...b.callouts] : undefined, random: b.random ? { ...b.random } : undefined })), sounds, advanced, calloutEvery: p.calloutEvery ?? 20, calloutOrder: p.calloutOrder ?? 'random', groups: p.groups ? { ...p.groups } : undefined };
}

function blankDraft(): Draft {
  return toDraft(simplePlan({ rounds: 3, work: 180, rest: 60, prep: 10 }));
}

export function toPlan(d: Draft, base?: SessionPlan): SessionPlan {
  const first = d.blocks[0]!;
  const plan = simplePlan({ rounds: first.count, work: first.work, rest: first.rest, prep: d.prep, name: d.name, sport: d.sport });
  if (base && !base.builtIn) plan.id = base.id;
  plan.blocks = d.blocks.map((b) => ({
    ...b, count: clamp(b.count, LIMITS.rounds), work: clamp(b.work, LIMITS.work), rest: clamp(b.rest, LIMITS.rest),
    label: b.label?.trim() || undefined, note: b.note?.trim() || undefined,
    callouts: b.callouts?.map((c) => c.trim()).filter(Boolean).length ? b.callouts.map((c) => c.trim()).filter(Boolean) : undefined,
    random: b.random ? { ...b.random, minGap: clamp(Math.min(b.random.minGap, b.random.maxGap), RANDOM_LIMITS.gap), maxGap: clamp(Math.max(b.random.minGap, b.random.maxGap), RANDOM_LIMITS.gap) } : undefined,
  }));
  if (plan.blocks.some((b) => b.callouts)) { plan.calloutEvery = clamp(d.calloutEvery, CALLOUT_LIMITS.every); plan.calloutOrder = d.calloutOrder; }
  if (d.groups) plan.groups = { count: d.groups.count, offset: clamp(d.groups.offset, GROUP_LIMITS.offset) };
  plan.sounds = { ...d.sounds };
  plan.cues = d.warn > 0 ? [{ at: d.warn, sound: d.sounds.warning }] : [];
  if (d.warmup > 0) plan.warmup = d.warmup;
  if (d.cooldown > 0) plan.cooldown = d.cooldown;
  return plan;
}

/** Parse "m:ss", "mm:ss" or plain seconds typed into a stepper value. */
export function parseDuration(text: string): number | null {
  const m = text.trim().match(/^(\d{1,3})(?::(\d{1,2}))?$/);
  if (!m) return null;
  return m[2] === undefined ? Number(m[1]) : Number(m[1]) * 60 + Number(m[2]);
}

function Stepper(props: { id: string; label: string; value: number; display: string; step: number; limits: { min: number; max: number }; onChange: (v: number) => void; parse?: (s: string) => number | null }) {
  const set = (v: number) => props.onChange(clamp(v, props.limits));
  const parse = props.parse ?? ((s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : null));
  return (
    <div class="stepper">
      <label class="stepper-label" for={props.id}>{props.label}</label>
      <div class="stepper-row">
        <button class="btn btn-step" aria-label={t('editor.minus')} onClick={() => set(props.value - props.step)}>−</button>
        <input id={props.id} class="stepper-value" type="text" inputmode="numeric" value={props.display}
          onChange={(e) => { const el = e.target as HTMLInputElement; const v = parse(el.value); if (v === null) el.value = props.display; else set(v); }} />
        <button class="btn btn-step" aria-label={t('editor.plus')} onClick={() => set(props.value + props.step)}>+</button>
      </div>
    </div>
  );
}

function BlockEditor({ b, i, n, onChange, onAction }: { b: RoundBlock; i: number; n: number; onChange: (b: RoundBlock) => void; onAction: (a: 'up' | 'down' | 'dup' | 'remove') => void }) {
  const id = (k: string) => `b-${b.id}-${k}`;
  return (
    <fieldset class="block">
      <legend>{t('editor.block', { n: i + 1 })}</legend>
      <label class="field"><span>{t('editor.block.label')}</span>
        <input type="text" value={b.label ?? ''} placeholder={t('editor.block.label.placeholder')} onInput={(e) => onChange({ ...b, label: (e.target as HTMLInputElement).value })} /></label>
      <Stepper id={id('rounds')} label={t('editor.rounds')} value={b.count} display={String(b.count)} step={1} limits={LIMITS.rounds} onChange={(v) => onChange({ ...b, count: v })} />
      <Stepper id={id('work')} label={t('editor.work')} value={b.work} display={formatShort(b.work)} step={15} limits={LIMITS.work} onChange={(v) => onChange({ ...b, work: v })} parse={parseDuration} />
      <Stepper id={id('rest')} label={t('editor.rest')} value={b.rest} display={formatShort(b.rest)} step={15} limits={LIMITS.rest} onChange={(v) => onChange({ ...b, rest: v })} parse={parseDuration} />
      <label class="field"><span>{t('editor.block.note')}</span>
        <input type="text" value={b.note ?? ''} placeholder={t('editor.block.note.placeholder')} onInput={(e) => onChange({ ...b, note: (e.target as HTMLInputElement).value })} /></label>

      <details class="sub">
        <summary>{t('editor.callouts')}{b.callouts?.length ? ` (${b.callouts.length})` : ''}</summary>
        <label class="field"><span>{t('editor.callouts.list')}</span>
          <textarea rows={4} value={(b.callouts ?? []).join('\n')} placeholder={t('editor.callouts.placeholder')} aria-label={t('editor.callouts.list')}
            onInput={(e) => onChange({ ...b, callouts: (e.target as HTMLTextAreaElement).value.split('\n') })} /></label>
        <div class="choices">
          <span class="muted">{t('editor.callouts.fill')}:</span>
          {(['basic', 'intermediate', 'advanced'] as const).map((k) => <button key={k} class="btn btn-sm" onClick={() => onChange({ ...b, callouts: [...COMBO_SETS[k]] })}>{t(`editor.callouts.${k}` as const)}</button>)}
          <button class="btn btn-sm" onClick={() => onChange({ ...b, callouts: undefined })}>{t('editor.callouts.clear')}</button>
        </div>
      </details>

      <details class="sub" open={!!b.random}>
        <summary>{t('editor.random')}</summary>
        <label class="row"><span>{t('editor.random.enabled')}</span>
          <input type="checkbox" checked={!!b.random} onChange={(e) => onChange({ ...b, random: (e.target as HTMLInputElement).checked ? { minGap: 5, maxGap: 12, sound: 'whistle', hideClock: false } : undefined })} /></label>
        {b.random && (
          <>
            <Stepper id={id('rmin')} label={t('editor.random.min')} value={b.random.minGap} display={String(b.random.minGap)} step={1} limits={RANDOM_LIMITS.gap} onChange={(v) => onChange({ ...b, random: { ...b.random!, minGap: v } })} />
            <Stepper id={id('rmax')} label={t('editor.random.max')} value={b.random.maxGap} display={String(b.random.maxGap)} step={1} limits={RANDOM_LIMITS.gap} onChange={(v) => onChange({ ...b, random: { ...b.random!, maxGap: v } })} />
            <label class="row"><span>{t('editor.random.sound')}</span>
              <select class="select" value={b.random.sound} aria-label={t('editor.random.sound')} onChange={(e) => onChange({ ...b, random: { ...b.random!, sound: (e.target as HTMLSelectElement).value as Sound } })}>
                {SOUNDS.filter((x) => x !== 'none').map((x) => <option key={x} value={x}>{t(`sound.name.${x}` as const)}</option>)}
              </select></label>
            <label class="row"><span>{t('editor.random.hide')}</span>
              <input type="checkbox" checked={!!b.random.hideClock} onChange={(e) => onChange({ ...b, random: { ...b.random!, hideClock: (e.target as HTMLInputElement).checked } })} /></label>
          </>
        )}
      </details>
      <div class="block-actions">
        <button class="btn btn-sm" disabled={i === 0} onClick={() => onAction('up')} aria-label={t('editor.block.up')}>↑</button>
        <button class="btn btn-sm" disabled={i === n - 1} onClick={() => onAction('down')} aria-label={t('editor.block.down')}>↓</button>
        <button class="btn btn-sm" onClick={() => onAction('dup')}>{t('editor.block.duplicate')}</button>
        <button class="btn btn-sm btn-danger" disabled={n === 1} onClick={() => onAction('remove')}>{t('editor.block.remove')}</button>
      </div>
    </fieldset>
  );
}

export function Editor({ id, shared }: { id?: string; shared?: SessionPlan }) {
  const base = shared ?? (id ? findPreset(id) : undefined);
  const [d, setD] = useState<Draft>(() => (base ? toDraft(base) : blankDraft()));
  const [saved, setSaved] = useState(false);
  const [share, setShare] = useState<{ url: string; svg: string; copied: boolean } | null>(null);
  const plan = useMemo(() => toPlan(d, base), [d, base]);
  const tot = totals(compile(plan));
  const patch = (p: Partial<Draft>) => { setD({ ...d, ...p }); setSaved(false); setShare(null); };
  const first = d.blocks[0]!;
  const setFirst = (b: Partial<RoundBlock>) => patch({ blocks: [{ ...first, ...b }, ...d.blocks.slice(1)] });
  const setBlock = (i: number, b: RoundBlock) => patch({ blocks: d.blocks.map((x, j) => (j === i ? b : x)) });
  const blockAction = (i: number, a: 'up' | 'down' | 'dup' | 'remove') => {
    const list = [...d.blocks];
    if (a === 'remove') list.splice(i, 1);
    else if (a === 'dup') list.splice(i + 1, 0, { ...list[i]!, id: newId() });
    else { const j = a === 'up' ? i - 1 : i + 1; [list[i], list[j]] = [list[j]!, list[i]!]; }
    patch({ blocks: list });
  };

  const start = () => {
    settings.value = { ...settings.value, lastPlanId: base && !shared ? base.id : plan.id };
    startSession(plan);
    navigate('run');
  };
  const save = () => { const s = savePreset(plan); setSaved(true); if (!base || base.builtIn || shared) navigate(`edit/${encodeURIComponent(s.id)}`); };
  const doShare = async () => {
    const url = shareUrl(plan);
    let copied = false;
    try { await navigator.clipboard.writeText(url); copied = true; } catch { /* clipboard may be unavailable */ }
    setShare({ url, svg: renderSVG(url, { border: 1 }), copied });
  };

  return (
    <main class="screen editor">
      <header class="topbar">
        <button class="btn btn-ghost" onClick={() => navigate('')}>‹ {t('nav.back')}</button>
        <h1>{shared ? t('share.title') : t('editor.title')}</h1>
      </header>
      <SoundGate />
      <div class="total-bar" role="img" aria-label={t('editor.total')}>
        <span class="seg prep" style={{ flex: tot.other }} />
        <span class="seg work" style={{ flex: tot.work }} />
        <span class="seg rest" style={{ flex: tot.rest }} />
      </div>
      <p class="total">{t('editor.total')}: <strong>{fmtMinutes(tot.total)}</strong> ({formatShort(tot.total)})</p>

      <label class="field">
        <span>{t('editor.name')}</span>
        <input type="text" value={d.name} placeholder={t('editor.name.placeholder')} onInput={(e) => patch({ name: (e.target as HTMLInputElement).value })} />
      </label>

      <div class="choices sports" role="radiogroup" aria-label={t('editor.sport')}>
        {SPORTS.map((sp) => (
          <button key={sp} type="button" role="radio" aria-checked={d.sport === sp} class={`btn btn-sm btn-sport sport-${sp} ${d.sport === sp ? 'selected' : ''}`} onClick={() => patch({ sport: sp })}>
            <SportIcon sport={sp} size={22} /> {t(`sport.${sp}` as const)}
          </button>
        ))}
      </div>

      <div class="choices mode">
        <button class={`btn btn-sm ${!d.advanced ? 'btn-primary' : ''}`} aria-pressed={!d.advanced} onClick={() => patch({ advanced: false })}>{t('editor.simple')}</button>
        <button class={`btn btn-sm ${d.advanced ? 'btn-primary' : ''}`} aria-pressed={d.advanced} onClick={() => patch({ advanced: true })}>{t('editor.advanced')}</button>
      </div>

      {!d.advanced ? (
        <>
          <Stepper id="rounds" label={t('editor.rounds')} value={first.count} display={String(first.count)} step={1} limits={LIMITS.rounds} onChange={(v) => setFirst({ count: v })} />
          <Stepper id="work" label={t('editor.work')} value={first.work} display={formatShort(first.work)} step={15} limits={LIMITS.work} onChange={(v) => setFirst({ work: v })} parse={parseDuration} />
          <Stepper id="rest" label={t('editor.rest')} value={first.rest} display={formatShort(first.rest)} step={15} limits={LIMITS.rest} onChange={(v) => setFirst({ rest: v })} parse={parseDuration} />
        </>
      ) : (
        <>
          <Stepper id="warmup" label={t('editor.warmup')} value={d.warmup} display={formatShort(d.warmup)} step={30} limits={BLOCK_LIMIT} onChange={(v) => patch({ warmup: v })} parse={parseDuration} />
          <h2>{t('editor.blocks')}</h2>
          {d.blocks.map((b, i) => <BlockEditor key={b.id} b={b} i={i} n={d.blocks.length} onChange={(nb) => setBlock(i, nb)} onAction={(a) => blockAction(i, a)} />)}
          <button class="btn" onClick={() => patch({ blocks: [...d.blocks, { id: newId(), count: 3, work: 180, rest: 60 }] })}>+ {t('editor.block.add')}</button>
          <Stepper id="cooldown" label={t('editor.cooldown')} value={d.cooldown} display={formatShort(d.cooldown)} step={30} limits={BLOCK_LIMIT} onChange={(v) => patch({ cooldown: v })} parse={parseDuration} />
          {d.blocks.some((b) => b.callouts?.some((c) => c.trim())) && (
            <>
              <Stepper id="callout-every" label={t('editor.callouts.every')} value={d.calloutEvery} display={String(d.calloutEvery)} step={5} limits={CALLOUT_LIMITS.every} onChange={(v) => patch({ calloutEvery: v })} />
              <label class="row"><span>{t('editor.callouts.order')}</span>
                <select class="select" value={d.calloutOrder} aria-label={t('editor.callouts.order')} onChange={(e) => patch({ calloutOrder: (e.target as HTMLSelectElement).value as 'random' | 'sequence' })}>
                  <option value="random">{t('editor.callouts.random')}</option>
                  <option value="sequence">{t('editor.callouts.sequence')}</option>
                </select></label>
            </>
          )}
          <h2>{t('editor.groups')}</h2>
          <div class="choices" role="radiogroup" aria-label={t('editor.groups.count')}>
            {([1, 2, 3] as const).map((n) => (
              <button key={n} type="button" role="radio" aria-checked={(d.groups?.count ?? 1) === n} class={`btn btn-sm ${(d.groups?.count ?? 1) === n ? 'btn-primary' : ''}`}
                onClick={() => patch({ groups: n === 1 ? undefined : { count: n, offset: d.groups?.offset ?? 30 } })}>{n === 1 ? t('editor.groups.one') : `${n} ${t('editor.groups.count').toLowerCase()}`}</button>
            ))}
          </div>
          {d.groups && <Stepper id="group-offset" label={t('editor.groups.offset')} value={d.groups.offset} display={String(d.groups.offset)} step={5} limits={GROUP_LIMITS.offset} onChange={(v) => patch({ groups: { ...d.groups!, offset: v } })} />}
        </>
      )}
      <Stepper id="prep" label={t('editor.prep')} value={d.prep} display={String(d.prep)} step={5} limits={LIMITS.prep} onChange={(v) => patch({ prep: v })} />
      <Stepper id="warn" label={t('editor.warning')} value={d.warn} display={String(d.warn)} step={5} limits={{ min: 0, max: 60 }} onChange={(v) => patch({ warn: v })} />

      <h2>{t('settings.sounds')}</h2>
      {SOUND_EVENTS.map((ev) => (
        <label class="row" key={ev}>
          <span>{t(`sound.${ev}` as const)}</span>
          <select class="select" value={d.sounds[ev]} aria-label={t(`sound.${ev}` as const)}
            onChange={async (e) => {
              const v = (e.target as HTMLSelectElement).value as Sound;
              patch({ sounds: { ...d.sounds, [ev]: v } });
              if (await enableSound()) audio.play(v);
            }}>
            {SOUNDS.map((x) => <option key={x} value={x}>{t(`sound.name.${x}` as const)}</option>)}
          </select>
        </label>
      ))}

      <section class="sheet" aria-hidden="true">
        <h1>{d.name || t('editor.title')}</h1>
        <p>{t('editor.total')}: {formatShort(tot.total)} · {t('editor.rounds')}: {tot.rounds} · {t('end.work')}: {formatShort(tot.work)} · {t('end.rest')}: {formatShort(tot.rest)}</p>
        <table>
          <thead><tr><th>#</th><th>{t('sheet.phase')}</th><th>{t('sheet.duration')}</th><th>{t('sheet.note')}</th></tr></thead>
          <tbody>
            {compile(plan).map((ph, i) => (
              <tr key={i}>
                <td>{ph.kind === 'work' ? ph.index : ''}</td>
                <td>{ph.kind === 'work' ? t('phase.work') : ph.kind === 'rest' ? t('phase.rest') : ph.kind === 'prep' ? t('phase.prep') : ph.kind === 'warmup' ? t('phase.warmup') : t('phase.cooldown')}{ph.label ? ` · ${ph.label}` : ''}</td>
                <td>{formatShort(ph.duration)}</td>
                <td>{ph.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section class="share">
        <button class="btn" onClick={() => window.print()}>{t('editor.print')}</button>
        <button class="btn" onClick={doShare}>{share?.copied ? t('editor.share.copied') : t('editor.share')}</button>
        {share && (
          <div class="share-box">
            <div class="qr" dangerouslySetInnerHTML={{ __html: share.svg }} aria-label={t('editor.share')} />
            <input class="share-url" type="text" readOnly value={share.url} onFocus={(e) => (e.target as HTMLInputElement).select()} />
            <p class="muted">{t('editor.share.hint')}</p>
          </div>
        )}
      </section>

      <nav class="bottombar">
        <button class="btn" onClick={save}>{saved ? t('editor.saved') : t('editor.save')}</button>
        <button class="btn btn-primary btn-start" onClick={start}>{t('editor.start')}</button>
      </nav>
    </main>
  );
}
