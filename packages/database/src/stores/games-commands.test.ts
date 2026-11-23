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
  putGameBack,
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
  newCourt,
  newGame,
  newLeague,
  newProgram,
  newSeason,
  newStage,
  newTeam,
  newVenue,
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
    // Step 2.158: put back, it is what it was when it was cancelled: postponed, waiting.
    expect(
      await putGameBack(g.ctx, { gameId: g.gameId, version: 3, reason: 'other' }, deps),
    ).toEqual({ ok: true, value: { version: 4, status: 'postponed', clashes: [] } });
    const back = await listPostponedGames(g.ctx, {}, deps);
    expect(back.ok && back.value.map((x) => x.id)).toEqual([g.gameId]);
    // And a postponement made by mistake goes back on its old date.
    expect(
      await putGameBack(g.ctx, { gameId: g.gameId, version: 4, reason: 'other' }, deps),
    ).toMatchObject({ ok: true, value: { status: 'scheduled' } });
    expect((await rowOf(g.gameId)).status).toBe('scheduled');
  });

  it('puts a cancelled game back over a game that took its place, naming it (step 2.158)', async () => {
    const at = '2026-12-13T18:00:00Z';
    const g = await leagueWithGame({ starts_at: at });
    const { stage_id: stageId } = await one<{ stage_id: string }>(
      pglite,
      'select stage_id from games where id = $1',
      [g.gameId],
    );
    const other = await newGame(pglite, {
      leagueId: g.l.leagueId,
      seasonId: g.seasonId,
      stageId,
      homeTeamId: g.home,
      awayTeamId: await newTeam(pglite, g.l.leagueId, g.seasonId),
      columns: { starts_at: at },
    });
    expect(await cancelGame(g.ctx, { gameId: g.gameId, version: 1 }, deps)).toMatchObject({
      ok: true,
    });
    const back = await putGameBack(
      g.ctx,
      { gameId: g.gameId, version: 2, reason: 'willBePlayed' },
      deps,
    );
    expect(back).toMatchObject({ ok: true, value: { status: 'scheduled' } });
    expect(back.ok && back.value.clashes.map((c) => c.id)).toEqual([other]);
  });

  it('refuses to put back a cancelled game whose team is in the bin (step 2.158)', async () => {
    const g = await leagueWithGame();
    expect(await cancelGame(g.ctx, { gameId: g.gameId, version: 1 }, deps)).toMatchObject({
      ok: true,
    });
    await pglite.query('update teams set deleted_at = now() where id = $1', [g.away]);
    expect(
      await putGameBack(g.ctx, { gameId: g.gameId, version: 2, reason: 'other' }, deps),
    ).toEqual({ ok: false, error: { code: 'game-part-in-bin' } });
    expect((await rowOf(g.gameId)).status).toBe('cancelled');
  });

  for (const part of ['venue', 'court'] as const) {
    it(`refuses to put back a cancelled game whose ${part} is in the bin (step 2.221)`, async () => {
      const g = await leagueWithGame();
      const venueId = await newVenue(pglite, g.l.leagueId);
      const courtId = await newCourt(pglite, g.l.leagueId, venueId);
      await pglite.query('update games set venue_id = $1, court_id = $2 where id = $3', [
        venueId,
        courtId,
        g.gameId,
      ]);
      // Setting its place moved the game's version on.
      const { version } = await rowOf(g.gameId);
      expect(await cancelGame(g.ctx, { gameId: g.gameId, version }, deps)).toMatchObject({
        ok: true,
      });
      await pglite.query(`update ${part}s set deleted_at = now() where id = $1`, [
        part === 'venue' ? venueId : courtId,
      ]);
      expect(
        await putGameBack(g.ctx, { gameId: g.gameId, version: version + 1, reason: 'other' }, deps),
      ).toEqual({ ok: false, error: { code: 'game-part-in-bin' } });
      expect((await rowOf(g.gameId)).status).toBe('cancelled');
    });
  }

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

describe('a result typed by hand over a game the live tracker scores (S-46, step 2.154)', () => {
  /** Inserts the game's events, numbered from 1, as the tracker would have saved them. */
  const tap = async (g: Awaited<ReturnType<typeof leagueWithGame>>, types: readonly string[]) => {
    for (const [i, type] of types.entries()) {
      await pglite.query(
        `insert into game_events (league_id, game_id, seq, command_id, type, payload, tapped_at)
         values ($1, $2, $3, public.uuid_v7(), $4, '{}', now())`,
        [g.l.leagueId, g.gameId, i + 1, type],
      );
    }
  };
  const eventCount = async (gameId: string) =>
    (
      await one<{ n: string }>(
        pglite,
        'select count(*)::text as n from game_events where game_id = $1',
        [gameId],
      )
    ).n;

  it('refuses a final score and a forfeit from every role that may send them; the game stays live with its plays', async () => {
    const g = await leagueWithGame({ status: 'live', capture_mode: 'live' });
    await tap(g, ['lineup', 'start', 'score']);
    const accounts: Record<string, string> = { owner: g.l.ownerId };
    for (const role of ['admin', 'scheduler', 'scorekeeper']) {
      accounts[role] = await newAccount(pglite);
      await pglite.query(
        'insert into role_grants (league_id, account_id, role) values ($1, $2, $3)',
        [g.l.leagueId, accounts[role], role],
      );
    }
    const before = await rowOf(g.gameId);
    for (const [role, accountId] of Object.entries(accounts)) {
      const as = { ...g.ctx, accountId };
      expect(
        await recordFinalScore(
          as,
          { gameId: g.gameId, version: before.version, homeScore: 40, awayScore: 38 },
          deps,
        ),
        role,
      ).toEqual({ ok: false, error: { code: 'game-is-tracked' } });
      // A scorekeeper may not record a forfeit at all; everyone else is refused for the plays.
      const forfeit = await recordForfeit(
        as,
        { gameId: g.gameId, version: before.version, forfeitingTeamId: g.home },
        deps,
      );
      expect(forfeit, role).toEqual({
        ok: false,
        error: { code: role === 'scorekeeper' ? 'not-allowed' : 'game-is-tracked' },
      });
    }
    expect(await rowOf(g.gameId)).toEqual(before);
    expect(before.status).toBe('live');
    expect(await eventCount(g.gameId)).toBe('3');
  });

  it('finishes a game set to live tracking by hand while it has no plays since its last marker', async () => {
    const marked = await leagueWithGame({ capture_mode: 'live' });
    // Started by mistake and marked not started (record 061): nothing after the marker.
    await tap(marked, ['lineup', 'score', 'reset']);
    expect(
      await recordFinalScore(
        marked.ctx,
        { gameId: marked.gameId, version: 1, homeScore: 40, awayScore: 38 },
        deps,
      ),
    ).toMatchObject({ ok: true });
    const unplayed = await leagueWithGame({ capture_mode: 'live' });
    expect(
      await recordFinalScore(
        unplayed.ctx,
        { gameId: unplayed.gameId, version: 1, homeScore: 40, awayScore: 38 },
        deps,
      ),
    ).toMatchObject({ ok: true });
  });
});
