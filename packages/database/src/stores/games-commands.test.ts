// Step 2.23's commands against the real database: each call is one transaction
// (commandTransaction). Covers what the database itself enforces for a game's result:
// the rules a game keeps once decided (S-1), a correction row written with every
// reopening (S-7) and no result change without one. Their isolation cases are in
// ../isolation.
import type { PGlite } from '@electric-sql/pglite';
import {
  cancelGame,
  gameFinalized,
  gameReopened,
  listPostponedGames,
  postponeGame,
  recordFinalScore,
  recordForfeit,
  reopenGame,
  type CommandDeps,
  type DomainEvent,
  type Job,
  type TrackerTx,
} from '@srleagues/core';
import { defaultSeasonRules } from '@srleagues/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  freshSchema,
  newAccount,
  newGame,
  newLeague,
  newProgram,
  newSeason,
  newStage,
  newTeam,
  one,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { gamesStore } from './games-store.ts';
import { liveGamesStore } from './live-games-store.ts';
import { scoringSessionsStore } from './scoring-sessions-store.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let deps: CommandDeps<TrackerTx>;
const events: DomainEvent[] = [];
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  const transaction = commandTransaction(db, (scope) => ({
    jobs: { enqueue: async (_job: Job) => {} },
    games: gamesStore(scope),
    // Reopening a game takes its lock and hands a tracked game back (step 2.30).
    scoringSessions: scoringSessionsStore(scope),
    liveGames: liveGamesStore(scope),
    clock: { now: () => Date.UTC(2026, 11, 6, 20, 0, 0) },
    access: accessStore(scope),
    activity: activityLogStore(scope),
  }));
  const keep = (type: string) => ({
    type,
    handle: async (event: DomainEvent) => void events.push(event),
  });
  deps = {
    transaction,
    events: [keep(gameFinalized), keep(gameReopened)],
    log: () => {},
    now: () => 0,
  };
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const contextOf = (l: MadeLeague) => ({
  leagueId: l.leagueId,
  accountId: l.ownerId,
  requestId: 'r-1',
});

async function leagueWithGame(columns: Record<string, unknown> = {}) {
  const l = await newLeague(pglite);
  const programId = await newProgram(pglite, l.leagueId);
  const seasonId = await newSeason(pglite, l.leagueId, programId);
  const home = await newTeam(pglite, l.leagueId, seasonId);
  const away = await newTeam(pglite, l.leagueId, seasonId);
  const gameId = await newGame(pglite, {
    leagueId: l.leagueId,
    seasonId,
    stageId: await newStage(pglite, l.leagueId, seasonId),
    homeTeamId: home,
    awayTeamId: away,
    columns,
  });
  return { l, seasonId, home, away, gameId, ctx: contextOf(l) };
}

const rowOf = (gameId: string) =>
  one<{
    status: string;
    home_score: number | null;
    winner_team_id: string | null;
    finalized_at: Date | null;
    format: { version: number } | null;
    version: number;
  }>(
    pglite,
    'select status, home_score, winner_team_id, finalized_at, format, version from games where id = $1',
    [gameId],
  );

describe('the games commands on the database', () => {
  it('records a final score: final, a worked-out winner, rules fixed, event announced', async () => {
    const g = await leagueWithGame();
    events.length = 0;
    const result = await recordFinalScore(
      g.ctx,
      { gameId: g.gameId, version: 1, homeScore: 60, awayScore: 55 },
      deps,
    );
    expect(result).toEqual({ ok: true, value: { version: 2 } });
    const row = await rowOf(g.gameId);
    expect(row).toMatchObject({ status: 'final', home_score: 60, winner_team_id: g.home });
    expect(row.finalized_at).not.toBeNull();
    expect(row.format).toMatchObject({ version: 1 });
    expect(events.map((e) => e.type)).toEqual(['games.finalized']);
    const log = await pglite.query<{ action: string }>(
      'select action from activity_log where league_id = $1',
      [g.l.leagueId],
    );
    expect(log.rows.map((r) => r.action)).toContain('games.record_final_score');
  });

  it('refuses a tie while the season keeps the starting rules (no ties)', async () => {
    const g = await leagueWithGame();
    const tie = { gameId: g.gameId, version: 1, homeScore: 50, awayScore: 50 };
    expect(await recordFinalScore(g.ctx, tie, deps)).toMatchObject({
      error: { code: 'tie-not-allowed' },
    });
    expect((await rowOf(g.gameId)).status).toBe('scheduled');
  });

  it('records a tie when the season allows ties (no winner), then reopens and decides again', async () => {
    const g = await leagueWithGame();
    const rules = { ...defaultSeasonRules(), allowTies: true };
    await pglite.query('update seasons set rules = $1::jsonb where id = $2', [
      JSON.stringify(rules),
      g.seasonId,
    ]);
    expect(
      await recordFinalScore(
        g.ctx,
        { gameId: g.gameId, version: 1, homeScore: 50, awayScore: 50 },
        deps,
      ),
    ).toMatchObject({ ok: true });
    expect(await rowOf(g.gameId)).toMatchObject({
      status: 'final',
      home_score: 50,
      winner_team_id: null,
    });
    expect(
      await reopenGame(g.ctx, { gameId: g.gameId, version: 2, reason: 'It was not a tie' }, deps),
    ).toMatchObject({ ok: true });
    expect(await rowOf(g.gameId)).toMatchObject({ status: 'scheduled', home_score: null });
    expect(
      await recordFinalScore(
        g.ctx,
        { gameId: g.gameId, version: 3, homeScore: 52, awayScore: 50 },
        deps,
      ),
    ).toMatchObject({ ok: true });
    expect(await rowOf(g.gameId)).toMatchObject({ status: 'final', winner_team_id: g.home });
    const corrections = await one<{ n: string }>(
      pglite,
      'select count(*)::text as n from game_corrections where game_id = $1',
      [g.gameId],
    );
    expect(corrections.n).toBe('1');
  });

  it('records a forfeit at the season forfeit score', async () => {
    const g = await leagueWithGame();
    const result = await recordForfeit(
      g.ctx,
      { gameId: g.gameId, version: 1, forfeitingTeamId: g.home },
      deps,
    );
    expect(result).toMatchObject({ ok: true });
    expect(await rowOf(g.gameId)).toMatchObject({
      status: 'forfeit',
      home_score: 0,
      winner_team_id: g.away,
    });
  });

  it('postpones into the waiting list, then cancels out of it', async () => {
    const g = await leagueWithGame();
    expect(await postponeGame(g.ctx, { gameId: g.gameId, version: 1 }, deps)).toMatchObject({
      ok: true,
    });
    const waiting = await listPostponedGames(g.ctx, {}, deps);
    expect(waiting.ok && waiting.value.map((x) => x.id)).toEqual([g.gameId]);
    expect(await cancelGame(g.ctx, { gameId: g.gameId, version: 2 }, deps)).toMatchObject({
      ok: true,
    });
    const after = await listPostponedGames(g.ctx, {}, deps);
    expect(after.ok && after.value).toEqual([]);
    expect((await rowOf(g.gameId)).status).toBe('cancelled');
  });

  it('reopens a final game with a correction row in the same transaction (S-7)', async () => {
    const g = await leagueWithGame();
    await recordFinalScore(
      g.ctx,
      { gameId: g.gameId, version: 1, homeScore: 60, awayScore: 55 },
      deps,
    );
    events.length = 0;
    const reopened = await reopenGame(
      g.ctx,
      { gameId: g.gameId, version: 2, reason: 'Scores were swapped' },
      deps,
    );
    expect(reopened).toMatchObject({ ok: true });
    expect(events.map((e) => e.type)).toEqual(['games.reopened']);
    expect(await rowOf(g.gameId)).toMatchObject({
      status: 'scheduled',
      home_score: null,
      finalized_at: null,
    });
    const corrections = await pglite.query<{ reason: string; before: unknown; account_id: string }>(
      'select reason, before, account_id from game_corrections where game_id = $1',
      [g.gameId],
    );
    expect(corrections.rows).toEqual([
      {
        reason: 'Scores were swapped',
        before: { version: 1, status: 'final', homeScore: 60, awayScore: 55 },
        account_id: g.l.ownerId,
      },
    ]);
    // The game keeps the rules it was decided under (S-1) and can be decided again.
    expect((await rowOf(g.gameId)).format).toMatchObject({ version: 1 });
    expect(
      await recordFinalScore(
        g.ctx,
        { gameId: g.gameId, version: 3, homeScore: 55, awayScore: 60 },
        deps,
      ),
    ).toMatchObject({ ok: true });
  });

  it('refuses reopening without a reason and leaves the game and its corrections as they were', async () => {
    const g = await leagueWithGame();
    await recordFinalScore(
      g.ctx,
      { gameId: g.gameId, version: 1, homeScore: 60, awayScore: 55 },
      deps,
    );
    for (const reason of [undefined, '', '  ']) {
      expect(await reopenGame(g.ctx, { gameId: g.gameId, version: 2, reason }, deps)).toMatchObject(
        { error: { code: 'invalid-input' } },
      );
    }
    expect((await rowOf(g.gameId)).status).toBe('final');
    const count = await one<{ n: string }>(
      pglite,
      'select count(*)::text as n from game_corrections where game_id = $1',
      [g.gameId],
    );
    expect(count.n).toBe('0');
  });

  it('is refused to anyone without the permission, and to a scorekeeper for reopening', async () => {
    const g = await leagueWithGame();
    const scorekeeper = await newAccount(pglite);
    await pglite.query(
      "insert into role_grants (league_id, account_id, role) values ($1, $2, 'scorekeeper')",
      [g.l.leagueId, scorekeeper],
    );
    const as = { ...g.ctx, accountId: scorekeeper };
    expect(
      await recordFinalScore(
        as,
        { gameId: g.gameId, version: 1, homeScore: 1, awayScore: 0 },
        deps,
      ),
    ).toMatchObject({ ok: true });
    expect(
      await reopenGame(as, { gameId: g.gameId, version: 2, reason: 'Oops' }, deps),
    ).toMatchObject({ error: { code: 'not-allowed' } });
  });
});
