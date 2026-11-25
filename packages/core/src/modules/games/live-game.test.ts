// Which box score lines are written again (changedLines): only those that differ from
// the saved ones, compared field by field, whatever order the fields come in. And a state
// that has not started, moved onto the game's rules as they are now (withCurrentRules).
// And the overtime periods a final game had (overtimePeriodsOf).
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { changedLines, overtimePeriodsOf, withCurrentRules } from './live-game.ts';
import type { LiveGameLine } from './ports.ts';

const line: LiveGameLine = {
  gameId: 'g1',
  teamId: 't1',
  personId: 'p1',
  jerseyNumber: '10',
  played: true,
  secondsPlayed: 60,
  stats: { points: 3, fg1: 0, fg2: 0, fg3: 1, fouls: 0, turnovers: 0 },
};

/** The line as the database gives it back: its fields and stats in another order. */
const readBack: LiveGameLine = {
  stats: { fg1: 0, fg2: 0, fg3: 1, fouls: 0, points: 3, turnovers: 0 },
  secondsPlayed: 60,
  played: true,
  jerseyNumber: '10',
  personId: 'p1',
  teamId: 't1',
  gameId: 'g1',
};

describe('changedLines', () => {
  it('leaves a line that has not changed, in whatever order its fields come', () => {
    expect(changedLines(new Map([['p1', readBack]]), new Map([['p1', line]]))).toEqual({
      lines: [],
      removed: [],
    });
  });

  it('writes a line whose counts, time, number or team changed, or that has a stat more or less', () => {
    const changes: LiveGameLine[] = [
      { ...line, stats: { ...line.stats, points: 5 } },
      { ...line, secondsPlayed: 61 },
      { ...line, jerseyNumber: null },
      { ...line, teamId: 't2' },
      { ...line, played: false },
      { ...line, stats: { ...line.stats, rebounds: 0 } },
      { ...line, stats: { points: 3 } },
    ];
    for (const changed of changes) {
      expect(changedLines(new Map([['p1', readBack]]), new Map([['p1', changed]])).lines).toEqual([
        changed,
      ]);
    }
  });

  it('writes a new line and takes out one that is gone', () => {
    const other = { ...line, personId: 'p2' };
    expect(changedLines(new Map([['p1', readBack]]), new Map([['p2', other]]))).toEqual({
      lines: [other],
      removed: ['p1'],
    });
  });
});

describe('overtimePeriodsOf (P7 §5.6, step 2.200)', () => {
  type Input = Parameters<typeof basketball.apply>[1];
  let n = 0;
  const tap = (state: basketball.GameState, input: Input) =>
    basketball.apply(state, input, { id: `t${++n}`, now: 1000 + n });
  /** A timeout in each of these periods, picked in turn, as the tracker's taps record them. */
  const playedIn = (rules: basketball.Rules, periods: readonly number[]) =>
    periods.reduce(
      (state, period) =>
        tap(period === 1 ? state : tap(state, { type: 'period', period }), {
          type: 'timeout',
          side: 'home',
          seconds: 60,
        }),
      basketball.newGame(rules, 0),
    );

  it('is 0 in regulation, and one for each period past it that something was played in', () => {
    expect(overtimePeriodsOf(playedIn(basketball.HALVES, []))).toBe(0);
    expect(overtimePeriodsOf(playedIn(basketball.HALVES, [1, 2]))).toBe(0);
    expect(overtimePeriodsOf(playedIn(basketball.HALVES, [1, 2, 3]))).toBe(1);
    expect(overtimePeriodsOf(playedIn(basketball.QUARTERS, [1, 2, 3, 4]))).toBe(0);
    expect(overtimePeriodsOf(playedIn(basketball.QUARTERS, [1, 2, 3, 4, 5]))).toBe(1);
    expect(overtimePeriodsOf(playedIn(basketball.QUARTERS, [1, 2, 3, 4, 5, 6]))).toBe(2);
  });

  it('counts no overtime that was only picked, or whose clock mode was only switched', () => {
    const picked = tap(playedIn(basketball.HALVES, [1, 2]), { type: 'period', period: 3 });
    expect(overtimePeriodsOf(picked)).toBe(0);
    expect(overtimePeriodsOf(tap(picked, { type: 'clock-mode', mode: 'running' }))).toBe(0);
    // A play undone is not standing: it counts for nothing.
    const timeout = tap(picked, { type: 'timeout', side: 'away', seconds: 60 });
    expect(overtimePeriodsOf(timeout)).toBe(1);
    expect(overtimePeriodsOf(tap(timeout, { type: 'undo' }))).toBe(0);
  });

  it('keeps the overtime played when the screen goes back to an earlier period', () => {
    const won = playedIn(basketball.HALVES, [1, 2, 3]);
    const back = tap(tap(won, { type: 'period', period: 2 }), {
      type: 'timeout',
      side: 'away',
      seconds: 30,
    });
    expect(basketball.derive(back).period).toBe(2);
    expect(overtimePeriodsOf(back)).toBe(1);
  });

  describe('a basket taken back (T-432)', () => {
    const lineups = (rules: basketball.Rules) =>
      tap(
        tap(basketball.newGame(rules, 0), {
          type: 'lineup',
          side: 'home',
          playerIds: ['h1', 'h2', 'h3', 'h4', 'h5'],
        }),
        { type: 'lineup', side: 'away', playerIds: ['a1', 'a2', 'a3', 'a4', 'a5'] },
      );
    const basket = { type: 'score', side: 'home', playerId: 'h1', points: 2 } as const;
    const takeBack = (state: basketball.GameState) => {
      const last = state.plays.findLast((p) => p.type === 'score');
      if (last?.type !== 'score') throw new Error('no basket');
      return tap(state, { ...basket, playId: last.id, type: 'unscore' });
    };
    /** The overtime count and the score by period's columns agree. */
    const agree = (state: basketball.GameState) =>
      expect(basketball.scoreByPeriod(state.plays).home.length).toBeLessThanOrEqual(
        state.rules.periods + overtimePeriodsOf(state),
      );

    it('a regulation game left on period 5 gets no overtime from a take-back alone', () => {
      const won = tap(tap(lineups(basketball.QUARTERS), basket), { type: 'period', period: 5 });
      expect(overtimePeriodsOf(won)).toBe(0);
      const corrected = takeBack(won);
      expect(basketball.derive(corrected).period).toBe(5);
      expect(overtimePeriodsOf(corrected)).toBe(0);
      agree(corrected);
    });

    it('an overtime whose only basket was taken back counts for nothing, as its column', () => {
      const inOvertime = tap(tap(lineups(basketball.QUARTERS), basket), {
        type: 'period',
        period: 5,
      });
      const scored = tap(inOvertime, basket);
      expect(overtimePeriodsOf(scored)).toBe(1);
      expect(basketball.scoreByPeriod(scored.plays).home).toEqual([2, 0, 0, 0, 2]);
      const corrected = takeBack(scored);
      expect(overtimePeriodsOf(corrected)).toBe(0);
      expect(basketball.scoreByPeriod(corrected.plays).home).toEqual([2]);
      agree(corrected);
      // A foul in that overtime still makes it played.
      const fouled = tap(corrected, { type: 'foul', side: 'away', playerId: 'a1' });
      expect(overtimePeriodsOf(fouled)).toBe(1);
    });
  });
});

describe('withCurrentRules, onto minutes on the game clock (record 077)', () => {
  const tracker = basketball.HALVES;
  const ours: basketball.Rules = { ...basketball.HALVES, minutesFollow: 'game-clock' };
  const lineups = (state: basketball.GameState) =>
    basketball.apply(
      state,
      { type: 'lineup', side: 'home', playerIds: ['h1', 'h2', 'h3', 'h4', 'h5'] },
      { id: 'l', now: 0 },
    );

  it('a state saved before, with its clock set before tip-off, keeps that set as where the half starts', () => {
    const saved = basketball.apply(
      lineups(basketball.newGame(tracker, 0)),
      { type: 'set-clock', ms: 15 * 60_000 },
      { id: 's', now: 0 },
    );
    const moved = withCurrentRules(saved, ours);
    expect(moved.clockSets).toEqual([{ segment: 0, ranMs: 0, ms: 15 * 60_000 }]);
    expect(moved.clock).toMatchObject({ remainingMs: 15 * 60_000, ranMs: 0 });
    // Played on: the half started at 15:00, so a minute run is a minute played.
    let s = basketball.apply(moved, { type: 'start' }, { id: 'a', now: 1_000 });
    s = basketball.apply(s, { type: 'pause' }, { id: 'b', now: 61_000 });
    expect(basketball.derive(s).players['h1']?.ms).toBe(60_000);
    // A later set to the half's own length does not reach back into it as played time.
    s = basketball.apply(s, { type: 'set-clock', ms: 14 * 60_000 }, { id: 'c', now: 62_000 });
    expect(basketball.derive(s).players['h1']?.ms).toBe(60_000);
  });

  it('one whose clock was never set gains the facts and no set; one already on the rule is left as it is', () => {
    const moved = withCurrentRules(lineups(basketball.newGame(tracker, 0)), ours);
    expect(moved.clockSets).toEqual([]);
    expect(moved.clock).toMatchObject({ remainingMs: 20 * 60_000, ranMs: 0 });
    const already = lineups(basketball.newGame(ours, 0));
    expect(withCurrentRules(already, ours)).toEqual({ ...already, rules: { ...ours } });
    // Onto the tracker's own rule, nothing is added.
    expect(withCurrentRules(lineups(basketball.newGame(tracker, 0)), tracker)).not.toHaveProperty(
      'clockSets',
    );
  });
});
