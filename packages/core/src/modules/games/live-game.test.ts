// Which box score lines are written again (changedLines): only those that differ from
// the saved ones, compared field by field, whatever order the fields come in.
import { describe, expect, it } from 'vitest';
import { changedLines } from './live-game.ts';
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
