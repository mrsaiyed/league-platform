// Step 2.24 against the real database: standings and season totals follow every
// result in the result's own transaction (T6 §7), a failure in that work takes the
// result back with it, and the rebuild command gives exactly the rows built up result
// by result. Isolation cases are in ../isolation.
import type { PGlite } from '@electric-sql/pglite';
import {
  eventHandlers,
  rebuildStandings,
  recordFinalScore,
  recordForfeit,
  reopenGame,
  type CommandDeps,
  type GamesTx,
  type Job,
  type StandingsStore,
  type StandingsTx,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  freshSchema,
  newDivision,
  newGame,
  newLeague,
  newPerson,
  newProgram,
  newSeason,
  newStage,
  newTeam,
  one,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { gamesStore } from './games-store.ts';
import { standingsStore } from './standings-store.ts';

let pglite: PGlite;
let db: DatabaseHandle;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

/** The apps' deps: every store the games commands and the standings handlers need. */
function depsWith(
  standings: (scope: LeagueScope) => StandingsStore = standingsStore,
): CommandDeps<GamesTx & StandingsTx> {
  return {
    transaction: commandTransaction(db, (scope) => ({
      jobs: { enqueue: async (_job: Job) => {} },
      games: gamesStore(scope),
      standings: standings(scope),
      access: accessStore(scope),
      activity: activityLogStore(scope),
    })),
    events: eventHandlers,
    log: () => {},
    now: () => 0,
  };
}

/** A season of four teams in two divisions, six games to play, and a player per team. */
async function season() {
  const l = await newLeague(pglite);
  const seasonId = await newSeason(pglite, l.leagueId, await newProgram(pglite, l.leagueId));
  const north = await newDivision(pglite, l.leagueId, seasonId, { name: 'North' });
  const south = await newDivision(pglite, l.leagueId, seasonId, { name: 'South' });
  const teams = [
    await newTeam(pglite, l.leagueId, seasonId, { divisionId: north }),
    await newTeam(pglite, l.leagueId, seasonId, { divisionId: north }),
    await newTeam(pglite, l.leagueId, seasonId, { divisionId: south }),
    await newTeam(pglite, l.leagueId, seasonId, { divisionId: south }),
  ] as const;
  const players = [];
  for (let k = 0; k < teams.length; k += 1) players.push(await newPerson(pglite, l.leagueId));
  const stageId = await newStage(pglite, l.leagueId, seasonId);
  const pairs = [
    [0, 1],
    [2, 3],
    [0, 2],
    [1, 3],
    [3, 0],
    [1, 2],
  ] as const;
  const games: string[] = [];
  for (const [n, [home, away]] of pairs.entries()) {
    const gameId = await newGame(pglite, {
      leagueId: l.leagueId,
      seasonId,
      stageId,
      homeTeamId: teams[home],
      awayTeamId: teams[away],
      columns: { starts_at: `2026-12-0${n + 1}T18:00:00Z`, capture_mode: 'live' },
    });
    games.push(gameId);
    // Each team's player's line: points and minutes. The games are tracked live, so
    // their lines stay when the result is saved with two numbers; a box score game
    // saved that way loses its lines (S-27), which box-score-commands.test.ts covers.
    for (const side of [home, away]) {
      await pglite.query(
        `insert into player_game_stats (league_id, game_id, team_id, person_id, played,
           seconds_played, stats)
         values ($1, $2, $3, $4, true, 600, $5)`,
        [l.leagueId, gameId, teams[side], players[side], JSON.stringify({ points: 10 + n + side })],
      );
    }
  }
  const ctx = { leagueId: l.leagueId, accountId: l.ownerId, requestId: 'r-1' };
  const game = (k: number) => {
    const id = games[k];
    if (id === undefined) throw new Error(`no game ${k}`);
    return id;
  };
  return { l, ctx, seasonId, north, south, teams, players, game };
}

type Season = Awaited<ReturnType<typeof season>>;

/** The calculated rows of a season, without ids, times and versions. */
async function calculated(s: Season) {
  const rows = await pglite.query<{
    team_id: string;
    division_id: string | null;
    seed: number;
    [column: string]: unknown;
  }>(
    `select team_id, division_id, rank, seed, games_played, wins, losses, ties, points_for,
       points_against, standings_points, streak_result, streak_length, decided_by
     from standings_rows where season_id = $1 order by division_id nulls first, seed`,
    [s.seasonId],
  );
  const totals = await pglite.query<{ person_id: string; [column: string]: unknown }>(
    `select person_id, games_played, seconds_played, seconds_games, stats
     from season_player_totals where season_id = $1 order by person_id`,
    [s.seasonId],
  );
  return { rows: rows.rows, totals: totals.rows };
}

const gameStatus = async (gameId: string) =>
  (await one<{ status: string }>(pglite, 'select status from games where id = $1', [gameId]))
    .status;

describe('standings follow every result (step 2.24)', () => {
  it('a final score saves the season standings and totals in the same transaction', async () => {
    const s = await season();
    const deps = depsWith();
    const result = await recordFinalScore(
      s.ctx,
      { gameId: s.game(0), version: 1, homeScore: 60, awayScore: 50 },
      deps,
    );
    expect(result).toMatchObject({ ok: true });
    const { rows, totals } = await calculated(s);
    expect(rows).toHaveLength(4);
    expect(rows.filter((r) => r.division_id === s.north)).toEqual([
      expect.objectContaining({ team_id: s.teams[0], seed: 1, wins: 1, points_for: 60 }),
      expect.objectContaining({ team_id: s.teams[1], seed: 2, losses: 1, points_against: 60 }),
    ]);
    expect(totals).toHaveLength(2);
    expect(totals.find((t) => t.person_id === s.players[0])).toMatchObject({
      games_played: 1,
      seconds_played: 600,
      seconds_games: 1,
      stats: {
        version: 1,
        teamIds: [s.teams[0]],
        stats: { points: { total: 10, gamesRecorded: 1 } },
      },
    });
  });

  it('a failure in the recalculation rolls back the result too', async () => {
    const s = await season();
    // The rows are really written, then saving the totals fails.
    const failing = (scope: LeagueScope): StandingsStore => ({
      ...standingsStore(scope),
      replaceTotals: async () => {
        throw new Error('totals could not be saved');
      },
    });
    await expect(
      recordFinalScore(
        s.ctx,
        { gameId: s.game(0), version: 1, homeScore: 60, awayScore: 50 },
        depsWith(failing),
      ),
    ).rejects.toThrow('totals could not be saved');
    expect(await gameStatus(s.game(0))).toBe('scheduled');
    expect(await calculated(s)).toEqual({ rows: [], totals: [] });
    const logged = await one<{ n: number }>(
      pglite,
      'select count(*)::int as n from activity_log where league_id = $1',
      [s.l.leagueId],
    );
    expect(logged.n).toBe(0);
  });

  it('a reopening that fails to recalculate stays decided, with no correction', async () => {
    const s = await season();
    await recordFinalScore(
      s.ctx,
      { gameId: s.game(0), version: 1, homeScore: 60, awayScore: 50 },
      depsWith(),
    );
    const before = await calculated(s);
    const failing = (scope: LeagueScope): StandingsStore => ({
      ...standingsStore(scope),
      replaceRows: async () => {
        throw new Error('rows could not be saved');
      },
    });
    await expect(
      reopenGame(
        s.ctx,
        { gameId: s.game(0), version: 2, reason: 'Wrong score' },
        depsWith(failing),
      ),
    ).rejects.toThrow('rows could not be saved');
    expect(await gameStatus(s.game(0))).toBe('final');
    expect(await calculated(s)).toEqual(before);
    const corrections = await one<{ n: number }>(
      pglite,
      'select count(*)::int as n from game_corrections where game_id = $1',
      [s.game(0)],
    );
    expect(corrections.n).toBe(0);
  });

  it('a rebuild from nothing equals the result built up game by game', async () => {
    const s = await season();
    const deps = depsWith();
    const score = (k: number, version: number, homeScore: number, awayScore: number) =>
      recordFinalScore(s.ctx, { gameId: s.game(k), version, homeScore, awayScore }, deps);
    expect(await score(0, 1, 60, 50)).toMatchObject({ ok: true });
    expect(await score(1, 1, 41, 48)).toMatchObject({ ok: true });
    expect(await score(2, 1, 55, 56)).toMatchObject({ ok: true });
    expect(
      await recordForfeit(
        s.ctx,
        { gameId: s.game(3), version: 1, forfeitingTeamId: s.teams[3] },
        deps,
      ),
    ).toMatchObject({ ok: true });
    expect(await score(4, 1, 70, 52)).toMatchObject({ ok: true });
    // A correction on the way: the first game reopened and decided the other way.
    expect(
      await reopenGame(s.ctx, { gameId: s.game(0), version: 2, reason: 'Swapped' }, deps),
    ).toMatchObject({ ok: true });
    expect(await score(0, 3, 50, 60)).toMatchObject({ ok: true });
    const stepByStep = await calculated(s);
    expect(stepByStep.rows).toHaveLength(4);
    expect(stepByStep.totals).toHaveLength(4);

    await pglite.query('delete from standings_rows where season_id = $1', [s.seasonId]);
    await pglite.query('delete from season_player_totals where season_id = $1', [s.seasonId]);
    expect(await rebuildStandings(s.ctx, { seasonId: s.seasonId }, deps)).toMatchObject({
      ok: true,
      value: { teams: 4, players: 4, problems: [] },
    });
    expect(await calculated(s)).toEqual(stepByStep);

    // Rebuilding over the rows it made keeps them as they are, ids and all.
    const ids = () =>
      pglite.query('select id from standings_rows where season_id = $1 order by id', [s.seasonId]);
    const before = (await ids()).rows;
    await rebuildStandings(s.ctx, { seasonId: s.seasonId }, deps);
    expect(await calculated(s)).toEqual(stepByStep);
    expect((await ids()).rows).toEqual(before);
  });

  it("a rebuild moves a team that changed division into its new division's table", async () => {
    const s = await season();
    const deps = depsWith();
    await recordFinalScore(
      s.ctx,
      { gameId: s.game(0), version: 1, homeScore: 60, awayScore: 50 },
      deps,
    );
    await pglite.query('update teams set division_id = $1 where id = $2', [s.south, s.teams[1]]);
    expect(await rebuildStandings(s.ctx, { seasonId: s.seasonId }, deps)).toMatchObject({
      ok: true,
    });
    const { rows } = await calculated(s);
    expect(rows.filter((r) => r.division_id === s.south).map((r) => r.team_id)).toContain(
      s.teams[1],
    );
    expect(rows.filter((r) => r.division_id === s.north).map((r) => r.seed)).toEqual([1]);
  });

  it('a team moved to the bin leaves the standings at the next rebuild', async () => {
    const s = await season();
    const deps = depsWith();
    const extra = await newTeam(pglite, s.l.leagueId, s.seasonId, { divisionId: s.north });
    await rebuildStandings(s.ctx, { seasonId: s.seasonId }, deps);
    expect((await calculated(s)).rows.map((r) => r.team_id)).toContain(extra);
    await pglite.query('update teams set deleted_at = now() where id = $1', [extra]);
    await rebuildStandings(s.ctx, { seasonId: s.seasonId }, deps);
    const { rows } = await calculated(s);
    expect(rows.map((r) => r.team_id)).not.toContain(extra);
    expect(rows).toHaveLength(4);
  });
});
