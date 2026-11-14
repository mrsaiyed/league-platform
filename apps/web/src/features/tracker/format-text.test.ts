import { createTranslator } from '@srleagues/site';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { formatLines } from './format-text.ts';
import { formatOf } from './opened-game-storage.ts';

const t = createTranslator('en');

describe('the game format in words', () => {
  it('says halves, their length, overtime and the clock', () => {
    expect(formatLines(formatOf(basketball.HALVES), t, 'en')).toEqual([
      '2 halves of 20 minutes',
      'Overtime periods of 5 minutes',
      'Stop clock: fouls and timeouts stop the clock',
    ]);
  });

  it('says quarters, a length that is not whole minutes, and a running clock', () => {
    const rules = { ...basketball.QUARTERS, periodSeconds: 450, clockMode: 'running' as const };
    expect(formatLines(formatOf(rules), t, 'en')).toEqual([
      '4 quarters of 7.5 minutes',
      'Overtime periods of 4 minutes',
      'Running clock: the clock keeps going through fouls and timeouts',
    ]);
  });
});
