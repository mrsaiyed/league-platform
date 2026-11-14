import { seasonRulesPreset } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { engineRulesOf } from './engine-rules.ts';

describe("a season's rules as the engine reads them (T-128, S-1)", () => {
  it('the high-school preset is the engine’s quarters format, with a stop clock', () => {
    expect(engineRulesOf(seasonRulesPreset('high-school'))).toEqual({
      ...basketball.QUARTERS,
      clockMode: 'stop',
    });
  });

  it('the rec-league preset is the engine’s halves format, with a running clock', () => {
    expect(engineRulesOf(seasonRulesPreset('rec-league'))).toEqual({
      ...basketball.HALVES,
      clockMode: 'running',
    });
  });

  it('carries every value the admin set', () => {
    const rules = seasonRulesPreset('custom');
    rules.gameFormat = { periods: 4, periodSeconds: 600, overtimeSeconds: 180 };
    rules.fouls = { ...rules.fouls, bonusFouls: 6, doubleBonusFouls: null };
    rules.timeouts = { full: 4, short: 1, per: 'game', overtime: 2, carry: true };
    rules.clock = { ...rules.clock, mode: 'stop' };
    expect(engineRulesOf(rules)).toEqual({
      periods: 4,
      periodSeconds: 600,
      overtimeSeconds: 180,
      bonusFouls: 6,
      doubleBonusFouls: null,
      fullTimeouts: 4,
      shortTimeouts: 1,
      timeoutsPer: 'game',
      overtimeTimeouts: 2,
      timeoutsCarry: true,
      clockMode: 'stop',
    });
  });

  it('a new game under them starts with the first period on the clock', () => {
    const game = basketball.newGame(engineRulesOf(seasonRulesPreset('rec-league')), 0);
    expect(game.clock.remainingMs).toBe(20 * 60 * 1000);
    expect(basketball.clockModeOf(game.rules)).toBe('running');
  });
});
