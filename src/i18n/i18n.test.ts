import { describe, expect, it } from 'vitest';
import { LOCALES, detectLocale, translate } from './index';
import en from '../locales/en.json';

describe('locales', () => {
  const keys = Object.keys(en).sort();
  for (const [name, { table }] of Object.entries(LOCALES)) {
    it(`${name} has exactly the keys of en.json`, () => {
      expect(Object.keys(table).sort()).toEqual(keys);
    });
    it(`${name} has no empty strings and keeps the same placeholders`, () => {
      for (const k of keys) {
        const v = table[k]!;
        expect(v.trim().length, k).toBeGreaterThan(0);
        const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
        expect(ph(v), k).toEqual(ph((en as Record<string, string>)[k]!));
      }
    });
  }
});

describe('translate', () => {
  it('interpolates params', () => {
    expect(translate(LOCALES['pt-BR'].table, 'run.round', { n: 3, total: 12 })).toBe('Round 3 de 12');
  });
  it('falls back to en for a missing key', () => {
    expect(translate({}, 'nav.home')).toBe('Home');
  });
});

describe('detectLocale', () => {
  it('maps browser languages to supported locales', () => {
    expect(detectLocale(['pt-PT', 'en'])).toBe('pt-BR');
    expect(detectLocale(['es-MX'])).toBe('es');
    expect(detectLocale(['de', 'fr'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });
});
