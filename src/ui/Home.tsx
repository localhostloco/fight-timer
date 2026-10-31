import { navigate } from '../router';
import { t, fmtMinutes, type Key } from '../i18n';
import { builtIns, userPresets, deletePreset, savePreset, findPreset } from '../store/presets';
import { settings } from '../store/settings';
import { formatShort, totalDuration, type SessionPlan } from '../engine/plan';
import { startSession } from '../store/session';
import { SoundGate } from './SoundGate';

export function planName(p: SessionPlan): string {
  return p.builtIn ? t(p.name as Key) : p.name || t('editor.title');
}

export function planSummary(p: SessionPlan): string {
  const b = p.blocks[0]!;
  return t('home.summary', { rounds: b.count, work: formatShort(b.work), rest: formatShort(b.rest), total: fmtMinutes(totalDuration(p)) });
}

function start(p: SessionPlan) {
  settings.value = { ...settings.value, lastPlanId: p.id };
  startSession(p);
  navigate('run');
}

function Card({ p }: { p: SessionPlan }) {
  return (
    <li class={`card sport-${p.sport ?? 'custom'}`}>
      <button class="card-main" onClick={() => start(p)} aria-label={`${t('editor.start')}: ${planName(p)}`}>
        <span class="card-name">{planName(p)}</span>
        <span class="card-summary">{planSummary(p)}</span>
      </button>
      <div class="card-actions">
        <button class="btn btn-sm" onClick={() => navigate(`edit/${encodeURIComponent(p.id)}`)}>{t('home.edit')}</button>
        {p.builtIn
          ? <button class="btn btn-sm" onClick={() => { savePreset({ ...p, name: planName(p) }); }}>{t('home.duplicate')}</button>
          : <button class="btn btn-sm btn-danger" onClick={() => { if (confirm(t('common.delete.confirm'))) deletePreset(p.id); }}>{t('home.delete')}</button>}
      </div>
    </li>
  );
}

export function Home() {
  const mine = userPresets.value;
  const last = settings.value.lastPlanId ? findPreset(settings.value.lastPlanId) : undefined;
  return (
    <main class="screen home">
      <header class="topbar">
        <h1>{t('app.name')}</h1>
        <button class="btn btn-ghost" onClick={() => navigate('settings')}>{t('nav.settings')}</button>
      </header>
      <SoundGate />
      <section>
        <h2>{t('home.mine')}</h2>
        {mine.length === 0 ? <p class="muted">{t('home.empty')}</p> : <ul class="cards">{mine.map((p) => <Card key={p.id} p={p} />)}</ul>}
      </section>
      <section>
        <h2>{t('home.builtin')}</h2>
        <ul class="cards">{builtIns.map((p) => <Card key={p.id} p={p} />)}</ul>
      </section>
      <nav class="bottombar">
        {last && <button class="btn" onClick={() => start(last)}>{t('nav.quick')}</button>}
        <button class="btn btn-primary" onClick={() => navigate('edit')}>{t('nav.new')}</button>
      </nav>
    </main>
  );
}
