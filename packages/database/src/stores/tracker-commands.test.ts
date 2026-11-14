// Step 2.29 against the real database: the tracker's commands (T6 §1, §3, §11). A batch
// saves its events, the state, the score and the changed box score lines in one
// transaction; a retry is answered duplicate; a takeover refuses the old device; a
// long queue replays to the engine's own result; and the database's rules for events
// hold. Each call is one transaction (commandTransaction). The isolation cases are in
// ../isolation.
//
// PGlite has one connection and runs transactions one after another, so forty games
// sent at once here are taken one by one: that they never wait for each other is
// shown in core (lockingTracker, apply-tracker-commands.test.ts). What this file shows
// of the lock is that it holds one game's row and nothing else (lock-live-game.ts takes
// a row lock, which PostgreSQL keeps per row). The platform's first real-database test
// run (staging) should send batches for many games from several connections at once to
// confirm the timing.
import type { PGlite } from '@electric-sql/pglite';
import { seasonRulesPreset } from '@srleagues/contracts';
import {
  applyTrackerCommands,
  engineRulesOf,
  takeOverScoring,
  type AccessTx,
  type CommandDeps,
  type Job,
  type LeaguesTx,
  type TrackerTx,
} from '@srleagues/core';
import { basketball } from '@srleagues/sports';
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
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { divisionsStore } from './divisions-store.ts';
import { gamesStore } from './games-store.ts';
import { leaguesStore } from './leagues-store.ts';
import { liveGamesStore } from './live-games-store.ts';
import { scoringSessionsStore } from './scoring-sessions-store.ts';

type Tx = TrackerTx & LeaguesTx & AccessTx;

/** The test's clock: 13 December 2026, 18:00 UTC, moved on by hand. */
const startOfTest = Date.UTC(2026, 11, 13, 18, 0, 0);
const clock = { at: startOfTest, now: () => clock.at };

let pglite: PGlite;
let db: DatabaseHandle;
let deps: CommandDeps<Tx>;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  const transaction = commandTransaction(
    db,
    (scope): Tx => ({
      jobs: { enqueue: async (_job: Job) => {} },
      games: gamesStore(scope),
      scoringSessions: scoringSessionsStore(scope),
      liveGames: liveGamesStore(scope),
      clock,
      leagues: leaguesStore(scope, { platformStaff: [] }),
      divisions: divisionsStore(scope),
      access: accessStore(scope),
      activity: activityLogStore(scope),
    }),
  );
  deps = { transaction, events: [], log: () => {}, now: () => 0 };
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

/** Six players on a team, numbered from `first`. */
async function squad(leagueId: string, teamId: string, first: number) {
  const ids: string[] = [];
  for (let n = 0; n < 6; n++) {
    const personId = await newPerson(pglite, leagueId);
    await newRosterEntry(pglite, leagueId, teamId, personId, { jersey: String(first + n) });
    ids.push(personId);
  }
  return ids;
}

/**
 * A league whose season plays the high-school rules, with `games` games between two
 * teams of six players, each held by the first scorekeeper's tablet.
 */
async function leagueWithGames(games = 1) {
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
  const first = await scorekeeper(l.leagueId);
  const second = await scorekeeper(l.leagueId);
  const as = (accountId: string) => ({ leagueId: l.leagueId, accountId, requestId: 'r-1' });
  const gameIds: string[] = [];
  const sessionIds: string[] = [];
  for (let g = 0; g < games; g++) {
    const gameId = await newGame(pglite, {
      leagueId: l.leagueId,
      seasonId,
      stageId,
      homeTeamId,
      awayTeamId,
      columns: { capture_mode: 'live' },
    });
    const session = await pglite.query<{ id: string }>(
      `insert into scoring_sessions (league_id, game_id, account_id, device_id, created_at, held_until)
       values ($1, $2, $3, 'tablet', $4, $5) returning id`,
      [
        l.leagueId,
        gameId,
        first,
        new Date(startOfTest).toISOString(),
        new Date(startOfTest + 120_000).toISOString(),
      ],
    );
    gameIds.push(gameId);
    sessionIds.push(session.rows[0]?.id ?? '');
  }
  return {
    ...l,
    seasonId,
    homeTeamId,
    awayTeamId,
    home,
    away,
    first,
    second,
    as,
    gameIds,
    sessionIds,
  };
}

type Input = Parameters<typeof basketball.apply>[1];

const taps = (inputs: readonly Input[], from = startOfTest) =>
  inputs.map((input, i) => ({ commandId: randomUUID(), at: from + i * 1000, input }));

const batch = (gameId: string, sessionId: string, commands: ReturnType<typeof taps>) => ({
  gameId,
  protocolVersion: 1,
  sessionId,
  commands,
});

async function rowsOf(gameId: string) {
  const q = async <Row>(text: string) => (await pglite.query<Row>(text, [gameId])).rows;
  return {
    game: (
      await q<{
        status: string;
        home_score: number | null;
        away_score: number | null;
        format: unknown;
      }>('select status, home_score, away_score, format from games where id = $1')
    )[0],
    events: await q<{ seq: number; type: string; payload: unknown; command_id: string }>(
      'select seq, type, payload, command_id from game_events where game_id = $1 order by seq',
    ),
    state: (
      await q<{ seq: number; state: basketball.GameState }>(
        'select seq, state from game_states where game_id = $1',
      )
    )[0],
    lines: await q<{
      person_id: string;
      team_id: string;
      jersey_number: string | null;
      played: boolean;
      seconds_played: number | null;
      stats: Record<string, number>;
    }>(
      `select person_id, team_id, jersey_number, played, seconds_played, stats
       from player_game_stats where game_id = $1 order by person_id`,
    ),
  };
}

const statuses = (result: Awaited<ReturnType<typeof applyTrackerCommands>>) =>
  result.ok ? result.value.results.map((r) => r.status) : result.error.code;

describe('the tracker’s commands on the database (T6 §1, §3)', () => {
  it('saves the events, the state, the score and the lines in one go, under the season’s rules', async () => {
    const l = await leagueWithGames();
    const [gameId = '', sessionId = ''] = [l.gameIds[0], l.sessionIds[0]];
    const commands = taps([
      { type: 'lineup', side: 'home', playerIds: l.home.slice(0, 5) },
      { type: 'lineup', side: 'away', playerIds: l.away.slice(0, 5) },
      { type: 'start' },
      { type: 'score', side: 'away', playerId: l.away[2] ?? '', points: 3 },
      { type: 'foul', side: 'home', playerId: l.home[1] ?? '' },
    ]);
    clock.at = startOfTest + 30_000;
    const result = await applyTrackerCommands(
      l.as(l.first),
      batch(gameId, sessionId, commands),
      deps,
    );
    expect(result).toMatchObject({ ok: true, value: { sequence: 5 } });
    const rows = await rowsOf(gameId);
    expect(rows.game).toEqual({
      status: 'live',
      home_score: 0,
      away_score: 3,
      format: seasonRulesPreset('high-school'),
    });
    expect(rows.events.map((e) => [e.seq, e.type, e.command_id])).toEqual(
      commands.map((c, i) => [i + 1, c.input.type, c.commandId]),
    );
    expect(rows.events[3]?.payload).toEqual({ side: 'away', playerId: l.away[2], points: 3 });
    expect(rows.state?.seq).toBe(5);
    expect(rows.state?.state.rules).toEqual(engineRulesOf(seasonRulesPreset('high-school')));
    expect(rows.lines).toHaveLength(10);
    expect(rows.lines.find((line) => line.person_id === l.away[2])).toEqual({
      person_id: l.away[2],
      team_id: l.awayTeamId,
      jersey_number: '22',
      played: true,
      seconds_played: 2,
      stats: { points: 3, fg1: 0, fg2: 0, fg3: 1, fouls: 0, turnovers: 0 },
    });
  });

  it('the same commands twice: duplicates, and nothing written again', async () => {
    const l = await leagueWithGames();
    const [gameId = '', sessionId = ''] = [l.gameIds[0], l.sessionIds[0]];
    const commands = taps([{ type: 'score', side: 'home', playerId: l.home[0] ?? '', points: 2 }]);
    await applyTrackerCommands(l.as(l.first), batch(gameId, sessionId, commands), deps);
    const before = await rowsOf(gameId);
    const again = await applyTrackerCommands(
      l.as(l.first),
      batch(gameId, sessionId, commands),
      deps,
    );
    expect(statuses(again)).toEqual(['duplicate']);
    expect(await rowsOf(gameId)).toEqual(before);
  });

  it('after a takeover the old device is refused, and the new one carries on', async () => {
    const l = await leagueWithGames();
    const [gameId = '', sessionId = ''] = [l.gameIds[0], l.sessionIds[0]];
    const sent = taps([{ type: 'lineup', side: 'home', playerIds: l.home.slice(0, 5) }]);
    await applyTrackerCommands(l.as(l.first), batch(gameId, sessionId, sent), deps);
    clock.at = startOfTest + 30_000;
    const taken = await takeOverScoring(
      l.as(l.second),
      { gameId, deviceId: 'phone', confirmed: true, expectedHolderSince: startOfTest },
      deps,
    );
    const newSession =
      taken.ok && taken.value.status === 'held-by-you' ? taken.value.sessionId : '';
    const queued = taps([{ type: 'start' }], startOfTest + 20_000);
    const late = await applyTrackerCommands(
      l.as(l.first),
      batch(gameId, sessionId, [...sent, ...queued]),
      deps,
    );
    expect(late).toMatchObject({
      value: {
        sequence: 1,
        results: [
          { status: 'duplicate' },
          { status: 'refused', reason: { code: 'session-not-held' } },
        ],
      },
    });
    const carried = await applyTrackerCommands(
      l.as(l.second),
      batch(gameId, newSession, queued),
      deps,
    );
    expect(statuses(carried)).toEqual(['accepted']);
    expect((await rowsOf(gameId)).events).toHaveLength(2);
  });

  it('a refused command is answered with its reason and writes nothing', async () => {
    const l = await leagueWithGames();
    const [gameId = '', sessionId = ''] = [l.gameIds[0], l.sessionIds[0]];
    const result = await applyTrackerCommands(
      l.as(l.first),
      batch(gameId, sessionId, taps([{ type: 'unfoul', side: 'home', playerId: l.home[0] ?? '' }])),
      deps,
    );
    expect(result).toMatchObject({
      value: {
        sequence: 0,
        results: [
          {
            status: 'refused',
            reason: { code: 'rule', message: 'That player has no foul to take back.' },
          },
        ],
      },
    });
    const rows = await rowsOf(gameId);
    expect([rows.events, rows.state, rows.lines]).toEqual([[], undefined, []]);
    expect(rows.game).toMatchObject({ status: 'scheduled', format: null });
  });

  it('undo takes a player’s only line out again', async () => {
    const l = await leagueWithGames();
    const [gameId = '', sessionId = ''] = [l.gameIds[0], l.sessionIds[0]];
    await applyTrackerCommands(
      l.as(l.first),
      batch(
        gameId,
        sessionId,
        taps([{ type: 'turnover', side: 'away', playerId: l.away[5] ?? '' }]),
      ),
      deps,
    );
    expect((await rowsOf(gameId)).lines.map((line) => line.person_id)).toEqual([l.away[5]]);
    await applyTrackerCommands(
      l.as(l.first),
      batch(gameId, sessionId, taps([{ type: 'undo' }])),
      deps,
    );
    expect((await rowsOf(gameId)).lines).toEqual([]);
  });

  it('a long offline queue, in batches, ends where the engine says', async () => {
    const l = await leagueWithGames();
    const [gameId = '', sessionId = ''] = [l.gameIds[0], l.sessionIds[0]];
    const inputs: Input[] = [
      { type: 'lineup', side: 'home', playerIds: l.home.slice(0, 5) },
      { type: 'lineup', side: 'away', playerIds: l.away.slice(0, 5) },
      { type: 'start' },
    ];
    for (let i = 0; inputs.length < 160; i++) {
      const side = i % 2 === 0 ? 'home' : 'away';
      const player = (side === 'home' ? l.home : l.away)[i % 5] ?? '';
      if (i % 9 === 8) inputs.push({ type: 'foul', side, playerId: player }, { type: 'start' });
      else
        inputs.push({ type: 'score', side, playerId: player, points: ((i % 3) + 1) as 1 | 2 | 3 });
    }
    const queue = taps(inputs.slice(0, 160), startOfTest + 5_000);
    clock.at = startOfTest + 3_600_000;
    for (let i = 0; i < queue.length; i += 50) {
      const result = await applyTrackerCommands(
        l.as(l.first),
        batch(gameId, sessionId, queue.slice(i, i + 50)),
        deps,
      );
      expect(result.ok && result.value.results.every((r) => r.status === 'accepted')).toBe(true);
    }
    let expected = basketball.newGame(engineRulesOf(seasonRulesPreset('high-school')), 0);
    for (const c of queue)
      expected = basketball.apply(expected, c.input, { id: c.commandId, now: c.at });
    const rows = await rowsOf(gameId);
    expect(rows.state).toEqual({ seq: 160, state: expected });
    const teams = basketball.derive(expected).teams;
    expect(rows.game).toMatchObject({ home_score: teams.home.score, away_score: teams.away.score });
    const players = basketball.derive(expected).players;
    for (const line of rows.lines) {
      expect(line.stats.points).toBe(players[line.person_id]?.points);
      expect(line.seconds_played).toBe(Math.floor((players[line.person_id]?.ms ?? 0) / 1000));
    }
  });

  it('forty games sent at once are each saved whole', async () => {
    const l = await leagueWithGames(40);
    const results = await Promise.all(
      l.gameIds.map((gameId, g) =>
        applyTrackerCommands(
          l.as(l.first),
          batch(
            gameId,
            l.sessionIds[g] ?? '',
            taps([
              { type: 'start' },
              { type: 'score', side: 'home', playerId: l.home[g % 6] ?? '', points: 2 },
            ]),
          ),
          deps,
        ),
      ),
    );
    expect(results.every((r) => statuses(r).toString() === 'accepted,accepted')).toBe(true);
    const counts = await pglite.query<{ games: number; events: number }>(
      `select count(distinct game_id)::int as games, count(*)::int as events
       from game_events where league_id = $1`,
      [l.leagueId],
    );
    expect(counts.rows[0]).toEqual({ games: 40, events: 80 });
  });
});
