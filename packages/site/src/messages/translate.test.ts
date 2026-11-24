import { describe, expect, it } from 'vitest';
import { MissingMessageError, translatorFrom } from '../../index.ts';

describe('translatorFrom: the lookup over only the words handed to it (step 2.38, L9)', () => {
  const words = { 'tracker.title': 'Scoring', 'tracker.fouls.count_one': '{count} action waiting' };

  it('says the words it was given, by the locale and then its language', () => {
    expect(translatorFrom('en-GB', { en: words })('tracker.title')).toBe('Scoring');
    expect(translatorFrom('en', { en: words }).plural('tracker.fouls.count', 1)).toBe(
      '1 action waiting',
    );
  });

  it('never reaches for a message file it was not given: a key it lacks is an error', () => {
    expect(() => translatorFrom('en', { en: words })('tracker.back')).toThrow(MissingMessageError);
    expect(() => translatorFrom('fr', {})('tracker.title')).toThrow(MissingMessageError);
  });

  it('uses the fallback only when no catalog matches', () => {
    const fallback = { 'tracker.title': 'Fallback' };
    expect(translatorFrom('fr', {}, fallback)('tracker.title')).toBe('Fallback');
    expect(translatorFrom('en', { en: words }, fallback)('tracker.title')).toBe('Scoring');
  });
});
