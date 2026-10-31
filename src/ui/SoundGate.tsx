import { t } from '../i18n';
import { audio, enableSound, soundReady } from '../store/session';

/** Browser autoplay gate: one tap unlocks the AudioContext for the session. */
export function SoundGate() {
  if (soundReady.value) return null;
  return (
    <div class="gate" role="region" aria-label={t('sound.gate.title')}>
      <strong>{t('sound.gate.title')}</strong>
      <p>{t('sound.gate.body')}</p>
      <button class="btn btn-primary" onClick={async () => { if (await enableSound()) audio.play('bell'); }}>{t('sound.gate.test')}</button>
    </div>
  );
}
