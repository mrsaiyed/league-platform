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
  rules,
  seasonId,
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
  it("names players by the scoring screens' rule, a person's own request holding (R-33)", async () => {
    const asked = [
      {
        ...player(homeTeamId, 1),
        firstName: 'Zara',
        lastName: 'Quintrell',
        nameRequest: 'removed',
      },
      {
        ...player(homeTeamId, 2),
        firstName: 'Omar',
        lastName: 'Vandersloot',
        nameRequest: 'initials',
      },
      { ...player(awayTeamId, 3), jerseyNumber: null, nameRequest: 'removed' },
      player(awayTeamId, 4),
    ];
    for (const on of [false, true]) {
      const { deps, as } = memoryGames({
        status: 'live',
        games: [game(1, { captureMode: 'live' })],
        grants: [scorekeeperGrant],
        roster: asked,
        settings: on
          ? {
              'privacy.scorekeepersSeeFullNames': [
                { level: 'league', document: { version: 1, value: true } },
              ],
              // Hidden on public pages: only the setting shows the others' names here.
              'privacy.publicNames': [
                { level: 'league', document: { version: 1, value: 'hidden' } },
              ],
            }
          : {},
      });
      const result = await readTrackerRosters(as(scorekeeperId), { gameId: gameUuid(1) }, deps);
      if (!result.ok) throw new Error(result.error.code);
      const served = JSON.stringify(result.value);
      expect(served).not.toContain('Quintrell');
      expect(served).not.toContain('Vandersloot');
      expect(
        result.value.players.map((p) => [p.jerseyNumber, p.firstName, p.lastName, p.ordinal]),
      ).toEqual([
        ['1', '', '', null],
        ['2', 'O. V.', '', null],
        [null, '', '', 1],
        ['4', 'First4', 'Last4', null],
      ]);
    }
  });

  it("gives the game's two teams and their players, those who left marked", async () => {
    const { deps, as } = setUp();
    const result = await readTrackerRosters(as(scorekeeperId), { gameId: gameUuid(1) }, deps);
    expect(result).toEqual({
      ok: true,
      value: {
        gameId: gameUuid(1),
        homeTeamId,
        awayTeamId,
        recording: 'live',
        status: 'scheduled',
        uniqueJerseys: false,
        allowTies: false,
        statistics: ['points', 'fg3', 'fg1', 'fouls'],
        players: roster.slice(0, 3).map((p) => ({ ...p, ordinal: null })),
      },
    });
  });

  it('says which statistics the season keeps as it stands, so the tracker offers only those (S-93)', async () => {
    const { deps, as } = memoryGames({
      status: 'live',
      seasons: [
        {
          id: seasonId,
          programId: 'p1',
          rules: rules((r) => {
            r.statistics = 'full';
          }),
        },
      ],
      games: [game(1, { captureMode: 'live' })],
      grants: [scorekeeperGrant],
      roster: [player(homeTeamId, 1)],
    });
    const result = await readTrackerRosters(as(scorekeeperId), { gameId: gameUuid(1) }, deps);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value.statistics).toContain('turnovers');
  });

  it('says whether a level score may end the game, from the rules the game is played under (S-73)', async () => {
    const withTies = (own: boolean) =>
      memoryGames({
        status: 'live',
        seasons: [
          {
            id: seasonId,
            programId: 'p1',
            rules: rules((r) => {
              r.allowTies = !own;
            }),
          },
        ],
        // A game with rules of its own is judged by them, as its End tap is.
        games: [
          game(1, {
            captureMode: 'live',
            ...(own
              ? {
                  format: rules((r) => {
                    r.allowTies = true;
                  }),
                }
              : {}),
          }),
        ],
        grants: [scorekeeperGrant],
        roster,
      });
    for (const own of [false, true]) {
      const { deps, as } = withTies(own);
      const result = await readTrackerRosters(as(scorekeeperId), { gameId: gameUuid(1) }, deps);
      expect(result).toMatchObject({ ok: true, value: { allowTies: true } });
    }
  });

  it('says whether the season wants unique numbers, and which players were added at a table and wait for review (record 058)', async () => {
    const walkUp = {
      ...player(awayTeamId, 5),
      addedAtGameId: gameUuid(1),
      needsReview: true,
    };
    const { deps, as } = memoryGames({
      status: 'live',
      seasons: [
        {
          id: seasonId,
          programId: 'p1',
          rules: rules((r) => {
            r.rosters.uniqueJerseys = true;
          }),
        },
      ],
      games: [game(1, { captureMode: 'live' })],
      grants: [scorekeeperGrant],
      roster: [player(homeTeamId, 1), walkUp],
    });
    const result = await readTrackerRosters(as(scorekeeperId), { gameId: gameUuid(1) }, deps);
    expect(result).toMatchObject({
      ok: true,
      value: { uniqueJerseys: true, players: [player(homeTeamId, 1), walkUp] },
    });
  });

  it('says how the game is recorded, so a game not recorded live is not scored in the tracker', async () => {
    const { deps, as } = memoryGames({
      status: 'live',
      games: [game(1, { captureMode: 'box' })],
      grants: [scorekeeperGrant],
      roster,
    });
    const result = await readTrackerRosters(as(scorekeeperId), { gameId: gameUuid(1) }, deps);
    expect(result).toMatchObject({ ok: true, value: { recording: 'box-score' } });
  });

  it('says where the game stands, so a game over is not offered for its score again', async () => {
    const { deps, as } = memoryGames({
      status: 'live',
      games: [game(1, { captureMode: 'final', status: 'final' })],
      grants: [scorekeeperGrant],
      roster,
    });
    const result = await readTrackerRosters(as(scorekeeperId), { gameId: gameUuid(1) }, deps);
    expect(result).toMatchObject({
      ok: true,
      value: { recording: 'final-score', status: 'final' },
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
