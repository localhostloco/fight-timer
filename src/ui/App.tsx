import { route } from '../router';
import { locale } from '../i18n';
import { Home } from './Home';
import { Editor } from './Editor';
import { Running } from './Running';
import { Settings } from './Settings';
import { UpdateToast } from './UpdateToast';

export function App() {
  locale.value; // subscribe so the whole tree re-renders on language switch
  const r = route.value;
  return (
    <>
      {r.name === 'home' && <Home />}
      {r.name === 'edit' && <Editor id={r.id} />}
      {r.name === 'run' && <Running />}
      {r.name === 'settings' && <Settings />}
      <UpdateToast />
    </>
  );
}
