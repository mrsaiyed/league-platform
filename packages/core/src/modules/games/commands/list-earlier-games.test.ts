import { describe, expect, it } from 'vitest';
import {
  editorGrant,
  editorId,
  finalGame,
  game,
  gameUuid,
  memoryGames,
  otherSeasonId,
  ownerId,
  programScorekeeperGrant,
  programScorekeeperId,
  scorekeeperGrant,
  scorekeeperId,
  scoringRule,
  seasonId,
  type MemoryGames,
} from '../memory-games.test-helper.ts';
import { earlierRoundGamesLimit, listEarlierGames } from './list-earlier-games.ts';

// The league's today is 6 December (the stand-in keeps UTC).
const r1 = { id: '01900000-0000-7000-8000-0000000d0001', number: 1, label: null };
const r2 = { id: '01900000-0000-7000-8000-0000000d0002', number: 2, label: 'Week 2' };
const r9 = { id: '01900000-0000-7000-8000-0000000d0009', number: 1, label: null };
const games = [
  finalGame(1, { startsAt: '2026-11-08T18:00:00.000Z' }),
  finalGame(2, { startsAt: '2026-11-08T19:00:00.000Z' }),
  game(3, { startsAt: '2026-11-15T18:00:00.000Z', status: 'postponed' }),
  finalGame(4, { startsAt: '2026-11-15T19:00:00.000Z' }),
  // Still waiting for a result: under "Needs a result", not here.
  game(5, { startsAt: '2026-11-15T20:00:00.000Z' }),
  // A make-up game in no round; today's final; the other program's.
  finalGame(6, { startsAt: '2026-11-20T18:00:00.000Z' }),
  finalGame(7, { startsAt: '2026-12-06T09:00:00.000Z' }),
  finalGame(8, { startsAt: '2026-11-01T18:00:00.000Z', seasonId: otherSeasonId }),
];
const rounds = {
  [gameUuid(1)]: r1,
  [gameUuid(2)]: r1,
  [gameUuid(3)]: r2,
  [gameUuid(4)]: r2,
  [gameUuid(5)]: r2,
  [gameUuid(7)]: r2,
  [gameUuid(8)]: r9,
};
const grants = [scorekeeperGrant, editorGrant, programScorekeeperGrant];

async function earlier(account: string, round?: string, state: Partial<MemoryGames> = {}) {
  const { deps, as } = memoryGames({ games, grants, rounds, ...state });
  const result = await listEarlierGames(as(account), round === undefined ? {} : { round }, deps);
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

describe('listEarlierGames', () => {
  it('offers the rounds of earlier games, latest played first, none of them shown', async () => {
    const value = await earlier(ownerId);
    expect(value.shown).toBeNull();
    expect(value.moreRounds).toBe(false);
    expect(value.rounds.map((r) => [r.key, r.games, r.firstDay, r.lastDay])).toEqual([
      [`s-${seasonId}`, 1, '2026-11-20', '2026-11-20'],
      [`r-${r2.id}`, 2, '2026-11-15', '2026-11-15'],
      [`r-${r1.id}`, 2, '2026-11-08', '2026-11-08'],
      [`r-${r9.id}`, 1, '2026-11-01', '2026-11-01'],
    ]);
    expect(value.rounds[1]).toMatchObject({ seasonId, roundId: r2.id, number: 2, label: 'Week 2' });
  });

  it('shows one round at a time, soonest first, and nothing for a key it does not offer', async () => {
    const value = await earlier(ownerId, `r-${r2.id}`);
    expect(value.shown?.round.key).toBe(`r-${r2.id}`);
    expect(value.shown?.games.map((g) => [g.id, g.status])).toEqual([
      [gameUuid(3), 'postponed'],
      [gameUuid(4), 'final'],
    ]);
    expect((await earlier(ownerId, `s-${seasonId}`)).shown?.games.map((g) => g.id)).toEqual([
      gameUuid(6),
    ]);
    for (const wrong of ['', 'r-nothing', `r-${gameUuid(1)}`, `s-${otherSeasonId}`]) {
      expect((await earlier(ownerId, wrong)).shown, wrong).toBeNull();
    }
  });

  it("gives a scorekeeper only what they may score, and a program's scorekeeper its program", async () => {
    const settings = scoringRule('assignedOnly');
    const assignments = [{ gameId: gameUuid(4), accountId: scorekeeperId }];
    const theirs = await earlier(scorekeeperId, `r-${r2.id}`, { settings, assignments });
    expect(theirs.rounds.map((r) => [r.key, r.games])).toEqual([[`r-${r2.id}`, 1]]);
    expect(theirs.shown?.games.map((g) => g.id)).toEqual([gameUuid(4)]);
    // A round with none of theirs is not offered, nor shown.
    expect(
      (await earlier(scorekeeperId, `r-${r1.id}`, { settings, assignments })).shown,
    ).toBeNull();
    const program = await earlier(programScorekeeperId, `r-${r1.id}`);
    expect(program.rounds.map((r) => r.key)).toEqual([`r-${r9.id}`]);
    expect(program.shown).toBeNull();
  });

  it('shows at most its limit of one round, and says there are more', async () => {
    const many = Array.from({ length: earlierRoundGamesLimit + 3 }, (_, i) =>
      finalGame(100 + i, {
        startsAt: new Date(Date.UTC(2026, 10, 1, 8) + i * 60_000).toISOString(),
      }),
    );
    const value = await earlier(ownerId, `r-${r1.id}`, {
      games: many,
      rounds: Object.fromEntries(many.map((g) => [g.id, r1])),
    });
    expect(value.rounds.map((r) => r.games)).toEqual([earlierRoundGamesLimit + 3]);
    expect(value.shown?.games.length).toBe(earlierRoundGamesLimit);
    expect(value.shown?.more).toBe(true);
  });

  it('refuses anyone who scores nowhere, and a visitor', async () => {
    const { deps, as } = memoryGames({ games, grants, rounds });
    expect(await listEarlierGames(as(editorId), {}, deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    expect(await listEarlierGames(as(null), {}, deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
  });
});
