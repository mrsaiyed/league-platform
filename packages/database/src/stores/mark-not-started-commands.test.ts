// Step 2.121 against the real database: marking a live-tracked game not started (S-40,
// record 061). The game goes back to scheduled with no score, no lines and no rules of
// its own (migration 0016 empties `format_fixed_at` with them), the event log keeps
// every cleared tap behind a `reset` marker, the session ends so the tablet's waiting
// taps are refused, the activity log keeps who and why, and the standings never move.
// Each call is one transaction (commandTransaction), with the apps' event handlers.
// Isolation cases are in ../isolation (not-started-cases.test-helper.ts).
import type { PGlite } from '@electric-sql/pglite';
import { seasonRulesPreset } from '@srleagues/contracts';
import {
  applyTrackerCommands,
  eventHandlers,
  markNotStarted,
  openScoringSession,
  recordFinalScore,
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

type Tx = TrackerTx & StandingsTx;

/** The test's clock: 13 December 2026, 18:00 UTC, moved on by hand. */
const startOfTest = Date.UTC(2026, 11, 13, 18, 0, 0);
const clock = { at: startOfTest, now: () => clock.at };

let pglite: PGlite;
let db: DatabaseHandle;
let deps: CommandDeps<Tx>;
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

/** Five players on a team, numbered from `first`. */
async function squad(leagueId: string, teamId: string, first: number) {
  const ids: string[] = [];
  for (let n = 0; n < 5; n++) {
    const personId = await newPerson(pglite, leagueId);
    await newRosterEntry(pglite, leagueId, teamId, personId, { jersey: String(first + n) });
    ids.push(personId);
  }
  return ids;
}

/**
 * A season under the high-school rules (quarters) with a game already decided, so it
 * has standings, and a live-tracked game between two teams of five, held by a
 * scorekeeper's tablet.
 */
async function trackedGame() {
  clock.at = startOfTest;
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
  const home = await squad(l.leagueId, homeTeamId, 10);
  const away = await squad(l.leagueId, awayTeamId, 20);
  const scorer = await newAccount(pglite);
  await pglite.query(
    `insert into role_grants (league_id, account_id, role, scope_type) values ($1, $2, 'scorekeeper', 'league')`,
    [l.leagueId, scorer],
  );
  const as = (accountId: string) => ({ leagueId: l.leagueId, accountId, requestId: 'r-1' });
  const teams = { leagueId: l.leagueId, seasonId, stageId, homeTeamId, awayTeamId };
  const decidedId = await newGame(pglite, { ...teams, columns: {} });
  const decided = await recordFinalScore(
    as(l.ownerId),
    { gameId: decidedId, version: 1, homeScore: 50, awayScore: 40 },
    deps,
  );
  if (!decided.ok) throw new Error('the earlier game was not decided');
  const gameId = await newGame(pglite, {
    ...teams,
    columns: { capture_mode: 'live', starts_at: '2026-12-13T18:00:00Z' },
  });
  const session = await one<{ id: string }>(
    pglite,
    `insert into scoring_sessions (league_id, game_id, account_id, device_id, created_at, held_until)
     values ($1, $2, $3, 'tablet', $4, $5) returning id`,
    [
      l.leagueId,
      gameId,
      scorer,
      new Date(startOfTest).toISOString(),
      new Date(startOfTest + 120_000).toISOString(),
    ],
  );
  return { ...l, seasonId, home, away, scorer, gameId, sessionId: session.id, as };
}

type Game = Awaited<ReturnType<typeof trackedGame>>;
type Input = Parameters<typeof basketball.apply>[1];

/** Sends taps through the tracker's door with the session given; their answers. */
async function tap(g: Game, inputs: readonly Input[], sessionId = g.sessionId) {
  const commands = inputs.map((input) => {
    clock.at += 1000;
    return { commandId: randomUUID(), at: clock.at, input };
  });
  const result = await applyTrackerCommands(
    g.as(g.scorer),
    { gameId: g.gameId, protocolVersion: 1, sessionId, commands },
    deps,
  );
  if (!result.ok) throw new Error(`batch refused: ${result.error.code}`);
  return result.value.results;
}

const tipOff = (g: Game): Input[] => [
  { type: 'lineup', side: 'home', playerIds: g.home },
  { type: 'lineup', side: 'away', playerIds: g.away },
  { type: 'start' },
];

async function rowsOf(g: Game) {
  const q = async <Row>(text: string) => (await pglite.query<Row>(text, [g.gameId])).rows;
  return {
    game: (
      await q<{
        status: string;
        home_score: number | null;
        away_score: number | null;
        format: unknown;
        format_fixed_at: Date | null;
      }>('select status, home_score, away_score, format, format_fixed_at from games where id = $1')
    )[0],
    events: await q<{ seq: number; type: string; payload: unknown }>(
      'select seq, type, payload from game_events where game_id = $1 order by seq',
    ),
    state: (
      await q<{ seq: number; state: basketball.GameState }>(
        'select seq, state from game_states where game_id = $1',
      )
    )[0],
    lines: await q<{ person_id: string }>(
      'select person_id from player_game_stats where game_id = $1',
    ),
    sessions: await q<{ id: string }>('select id from scoring_sessions where game_id = $1'),
  };
}

async function standingsOf(g: Game) {
  const rows = await pglite.query(
    `select team_id, wins, losses, version from standings_rows where season_id = $1 order by team_id`,
    [g.seasonId],
  );
  const totals = await pglite.query(
    `select person_id, games_played, stats from season_player_totals
     where season_id = $1 order by person_id`,
    [g.seasonId],
  );
  return { rows: rows.rows, totals: totals.rows };
}

const activityOf = async (g: Game) =>
  (
    await pglite.query<{ action: string; actor_account_id: string; details: unknown }>(
      `select action, actor_account_id, details from activity_log
       where league_id = $1 and action = 'games.mark_not_started'`,
      [g.leagueId],
    )
  ).rows;

const mark = async (g: Game, accountId: string, reason?: string) => {
  const sequence = (await rowsOf(g)).state?.seq ?? 0;
  return markNotStarted(
    g.as(accountId),
    { gameId: g.gameId, sequence, ...(reason === undefined ? {} : { reason }) },
    deps,
  );
};

describe('marking a game not started on the database (S-40)', () => {
  it('clears a game with only clock taps, keeps its log and leaves the standings alone', async () => {
    const g = await trackedGame();
    const standings = await standingsOf(g);
    expect(standings.rows).toHaveLength(2);
    await tap(g, tipOff(g));
    await tap(g, [
      { type: 'score', side: 'home', playerId: g.home[0] ?? '', points: 3 },
      { type: 'undo' },
      { type: 'pause' },
    ]);
    const before = await rowsOf(g);
    expect(before.game).toMatchObject({ status: 'live', home_score: 0, away_score: 0 });
    expect(before.game?.format_fixed_at).not.toBeNull();
    expect(before.lines.length).toBeGreaterThan(0);

    const result = await mark(g, g.scorer);
    expect(result).toMatchObject({ ok: true, value: { sequence: 7 } });
    const after = await rowsOf(g);
    expect(after.game).toEqual({
      status: 'scheduled',
      home_score: null,
      away_score: null,
      format: null,
      format_fixed_at: null,
    });
    expect(after.events.slice(0, 6)).toEqual(before.events);
    expect(after.events[6]).toEqual({ seq: 7, type: 'reset', payload: { clearedThrough: 6 } });
    expect(after.state?.seq).toBe(7);
    expect(after.state?.state).toMatchObject({ status: 'scheduled', plays: [], redo: [] });
    expect(after.lines).toEqual([]);
    expect(after.sessions).toEqual([]);
    expect(await activityOf(g)).toEqual([
      {
        action: 'games.mark_not_started',
        actor_account_id: g.scorer,
        details: { clearedThrough: 6 },
      },
    ]);
    expect(await standingsOf(g)).toEqual(standings);

    // The tablet's taps sent afterwards meet the server's own refusal.
    const late = await tap(g, [{ type: 'start' }]);
    expect(late).toMatchObject([{ status: 'refused', reason: { code: 'session-not-held' } }]);
    expect((await rowsOf(g)).state?.seq).toBe(7);
  });

  it('starts again under the season’s rules as they stand now', async () => {
    const g = await trackedGame();
    await tap(g, tipOff(g));
    expect(
      ((await rowsOf(g)).game?.format as { gameFormat: { periods: number } }).gameFormat,
    ).toMatchObject({ periods: 4 });
    await pglite.query('update seasons set rules = $2 where id = $1', [
      g.seasonId,
      JSON.stringify(seasonRulesPreset('rec-league')),
    ]);
    expect(await mark(g, g.scorer)).toMatchObject({ ok: true });
    expect((await rowsOf(g)).state?.state.rules.periods).toBe(2);

    const opened = await openScoringSession(
      g.as(g.scorer),
      { gameId: g.gameId, deviceId: 'tablet' },
      deps,
    );
    if (!opened.ok || opened.value.status !== 'held-by-you') throw new Error('not opened');
    const taken = await tap(
      g,
      [...tipOff(g), { type: 'score', side: 'away', playerId: g.away[0] ?? '', points: 2 }],
      opened.value.sessionId,
    );
    expect(taken.map((r) => r.status)).toEqual(['accepted', 'accepted', 'accepted', 'accepted']);
    const again = await rowsOf(g);
    expect(again.game).toMatchObject({ status: 'live', home_score: 0, away_score: 2 });
    expect((again.game?.format as { gameFormat: { periods: number } }).gameFormat.periods).toBe(2);
    expect(again.game?.format_fixed_at).not.toBeNull();
    expect(again.events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('once a basket stands, refuses the scorekeeper and takes an admin with a reason', async () => {
    const g = await trackedGame();
    const standings = await standingsOf(g);
    await tap(g, [
      ...tipOff(g),
      { type: 'score', side: 'home', playerId: g.home[1] ?? '', points: 2 },
    ]);
    const before = await rowsOf(g);
    expect(await mark(g, g.scorer, 'Wrong game')).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    expect(await rowsOf(g)).toEqual(before);

    clock.at += 120_000;
    expect(await mark(g, g.ownerId)).toEqual({ ok: false, error: { code: 'reason-needed' } });
    expect(await mark(g, g.ownerId, 'Started the wrong game')).toMatchObject({ ok: true });
    const after = await rowsOf(g);
    expect(after.game).toMatchObject({ status: 'scheduled', home_score: null, format: null });
    expect(after.events.map((e) => e.type)).toEqual([
      'lineup',
      'lineup',
      'start',
      'score',
      'reset',
    ]);
    expect(after.lines).toEqual([]);
    expect(await activityOf(g)).toEqual([
      {
        action: 'games.mark_not_started',
        actor_account_id: g.ownerId,
        details: { clearedThrough: 4, reason: 'Started the wrong game' },
      },
    ]);
    expect(await standingsOf(g)).toEqual(standings);
  });
});
