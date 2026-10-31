import { signal } from '@preact/signals';
import { t } from '../i18n';
import { snap } from '../store/session';

/** Set by main.tsx when the service worker has a new build waiting. */
export const updateReady = signal<null | (() => void)>(null);

export function UpdateToast() {
  const reload = updateReady.value;
  // Never interrupt a running session with an update prompt.
  if (!reload || snap.value.status === 'running' || snap.value.status === 'paused') return null;
  return (
    <div class="toast" role="status">
      <span>{t('update.available')}</span>
      <button class="btn btn-sm" onClick={reload}>{t('update.reload')}</button>
    </div>
  );
}
