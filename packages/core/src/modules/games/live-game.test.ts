// Which box score lines are written again (changedLines): only those that differ from
// the saved ones, compared field by field, whatever order the fields come in. And a state
// that has not started, moved onto the game's rules as they are now (withCurrentRules).
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { changedLines, withCurrentRules } from './live-game.ts';
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
