import { describe, expect, it } from 'vitest';
import {
  compareCatalogs,
  createTranslator,
  en,
  MissingMessageError,
  normalizeLocale,
  type Translate,
} from '../../index.ts';

const inherited = ['constructor', 'toString', '__proto__', 'hasOwnProperty'];

// A real second catalog: one key translated, one missing, one that English does not have.
const es = {
  'nav.home': 'Inicio',
  'schedule.games_one': '{count} partido el {date}',
  'schedule.games_other': '{count} partidos el {date}',
  'nav.legacy': 'Antiguo',
};

describe('messages (T-187)', () => {
  it('holds no U+FFFD replacement character (a damaged apostrophe)', () => {
    const damaged = Object.entries(en).filter(([, text]) => String(text).includes('�'));
    expect(damaged).toEqual([]);
  });

  it('looks up English text and fills in values', () => {
    const t = createTranslator('en');
    expect(t('site.poweredBy')).toBe('Powered by SR Leagues');
  });

  it('fails on a missing key and a missing value', () => {
    const t = createTranslator('es', { es });
    expect(() => t('nav.teams')).toThrow(MissingMessageError);
    expect(() => t.plural('schedule.games', 2, {})).toThrow(MissingMessageError);
  });

  it('never finds inherited names as keys', () => {
    const t = createTranslator('en');
    for (const name of inherited) {
      expect(() => t(name as unknown as Parameters<Translate>[0])).toThrow(MissingMessageError);
    }
  });

  it('never finds inherited names as locales, and falls back to English', () => {
    for (const name of inherited) {
      expect(createTranslator(name)('nav.home')).toBe('Home');
    }
    expect(createTranslator('toString', { en: { 'nav.home': 'H' } })('nav.home')).toBe('H');
  });

  it('does not read inherited names as values', () => {
    const t = createTranslator('es', { es: { 'nav.home': 'a {constructor}' } });
    expect(() => t('nav.home', {})).toThrow(MissingMessageError);
  });

  it('uses the language of a regional locale, and English for unknown ones', () => {
    expect(createTranslator('es-MX', { en, es: { ...en, ...es } })('nav.home')).toBe('Inicio');
    expect(createTranslator('zz', { en, es })('nav.home')).toBe('Home');
  });

  it('normalises case and underscores in locales', () => {
    expect(normalizeLocale('ES_mx')).toBe('es-MX');
    expect(normalizeLocale('not a locale')).toBe('en');
    expect(createTranslator('ES_mx', { en, es })('nav.home')).toBe('Inicio');
  });

  it('picks the singular or plural form', () => {
    const t = createTranslator('en');
    expect(t.plural('schedule.games', 1, { date: 'Sat' })).toBe('1 game on Sat');
    expect(t.plural('schedule.games', 0, { date: 'Sat' })).toBe('0 games on Sat');
    expect(t.plural('schedule.games', 3, { date: 'Sat' })).toBe('3 games on Sat');
    expect(createTranslator('es', { en, es }).plural('schedule.games', 2, { date: 'sáb' })).toBe(
      '2 partidos el sáb',
    );
  });

  it('falls back to the other form when a language has more plural categories', () => {
    const ar = { 'schedule.games_other': '{count} مباريات في {date}' };
    // Arabic uses "two", which this catalog does not have.
    expect(createTranslator('ar', { ar }).plural('schedule.games', 2, { date: 'x' })).toContain(
      '2',
    );
  });

  it('finds missing and extra keys in a second catalog', () => {
    const result = compareCatalogs(en, es);
    expect(result.missing).toContain('nav.teams');
    expect(result.missing).not.toContain('nav.home');
    expect(result.extra).toEqual(['nav.legacy']);
    expect(compareCatalogs(en, en)).toEqual({ missing: [], extra: [] });
  });

  it('does not count inherited names as present in compareCatalogs', () => {
    expect(compareCatalogs({ constructor: 'x' }, {}).missing).toEqual(['constructor']);
    expect(compareCatalogs({}, { toString: 'x' }).extra).toEqual(['toString']);
  });
});
