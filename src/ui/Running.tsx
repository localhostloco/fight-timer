import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { navigate } from '../router';
import { t, fmtMinutes } from '../i18n';
import { formatClock, formatShort, totals, type PhaseKind } from '../engine/plan';
import { settings } from '../store/settings';
import { activePlan, pauseSession, restartPhase, skipPhase, snap, soundReady, startSession, stopSession, toggleSession, wake, wasLate } from '../store/session';

const PHASE_KEY = { prep: 'phase.prep', warmup: 'phase.warmup', work: 'phase.work', rest: 'phase.rest', cooldown: 'phase.cooldown' } as const;
const phaseKey = (k: PhaseKind) => PHASE_KEY[k];

/** Press-and-hold button: fires `onHold` after `ms` of continuous pressure. */
function Hold({ ms, onHold, class: cls, children, label }: { ms: number; onHold: () => void; class?: string; children: ComponentChildren; label: string }) {
  const timer = useRef(0);
  const [holding, setHolding] = useState(false);
  // Touch long-presses fire contextmenu/selection and then pointercancel, which
  // would abort the hold: touch-action none (CSS), no callout, and no context menu.
  const down = (e: PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic or unknown pointer */ }
    setHolding(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setHolding(false); onHold(); }, ms);
  };
  const up = (e: Event) => { e.stopPropagation(); setHolding(false); clearTimeout(timer.current); };
  return (
    <button class={`btn-hold ${cls ?? ''} ${holding ? 'holding' : ''}`} aria-label={label} title={label} style={{ '--hold-ms': `${ms}ms` }}
      onPointerDown={down} onPointerUp={up} onPointerCancel={up} onContextMenu={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onHold(); } }}>
      {children}
    </button>
  );
}

export function Running() {
  const s = snap.value;
  const plan = activePlan.value;
  const [locked, setLocked] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (locked) return;
      if (e.key === ' ') { e.preventDefault(); toggleSession(); }
      else if (e.key === 'ArrowRight') skipPhase();
      else if (e.key === 'r') restartPhase();
      else if (e.key === 'Escape') setConfirmStop(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked]);

  if (!plan || s.status === 'idle') { navigate(''); return null; }

  if (s.status === 'finished') {
    const tot = totals(s.phases);
    return (
      <main class="screen end">
        <h1>{t('end.title')}</h1>
        <dl class="stats">
          <div><dt>{t('end.rounds')}</dt><dd>{tot.rounds}</dd></div>
          <div><dt>{t('end.work')}</dt><dd>{formatShort(tot.work)}</dd></div>
          <div><dt>{t('end.rest')}</dt><dd>{formatShort(tot.rest)}</dd></div>
          <div><dt>{t('end.total')}</dt><dd>{fmtMinutes(tot.total)}</dd></div>
        </dl>
        <nav class="bottombar">
          <button class="btn" onClick={() => { stopSession(); navigate(''); }}>{t('end.home')}</button>
          <button class="btn" onClick={() => { stopSession(); navigate(`edit/${encodeURIComponent(plan.id)}`); }}>{t('end.edit')}</button>
          <button class="btn btn-primary" onClick={() => startSession(plan)}>{t('end.repeat')}</button>
        </nav>
      </main>
    );
  }

  const phase = s.phase!;
  const paused = s.status === 'paused';
  const remaining = s.remainingMs / 1000;
  const lastTen = phase.kind !== 'prep' && remaining <= 10 && !paused;
  const label = phase.kind === 'work' ? t('run.round', { n: phase.index, total: phase.total }) : t(phaseKey(phase.kind));
  const next = s.next ? t('run.next', { phase: t(phaseKey(s.next.kind)), time: formatShort(s.next.duration) }) : t('run.next.end');
  const roundsDone = s.phases.slice(0, s.current + (phase.kind === 'work' ? 0 : 1)).filter((p) => p.kind === 'work').length;

  const tap = () => { if (!locked && !confirmStop) toggleSession(); };

  return (
    <main class={`screen run phase-${phase.kind} ${paused ? 'paused' : ''} ${lastTen ? 'last-ten' : ''}`} onClick={tap}
      aria-live="off">
      <div class="run-top">
        <span class="run-label">{paused ? t('phase.paused') : label}</span>
        {phase.label && <span class="run-sub">{phase.label}</span>}
      </div>
      <div class="clock" aria-live="polite" aria-atomic="true">{formatClock(remaining, settings.value.showTenths)}</div>
      <div class="run-bottom">
        <span>{next}</span>
        <span>{t('run.elapsed', { time: formatShort(Math.floor(s.elapsedTotalMs / 1000)) })}</span>
      </div>
      <div class="progress" aria-hidden="true">
        {Array.from({ length: phase.total }, (_, i) => <span key={i} class={i < roundsDone ? 'done' : i === roundsDone && phase.kind === 'work' ? 'now' : ''} />)}
      </div>

      {!soundReady.value && <div class="banner warn">{t('sound.blocked')}</div>}
      {!wake.supported && settings.value.keepAwake && <div class="banner">{t('run.wakelock.unsupported')}</div>}
      {wasLate.value && <div class="banner">{t('run.late')}</div>}

      <div class="controls" onClick={(e) => e.stopPropagation()}>
        {locked ? (
          <Hold ms={2000} onHold={() => setLocked(false)} class="btn btn-ctl btn-wide" label={t('run.unlock')}>🔒 {t('run.unlock')}</Hold>
        ) : (
          <>
            <button class="btn btn-ctl" onClick={() => (paused ? toggleSession() : pauseSession())}>{paused ? `▶ ${t('run.resume')}` : `❚❚ ${t('run.pause')}`}</button>
            <button class="btn btn-ctl" onClick={restartPhase}>↺ {t('run.restart')}</button>
            <button class="btn btn-ctl" onClick={skipPhase}>⏭ {t('run.skip')}</button>
            <button class="btn btn-ctl" onClick={() => setLocked(true)}>🔓 {t('run.lock')}</button>
            <Hold ms={1000} onHold={() => setConfirmStop(true)} class="btn btn-ctl btn-danger" label={t('run.stop.hold')}>■ {t('run.stop.hold')}</Hold>
          </>
        )}
      </div>

      {confirmStop && (
        <div class="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <p>{t('run.stop.confirm')}</p>
          <div class="modal-actions">
            <button class="btn" onClick={() => setConfirmStop(false)}>{t('run.stop.no')}</button>
            <button class="btn btn-danger" onClick={() => { stopSession(); navigate(''); }}>{t('run.stop.yes')}</button>
          </div>
        </div>
      )}
    </main>
  );
}
