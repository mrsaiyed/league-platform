import { describe, expect, it } from 'vitest';
import {
  awayTeamId,
  editorGrant,
  editorId,
  finalGame,
  game,
  gameUuid,
  homeTeamId,
  memoryGames,
  ownerId,
  rules,
  seasonId,
} from '../memory-games.test-helper.ts';
import { getBoxScoreSheet } from './get-box-score-sheet.ts';

const personId = '01900000-0000-7000-8000-0000000d0001';
const roster = [
  {
    teamId: homeTeamId,
    personId,
    firstName: 'Ada',
    lastName: 'Lane',
    jerseyNumber: '4',
    left: false,
  },
  // A player of a team not in the game is not listed.
  {
    teamId: '01900000-0000-7000-8000-0000000a0009',
    personId: '01900000-0000-7000-8000-0000000d0009',
    firstName: 'Out',
    lastName: 'Side',
    jerseyNumber: null,
    left: false,
  },
];

describe('getBoxScoreSheet', () => {
  it("lists the game's players and its rules' stat columns, open to save", async () => {
    const { deps, as } = memoryGames({ games: [game(1)], roster });
    const sheet = await getBoxScoreSheet(as(ownerId), { gameId: gameUuid(1) }, deps);
    expect(sheet).toMatchObject({
      ok: true,
      value: {
        game: { id: gameUuid(1), homeTeamId, awayTeamId },
        players: [roster[0]],
        lines: [],
        statKeys: ['points', 'fg3', 'fg1', 'fouls'],
        minutes: true,
        locked: null,
      },
    });
  });

  it('follows a points-only season, and keeps stats and minutes lines already hold', async () => {
    const { deps, as } = memoryGames({
      games: [
        finalGame(1, {
          format: rules((r) => {
            r.recording = 'box-score';
            r.statistics = 'points-only';
          }),
        }),
      ],
      roster,
      lines: [
        {
          gameId: gameUuid(1),
          teamId: homeTeamId,
          personId,
          played: true,
          secondsPlayed: 300,
          stats: { points: 4, rebounds: 2 },
        },
      ],
    });
    const sheet = await getBoxScoreSheet(as(ownerId), { gameId: gameUuid(1) }, deps);
    expect(sheet).toMatchObject({
      ok: true,
      value: { statKeys: ['points', 'rebounds'], minutes: true, locked: 'decided' },
    });
  });

  it('says a cancelled or tracked game cannot be saved here', async () => {
    const cancelled = memoryGames({ games: [game(1, { status: 'cancelled' })] });
    expect(
      await getBoxScoreSheet(cancelled.as(ownerId), { gameId: gameUuid(1) }, cancelled.deps),
    ).toMatchObject({ value: { locked: 'cancelled' } });
    const tracked = memoryGames({ games: [game(1)], tracked: [gameUuid(1)] });
    expect(
      await getBoxScoreSheet(tracked.as(ownerId), { gameId: gameUuid(1) }, tracked.deps),
    ).toMatchObject({ value: { locked: 'tracked' } });
  });

  it('answers a missing or binned game as not found, and refuses one who may not score', async () => {
    const { deps, as } = memoryGames({
      games: [game(1, { binned: true })],
      grants: [editorGrant],
      seasons: [{ id: seasonId, programId: 'p1', rules: rules() }],
    });
    expect(await getBoxScoreSheet(as(ownerId), { gameId: gameUuid(1) }, deps)).toEqual({
      ok: false,
      error: { code: 'game-not-found' },
    });
    expect(await getBoxScoreSheet(as(ownerId), { gameId: gameUuid(2) }, deps)).toEqual({
      ok: false,
      error: { code: 'game-not-found' },
    });
    expect(await getBoxScoreSheet(as(editorId), { gameId: gameUuid(1) }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
