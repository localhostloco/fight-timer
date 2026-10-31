import { navigate } from '../router';
import { LOCALES, t, type Locale } from '../i18n';
import { resetAll, settings, updateSettings } from '../store/settings';
import { userPresets } from '../store/presets';
import { audio, enableSound, speak, voice } from '../store/session';
import { exportPresets, importPresets, downloadText } from '../store/transfer';
import { useRef, useState } from 'preact/hooks';
import { history, clearHistory } from '../store/history';
import { SOUNDS, type Sound } from '../engine/plan';

export function Settings() {
  const s = settings.value;
  const fileInput = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const voices = voice.voicesFor(s.locale);
  const onImportFile = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const n = importPresets(await f.text());
    setImportMsg(n === null ? t('settings.import.fail') : t('settings.import.done', { n }));
    (e.target as HTMLInputElement).value = '';
  };
  const toggle = (k: 'vibrate' | 'keepAwake' | 'showTenths') => (
    <label class="row">
      <span>{t(`settings.${k}` as const)}</span>
      <input type="checkbox" checked={s[k]} onChange={(e) => updateSettings({ [k]: (e.target as HTMLInputElement).checked })} />
    </label>
  );
  return (
    <main class="screen settings">
      <header class="topbar">
        <button class="btn btn-ghost" onClick={() => navigate('')}>‹ {t('nav.back')}</button>
        <h1>{t('settings.title')}</h1>
      </header>

      <section>
        <h2>{t('settings.language')}</h2>
        <div class="choices">
          {(Object.keys(LOCALES) as Locale[]).map((l) => (
            <button key={l} class={`btn ${s.locale === l ? 'btn-primary' : ''}`} lang={l} onClick={() => updateSettings({ locale: l })}>{LOCALES[l].name}</button>
          ))}
        </div>
      </section>

      <section>
        <h2>{t('settings.sounds')}</h2>
        <label class="row">
          <span>{t('sound.volume')}</span>
          <input type="range" min={0} max={1} step={0.05} value={s.volume}
            onInput={(e) => { const v = Number((e.target as HTMLInputElement).value); updateSettings({ volume: v }); audio.setVolume(v); }}
            onChange={async () => { if (await enableSound()) audio.play('beep'); }} />
        </label>
        <div class="choices">
          {SOUNDS.filter((x) => x !== 'none').map((x: Sound) => (
            <button key={x} class="btn btn-sm" onClick={async () => { if (await enableSound()) audio.play(x); }}>{t(`sound.name.${x}` as const)}</button>
          ))}
        </div>
        {toggle('vibrate')}
      </section>

      <section>
        <h2>{t('settings.voice')}</h2>
        {!voice.supported ? <p class="muted">{t('settings.voice.unsupported')}</p> : (
          <>
            <label class="row"><span>{t('settings.voice.enabled')}</span>
              <input type="checkbox" checked={s.voice.enabled} onChange={(e) => updateSettings({ voice: { ...s.voice, enabled: (e.target as HTMLInputElement).checked } })} /></label>
            <label class="row"><span>{t('settings.voice.name')}</span>
              <select class="select" value={s.voice.name ?? ''} onChange={(e) => updateSettings({ voice: { ...s.voice, name: (e.target as HTMLSelectElement).value || undefined } })}>
                <option value="">{t('settings.voice.auto')}</option>
                {voices.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
              </select></label>
            <label class="row"><span>{t('settings.voice.rate')}</span>
              <input type="range" min={0.7} max={1.4} step={0.1} value={s.voice.rate} onInput={(e) => updateSettings({ voice: { ...s.voice, rate: Number((e.target as HTMLInputElement).value) } })} /></label>
            <button class="btn btn-sm" onClick={() => speak(t('voice.test'))}>{t('settings.voice.test')}</button>
          </>
        )}
      </section>

      <section>
        <h2>{t('settings.display')}</h2>
        {toggle('keepAwake')}
        {toggle('showTenths')}
        <label class="row"><span>{t('settings.tvMode')}</span>
          <input type="checkbox" checked={s.tvMode} onChange={(e) => updateSettings({ tvMode: (e.target as HTMLInputElement).checked })} /></label>
      </section>

      <section>
        <h2>{t('settings.data')}</h2>
        <div class="choices">
          <button class="btn btn-sm" onClick={() => downloadText(`fight-timer-presets-${new Date().toISOString().slice(0, 10)}.json`, exportPresets())}>{t('settings.export')}</button>
          <button class="btn btn-sm" onClick={() => fileInput.current?.click()}>{t('settings.import')}</button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={onImportFile} aria-label={t('settings.import')} />
          {history.value.length > 0 && <button class="btn btn-sm" onClick={() => { if (confirm(t('history.clear'))) clearHistory(); }}>{t('history.clear')}</button>}
        </div>
        {importMsg && <p class="banner" role="status">{importMsg}</p>}
        <p class="muted">{t('settings.installed')}</p>
        <p class="muted">{t('settings.about')}</p>
        <button class="btn btn-danger" onClick={() => { if (confirm(t('settings.reset.confirm'))) { resetAll(); userPresets.value = []; } }}>{t('settings.reset')}</button>
      </section>
    </main>
  );
}
