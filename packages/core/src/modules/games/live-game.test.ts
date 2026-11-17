// Which box score lines are written again (changedLines): only those that differ from
// the saved ones, compared field by field, whatever order the fields come in.
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { changedLines, overtimePeriodsOf } from './live-game.ts';
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
});
