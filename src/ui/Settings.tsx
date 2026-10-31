import { navigate } from '../router';
import { LOCALES, t, type Locale } from '../i18n';
import { resetAll, settings, updateSettings } from '../store/settings';
import { userPresets } from '../store/presets';
import { audio, enableSound } from '../store/session';
import { SOUNDS, type Sound } from '../engine/plan';

export function Settings() {
  const s = settings.value;
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
        <h2>{t('settings.display')}</h2>
        {toggle('keepAwake')}
        {toggle('showTenths')}
      </section>

      <section>
        <h2>{t('settings.data')}</h2>
        <p class="muted">{t('settings.installed')}</p>
        <p class="muted">{t('settings.about')}</p>
        <button class="btn btn-danger" onClick={() => { if (confirm(t('settings.reset.confirm'))) { resetAll(); userPresets.value = []; } }}>{t('settings.reset')}</button>
      </section>
    </main>
  );
}
