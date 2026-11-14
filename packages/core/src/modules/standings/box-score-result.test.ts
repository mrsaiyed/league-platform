// Step 2.64's done test in core: a game entered afterwards as a box score counts in the
// standings and the season totals like any final game, and a stat it did not record
// leaves that stat's average to the games that did (T6 §9, P7 §8).
import { describe, expect, it } from 'vitest';
import { recordFinalScore, reopenGame, setBoxScore } from '../games/index.ts';
import {
  game,
  gameId,
  line,
  memoryStandings,
  ownerId,
  personId,
  seasonId,
  teamId,
} from './memory-standings.test-helper.ts';

const rostered = (n: number, team: number) => ({
  teamId: teamId(team),
  personId: personId(n),
  firstName: `First${n}`,
  lastName: `Last${n}`,
  jerseyNumber: null,
  left: false,
});

describe('a box score entered afterwards (step 2.64)', () => {
  it('counts in standings and totals; averages ignore stats it did not record', async () => {
    const { db, deps, as } = memoryStandings({
      // Game 1 was tracked: the line has points and fouls. Game 2 comes from a paper
      // sheet that kept points only.
      games: [game(1, 1, 2, { captureMode: 'live' }), game(2, 1, 3, { captureMode: 'final' })],
      lines: [{ ...line(1, 1, 1, 20), stats: { points: 20, fouls: 4 } }],
      roster: [rostered(1, 1), rostered(3, 3)],
    });
    expect(
      await recordFinalScore(
        as(ownerId),
        { gameId: gameId(1), version: 1, homeScore: 60, awayScore: 50 },
        deps,
      ),
    ).toMatchObject({ ok: true });
    const sheet = {
      gameId: gameId(2),
      version: 1,
      homeScore: 41,
      awayScore: 45,
      lines: [
        {
          teamId: teamId(1),
          personId: personId(1),
          played: true,
          secondsPlayed: null,
          stats: { points: 10 },
        },
        {
          teamId: teamId(3),
          personId: personId(3),
          played: true,
          secondsPlayed: null,
          stats: { points: 15 },
        },
      ],
    };
    expect(await setBoxScore(as(ownerId), sheet, deps)).toMatchObject({ ok: true });

    const rows = db.state.rows[seasonId] ?? [];
    expect(rows.find((r) => r.teamId === teamId(1))).toMatchObject({
      wins: 1,
      losses: 1,
      pointsFor: 101,
      pointsAgainst: 95,
    });
    expect(rows.find((r) => r.teamId === teamId(3))).toMatchObject({ wins: 1, losses: 0 });
    const totals = db.state.totals[seasonId] ?? [];
    expect(totals.find((t) => t.personId === personId(1))).toMatchObject({
      gamesPlayed: 2,
      stats: {
        points: { total: 30, gamesRecorded: 2, average: 15 },
        // The sheet kept no fouls, so the average is over the tracked game only.
        fouls: { total: 4, gamesRecorded: 1, average: 4 },
      },
      // Minutes were in the tracked game only.
      seconds: { total: 600, gamesRecorded: 1, average: 600 },
    });
    expect(totals.find((t) => t.personId === personId(3))).toMatchObject({
      gamesPlayed: 1,
      stats: { points: { total: 15, gamesRecorded: 1, average: 15 } },
    });
  });

  it('is corrected by reopening it with a reason and entering the sheet again', async () => {
    const { db, deps, as } = memoryStandings({
      games: [game(1, 1, 2)],
      roster: [rostered(1, 1)],
    });
    const sheet = (version: number, points: number) => ({
      gameId: gameId(1),
      version,
      homeScore: points,
      awayScore: 5,
      lines: [
        {
          teamId: teamId(1),
          personId: personId(1),
          played: true,
          secondsPlayed: null,
          stats: { points },
        },
      ],
    });
    expect(await setBoxScore(as(ownerId), sheet(1, 12), deps)).toMatchObject({ ok: true });
    expect(await setBoxScore(as(ownerId), sheet(2, 14), deps)).toMatchObject({
      error: { code: 'game-already-decided' },
    });
    await reopenGame(as(ownerId), { gameId: gameId(1), version: 2, reason: 'Misread sheet' }, deps);
    expect(db.state.corrections).toHaveLength(1);
    expect(await setBoxScore(as(ownerId), sheet(3, 14), deps)).toMatchObject({ ok: true });
    expect(db.state.totals[seasonId]?.[0]).toMatchObject({
      stats: { points: { total: 14, gamesRecorded: 1 } },
    });
    expect(db.state.rows[seasonId]?.find((r) => r.teamId === teamId(1))).toMatchObject({
      pointsFor: 14,
    });
  });
});
