import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import { updateReady } from './ui/UpdateToast';
import './styles.css';

const updateSW = registerSW({
  onNeedRefresh() { updateReady.value = () => updateSW(true); },
});

render(<App />, document.getElementById('app')!);
