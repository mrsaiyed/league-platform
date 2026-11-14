import { describe, expect, it } from 'vitest';
import { recordFinalScore, recordForfeit, reopenGame } from '../games/index.ts';
import { rebuildStandings } from './commands/rebuild-standings.ts';
import {
  fourTeams,
  game as scheduledGame,
  gameId,
  line,
  memoryStandings,
  otherSeasonId,
  ownerId,
  personId,
  seasonId,
  teamId,
} from './memory-standings.test-helper.ts';

// These games carry player lines before their result is saved, as a game the live
// tracker kept does: a final score keeps a tracked game's lines. (A box score game saved
// again with two numbers only loses its lines, S-27, so it would carry none here; that
// case has its own tests in box-score-result.test.ts and record-final-score.test.ts.)
const game: typeof scheduledGame = (n, home, away, fields = {}) =>
  scheduledGame(n, home, away, { captureMode: 'live', ...fields });

const score = (n: number, version: number, homeScore: number, awayScore: number) => ({
  gameId: gameId(n),
  version,
  homeScore,
  awayScore,
});

const record = (row: { teamId: string; wins: number; losses: number; seed: number }) => ({
  teamId: row.teamId,
  wins: row.wins,
  losses: row.losses,
  seed: row.seed,
});

describe('standings follow every result (T6 §7)', () => {
  it('a final score saves the season standings and player totals with it', async () => {
    const { db, deps, as } = memoryStandings({
      games: [game(1, 1, 2)],
      lines: [line(1, 1, 1, 20), line(1, 2, 2, 14)],
    });
    expect(await recordFinalScore(as(ownerId), score(1, 1, 60, 50), deps)).toMatchObject({
      ok: true,
    });
    expect(db.state.locked).toEqual([seasonId]);
    const rows = db.state.rows[seasonId] ?? [];
    // Every team of the season has its row, teams 3 and 4 with nothing played yet.
    expect(rows.map((r) => r.teamId).sort()).toEqual(fourTeams.map((t) => t.teamId));
    expect(record(rows[0] ?? { teamId: '', wins: 0, losses: 0, seed: 0 })).toEqual({
      teamId: teamId(1),
      wins: 1,
      losses: 0,
      seed: 1,
    });
    expect(rows.find((r) => r.teamId === teamId(2))).toMatchObject({
      wins: 0,
      losses: 1,
      pointsFor: 50,
      pointsAgainst: 60,
    });
    expect(db.state.totals[seasonId]).toEqual([
      expect.objectContaining({
        personId: personId(1),
        gamesPlayed: 1,
        stats: { points: { total: 20, gamesRecorded: 1, average: 20 } },
      }),
      expect.objectContaining({ personId: personId(2), gamesPlayed: 1 }),
    ]);
  });

  it('a forfeit counts in the standings at the forfeit score, and in no player totals', async () => {
    const { db, deps, as } = memoryStandings({
      games: [game(1, 1, 2)],
      lines: [line(1, 1, 1, 20)],
    });
    await recordForfeit(
      as(ownerId),
      { gameId: gameId(1), version: 1, forfeitingTeamId: teamId(1) },
      deps,
    );
    const rows = db.state.rows[seasonId] ?? [];
    expect(rows[0]).toMatchObject({ teamId: teamId(2), wins: 1 });
    expect(rows.find((r) => r.teamId === teamId(1))).toMatchObject({ losses: 1 });
    expect(db.state.totals[seasonId]).toEqual([]);
  });

  it('a reopened game leaves the standings and totals', async () => {
    const { db, deps, as } = memoryStandings({
      games: [game(1, 1, 2)],
      lines: [line(1, 1, 1, 20)],
    });
    await recordFinalScore(as(ownerId), score(1, 1, 60, 50), deps);
    const reopened = await reopenGame(
      as(ownerId),
      { gameId: gameId(1), version: 2, reason: 'Wrong score' },
      deps,
    );
    expect(reopened).toMatchObject({ ok: true });
    expect(db.state.rows[seasonId]?.every((r) => r.gamesPlayed === 0)).toBe(true);
    expect(db.state.totals[seasonId]).toEqual([]);
  });

  it('a failure in the recalculation rolls back the result too', async () => {
    const { db, deps, as } = memoryStandings(
      { games: [game(1, 1, 2)] },
      { failSaving: new Error('standings could not be saved') },
    );
    await expect(recordFinalScore(as(ownerId), score(1, 1, 60, 50), deps)).rejects.toThrow(
      'standings could not be saved',
    );
    expect(db.state.games[0]).toMatchObject({ status: 'scheduled', homeScore: null, version: 1 });
    expect(db.state.activity).toEqual([]);
    expect(db.state.rows).toEqual({});
    expect(deps.lines.map((l) => l.outcome)).toEqual(['failed']);
  });

  it("works out only the game's own season", async () => {
    const { db, deps, as } = memoryStandings({
      teams: [
        ...fourTeams,
        { teamId: teamId(9), divisionId: null, seasonId: otherSeasonId },
        { teamId: teamId(8), divisionId: null, seasonId: otherSeasonId },
      ],
      games: [game(1, 1, 2), game(2, 9, 8, { seasonId: otherSeasonId })],
    });
    await recordFinalScore(as(ownerId), score(2, 1, 40, 30), deps);
    expect(Object.keys(db.state.rows)).toEqual([otherSeasonId]);
    expect(db.state.rows[otherSeasonId]?.map((r) => r.teamId)).toEqual([teamId(9), teamId(8)]);
  });

  it('a rebuild from nothing equals the result built up game by game', async () => {
    const { db, deps, as } = memoryStandings({
      games: [
        game(1, 1, 2),
        game(2, 3, 4),
        game(3, 1, 3),
        game(4, 2, 4),
        game(5, 4, 1),
        game(6, 2, 3),
      ],
      lines: [
        line(1, 1, 1, 20),
        line(1, 2, 2, 11),
        line(2, 3, 3, 9),
        line(2, 4, 4, 30),
        line(3, 1, 1, 7),
        line(3, 3, 3, 12),
        line(4, 2, 2, 18),
        line(5, 1, 1, 25),
        line(6, 3, 3, 4),
      ],
      adjustments: [
        {
          id: '01900000-0000-7000-8000-0000000e0001',
          seasonId,
          teamId: teamId(2),
          wins: 1,
          losses: -1,
          ties: 0,
          points: 0,
          reason: 'Result overturned by ruling',
        },
      ],
    });
    const steps = [
      () => recordFinalScore(as(ownerId), score(1, 1, 60, 50), deps),
      () => recordFinalScore(as(ownerId), score(2, 1, 41, 48), deps),
      () => recordFinalScore(as(ownerId), score(3, 1, 55, 56), deps),
      () =>
        recordForfeit(
          as(ownerId),
          { gameId: gameId(4), version: 1, forfeitingTeamId: teamId(4) },
          deps,
        ),
      () => recordFinalScore(as(ownerId), score(5, 1, 70, 52), deps),
    ];
    for (const step of steps) expect(await step()).toMatchObject({ ok: true });
    // A correction on the way: game 1 reopened and scored the other way round.
    await reopenGame(as(ownerId), { gameId: gameId(1), version: 2, reason: 'Swapped' }, deps);
    await recordFinalScore(as(ownerId), score(1, 3, 50, 60), deps);
    const stepByStep = { rows: db.state.rows[seasonId], totals: db.state.totals[seasonId] };
    expect(stepByStep.rows).toHaveLength(4);
    expect(stepByStep.totals?.length).toBeGreaterThan(0);

    db.state.rows = {};
    db.state.totals = {};
    expect(await rebuildStandings(as(ownerId), { seasonId }, deps)).toMatchObject({
      ok: true,
      value: { teams: 4, players: 4 },
    });
    expect({ rows: db.state.rows[seasonId], totals: db.state.totals[seasonId] }).toEqual(
      stepByStep,
    );
  });
});
