import { describe, expect, it } from 'vitest';
import {
  game,
  gameUuid,
  memoryGames,
  ownerId,
  scorekeeperGrant,
  scorekeeperId,
  scoringRule,
} from '../memory-games.test-helper.ts';
import { dayAfter, laterGamesLimit, listLaterGames } from './list-later-games.ts';

// The league's today is 6 December: the week shown by day runs to 12 December.
const games = [
  game(1, { startsAt: '2026-12-08T18:00:00.000Z' }),
  game(2, { startsAt: '2026-12-13T18:00:00.000Z' }),
  game(3, { startsAt: '2027-02-01T18:00:00.000Z' }),
  game(4, { startsAt: '2026-12-20T18:00:00.000Z', status: 'postponed' }),
  game(5, { startsAt: '2026-12-21T18:00:00.000Z', status: 'cancelled' }),
  game(6, { startsAt: '2026-12-22T18:00:00.000Z', binned: true }),
  game(7, { startsAt: null }),
];

describe('listLaterGames', () => {
  it('lists every scheduled game after this week, soonest first', async () => {
    const { deps, as } = memoryGames({ games, grants: [scorekeeperGrant] });
    const result = await listLaterGames(as(ownerId), {}, deps);
    expect(result.ok && result.value.games.map((g) => g.id)).toEqual([2, 3].map(gameUuid));
    expect(result.ok && result.value.more).toBe(false);
    const teams = result.ok ? result.value.teamIds : [];
    expect(teams.length).toBeGreaterThan(0);
    // Asked for a team: only its games; a team with none gets none.
    const one = teams[0] ?? '';
    const theirs = await listLaterGames(as(ownerId), { teamId: one }, deps);
    expect(
      theirs.ok && theirs.value.games.every((g) => [g.homeTeamId, g.awayTeamId].includes(one)),
    ).toBe(true);
    const nobody = await listLaterGames(as(ownerId), { teamId: gameUuid(999) }, deps);
    expect(nobody.ok && nobody.value.games).toEqual([]);
  });

  it('shows a scorekeeper only the games they may score', async () => {
    const settings = scoringRule('assignedOnly');
    const assignments = [{ gameId: gameUuid(3), accountId: scorekeeperId }];
    const { deps, as } = memoryGames({ games, grants: [scorekeeperGrant], settings, assignments });
    const result = await listLaterGames(as(scorekeeperId), {}, deps);
    expect(result.ok && result.value.games.map((g) => g.id)).toEqual([gameUuid(3)]);
  });

  it('holds at most its limit, the soonest, and says there are more', async () => {
    const many = Array.from({ length: laterGamesLimit + 3 }, (_, i) =>
      game(100 + i, {
        startsAt: new Date(Date.UTC(2026, 11, 14, 18) + i * 3_600_000).toISOString(),
      }),
    );
    const { deps, as } = memoryGames({ games: many, grants: [] });
    const result = await listLaterGames(as(ownerId), {}, deps);
    expect(result.ok && result.value.games.length).toBe(laterGamesLimit);
    expect(result.ok && result.value.games[0]?.id).toBe(gameUuid(100));
    expect(result.ok && result.value.more).toBe(true);
  });

  it('counts days in the calendar', () => {
    expect(dayAfter('2026-12-28', 7)).toBe('2027-01-04');
  });
});
