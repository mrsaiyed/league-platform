import { seasonRulesPreset } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { engineRulesOf } from './engine-rules.ts';

describe("a season's rules as the engine reads them (T-128, S-1)", () => {
  it('the high-school preset is the engine’s quarters format, with a stop clock', () => {
    expect(engineRulesOf(seasonRulesPreset('high-school'))).toEqual({
      ...basketball.QUARTERS,
      clockMode: 'stop',
      // The preset's limit (P7 §1), carried since step 2.122.
      playerFoulLimit: 5,
    });
  });

  it('the rec-league preset is the engine’s halves format, with a running clock', () => {
    expect(engineRulesOf(seasonRulesPreset('rec-league'))).toEqual({
      ...basketball.HALVES,
      clockMode: 'running',
      playerFoulLimit: 5,
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
      playerFoulLimit: 5,
    });
  });

  it('carries the foul limit, the mercy lead and the last-minutes stop clock (step 2.122)', () => {
    const stop = seasonRulesPreset('high-school');
    stop.clock = { mode: 'stop', stopClockLastSeconds: null, mercyLead: 25 };
    stop.fouls = { ...stop.fouls, playerFoulLimit: 4 };
    expect(engineRulesOf(stop)).toMatchObject({ clockMode: 'stop', mercyLead: 25 });
    expect(engineRulesOf(stop).playerFoulLimit).toBe(4);

    const running = seasonRulesPreset('rec-league');
    running.clock = {
      mode: 'running',
      stopClockLastSeconds: 120,
      stopClockScope: 'game',
      mercyLead: null,
    };
    expect(engineRulesOf(running)).toMatchObject({
      clockMode: 'running',
      stopClockLastSeconds: 120,
      stopClockScope: 'game',
    });
  });

  it('leaves each rule out when it is off, as the engine keeps rules, so nothing else changes', () => {
    const rules = seasonRulesPreset('rec-league');
    rules.clock = {
      mode: 'running',
      stopClockLastSeconds: null,
      stopClockScope: 'period',
      mercyLead: null,
    };
    rules.fouls = { ...rules.fouls, playerFoulLimit: null };
    const engine = engineRulesOf(rules);
    expect(engine).toEqual({ ...basketball.HALVES, clockMode: 'running' });
    for (const key of ['stopClockLastSeconds', 'stopClockScope', 'mercyLead', 'playerFoulLimit']) {
      expect(Object.hasOwn(engine, key), key).toBe(false);
    }
  });

  it('is the very rules the engine keeps when it is given them as a format', () => {
    const rules = seasonRulesPreset('rec-league');
    rules.clock = {
      mode: 'running',
      stopClockLastSeconds: 90,
      stopClockScope: 'half',
      mercyLead: null,
    };
    rules.fouls = { ...rules.fouls, playerFoulLimit: 4 };
    const engine = engineRulesOf(rules);
    const set = basketball.apply(
      basketball.newGame(basketball.HALVES, 0),
      { type: 'rules', rules: engine },
      { id: 'r', now: 0 },
    );
    expect(set.rules).toEqual(engine);
  });

  it('a new game under them starts with the first period on the clock', () => {
    const game = basketball.newGame(engineRulesOf(seasonRulesPreset('rec-league')), 0);
    expect(game.clock.remainingMs).toBe(20 * 60 * 1000);
    expect(basketball.clockModeOf(game.rules)).toBe('running');
  });
});
