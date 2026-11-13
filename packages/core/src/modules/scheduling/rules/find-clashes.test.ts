import { describe, expect, it } from 'vitest';
import { findClashes } from './find-clashes.ts';
import { game } from './schedule-test-data.ts';

describe('findClashes (P7 §4.3)', () => {
  it('finds nothing in a clean schedule', () => {
    const games = [game('g1'), game('g2', { homeTeamId: 'c', awayTeamId: 'd', court: 'Court 2' })];
    expect(findClashes(games, [])).toEqual([]);
  });

  it('flags a team in two places at once', () => {
    const games = [game('g1'), game('g2', { awayTeamId: 'c', court: 'Court 2' })];
    expect(findClashes(games, [])).toEqual([
      {
        kind: 'team-in-two-places',
        teamId: 'a',
        date: '2026-10-04',
        time: '18:00',
        gameIds: ['g1', 'g2'],
      },
    ]);
  });

  it('flags a court booked twice, comparing court names exactly', () => {
    const other = { homeTeamId: 'c', awayTeamId: 'd' };
    expect(findClashes([game('g1'), game('g2', other)], [])).toEqual([
      {
        kind: 'court-booked-twice',
        venueId: 'v1',
        court: 'Court 1',
        date: '2026-10-04',
        time: '18:00',
        gameIds: ['g1', 'g2'],
      },
    ]);
    expect(findClashes([game('g1'), game('g2', { ...other, court: 'court 1' })], [])).toEqual([]);
    expect(findClashes([game('g1'), game('g2', { ...other, venueId: 'v2' })], [])).toEqual([]);
  });

  it('flags a game on a skipped date', () => {
    expect(findClashes([game('g1')], ['2026-10-04'])).toEqual([
      { kind: 'skipped-date', gameId: 'g1', date: '2026-10-04' },
    ]);
  });

  it('ignores postponed and cancelled games and games with no time', () => {
    const other = { homeTeamId: 'c', awayTeamId: 'd' };
    expect(findClashes([game('g1'), game('g2', { ...other, status: 'postponed' })], [])).toEqual(
      [],
    );
    expect(findClashes([game('g1'), game('g2', { ...other, status: 'cancelled' })], [])).toEqual(
      [],
    );
    expect(
      findClashes([game('g1', { time: null }), game('g2', { ...other, time: null })], []),
    ).toEqual([]);
  });

  it('can be limited to clashes that involve certain games', () => {
    const games = [
      game('g1'),
      game('g2', { awayTeamId: 'c', court: 'Court 2' }),
      game('g3', { homeTeamId: 'x', awayTeamId: 'y', date: '2026-10-05' }),
    ];
    expect(findClashes(games, ['2026-10-05'], new Set(['g3']))).toEqual([
      { kind: 'skipped-date', gameId: 'g3', date: '2026-10-05' },
    ]);
  });
});
