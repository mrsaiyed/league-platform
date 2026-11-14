// Step 2.30 against the real database: ending a tracked game, through the tracker's
// own End game tap or games.end_tracked_game, settles its lines, makes it final and
// works out the standings and season totals in the same transaction (T6 §7); a failure
// anywhere saves none of it; reopening with a reason hands the game back to the
// tracker, and ending it again gives one correct result (T6 §8). Each call is one
// transaction (commandTransaction), with the apps' event handlers. Isolation cases are
// in ../isolation.
import type { PGlite } from '@electric-sql/pglite';
import { seasonRulesPreset } from '@srleagues/contracts';
import {
  applyTrackerCommands,
  endTrackedGame,
  eventHandlers,
  reopenGame,
  type CommandDeps,
  type Job,
  type StandingsStore,
  type StandingsTx,
  type TrackerTx,
} from '@srleagues/core';
import type { basketball } from '@srleagues/sports';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import type { LeagueScope } from '../db/transaction-scope.ts';
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
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

/** The apps' deps: the tracker's stores, the standings and the standings handlers. */
function depsWith(standings: (scope: LeagueScope) => StandingsStore = standingsStore) {
  const deps: CommandDeps<Tx> = {
    transaction: commandTransaction(db, (scope) => ({
      jobs: { enqueue: async (_job: Job) => {} },
      games: gamesStore(scope),
      scoringSessions: scoringSessionsStore(scope),
      liveGames: liveGamesStore(scope),
      clock,
      standings: standings(scope),
      access: accessStore(scope),
      activity: activityLogStore(scope),
    })),
    events: eventHandlers,
    log: () => {},
    now: () => 0,
  };
  return deps;
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
 * A season under the high-school rules with one live-tracked game between two teams
 * of six, held by a scorekeeper's tablet, and a seventh home player who has left.
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
  const leftId = await newPerson(pglite, l.leagueId);
  const leftEntry = await newRosterEntry(pglite, l.leagueId, homeTeamId, leftId, { jersey: '99' });
  await pglite.query(`update roster_entries set left_on = '2026-12-01' where id = $1`, [leftEntry]);
  const scorer = await newAccount(pglite);
  await pglite.query(
    `insert into role_grants (league_id, account_id, role, scope_type) values ($1, $2, 'scorekeeper', 'league')`,
    [l.leagueId, scorer],
  );
  const gameId = await newGame(pglite, {
    leagueId: l.leagueId,
    seasonId,
    stageId,
    homeTeamId,
    awayTeamId,
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
  const as = (accountId: string) => ({ leagueId: l.leagueId, accountId, requestId: 'r-1' });
  return {
    ...l,
    seasonId,
    homeTeamId,
    awayTeamId,
    home,
    away,
    leftId,
    scorer,
    gameId,
    sessionId: session.id,
    as,
  };
}

type Game = Awaited<ReturnType<typeof trackedGame>>;
type Input = Parameters<typeof basketball.apply>[1];

/** The tablet's lease runs out, so another account may end the game. */
const lapse = () => void (clock.at += 120_000);

/** Sends taps through the tracker's door; their statuses. */
async function tap(g: Game, inputs: readonly Input[], deps = depsWith()) {
  const commands = inputs.map((input) => {
    clock.at += 1000;
    return { commandId: randomUUID(), at: clock.at, input };
  });
  const result = await applyTrackerCommands(
    g.as(g.scorer),
    { gameId: g.gameId, protocolVersion: 1, sessionId: g.sessionId, commands },
    deps,
  );
  return result.ok ? result.value.results.map((r) => r.status) : [result.error.code];
}

/** Home 5, away 2; the away basket by the away team's first player. */
const firstHalf = (g: Game): Input[] => [
  { type: 'lineup', side: 'home', playerIds: g.home.slice(0, 5) },
  { type: 'lineup', side: 'away', playerIds: g.away.slice(0, 5) },
  { type: 'start' },
  { type: 'score', side: 'home', playerId: g.home[0] ?? '', points: 3 },
  { type: 'score', side: 'home', playerId: g.home[1] ?? '', points: 2 },
  { type: 'score', side: 'away', playerId: g.away[0] ?? '', points: 2 },
];

async function rowsOf(g: Game) {
  const q = async <Row>(text: string) => (await pglite.query<Row>(text, [g.gameId])).rows;
  return {
    game: (
      await q<{
        status: string;
        home_score: number | null;
        away_score: number | null;
        winner_team_id: string | null;
        finalized_at: Date | null;
        version: number;
      }>(
        `select status, home_score, away_score, winner_team_id, finalized_at, version
         from games where id = $1`,
      )
    )[0],
    events: await q<{ seq: number; type: string }>(
      'select seq, type from game_events where game_id = $1 order by seq',
    ),
    state: (
      await q<{ seq: number; status: string }>(
        `select seq, state->>'status' as status from game_states where game_id = $1`,
      )
    )[0],
    lines: await q<{
      person_id: string;
      played: boolean;
      seconds_played: number | null;
      stats: Record<string, number>;
    }>(
      `select person_id, played, seconds_played, stats from player_game_stats
       where game_id = $1 order by person_id`,
    ),
    corrections: await q<{ reason: string; before: unknown; after: unknown }>(
      'select reason, before, after from game_corrections where game_id = $1 order by at',
    ),
  };
}

async function standingsOf(g: Game) {
  const rows = await pglite.query<{ team_id: string; wins: number; losses: number }>(
    `select team_id, wins, losses from standings_rows where season_id = $1 order by team_id`,
    [g.seasonId],
  );
  const totals = await pglite.query<{ person_id: string; games_played: number; stats: unknown }>(
    `select person_id, games_played, stats from season_player_totals
     where season_id = $1 order by person_id`,
    [g.seasonId],
  );
  return { rows: rows.rows, totals: totals.rows };
}

const versionOf = async (g: Game) =>
  (await one<{ version: number }>(pglite, 'select version from games where id = $1', [g.gameId]))
    .version;

const actions = async (g: Game) =>
  (
    await pglite.query<{ action: string }>(
      'select action from activity_log where league_id = $1 order by at, id',
      [g.leagueId],
    )
  ).rows.map((r) => r.action);

describe('ending a tracked game on the database (T6 §7)', () => {
  it('the End game tap ends it in its batch: final, winner, lines settled, standings and totals', async () => {
    const g = await trackedGame();
    expect(await tap(g, [...firstHalf(g), { type: 'end' }])).toEqual(
      Array.from({ length: 7 }, () => 'accepted'),
    );
    const rows = await rowsOf(g);
    expect(rows.game).toMatchObject({
      status: 'final',
      home_score: 5,
      away_score: 2,
      winner_team_id: g.homeTeamId,
    });
    expect(rows.game?.finalized_at).not.toBeNull();
    expect(rows.events.at(-1)).toEqual({ seq: 7, type: 'end' });
    expect(rows.state).toEqual({ seq: 7, status: 'final' });
    // Ten who played, the two on the benches as did-not-play, not the one who left.
    expect(rows.lines).toHaveLength(12);
    expect(
      rows.lines
        .filter((l) => !l.played)
        .map((l) => l.person_id)
        .sort(),
    ).toEqual([g.home[5], g.away[5]].sort());
    expect(rows.lines.some((l) => l.person_id === g.leftId)).toBe(false);
    expect(rows.lines.find((l) => l.person_id === g.home[5])).toMatchObject({
      seconds_played: 0,
      stats: {},
    });
    const { rows: table, totals } = await standingsOf(g);
    expect(table).toEqual(
      expect.arrayContaining([
        { team_id: g.homeTeamId, wins: 1, losses: 0 },
        { team_id: g.awayTeamId, wins: 0, losses: 1 },
      ]),
    );
    // Only the ten who played have a game in their season totals (P7 §5.6).
    expect(totals).toHaveLength(10);
    expect(totals.find((t) => t.person_id === g.home[0])).toMatchObject({ games_played: 1 });
    expect(await actions(g)).toEqual(['games.end_tracked_game']);
  });

  it("did-not-play lines follow the roster on the game's day, not today's (step 2.58)", async () => {
    const g = await trackedGame();
    // The game was played on 13 December (Chicago). The player who left on 1 December
    // is still off it; one who left after the game and one who joined before it with
    // no leaving date are on it; one who joined after the game and one who left on the
    // game's own day are not; a missing joining date is open.
    const entry = async (dates: { joined?: string; left?: string }) => {
      const personId = await newPerson(pglite, g.leagueId);
      const id = await newRosterEntry(pglite, g.leagueId, g.homeTeamId, personId);
      await pglite.query('update roster_entries set joined_on = $2, left_on = $3 where id = $1', [
        id,
        dates.joined ?? null,
        dates.left ?? null,
      ]);
      return personId;
    };
    const leftAfter = await entry({ joined: '2026-09-01', left: '2026-12-20' });
    const joinedBefore = await entry({ joined: '2026-12-13' });
    const joinedAfter = await entry({ joined: '2026-12-14' });
    const leftThatDay = await entry({ left: '2026-12-13' });
    expect(await tap(g, [...firstHalf(g), { type: 'end' }])).toContain('accepted');
    const benched = (await rowsOf(g)).lines.filter((l) => !l.played).map((l) => l.person_id);
    expect(benched.sort()).toEqual([g.home[5], g.away[5], leftAfter, joinedBefore].sort());
    expect(benched).not.toContain(joinedAfter);
    expect(benched).not.toContain(leftThatDay);
    expect(benched).not.toContain(g.leftId);
  });

  it('games.end_tracked_game gives the same result, and refuses a tie the season does not allow', async () => {
    const g = await trackedGame();
    await tap(g, [
      ...firstHalf(g),
      { type: 'score', side: 'away', playerId: g.away[1] ?? '', points: 3 },
    ]);
    // While the scorekeeper's tablet holds the game, the owner may not end it.
    expect(
      await endTrackedGame(
        g.as(g.ownerId),
        { gameId: g.gameId, version: await versionOf(g) },
        depsWith(),
      ),
    ).toMatchObject({ error: { code: 'session-held' } });
    lapse();
    expect(
      await endTrackedGame(
        g.as(g.ownerId),
        { gameId: g.gameId, version: await versionOf(g) },
        depsWith(),
      ),
    ).toMatchObject({ error: { code: 'tie-not-allowed' } });
    expect((await rowsOf(g)).game?.status).toBe('live');
    await tap(g, [{ type: 'score', side: 'home', playerId: g.home[2] ?? '', points: 1 }]);
    const ended = await endTrackedGame(
      g.as(g.ownerId),
      { gameId: g.gameId, version: await versionOf(g) },
      depsWith(),
    );
    expect(ended).toMatchObject({ ok: true });
    const rows = await rowsOf(g);
    expect(rows.game).toMatchObject({ status: 'final', home_score: 6, away_score: 5 });
    expect(rows.events.at(-1)?.type).toBe('end');
    expect(rows.lines).toHaveLength(12);
    expect((await standingsOf(g)).rows).toEqual(
      expect.arrayContaining([{ team_id: g.homeTeamId, wins: 1, losses: 0 }]),
    );
  });

  it('is all or nothing: when the totals cannot be saved, nothing of the end is', async () => {
    const g = await trackedGame();
    await tap(g, firstHalf(g));
    lapse();
    const before = await rowsOf(g);
    const failing = (scope: LeagueScope): StandingsStore => ({
      ...standingsStore(scope),
      replaceTotals: async () => {
        throw new Error('totals could not be saved');
      },
    });
    await expect(
      endTrackedGame(
        g.as(g.ownerId),
        { gameId: g.gameId, version: await versionOf(g) },
        depsWith(failing),
      ),
    ).rejects.toThrow('totals could not be saved');
    await expect(tap(g, [{ type: 'end' }], depsWith(failing))).rejects.toThrow(
      'totals could not be saved',
    );
    expect(await rowsOf(g)).toEqual(before);
    expect(await standingsOf(g)).toEqual({ rows: [], totals: [] });
    expect(await actions(g)).toEqual([]);
  });
});

describe('reopening a tracked game on the database (T6 §8)', () => {
  it('end, reopen with a reason, fix with the tracker, end again: one correct result', async () => {
    const g = await trackedGame();
    await tap(g, [...firstHalf(g), { type: 'end' }]);

    const reopened = await reopenGame(
      g.as(g.ownerId),
      { gameId: g.gameId, version: await versionOf(g), reason: 'The away basket was not his' },
      depsWith(),
    );
    expect(reopened).toMatchObject({ ok: true });
    let rows = await rowsOf(g);
    expect(rows.game).toMatchObject({
      status: 'live',
      home_score: 5,
      away_score: 2,
      winner_team_id: null,
      finalized_at: null,
    });
    expect(rows.events.slice(-2)).toEqual([
      { seq: 7, type: 'end' },
      { seq: 8, type: 'reopen' },
    ]);
    expect(rows.state).toEqual({ seq: 8, status: 'live' });
    expect(rows.corrections).toEqual([
      {
        reason: 'The away basket was not his',
        before: { version: 1, status: 'final', homeScore: 5, awayScore: 2 },
        after: { version: 1, status: 'live', homeScore: 5, awayScore: 2 },
      },
    ]);
    expect(rows.lines.every((l) => l.played)).toBe(true);
    // While it is open again it counts for nothing (S-11).
    const open = await standingsOf(g);
    expect(open.totals).toEqual([]);
    expect(open.rows.every((r) => r.wins === 0 && r.losses === 0)).toBe(true);

    // Fixed with the tracker's own tools, then ended again.
    expect(
      await tap(g, [
        { type: 'undo' },
        { type: 'score', side: 'away', playerId: g.away[1] ?? '', points: 2 },
        { type: 'end' },
      ]),
    ).toEqual(['accepted', 'accepted', 'accepted']);
    rows = await rowsOf(g);
    expect(rows.game).toMatchObject({
      status: 'final',
      home_score: 5,
      away_score: 2,
      winner_team_id: g.homeTeamId,
    });
    expect(rows.events.map((e) => e.type).filter((type) => type === 'end')).toHaveLength(2);
    expect(rows.lines).toHaveLength(12);
    const points = (personId: string | undefined) =>
      rows.lines.find((l) => l.person_id === personId)?.stats.points;
    expect([points(g.away[0]), points(g.away[1])]).toEqual([0, 2]);

    // The same as a game tracked right the first time.
    const right = await trackedGame();
    await tap(right, [
      ...firstHalf(right).slice(0, 5),
      { type: 'score', side: 'away', playerId: right.away[1] ?? '', points: 2 },
      { type: 'end' },
    ]);
    const shape = async (x: Game) => {
      const { rows: table, totals } = await standingsOf(x);
      const rename = new Map<string, string>([
        [x.homeTeamId, 'home'],
        [x.awayTeamId, 'away'],
        ...x.home.map((id, i): [string, string] => [id, `home-${i}`]),
        ...x.away.map((id, i): [string, string] => [id, `away-${i}`]),
      ]);
      return {
        table: table.map((r) => ({ ...r, team_id: rename.get(r.team_id) })),
        totals: totals
          .map((t) => ({
            person: rename.get(t.person_id),
            gamesPlayed: t.games_played,
            points: (t.stats as { stats?: { points?: { total?: number } } }).stats?.points?.total,
          }))
          .sort((a, b) => String(a.person).localeCompare(String(b.person))),
      };
    };
    expect(await shape(g)).toEqual(await shape(right));
    expect(await actions(g)).toEqual([
      'games.end_tracked_game',
      'games.reopen_game',
      'games.end_tracked_game',
    ]);
  });
});
