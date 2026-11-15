// Step 2.120 against the real database: the scorekeeper who tapped End game too soon
// reopens the game with a reason, within the league's minutes (S-36). The correction
// says who and why, in the same transaction as the result change (S-7, which the
// database enforces); standings and season totals follow the game out and back in;
// past the minutes, or for a scorekeeper who did not end it, nothing changes; the same
// request sent twice reopens once. The time is measured inside the database, from the
// game's finalized_at (which it stamps when it takes the end) to its now(); time passing
// is shown by moving finalized_at back (`endedMinutesAgo`). Each call is one transaction
// (commandTransaction), with the apps' event handlers. Isolation cases are in
// ../isolation; the role rows in role-matrix.test.ts.
import type { PGlite } from '@electric-sql/pglite';
import { seasonRulesPreset } from '@srleagues/contracts';
import {
  applyTrackerCommands,
  eventHandlers,
  openScoringSession,
  readReopenOffer,
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

/** The app server's clock: the taps' times and the time Reopen is offered until. */
const clock = { at: Date.now(), now: () => clock.at };

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

/** Home 5, away 2, then End game on the tablet. */
async function endedOnTablet(g: Game): Promise<void> {
  await tap(g, [
    { type: 'lineup', side: 'home', playerIds: g.home },
    { type: 'lineup', side: 'away', playerIds: g.away },
    { type: 'start' },
    { type: 'score', side: 'home', playerId: g.home[0] ?? '', points: 3 },
    { type: 'score', side: 'home', playerId: g.home[1] ?? '', points: 2 },
    { type: 'score', side: 'away', playerId: g.away[0] ?? '', points: 2 },
  ]);
  expect(await tap(g, [{ type: 'end' }])).toEqual(['accepted']);
}

/**
 * Changes a stored row with the database's own triggers held off, as only a test may:
 * the result-change check (S-7) and the events' never-changed rule would rightly refuse
 * it. Used to stand for time that has passed, or for an end the transfer brought in
 * with no account.
 */
async function rewrite(text: string, params: unknown[]) {
  await pglite.transaction(async (tx) => {
    await tx.query('set local session_replication_role = replica');
    await tx.query(text, params);
  });
}

/** As if the game had been decided `n` minutes ago by the database's own clock. */
const endedMinutesAgo = (g: Game, n: number) =>
  rewrite(`update games set finalized_at = now() - make_interval(mins => $2) where id = $1`, [
    g.gameId,
    n,
  ]);

/** The number of the game's last saved tap: what the tablet knows of it. */
const sequenceOf = async (g: Game) =>
  (await one<{ seq: number }>(pglite, 'select seq from game_states where game_id = $1', [g.gameId]))
    .seq;

async function reopenAs(
  g: Game,
  accountId: string,
  { requestId = randomUUID(), reason = 'Tapped End game, meant Pause' } = {},
) {
  const result = await reopenTrackedGame(
    g.as(accountId),
    { gameId: g.gameId, requestId, sequence: await sequenceOf(g), reason },
    deps,
  );
  return result.ok ? 'ok' : result.error.code;
}

async function offerTo(g: Game, accountId: string) {
  const result = await readReopenOffer(g.as(accountId), { gameId: g.gameId }, deps);
  if (!result.ok) throw new Error(`offer refused: ${result.error.code}`);
  return result.value;
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
    await endedOnTablet(g);
    const counted = { home: { wins: 1, losses: 0 }, away: { wins: 0, losses: 1 }, played: 10 };
    expect(await standingsOf(g)).toEqual(counted);

    await endedMinutesAgo(g, 29);
    const offer = await offerTo(g, g.scorer);
    expect(offer.endedBy).toBe(g.scorer);
    // About a minute left, by the app server's clock.
    const left = offer.reopen.when === 'until' ? offer.reopen.until - clock.now() : -1;
    expect(left).toBeGreaterThan(55_000);
    expect(left).toBeLessThanOrEqual(60_000);
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
    await endedOnTablet(g);
    await endedMinutesAgo(g, 5);
    const before = { rows: await rowsOf(g), standings: await standingsOf(g) };
    expect(await reopenAs(g, g.otherScorer)).toBe('not-ended-by-you');
    await endedMinutesAgo(g, 31);
    expect(await reopenAs(g, g.scorer)).toBe('reopen-time-over');
    expect((await offerTo(g, g.scorer)).reopen).toEqual({ when: 'no', code: 'reopen-time-over' });
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
    await endedOnTablet(g);
    await endedMinutesAgo(g, 44);
    expect(await reopenAs(g, g.scorer)).toBe('ok');
  });

  it('reopens once when the same request is sent twice', async () => {
    const g = await trackedGame();
    await endedOnTablet(g);
    const requestId = randomUUID();
    expect(await reopenAs(g, g.scorer, { requestId })).toBe('ok');
    const once = { rows: await rowsOf(g), standings: await standingsOf(g) };
    const again = await reopenTrackedGame(
      g.as(g.scorer),
      { gameId: g.gameId, requestId, reason: 'Tapped End game, meant Pause' },
      deps,
    );
    expect(again).toEqual({ ok: true, value: { sequence: 8 } });
    expect({ rows: await rowsOf(g), standings: await standingsOf(g) }).toEqual(once);
    expect(once.rows.corrections).toHaveLength(1);
  });

  it('an end with no account on it is no scorekeeper’s to reopen, but an admin’s', async () => {
    const g = await trackedGame();
    await endedOnTablet(g);
    await rewrite(`update game_events set account_id = null where game_id = $1 and type = 'end'`, [
      g.gameId,
    ]);
    expect(await offerTo(g, g.scorer)).toEqual({
      reopen: { when: 'no', code: 'not-ended-by-you' },
      endedBy: null,
    });
    expect(await reopenAs(g, g.scorer)).toBe('not-ended-by-you');
    expect(await reopenAs(g, g.ownerId)).toBe('ok');
  });
});
