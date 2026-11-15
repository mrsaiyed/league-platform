// Step 2.117 against the real database: the players the scorer's table adds, changes
// and takes off (record 058, T-261), in the tracker's own batch. A visiting team with
// no roster is entered by number only and scored; the same batch sent twice adds no
// one twice; a number already worn is refused naming who wears it while the rest of the
// batch is saved; the added players carry the game and the "to review" mark (0010);
// and on the public pages a number-only player is "#12", never an empty name. The
// isolation cases are in ../isolation, the roles in role-matrix.test.ts.
import type { PGlite } from '@electric-sql/pglite';
import { seasonRulesPreset, type BatchCommand, type CommandResult } from '@srleagues/contracts';
import {
  applyTrackerCommands,
  defaultNamePolicy,
  publicViewer,
  readGamePage,
  readGameSnapshot,
  type AccessTx,
  type CommandDeps,
  type Job,
  type LeaguesTx,
  type TrackerTx,
} from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { gameHasPlays, listPublicRoster } from '../queries/index.ts';
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
import { gamesReadStore } from './games-read-store.ts';
import { gamesStore } from './games-store.ts';
import { leaguesStore } from './leagues-store.ts';
import { liveGamesStore } from './live-games-store.ts';
import { scoringSessionsStore } from './scoring-sessions-store.ts';

type Tx = TrackerTx & LeaguesTx & AccessTx;

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

/**
 * A published season playing the high-school rules (unique numbers if asked), a home
 * team of five named players numbered 10 to 14, a visiting team with no roster, and
 * one game recorded live, held by the scorekeeper's tablet.
 */
async function leagueWithGame({ uniqueJerseys = false } = {}) {
  clock.at = startOfTest;
  const l = await newLeague(pglite);
  const programId = await newProgram(pglite, l.leagueId);
  const seasonId = await newSeason(pglite, l.leagueId, programId);
  const rules = seasonRulesPreset('high-school');
  await pglite.query(`update seasons set rules = $2, status = 'active' where id = $1`, [
    seasonId,
    JSON.stringify({ ...rules, rosters: { ...rules.rosters, uniqueJerseys } }),
  ]);
  const stageId = await newStage(pglite, l.leagueId, seasonId);
  const homeTeamId = await newTeam(pglite, l.leagueId, seasonId);
  const awayTeamId = await newTeam(pglite, l.leagueId, seasonId);
  const home: string[] = [];
  for (let n = 0; n < 5; n++) {
    const personId = await newPerson(pglite, l.leagueId, {
      firstName: 'Jordan',
      lastName: `Ellis${n}`,
    });
    await newRosterEntry(pglite, l.leagueId, homeTeamId, personId, { jersey: String(10 + n) });
    home.push(personId);
  }
  const scorekeeperId = await newAccount(pglite);
  await pglite.query(
    `insert into role_grants (league_id, account_id, role, scope_type) values ($1, $2, 'scorekeeper', 'league')`,
    [l.leagueId, scorekeeperId],
  );
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
      scorekeeperId,
      new Date(startOfTest).toISOString(),
      new Date(startOfTest + 120_000).toISOString(),
    ],
  );
  const sessionId = session.rows[0]?.id ?? '';
  const send = (commands: readonly BatchCommand[]) =>
    applyTrackerCommands(
      { leagueId: l.leagueId, accountId: scorekeeperId, requestId: 'r-1' },
      { gameId, protocolVersion: 2, sessionId, commands },
      deps,
    );
  return { ...l, seasonId, homeTeamId, awayTeamId, home, gameId, send };
}

type Input = BatchCommand['input'];
const commandsOf = (inputs: readonly Input[]): BatchCommand[] =>
  inputs.map(
    (input, i) => ({ commandId: randomUUID(), at: startOfTest + i * 1000, input }) as BatchCommand,
  );

const resultsOf = (result: Awaited<ReturnType<ReturnType<typeof leagueWithGame>['send']>>) => {
  if (!result.ok) throw new Error(result.error.code);
  return result.value.results;
};
const statusesOf = (results: readonly CommandResult[]) => results.map((r) => r.status);

/** The numbers a school arrives with, and the ids the device makes for them. */
const numbers = ['3', '5', '10', '12', '14', '21', '23', '30'];
const addAll = (ids: readonly string[]): Input[] =>
  numbers.map((jersey, i) => ({
    type: 'add-player',
    side: 'away',
    playerId: ids[i] ?? '',
    jersey,
    name: '',
  }));

async function visitorsOf(teamId: string) {
  return (
    await pglite.query<{
      person_id: string;
      jersey_number: string | null;
      added_at_game_id: string | null;
      needs_review: boolean;
      first_name: string;
      last_name: string;
    }>(
      `select r.person_id, r.jersey_number, r.added_at_game_id, r.needs_review, p.first_name, p.last_name
       from roster_entries r join people p on p.id = r.person_id
       where r.team_id = $1 order by r.sort`,
      [teamId],
    )
  ).rows;
}

describe('players at the scorer’s table on the database (record 058)', () => {
  it('adds eight number-only visitors, scores #12, and a visitor sees "#12" with no name', async () => {
    const l = await leagueWithGame();
    const ids = numbers.map(() => randomUUID());
    const twelve = ids[3] ?? '';
    const commands = commandsOf([
      ...addAll(ids),
      { type: 'lineup', side: 'home', playerIds: l.home },
      { type: 'lineup', side: 'away', playerIds: ids.slice(0, 5) },
      { type: 'start' },
      { type: 'score', side: 'away', playerId: twelve, points: 2 },
    ]);
    clock.at = startOfTest + 30_000;
    expect(statusesOf(resultsOf(await l.send(commands)))).toEqual(commands.map(() => 'accepted'));

    // Each a person with no name, marked as added at this game and to review (S-6, 0010).
    expect(await visitorsOf(l.awayTeamId)).toEqual(
      numbers.map((jersey, i) => ({
        person_id: ids[i],
        jersey_number: jersey,
        added_at_game_id: l.gameId,
        needs_review: true,
        first_name: '',
        last_name: '',
      })),
    );
    const line = await pglite.query<{ jersey_number: string; stats: Record<string, number> }>(
      'select jersey_number, stats from player_game_stats where game_id = $1 and person_id = $2',
      [l.gameId, twelve],
    );
    expect(line.rows[0]).toMatchObject({ jersey_number: '12', stats: { points: 2 } });
    const game = await pglite.query<{ away_score: number; status: string }>(
      'select away_score, status from games where id = $1',
      [l.gameId],
    );
    expect(game.rows[0]).toEqual({ away_score: 2, status: 'live' });
    // The events keep no name: none was typed, and none would be.
    const events = await pglite.query<{ type: string; payload: unknown }>(
      'select type, payload from game_events where game_id = $1 order by seq',
      [l.gameId],
    );
    expect(events.rows[3]).toEqual({
      type: 'add-player',
      payload: { side: 'away', playerId: twelve, jersey: '12', named: false },
    });

    // What a visitor sees: the game page, its snapshot and the team's roster.
    const viewing = {
      leagueId: l.leagueId,
      viewer: publicViewer(l.leagueId),
      audience: 'adult' as const,
      policy: defaultNamePolicy,
    };
    const seen = await withTransaction(db, { leagueId: l.leagueId }, async (scope) => ({
      page: await readGamePage(gamesReadStore(scope), { gameId: l.gameId }, viewing),
      snapshot: await readGameSnapshot(gamesReadStore(scope), { gameId: l.gameId }, viewing, 1),
      roster: await listPublicRoster(scope, l.awayTeamId, {
        policy: defaultNamePolicy,
        viewer: viewing.viewer,
      }),
    }));
    if (!seen.page.ok || !seen.snapshot.ok) throw new Error('not read');
    const box = seen.page.value.boxScores.find((b) => b.side === 'away');
    expect(box?.players.find((p) => p.personId === twelve)).toMatchObject({
      name: null,
      jersey: '12',
      unnamed: true,
    });
    const scored = seen.page.value.plays.find((p) => p.player?.personId === twelve);
    expect(scored?.player).toEqual({ personId: twelve, name: null, jersey: '12', unnamed: true });
    expect(seen.snapshot.value.players.find((p) => p.playerId === twelve)).toMatchObject({
      name: null,
      jersey: '12',
      unnamed: true,
    });
    // A named home player is not marked.
    const named = seen.snapshot.value.players.find((p) => p.playerId === l.home[0]);
    expect(named?.name).toBe('Jordan Ellis0');
    expect(named).not.toHaveProperty('unnamed');
    const twelveLine = seen.roster.lines.find((r) => r.jerseyNumber === '12');
    expect(twelveLine?.name).toEqual({ shown: false, why: 'no_name' });
    expect(JSON.stringify(seen)).not.toContain('undefined');
  });

  it('adds each player once when the same batch is sent twice', async () => {
    const l = await leagueWithGame();
    const ids = numbers.map(() => randomUUID());
    const commands = commandsOf(addAll(ids));
    expect(statusesOf(resultsOf(await l.send(commands)))).toEqual(commands.map(() => 'accepted'));
    expect(statusesOf(resultsOf(await l.send(commands)))).toEqual(commands.map(() => 'duplicate'));
    expect(await visitorsOf(l.awayTeamId)).toHaveLength(8);
  });

  it('refuses a number already worn where the season wants unique ones, naming who wears it, and saves the rest', async () => {
    const l = await leagueWithGame({ uniqueJerseys: true });
    const [a, b] = [randomUUID(), randomUUID()];
    const commands = commandsOf([
      { type: 'add-player', side: 'home', playerId: a, jersey: '10', name: '' },
      { type: 'add-player', side: 'home', playerId: b, jersey: '15', name: 'Sam Lee' },
      { type: 'change-player', side: 'home', playerId: b, jersey: '11' },
      { type: 'change-player', side: 'home', playerId: b, jersey: '16' },
    ]);
    const results = resultsOf(await l.send(commands));
    expect(statusesOf(results)).toEqual(['refused', 'accepted', 'refused', 'accepted']);
    expect(results[0]).toMatchObject({
      status: 'refused',
      reason: {
        code: 'rule',
        message: 'Number 10 is already worn by Jordan Ellis0 on this team.',
        problem: 'jersey-taken',
        wornBy: l.home[0],
      },
    });
    expect(results[2]).toMatchObject({ reason: { problem: 'jersey-taken', wornBy: l.home[1] } });
    const rows = await visitorsOf(l.homeTeamId);
    expect(rows.map((r) => r.person_id)).not.toContain(a);
    expect(rows.find((r) => r.person_id === b)).toMatchObject({
      jersey_number: '16',
      first_name: 'Sam',
      last_name: 'Lee',
      needs_review: true,
    });
    expect(await pglite.query('select 1 from people where id = $1', [a])).toMatchObject({
      rows: [],
    });
  });

  it('takes off a player added by mistake, leaving nothing behind, but keeps one a play names', async () => {
    const l = await leagueWithGame();
    const [mistake, starter] = [randomUUID(), randomUUID()];
    await l.send(
      commandsOf([
        { type: 'add-player', side: 'away', playerId: mistake, jersey: '7', name: '' },
        { type: 'add-player', side: 'away', playerId: starter, jersey: '8', name: '' },
        { type: 'lineup', side: 'away', playerIds: [starter] },
      ]),
    );
    const results = resultsOf(
      await l.send(
        commandsOf([
          { type: 'remove-player', side: 'away', playerId: mistake },
          { type: 'remove-player', side: 'away', playerId: starter },
          { type: 'remove-player', side: 'home', playerId: l.home[0] ?? '' },
        ]),
      ),
    );
    expect(results.map((r) => (r.status === 'refused' ? r.reason.problem : r.status))).toEqual([
      'accepted',
      'has-plays',
      'not-added-here',
    ]);
    expect((await visitorsOf(l.awayTeamId)).map((r) => r.person_id)).toEqual([starter]);
    expect(await pglite.query('select 1 from people where id = $1', [mistake])).toMatchObject({
      rows: [],
    });
  });

  it('does not count changes of players as plays: the box score can still be entered', async () => {
    const l = await leagueWithGame();
    await l.send(
      commandsOf([
        { type: 'add-player', side: 'away', playerId: randomUUID(), jersey: '4', name: '' },
      ]),
    );
    const before = await withTransaction(db, { leagueId: l.leagueId }, (scope) =>
      gameHasPlays(scope, l.gameId),
    );
    expect(before).toBe(false);
    await l.send(commandsOf([{ type: 'lineup', side: 'home', playerIds: l.home }]));
    const after = await withTransaction(db, { leagueId: l.leagueId }, (scope) =>
      gameHasPlays(scope, l.gameId),
    );
    expect(after).toBe(true);
  });
});
