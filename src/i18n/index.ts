// Every user-facing string goes through t(). Locales are bundled JSON tables;
// the active locale is a signal so components re-render on switch, no reload.

import { signal, computed } from '@preact/signals';
import en from '../locales/en.json';
import ptBR from '../locales/pt-BR.json';
import es from '../locales/es.json';

export type Locale = 'en' | 'pt-BR' | 'es';
export type Key = keyof typeof en;

export const LOCALES: Record<Locale, { name: string; table: Record<string, string> }> = {
  'pt-BR': { name: 'Português (Brasil)', table: ptBR },
  en: { name: 'English', table: en },
  es: { name: 'Español', table: es },
};

export const DEFAULT_LOCALE: Locale = 'en';

export function detectLocale(languages: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages : []): Locale {
  for (const lang of languages) {
    const l = lang.toLowerCase();
    if (l.startsWith('pt')) return 'pt-BR';
    if (l.startsWith('es')) return 'es';
    if (l.startsWith('en')) return 'en';
  }
  return DEFAULT_LOCALE;
}

export const locale = signal<Locale>(DEFAULT_LOCALE);

export function setLocale(l: Locale): void {
  locale.value = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}

export function translate(table: Record<string, string>, key: Key, params?: Record<string, string | number>): string {
  let s = table[key] ?? en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

const table = computed(() => LOCALES[locale.value].table);

export function t(key: Key, params?: Record<string, string | number>): string {
  return translate(table.value, key, params);
}

/** Localized "N min" / "mm:ss" for totals on cards and headers. */
export function fmtMinutes(seconds: number): string {
  return t('common.min', { n: new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 }).format(Math.round(seconds / 60)) });
}
