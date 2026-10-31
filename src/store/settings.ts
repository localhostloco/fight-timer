import { signal, effect } from '@preact/signals';
import { detectLocale, setLocale, type Locale } from '../i18n';

export interface Settings {
  locale: Locale;
  volume: number;
  vibrate: boolean;
  keepAwake: boolean;
  showTenths: boolean;
  tvMode: boolean;
  voiceControl: boolean;
  voice: { enabled: boolean; name?: string; rate: number };
  theme: 'dark';
  lastPlanId?: string;
}

export const SETTINGS_KEY = 'ft.settings';
export const SCHEMA_KEY = 'ft.schemaVersion';
export const SCHEMA_VERSION = 1;

const defaults = (): Settings => ({
  locale: detectLocale(),
  volume: 1,
  vibrate: true,
  keepAwake: true,
  showTenths: false,
  tvMode: false,
  voiceControl: false,
  voice: { enabled: false, rate: 1 },
  theme: 'dark',
});

export function loadSettings(storage: Storage | null = safeStorage()): Settings {
  const d = defaults();
  if (!storage) return d;
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return d;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...d, ...parsed, voice: { ...d.voice, ...(parsed.voice ?? {}) } };
  } catch { return d; }
}

export function safeStorage(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export const settings = signal<Settings>(loadSettings());

export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
}

if (typeof window !== 'undefined') {
  effect(() => {
    const s = settings.value;
    setLocale(s.locale);
    const st = safeStorage();
    if (st) { st.setItem(SETTINGS_KEY, JSON.stringify(s)); st.setItem(SCHEMA_KEY, String(SCHEMA_VERSION)); }
  });
}

export function resetAll(): void {
  const st = safeStorage();
  if (st) for (const k of Object.keys(st)) if (k.startsWith('ft.')) st.removeItem(k);
  settings.value = defaults();
}
