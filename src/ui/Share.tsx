import { useMemo } from 'preact/hooks';
import { decodePlan } from '../engine/codec';
import { navigate } from '../router';
import { t } from '../i18n';
import { Editor } from './Editor';

/** A share link lands here: decode once, then hand the plan to the editor, one tap from Start. */
export function Share({ payload }: { payload: string }) {
  const plan = useMemo(() => decodePlan(payload), [payload]);
  if (!plan) {
    return (
      <main class="screen">
        <header class="topbar"><button class="btn btn-ghost" onClick={() => navigate('')}>‹ {t('nav.back')}</button><h1>{t('share.title')}</h1></header>
        <p class="banner warn">{t('share.invalid')}</p>
      </main>
    );
  }
  return <Editor shared={plan} />;
}
