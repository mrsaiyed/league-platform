import { describe, expect, it } from 'vitest';
import { compareLines, type ComparableLine } from './tracker-lines.ts';
import type { TrackerLine } from './tracker-transfer-data.ts';

const old: TrackerLine = {
  playerId: 'P1',
  teamId: 'tracker-team',
  jersey: '4',
  appeared: true,
  points: 5,
  fg1: 0,
  fg2: 1,
  fg3: 1,
  fouls: 2,
  turnovers: 1,
  ms: 754_999,
};
const same: ComparableLine = {
  teamId: 'team',
  jerseyNumber: '4',
  played: true,
  secondsPlayed: 754,
  stats: { points: 5, fg1: 0, fg2: 1, fg3: 1, fouls: 2, turnovers: 1 },
};
const teamOf = (id: string) => (id === 'tracker-team' ? 'team' : undefined);
const didNotPlay: ComparableLine = {
  teamId: 'team',
  jerseyNumber: null,
  played: false,
  secondsPlayed: 0,
  stats: {},
};

describe('comparing box score lines with the tracker’s', () => {
  it('finds none when every line is the same, in whole seconds, with did-not-play lines beside', () => {
    const here = new Map([
      ['p1', same],
      ['p2', didNotPlay],
    ]);
    expect(compareLines([old], here, [didNotPlay], teamOf)).toEqual([]);
  });

  it('names each field that differs, and lines missing or extra', () => {
    const differs: ComparableLine = {
      ...same,
      teamId: 'other',
      jerseyNumber: null,
      secondsPlayed: 700,
      stats: { ...same.stats, fouls: 3, turnovers: 1, points: 5 },
    };
    expect(compareLines([old], new Map([['p1', differs]]), [], teamOf)).toEqual([
      { playerId: 'p1', what: 'team', tracker: 'team', here: 'other' },
      { playerId: 'p1', what: 'number', tracker: '4', here: '' },
      { playerId: 'p1', what: 'seconds', tracker: '754', here: '700' },
      { playerId: 'p1', what: 'fouls', tracker: '2', here: '3' },
    ]);
    expect(compareLines([old], new Map(), [same], teamOf)).toEqual([
      { playerId: 'p1', what: 'missing', tracker: '', here: '' },
      { playerId: null, what: 'extra', tracker: '', here: '' },
    ]);
    expect(compareLines([], new Map([['p9', same]]), [], teamOf)).toEqual([
      { playerId: 'p9', what: 'extra', tracker: '', here: '' },
    ]);
  });
});
