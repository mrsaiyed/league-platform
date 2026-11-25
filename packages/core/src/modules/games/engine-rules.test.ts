import { foulsWithReset, SeasonRules, seasonRulesPreset } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { engineRulesOf, trackerEngineRulesOf, withoutMercyOrLastMinutes } from './engine-rules.ts';
import { withCurrentRules } from './live-game.ts';

// Every game of the new product counts minutes on the game clock (S-71, record 077).
const gameClock = { minutesFollow: 'game-clock' } as const;

describe("a season's rules as the engine reads them (T-128, S-1)", () => {
  it('the high-school preset is the engine’s quarters format, with a stop clock', () => {
    expect(engineRulesOf(seasonRulesPreset('high-school'))).toEqual({
      ...basketball.QUARTERS,
      clockMode: 'stop',
      // The preset's limit (P7 §1), carried since step 2.122.
      playerFoulLimit: 5,
      ...gameClock,
    });
  });

  it('the rec-league preset is the engine’s halves format, with a running clock', () => {
    expect(engineRulesOf(seasonRulesPreset('rec-league'))).toEqual({
      ...basketball.HALVES,
      clockMode: 'running',
      playerFoulLimit: 5,
      ...gameClock,
    });
  });

  it('counts minutes on the game clock, whatever the season, and the tracker’s way for a game brought over', () => {
    for (const preset of ['high-school', 'rec-league', 'custom'] as const) {
      expect(engineRulesOf(seasonRulesPreset(preset)).minutesFollow).toBe('game-clock');
      const tracked = trackerEngineRulesOf(seasonRulesPreset(preset));
      expect(Object.hasOwn(tracked, 'minutesFollow')).toBe(false);
      expect(tracked).toEqual(
        Object.fromEntries(
          Object.entries(
            engineRulesOf(withoutMercyOrLastMinutes(seasonRulesPreset(preset))),
          ).filter(([key]) => key !== 'minutesFollow'),
        ),
      );
    }
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
      // The custom start stores 'half' with no choice marked: each period, as before (T-422).
      ...gameClock,
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
    expect(engine).toEqual({ ...basketball.HALVES, clockMode: 'running', ...gameClock });
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
    // The format is kept whole; how minutes are counted is never a format's to change
    // (the engine's checkRules leaves it out), so a game keeps its own.
    const { minutesFollow: _minutes, ...format } = engine;
    expect(set.rules).toEqual(format);
    const ours = basketball.apply(
      basketball.newGame(engine, 0),
      { type: 'rules', rules: engine },
      { id: 'r', now: 0 },
    );
    expect(ours.rules).toEqual(engine);
  });

  it('without the mercy rule and the last-minutes stop clock, for a game played without them (record 062)', () => {
    const stop = seasonRulesPreset('high-school');
    stop.clock = { mode: 'stop', stopClockLastSeconds: null, mercyLead: 20 };
    stop.fouls = { ...stop.fouls, playerFoulLimit: 4 };
    const played = withoutMercyOrLastMinutes(stop);
    expect(SeasonRules.safeParse(played).success).toBe(true);
    expect(played).toEqual({ ...stop, clock: { ...stop.clock, mercyLead: null } });
    expect(trackerEngineRulesOf(stop)).toEqual({
      ...basketball.QUARTERS,
      clockMode: 'stop',
      playerFoulLimit: 4,
    });

    const running = seasonRulesPreset('rec-league');
    running.clock = {
      mode: 'running',
      stopClockLastSeconds: 120,
      stopClockScope: 'game',
      mercyLead: null,
    };
    expect(withoutMercyOrLastMinutes(running).clock).toEqual({
      mode: 'running',
      stopClockLastSeconds: null,
      mercyLead: null,
    });
    // The season's own rules are left as they were.
    expect(running.clock.stopClockLastSeconds).toBe(120);
  });

  it('a new game under them starts with the first period on the clock', () => {
    const game = basketball.newGame(engineRulesOf(seasonRulesPreset('rec-league')), 0);
    expect(game.clock.remainingMs).toBe(20 * 60 * 1000);
    expect(basketball.clockModeOf(game.rules)).toBe('running');
  });
});

describe('when team fouls reset reaches the engine (step 2.123)', () => {
  const withReset = (
    preset: 'high-school' | 'rec-league',
    teamFoulsReset: SeasonRules['fouls']['teamFoulsReset'],
  ): SeasonRules => {
    const rules = seasonRulesPreset(preset);
    rules.fouls = foulsWithReset(rules.fouls, teamFoulsReset);
    return rules;
  };
  const home = ['h1', 'h2', 'h3', 'h4', 'h5'];
  const lineups: basketball.Command[] = [
    { type: 'lineup', side: 'home', playerIds: home },
    { type: 'lineup', side: 'away', playerIds: ['a1', 'a2', 'a3', 'a4', 'a5'] },
  ];
  /** The audit's example: 4 home fouls in Q1, 3 in Q2. */
  const example: basketball.Command[] = [
    ...lineups,
    ...[0, 1, 2, 3].map(
      (i): basketball.Command => ({ type: 'foul', side: 'home', playerId: home[i] ?? 'h1' }),
    ),
    { type: 'period', period: 2 },
    ...[4, 0, 1].map(
      (i): basketball.Command => ({ type: 'foul', side: 'home', playerId: home[i] ?? 'h1' }),
    ),
  ];
  const play = (state: basketball.GameState, commands: basketball.Command[]) =>
    commands.reduce(
      (s, c, i) => basketball.apply(s, c, { id: `c${i}`, now: 1_000 * (i + 1) }),
      state,
    );

  it('carries each half with quarters and once a game, and leaves out what counts as each period', () => {
    expect(engineRulesOf(withReset('high-school', 'half')).teamFoulsReset).toBe('half');
    expect(engineRulesOf(withReset('high-school', 'game')).teamFoulsReset).toBe('game');
    expect(engineRulesOf(withReset('rec-league', 'game')).teamFoulsReset).toBe('game');
    for (const rules of [
      withReset('high-school', 'period'),
      withReset('rec-league', 'half'),
      withReset('rec-league', 'period'),
    ]) {
      expect(Object.hasOwn(engineRulesOf(rules), 'teamFoulsReset')).toBe(false);
    }
  });

  it('counts each period for rules saved before this step, whatever they store (T-422)', () => {
    for (const [preset, teamFoulsReset] of [
      ['high-school', 'half'],
      ['high-school', 'game'],
      ['rec-league', 'game'],
    ] as const) {
      const rules = seasonRulesPreset(preset);
      rules.fouls = { ...rules.fouls, teamFoulsReset };
      expect(Object.hasOwn(engineRulesOf(rules), 'teamFoulsReset')).toBe(false);
    }
  });

  it("gives the audit's example 7 team fouls and the bonus in Q2 by the half, 3 and none each period", () => {
    const bonus7 = (reset: SeasonRules['fouls']['teamFoulsReset']) => {
      const rules = withReset('high-school', reset);
      rules.fouls = { ...rules.fouls, bonusFouls: 7, doubleBonusFouls: 10 };
      return basketball.derive(play(basketball.newGame(engineRulesOf(rules), 0), example));
    };
    expect(bonus7('half').teams.home.periodFouls).toBe(7);
    expect(bonus7('half').teams.away.bonus).toBe(1);
    expect(bonus7('period').teams.home.periodFouls).toBe(3);
    expect(bonus7('period').teams.away.bonus).toBe(0);
  });

  it('a game brought over from the tracker keeps counting each period, as it was counted', () => {
    expect(
      Object.hasOwn(trackerEngineRulesOf(withReset('high-school', 'half')), 'teamFoulsReset'),
    ).toBe(false);
  });

  it('a game keeps the rules it started with when the season changes (S-1)', () => {
    const before = engineRulesOf(withReset('high-school', 'period'));
    const after = engineRulesOf(withReset('high-school', 'half'));
    const started = play(basketball.newGame(before, 0), [...lineups, { type: 'start' }]);
    expect(withCurrentRules(started, after).rules).toEqual(before);
    const waiting = play(basketball.newGame(before, 0), lineups);
    expect(withCurrentRules(waiting, after).rules.teamFoulsReset).toBe('half');
  });
});
