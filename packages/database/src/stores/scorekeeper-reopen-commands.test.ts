// Step 2.120 against the real database: the scorekeeper who tapped End game too soon
// reopens the game with a reason, within the league's minutes (S-36). The correction
// says who and why, in the same transaction as the result change (S-7, which the
// database enforces); standings and season totals follow the game out and back in;
// past the minutes, or for a scorekeeper who did not end it, nothing changes. The time
// is measured from the game's finalized_at, which the database stamps when it takes
// the end, to the command's clock, set here by hand. Each call is one transaction
// (commandTransaction), with the apps' event handlers. Isolation cases are in
// ../isolation; the role rows in role-matrix.test.ts.
import type { PGlite } from '@electric-sql/pglite';
import { seasonRulesPreset } from '@srleagues/contracts';
import {
  applyTrackerCommands,
  eventHandlers,
  openScoringSession,
  reopenTrackedGame,
  type CommandDeps,
  type Job,
  type StandingsTx,
  type TrackerTx,
} from '@srleagues/core';
import type { basketball } from '@srleagues/sports';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  freshSchema,
  newAccount,
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

/** The command's clock, moved by hand. */
const clock = { at: Date.now(), now: () => clock.at };
const minutes = (n: number) => n * 60_000;

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
      clock,
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

async function scorekeeper(leagueId: string) {
  const accountId = await newAccount(pglite);
  await pglite.query(
    `insert into role_grants (league_id, account_id, role, scope_type) values ($1, $2, 'scorekeeper', 'league')`,
    [leagueId, accountId],
  );
  return accountId;
}

/** A live-tracked game between two teams of five, held by a scorekeeper's tablet. */
async function trackedGame() {
  clock.at = Date.now();
  const l = await newLeague(pglite);
  const programId = await newProgram(pglite, l.leagueId);
  const seasonId = await newSeason(pglite, l.leagueId, programId);
  await pglite.query('update seasons set rules = $2 where id = $1', [
    seasonId,
    JSON.stringify(seasonRulesPreset('high-school')),
  ]);
  const stageId = await newStage(pglite, l.leagueId, seasonId);
  const homeTeamId = await newTeam(pglite, l.leagueId, seasonId);
  const awayTeamId = await newTeam(pglite, l.leagueId, seasonId);
  const squad = async (teamId: string, first: number) => {
    const ids: string[] = [];
    for (let n = 0; n < 5; n++) {
      const personId = await newPerson(pglite, l.leagueId);
      await newRosterEntry(pglite, l.leagueId, teamId, personId, { jersey: String(first + n) });
      ids.push(personId);
    }
    return ids;
  };
  const home = await squad(homeTeamId, 10);
  const away = await squad(awayTeamId, 20);
  const scorer = await scorekeeper(l.leagueId);
  const otherScorer = await scorekeeper(l.leagueId);
  const gameId = await newGame(pglite, {
    leagueId: l.leagueId,
    seasonId,
    stageId,
    homeTeamId,
    awayTeamId,
    columns: { capture_mode: 'live' },
  });
  const opened = await openScoringSession(
    { leagueId: l.leagueId, accountId: scorer, requestId: 'r-1' },
    { gameId, deviceId: 'tablet' },
    deps,
  );
  if (!opened.ok || opened.value.status !== 'held-by-you') throw new Error('not opened');
  const as = (accountId: string) => ({ leagueId: l.leagueId, accountId, requestId: 'r-1' });
  return {
    ...l,
    seasonId,
    homeTeamId,
    awayTeamId,
    home,
    away,
    scorer,
    otherScorer,
    gameId,
    sessionId: opened.value.sessionId,
    as,
  };
}

type Game = Awaited<ReturnType<typeof trackedGame>>;
type Input = Parameters<typeof basketball.apply>[1];

async function tap(g: Game, inputs: readonly Input[]) {
  const commands = inputs.map((input) => ({ commandId: randomUUID(), at: clock.at, input }));
  const result = await applyTrackerCommands(
    g.as(g.scorer),
    { gameId: g.gameId, protocolVersion: 1, sessionId: g.sessionId, commands },
    deps,
  );
  return result.ok ? result.value.results.map((r) => r.status) : [result.error.code];
}

/** Home 5, away 2, then End game on the tablet; when the database took the end. */
async function endedOnTablet(g: Game): Promise<number> {
  await tap(g, [
    { type: 'lineup', side: 'home', playerIds: g.home },
    { type: 'lineup', side: 'away', playerIds: g.away },
    { type: 'start' },
    { type: 'score', side: 'home', playerId: g.home[0] ?? '', points: 3 },
    { type: 'score', side: 'home', playerId: g.home[1] ?? '', points: 2 },
    { type: 'score', side: 'away', playerId: g.away[0] ?? '', points: 2 },
  ]);
  expect(await tap(g, [{ type: 'end' }])).toEqual(['accepted']);
  const row = await one<{ finalized_at: Date }>(
    pglite,
    'select finalized_at from games where id = $1',
    [g.gameId],
  );
  return row.finalized_at.getTime();
}

const versionOf = async (g: Game) =>
  (await one<{ version: number }>(pglite, 'select version from games where id = $1', [g.gameId]))
    .version;

async function reopenAs(g: Game, accountId: string, reason = 'Tapped End game, meant Pause') {
  const result = await reopenTrackedGame(
    g.as(accountId),
    { gameId: g.gameId, version: await versionOf(g), reason },
    deps,
  );
  return result.ok ? 'ok' : result.error.code;
}

async function rowsOf(g: Game) {
  const q = async <Row>(text: string) => (await pglite.query<Row>(text, [g.gameId])).rows;
  return {
    game: (
      await q<{ status: string; home_score: number | null; away_score: number | null }>(
        'select status, home_score, away_score from games where id = $1',
      )
    )[0],
    events: await q<{ type: string; account_id: string | null }>(
      'select type, account_id from game_events where game_id = $1 order by seq',
    ),
    corrections: await q<{ account_id: string; reason: string; before: unknown; after: unknown }>(
      'select account_id, reason, before, after from game_corrections where game_id = $1 order by at',
    ),
  };
}

async function standingsOf(g: Game) {
  const rows = await pglite.query<{ team_id: string; wins: number; losses: number }>(
    'select team_id, wins, losses from standings_rows where season_id = $1 order by team_id',
    [g.seasonId],
  );
  const totals = await pglite.query<{ person_id: string; games_played: number }>(
    'select person_id, games_played from season_player_totals where season_id = $1',
    [g.seasonId],
  );
  const won = (teamId: string) => rows.rows.find((r) => r.team_id === teamId);
  return {
    home: { wins: won(g.homeTeamId)?.wins ?? 0, losses: won(g.homeTeamId)?.losses ?? 0 },
    away: { wins: won(g.awayTeamId)?.wins ?? 0, losses: won(g.awayTeamId)?.losses ?? 0 },
    played: totals.rows.filter((t) => t.games_played > 0).length,
  };
}

const actions = async (g: Game) =>
  (
    await pglite.query<{ action: string; actor_account_id: string | null }>(
      'select action, actor_account_id from activity_log where league_id = $1 order by at, id',
      [g.leagueId],
    )
  ).rows;

describe('a scorekeeper reopening a game they ended, on the database (S-36)', () => {
  it('reopens at 29 minutes: the correction says who and why, and the standings follow both ways', async () => {
    const g = await trackedGame();
    const endedAt = await endedOnTablet(g);
    const counted = { home: { wins: 1, losses: 0 }, away: { wins: 0, losses: 1 }, played: 10 };
    expect(await standingsOf(g)).toEqual(counted);

    clock.at = endedAt + minutes(29);
    expect(await reopenAs(g, g.scorer)).toBe('ok');
    const rows = await rowsOf(g);
    expect(rows.game).toEqual({ status: 'live', home_score: 5, away_score: 2 });
    expect(rows.events.slice(-2)).toEqual([
      { type: 'end', account_id: g.scorer },
      { type: 'reopen', account_id: g.scorer },
    ]);
    expect(rows.corrections).toEqual([
      {
        account_id: g.scorer,
        reason: 'Tapped End game, meant Pause',
        before: { version: 1, status: 'final', homeScore: 5, awayScore: 2 },
        after: { version: 1, status: 'live', homeScore: 5, awayScore: 2 },
      },
    ]);
    // Out of the standings and the season totals while it is open again (S-11).
    expect(await standingsOf(g)).toEqual({
      home: { wins: 0, losses: 0 },
      away: { wins: 0, losses: 0 },
      played: 0,
    });
    const log = await actions(g);
    expect(log.at(-1)).toEqual({ action: 'games.reopen_tracked_game', actor_account_id: g.scorer });

    // The tablet opens it again with its own session and carries on; ended again, it counts again.
    const opened = await openScoringSession(
      g.as(g.scorer),
      { gameId: g.gameId, deviceId: 'tablet' },
      deps,
    );
    expect(opened).toMatchObject({ ok: true, value: { status: 'held-by-you' } });
    expect(
      await tap(g, [
        { type: 'score', side: 'away', playerId: g.away[1] ?? '', points: 3 },
        { type: 'score', side: 'away', playerId: g.away[2] ?? '', points: 2 },
        { type: 'end' },
      ]),
    ).toEqual(['accepted', 'accepted', 'accepted']);
    expect((await rowsOf(g)).game).toEqual({ status: 'final', home_score: 5, away_score: 7 });
    expect(await standingsOf(g)).toEqual({
      home: { wins: 0, losses: 1 },
      away: { wins: 1, losses: 0 },
      played: 10,
    });
  });

  it('is refused at 31 minutes, and to a scorekeeper who did not end it; nothing changes', async () => {
    const g = await trackedGame();
    const endedAt = await endedOnTablet(g);
    const before = { rows: await rowsOf(g), standings: await standingsOf(g) };
    clock.at = endedAt + minutes(5);
    expect(await reopenAs(g, g.otherScorer)).toBe('not-ended-by-you');
    clock.at = endedAt + minutes(31);
    expect(await reopenAs(g, g.scorer)).toBe('reopen-time-over');
    expect({ rows: await rowsOf(g), standings: await standingsOf(g) }).toEqual(before);
    expect((await actions(g)).map((a) => a.action)).toEqual(['games.end_tracked_game']);
    // The owner may correct games, so may still reopen it.
    expect(await reopenAs(g, g.ownerId)).toBe('ok');
  });

  it("follows the league's own minutes, read from its settings", async () => {
    const g = await trackedGame();
    await pglite.query(
      `insert into setting_values (league_id, level, key, value)
       values ($1, 'league', 'games.scorekeeperReopenMinutes', $2::jsonb)`,
      [g.leagueId, JSON.stringify({ version: 1, value: 45 })],
    );
    const endedAt = await endedOnTablet(g);
    clock.at = endedAt + minutes(44);
    expect(await reopenAs(g, g.scorer)).toBe('ok');
  });
});
