// The form's fields and back (checklist B1, step 2.119): a format comes back unchanged,
// minutes become seconds, empty means none, and fields that do not make a format give null.
import { formatOfRules, seasonRulesPreset } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { formatOfValues, valuesOf } from './format-values.ts';

const format = formatOfRules(seasonRulesPreset('rec-league'));

describe('the format form values', () => {
  it('gives back the format it was filled from', () => {
    expect(formatOfValues(valuesOf(format))).toEqual({
      ...format,
      clock: { ...format.clock, stopClockScope: format.clock.stopClockScope ?? 'half' },
      // Stored 'half' with no choice marked counts each period, and is shown so (T-422).
      fouls: { ...format.fouls, teamFoulsReset: 'period' },
    });
  });

  it('shows a format saved before step 2.123 as each period, and marks a choice saved (T-422)', () => {
    const quarters = { ...format, gameFormat: { ...format.gameFormat, periods: 4 as const } };
    expect(valuesOf(quarters).teamFoulsReset).toBe('period');
    for (const reset of ['half', 'game'] as const) {
      const saved = formatOfValues({ ...valuesOf(quarters), teamFoulsReset: reset });
      expect(saved?.fouls).toMatchObject({ teamFoulsReset: reset, teamFoulsResetChosen: true });
      expect(saved === null ? undefined : valuesOf(saved).teamFoulsReset).toBe(reset);
    }
    const period = formatOfValues(valuesOf(quarters));
    expect(period === null ? 'none' : Object.hasOwn(period.fouls, 'teamFoulsResetChosen')).toBe(
      false,
    );
  });

  it('turns halves into 8-minute quarters, and empty into none', () => {
    const changed = formatOfValues({
      ...valuesOf(format),
      periods: '4',
      minutes: '8',
      mercyLead: '',
      playerFoulLimit: '',
    });
    expect(changed).toMatchObject({
      gameFormat: { periods: 4, periodSeconds: 480 },
      clock: { mercyLead: null },
      fouls: { playerFoulLimit: null },
    });
  });

  it('makes no format of fields that are not numbers or do not fit', () => {
    expect(formatOfValues({ ...valuesOf(format), minutes: 'ten' })).toBeNull();
    expect(formatOfValues({ ...valuesOf(format), bonusFouls: '-1' })).toBeNull();
    expect(formatOfValues({ ...valuesOf(format), minutes: '0' })).toBeNull();
  });
});
