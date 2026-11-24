// The format's words (step 2.119; S-39): every rule has a line, "none" says so, the place
// of the last seconds only when there are some, and the one line said back (B4).
import {
  formatFacts,
  formatOfRules,
  gameFormatRefusals,
  seasonRulesPreset,
} from '@srleagues/contracts';
import { createTranslator, en } from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import { factLines, refusalText, summaryOf } from './format-words.ts';

const t = createTranslator('en', { en });
const format = formatOfRules(seasonRulesPreset('high-school'));

describe('the format in words', () => {
  it('lists every rule, the clock mode included', () => {
    const lines = factLines(formatFacts(format), t, 'en');
    expect(lines.length).toBeGreaterThanOrEqual(15);
    expect(lines.some((l) => /clock/i.test(l))).toBe(true);
    expect(lines.every((l) => !l.includes('{') && !l.includes('tracker.'))).toBe(true);
  });

  it('says "none" for a rule that is not used and leaves out where no last seconds are', () => {
    const none = {
      ...format,
      clock: { ...format.clock, stopClockLastSeconds: null, mercyLead: null },
      fouls: { ...format.fouls, doubleBonusFouls: null, playerFoulLimit: null },
    };
    const lines = factLines(formatFacts(none), t, 'en');
    expect(lines).toEqual(
      expect.arrayContaining([
        'No stop clock at the end',
        'No mercy rule',
        'No double bonus',
        'No foul limit for players',
      ]),
    );
    expect(lines.some((l) => l.startsWith('Those last seconds'))).toBe(false);
  });

  it('says a saved format back in one line', () => {
    const quarters = {
      ...format,
      gameFormat: { ...format.gameFormat, periods: 4 as const, periodSeconds: 480 },
    };
    expect(summaryOf(quarters, t, 'en')).toMatch(
      /^4 quarters of 8 minutes, (stop|running) clock, bonus from team foul \d+$/,
    );
  });

  it('has words for every refusal', () => {
    for (const code of gameFormatRefusals) expect(refusalText(code, t)).not.toMatch(/tracker\./);
  });
});
