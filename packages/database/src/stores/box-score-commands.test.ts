// Step 2.64 against the real database: a game entered afterwards as a box score saves
// its lines and is decided through the same step as a final score, so it counts in the
// standings and season totals, and a stat its sheet did not record leaves that stat's
// average to the games that did. Isolation cases are in ../isolation.
import type { PGlite } from '@electric-sql/pglite';
import {
  eventHandlers,
  getBoxScoreSheet,
  recordFinalScore,
  reopenGame,
  setBoxScore,
  type CommandDeps,
  type Job,
  type StandingsTx,
  type TrackerTx,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  freshSchema,
  newGame,
  newLeague,
  newPerson,
  newProgram,
  newRosterEntry,
  newSeason,
  newStage,
  newTeam,
  one,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { gamesStore } from './games-store.ts';
import { liveGamesStore } from './live-games-store.ts';
import { scoringSessionsStore } from './scoring-sessions-store.ts';
import { standingsStore } from './standings-store.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let deps: CommandDeps<TrackerTx & StandingsTx>;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  deps = {
    transaction: commandTransaction(db, (scope) => ({
      jobs: { enqueue: async (_job: Job) => {} },
      games: gamesStore(scope),
      scoringSessions: scoringSessionsStore(scope),
      liveGames: liveGamesStore(scope),
      clock: { now: () => Date.UTC(2026, 11, 6, 20, 0, 0) },
      standings: standingsStore(scope),
      access: accessStore(scope),
      activity: activityLogStore(scope),
    })),
    events: eventHandlers,
    log: () => {},
    now: () => 0,
  };
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

/** Two teams with a rostered player each, a coach on the first, and two games. */
async function season() {
  const l = await newLeague(pglite);
  const seasonId = await newSeason(pglite, l.leagueId, await newProgram(pglite, l.leagueId));
  const stageId = await newStage(pglite, l.leagueId, seasonId);
  const home = await newTeam(pglite, l.leagueId, seasonId);
  const away = await newTeam(pglite, l.leagueId, seasonId);
  const ada = await newPerson(pglite, l.leagueId, { firstName: 'Ada', lastName: 'Lane' });
  const bo = await newPerson(pglite, l.leagueId, { firstName: 'Bo', lastName: 'Reed' });
  const coach = await newPerson(pglite, l.leagueId);
  await newRosterEntry(pglite, l.leagueId, home, ada, { jersey: '4' });
  await newRosterEntry(pglite, l.leagueId, away, bo, { jersey: '00' });
  await newRosterEntry(pglite, l.leagueId, home, coach, { role: 'coach' });
  const game = (n: number, captureMode: string) =>
    newGame(pglite, {
      leagueId: l.leagueId,
      seasonId,
      stageId,
      homeTeamId: home,
      awayTeamId: away,
      columns: { starts_at: `2026-12-0${n}T18:00:00Z`, capture_mode: captureMode },
    });
  const tracked = await game(1, 'live');
  const paper = await game(2, 'final');
  // The tracked game's line: points, fouls and minutes.
  await pglite.query(
    `insert into player_game_stats (league_id, game_id, team_id, person_id, played,
       seconds_played, stats)
     values ($1, $2, $3, $4, true, 600, '{"points": 20, "fouls": 4}')`,
    [l.leagueId, tracked, home, ada],
  );
  const ctx = { leagueId: l.leagueId, accountId: l.ownerId, requestId: 'r-1' };
  return { l, ctx, seasonId, home, away, ada, bo, coach, tracked, paper };
}

const sheetOf = (s: Awaited<ReturnType<typeof season>>, version = 1, adaPoints = 10) => ({
  gameId: s.paper,
  version,
  homeScore: 41,
  awayScore: 45,
  lines: [
    {
      teamId: s.home,
      personId: s.ada,
      played: true,
      secondsPlayed: null,
      stats: { points: adaPoints },
    },
    { teamId: s.away, personId: s.bo, played: false, secondsPlayed: null, stats: {} },
  ],
});

describe('a box score entered afterwards (step 2.64)', () => {
  it('counts in standings and totals; averages ignore stats it did not record', async () => {
    const s = await season();
    expect(
      await recordFinalScore(
        s.ctx,
        { gameId: s.tracked, version: 1, homeScore: 60, awayScore: 50 },
        deps,
      ),
    ).toMatchObject({ ok: true });
    expect(await setBoxScore(s.ctx, sheetOf(s), deps)).toMatchObject({ ok: true });

    const game = await one<{ status: string; capture_mode: string; home_score: number }>(
      pglite,
      'select status, capture_mode, home_score from games where id = $1',
      [s.paper],
    );
    expect(game).toEqual({ status: 'final', capture_mode: 'box', home_score: 41 });
    const lines = await pglite.query<Record<string, unknown>>(
      `select person_id, jersey_number, played, seconds_played, stats from player_game_stats
       where game_id = $1 order by jersey_number`,
      [s.paper],
    );
    expect(lines.rows).toEqual([
      { person_id: s.bo, jersey_number: '00', played: false, seconds_played: null, stats: {} },
      {
        person_id: s.ada,
        jersey_number: '4',
        played: true,
        seconds_played: null,
        stats: { points: 10 },
      },
    ]);

    const rows = await pglite.query<Record<string, unknown>>(
      `select team_id, wins, losses, points_for, points_against from standings_rows
       where season_id = $1 order by team_id`,
      [s.seasonId],
    );
    expect(rows.rows).toEqual(
      expect.arrayContaining([
        { team_id: s.home, wins: 1, losses: 1, points_for: 101, points_against: 95 },
        { team_id: s.away, wins: 1, losses: 1, points_for: 95, points_against: 101 },
      ]),
    );
    const totals = await pglite.query<{ person_id: string; [column: string]: unknown }>(
      `select person_id, games_played, seconds_played, seconds_games, stats
       from season_player_totals where season_id = $1`,
      [s.seasonId],
    );
    // Bo did not play in the only game he has a line in, so he has no totals.
    expect(totals.rows).toEqual([
      {
        person_id: s.ada,
        games_played: 2,
        seconds_played: 600,
        seconds_games: 1,
        stats: {
          version: 1,
          teamIds: [s.home],
          stats: {
            points: { total: 30, gamesRecorded: 2 },
            // The sheet kept no fouls: the average is over the tracked game only.
            fouls: { total: 4, gamesRecorded: 1 },
          },
        },
      },
    ]);
  });

  it('lists neither a person in the bin nor a team in the bin', async () => {
    const s = await season();
    await pglite.query('update people set deleted_at = now() where league_id = $1 and id = $2', [
      s.l.leagueId,
      s.ada,
    ]);
    expect(await getBoxScoreSheet(s.ctx, { gameId: s.paper }, deps)).toMatchObject({
      value: { players: [{ teamId: s.away, personId: s.bo }] },
    });
    await pglite.query('update teams set deleted_at = now() where league_id = $1 and id = $2', [
      s.l.leagueId,
      s.away,
    ]);
    expect(await getBoxScoreSheet(s.ctx, { gameId: s.paper }, deps)).toMatchObject({
      value: { players: [] },
    });
  });

  it('shows the sheet, refuses a tracked game, and is corrected by reopening', async () => {
    const s = await season();
    const sheet = await getBoxScoreSheet(s.ctx, { gameId: s.paper }, deps);
    expect(sheet).toMatchObject({
      ok: true,
      value: {
        // Players only: the coach is not listed.
        players: [
          { teamId: s.home, personId: s.ada, firstName: 'Ada', jerseyNumber: '4', left: false },
          { teamId: s.away, personId: s.bo, firstName: 'Bo', jerseyNumber: '00', left: false },
        ],
        lines: [],
        locked: null,
      },
    });
    // A game the tracker has played is corrected in the tracker's grid, not here.
    await pglite.query(
      `insert into game_events (league_id, game_id, seq, command_id, type, payload, tapped_at)
       values ($1, $2, 1, public.uuid_v7(), 'score', '{}', now())`,
      [s.l.leagueId, s.tracked],
    );
    expect(await setBoxScore(s.ctx, { ...sheetOf(s), gameId: s.tracked, lines: [] }, deps)).toEqual(
      { ok: false, error: { code: 'game-is-tracked' } },
    );
    expect(await getBoxScoreSheet(s.ctx, { gameId: s.tracked }, deps)).toMatchObject({
      value: { locked: 'tracked' },
    });
    // A coach is not a player of the game.
    const coachLine = {
      teamId: s.home,
      personId: s.coach,
      played: true,
      secondsPlayed: null,
      stats: {},
    };
    expect(await setBoxScore(s.ctx, { ...sheetOf(s), lines: [coachLine] }, deps)).toEqual({
      ok: false,
      error: { code: 'player-not-on-team' },
    });

    expect(await setBoxScore(s.ctx, sheetOf(s), deps)).toMatchObject({ ok: true });
    expect(
      await reopenGame(s.ctx, { gameId: s.paper, version: 2, reason: 'Misread the sheet' }, deps),
    ).toMatchObject({ ok: true });
    // The reopened game keeps its lines for the grid to correct.
    expect(await getBoxScoreSheet(s.ctx, { gameId: s.paper }, deps)).toMatchObject({
      value: { locked: null, lines: [{ personId: s.ada, stats: { points: 10 } }, {}] },
    });
    expect(await setBoxScore(s.ctx, sheetOf(s, 3, 14), deps)).toMatchObject({ ok: true });
    const totals = await one<{ stats: { stats: Record<string, unknown> } }>(
      pglite,
      'select stats from season_player_totals where season_id = $1 and person_id = $2',
      [s.seasonId, s.ada],
    );
    expect(totals.stats.stats).toEqual({ points: { total: 14, gamesRecorded: 1 } });
  });
});
