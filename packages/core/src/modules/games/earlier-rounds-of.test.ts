import { describe, expect, it } from 'vitest';
import {
  earlierRoundsOf,
  inEarlierRound,
  isEarlierGame,
  type GameWithRound,
} from './earlier-rounds-of.ts';
import { game, gameUuid, otherSeasonId, seasonId } from './memory-games.test-helper.ts';

const r1 = { id: '01900000-0000-7000-8000-0000000d0001', number: 1, label: null };
const r2 = { id: '01900000-0000-7000-8000-0000000d0002', number: 2, label: 'Week 2' };

const entry = (
  n: number,
  day: string,
  status: string,
  round: GameWithRound['round'],
  fields: { assigned?: boolean; binned?: boolean; season?: string } = {},
): GameWithRound => ({
  game: game(n, {
    status,
    startsAt: `${day}T18:00:00.000Z`,
    binned: fields.binned ?? false,
    seasonId: fields.season ?? seasonId,
  }),
  programId: fields.season === otherSeasonId ? 'p2' : 'p1',
  day,
  assigned: fields.assigned ?? false,
  round,
});

const today = '2026-12-06';
const entries = [
  entry(1, '2026-11-22', 'final', r1),
  entry(2, '2026-11-23', 'forfeit', r1, { assigned: true }),
  entry(3, '2026-11-29', 'postponed', r2),
  entry(4, '2026-11-29', 'cancelled', r2),
  // Still waiting for a result: not earlier.
  entry(5, '2026-11-29', 'scheduled', r2),
  entry(6, '2026-11-29', 'live', r2),
  // Today's, in the bin, and with no round.
  entry(7, today, 'final', r2),
  entry(8, '2026-11-29', 'final', r2, { binned: true }),
  entry(9, '2026-11-30', 'final', null),
  entry(10, '2026-11-01', 'final', null, { season: otherSeasonId }),
];

describe('earlier games by round', () => {
  it('counts a decided or called-off game from before today, in no bin', () => {
    expect(entries.filter((e) => isEarlierGame(e, today)).map((e) => e.game.id)).toEqual(
      [1, 2, 3, 4, 9, 10].map(gameUuid),
    );
  });

  it('gives the rounds latest played first, a season with no round its own', () => {
    expect(earlierRoundsOf(entries, today, 10)).toEqual([
      {
        seasonId,
        programId: 'p1',
        roundId: null,
        number: null,
        label: null,
        firstDay: '2026-11-30',
        lastDay: '2026-11-30',
        games: 1,
        assigned: 0,
      },
      {
        seasonId,
        programId: 'p1',
        roundId: r2.id,
        number: 2,
        label: 'Week 2',
        firstDay: '2026-11-29',
        lastDay: '2026-11-29',
        games: 2,
        assigned: 0,
      },
      {
        seasonId,
        programId: 'p1',
        roundId: r1.id,
        number: 1,
        label: null,
        firstDay: '2026-11-22',
        lastDay: '2026-11-23',
        games: 2,
        assigned: 1,
      },
      {
        seasonId: otherSeasonId,
        programId: 'p2',
        roundId: null,
        number: null,
        label: null,
        firstDay: '2026-11-01',
        lastDay: '2026-11-01',
        games: 1,
        assigned: 0,
      },
    ]);
    expect(earlierRoundsOf(entries, today, 2).map((r) => r.roundId)).toEqual([null, r2.id]);
  });

  it('knows which round a game is in', () => {
    const [first, , , , , , , , noRound] = entries;
    expect(first && inEarlierRound(first, { roundId: r1.id })).toBe(true);
    expect(first && inEarlierRound(first, { roundId: r2.id })).toBe(false);
    expect(first && inEarlierRound(first, { seasonId })).toBe(false);
    expect(noRound && inEarlierRound(noRound, { seasonId })).toBe(true);
    expect(noRound && inEarlierRound(noRound, { seasonId: otherSeasonId })).toBe(false);
  });
});
