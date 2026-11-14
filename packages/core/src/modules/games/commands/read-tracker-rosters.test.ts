// The rosters for the scorekeeper's device (record 054, T-258): both teams' players with
// names and numbers, for whoever may score the game and nobody else. The same read
// against the real database is in packages/database (the two-league harness and the
// role matrix).
import { describe, expect, it } from 'vitest';
import {
  awayTeamId,
  editorGrant,
  editorId,
  game,
  gameUuid,
  homeTeamId,
  memoryGames,
  ownerId,
  scorekeeperGrant,
  scorekeeperId,
  scoringRule,
} from '../memory-games.test-helper.ts';
import { readTrackerRosters } from './read-tracker-rosters.ts';

const player = (teamId: string, n: number, left = false) => ({
  teamId,
  personId: `01900000-0000-7000-8000-0000000d000${n}`,
  firstName: `First${n}`,
  lastName: `Last${n}`,
  jerseyNumber: String(n),
  left,
});
const roster = [
  player(homeTeamId, 1),
  player(homeTeamId, 2, true),
  player(awayTeamId, 3),
  // A player of a team not in the game is not listed.
  player('01900000-0000-7000-8000-0000000a0009', 4),
];

const setUp = (settings = {}) =>
  memoryGames({
    status: 'live',
    games: [game(1, { captureMode: 'live' }), game(2, { binned: true })],
    grants: [scorekeeperGrant, editorGrant],
    roster,
    settings,
  });

describe('reading the rosters for the tracker (T-115, T-258)', () => {
  it("gives the game's two teams and their players, those who left marked", async () => {
    const { deps, as } = setUp();
    const result = await readTrackerRosters(as(scorekeeperId), { gameId: gameUuid(1) }, deps);
    expect(result).toEqual({
      ok: true,
      value: {
        gameId: gameUuid(1),
        homeTeamId,
        awayTeamId,
        players: roster.slice(0, 3),
      },
    });
  });

  it('accepts a game id in capitals, as the address may have it', async () => {
    const { deps, as } = setUp();
    const result = await readTrackerRosters(
      as(ownerId),
      { gameId: gameUuid(1).toUpperCase() },
      deps,
    );
    expect(result).toMatchObject({ ok: true, value: { gameId: gameUuid(1) } });
  });

  it('is only for whoever may score the game, and changes nothing', async () => {
    const { db, deps, as } = setUp();
    const before = structuredClone(db.state);
    for (const who of [editorId, null]) {
      expect(await readTrackerRosters(as(who), { gameId: gameUuid(1) }, deps)).toMatchObject({
        ok: false,
        error: { code: 'not-allowed' },
      });
    }
    expect(db.state).toEqual(before);
  });

  it('is refused to a scorekeeper not assigned to the game where only those assigned score', async () => {
    const { deps, as } = setUp(scoringRule('assignedOnly'));
    expect(
      await readTrackerRosters(as(scorekeeperId), { gameId: gameUuid(1) }, deps),
    ).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
  });

  it('finds no game that is missing or in the bin', async () => {
    const { deps, as } = setUp();
    for (const id of [gameUuid(2), gameUuid(9)]) {
      expect(await readTrackerRosters(as(ownerId), { gameId: id }, deps)).toEqual({
        ok: false,
        error: { code: 'game-not-found' },
      });
    }
  });
});
