// Step 2.28 against the real database: one scorer at a time (T6 §5, S-5, T-116).
// Two devices racing for one game, taking over, a lease running out, and leaving the
// game, all with a clock the test moves by hand. Each call is one transaction
// (commandTransaction). The isolation cases are in ../isolation.
import type { PGlite } from '@electric-sql/pglite';
import {
  leaseMs,
  openScoringSession,
  releaseScoringSession,
  renewScoringSession,
  takeOverScoring,
  type AccessTx,
  type CommandDeps,
  type Job,
  type LeaguesTx,
  type ScoringTx,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { insertScoringSession } from '../queries/insert-scoring-session.ts';
import {
  freshSchema,
  newAccount,
  newGame,
  newLeague,
  newProgram,
  newSeason,
  newStage,
  newTeam,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { divisionsStore } from './divisions-store.ts';
import { gamesStore } from './games-store.ts';
import { leaguesStore } from './leagues-store.ts';
import { scoringSessionsStore } from './scoring-sessions-store.ts';

type Tx = ScoringTx & LeaguesTx & AccessTx;

/** The test's clock: 13 December 2026, 18:00 UTC, moved on by hand. */
const startOfTest = Date.UTC(2026, 11, 13, 18, 0, 0);
const clock = { at: startOfTest, now: () => clock.at };
const advance = (seconds: number) => void (clock.at += seconds * 1000);

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

/** A league with one game to play and two scorekeepers; the clock back at the start. */
async function leagueWithGame() {
  clock.at = startOfTest;
  const l = await newLeague(pglite);
  const programId = await newProgram(pglite, l.leagueId);
  const seasonId = await newSeason(pglite, l.leagueId, programId);
  const gameId = await newGame(pglite, {
    leagueId: l.leagueId,
    seasonId,
    stageId: await newStage(pglite, l.leagueId, seasonId),
    homeTeamId: await newTeam(pglite, l.leagueId, seasonId),
    awayTeamId: await newTeam(pglite, l.leagueId, seasonId),
  });
  const first = await scorekeeper(l.leagueId);
  const second = await scorekeeper(l.leagueId);
  const as = (accountId: string) => ({ leagueId: l.leagueId, accountId, requestId: 'r-1' });
  const sessions = async () =>
    (
      await pglite.query<{ id: string; account_id: string; device_id: string; held_until: Date }>(
        'select id, account_id, device_id, held_until from scoring_sessions where game_id = $1',
        [gameId],
      )
    ).rows;
  return { ...l, gameId, first, second, as, sessions };
}

describe('scoring sessions on the database (T6 §5, T-116)', () => {
  it('two devices race to open one game: only one wins, the other is told who has it', async () => {
    const l = await leagueWithGame();
    const [tablet, phone] = await Promise.all([
      openScoringSession(l.as(l.first), { gameId: l.gameId, deviceId: 'tablet' }, deps),
      openScoringSession(l.as(l.second), { gameId: l.gameId, deviceId: 'phone' }, deps),
    ]);
    const replies = [tablet, phone].map((r) => (r.ok ? r.value : undefined));
    const won = replies.filter((r) => r?.status === 'held-by-you');
    const lost = replies.filter((r) => r?.status === 'held-by-other');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    const rows = await l.sessions();
    expect(rows).toHaveLength(1);
    const winner = rows[0]?.account_id;
    expect(lost[0]).toEqual({
      status: 'held-by-other',
      holder: { accountId: winner, since: startOfTest },
      sentAt: startOfTest,
    });
    expect(won[0]).toEqual({
      status: 'held-by-you',
      sessionId: rows[0]?.id,
      expiresAt: startOfTest + leaseMs,
      sentAt: startOfTest,
    });
  });

  it('a second insert for a game that has a session returns nothing and leaves the transaction usable', async () => {
    const l = await leagueWithGame();
    const session = (accountId: string, deviceId: string) => ({
      gameId: l.gameId,
      accountId,
      deviceId,
      since: startOfTest,
      heldUntil: startOfTest + leaseMs,
    });
    const [firstIn, secondIn, seen] = await withTransaction(
      db,
      { leagueId: l.leagueId, accountId: l.first },
      async (scope) => [
        await insertScoringSession(scope, session(l.first, 'tablet')),
        await insertScoringSession(scope, session(l.second, 'phone')),
        await scoringSessionsStore(scope).findForGame(l.gameId),
      ],
    );
    expect(firstIn).toMatchObject({ accountId: l.first, since: startOfTest });
    expect(secondIn).toBeUndefined();
    expect(seen).toEqual(firstIn);
  });

  it('takes over: the holder’s session ends, a new one starts, and the first device is told', async () => {
    const l = await leagueWithGame();
    const opened = await openScoringSession(
      l.as(l.first),
      { gameId: l.gameId, deviceId: 'tablet' },
      deps,
    );
    const firstSession =
      opened.ok && opened.value.status === 'held-by-you' ? opened.value.sessionId : '';
    advance(45);
    const asked = await openScoringSession(
      l.as(l.second),
      { gameId: l.gameId, deviceId: 'phone' },
      deps,
    );
    expect(asked).toMatchObject({
      value: { status: 'held-by-other', holder: { accountId: l.first } },
    });
    const since =
      asked.ok && asked.value.status === 'held-by-other' ? asked.value.holder.since : -1;
    const taken = await takeOverScoring(
      l.as(l.second),
      { gameId: l.gameId, deviceId: 'phone', confirmed: true, expectedHolderSince: since },
      deps,
    );
    const now = startOfTest + 45_000;
    expect(taken).toMatchObject({
      ok: true,
      value: { status: 'held-by-you', expiresAt: now + leaseMs, sentAt: now },
    });
    const rows = await l.sessions();
    expect(rows).toEqual([expect.objectContaining({ account_id: l.second, device_id: 'phone' })]);
    expect(rows[0]?.id).not.toBe(firstSession);
    expect(
      await renewScoringSession(l.as(l.first), { gameId: l.gameId, sessionId: firstSession }, deps),
    ).toEqual({ ok: true, value: { status: 'ended', reason: 'taken-over', sentAt: now } });
    const logged = await pglite.query<{ action: string; actor_account_id: string }>(
      `select action, actor_account_id from activity_log where league_id = $1 and target_id = $2`,
      [l.leagueId, l.gameId],
    );
    expect(logged.rows).toEqual([
      { action: 'games.take_over_scoring', actor_account_id: l.second },
    ]);
  });

  it('a takeover naming a holder who has since changed takes nothing', async () => {
    const l = await leagueWithGame();
    await openScoringSession(l.as(l.first), { gameId: l.gameId, deviceId: 'tablet' }, deps);
    expect(
      await takeOverScoring(
        l.as(l.second),
        {
          gameId: l.gameId,
          deviceId: 'phone',
          confirmed: true,
          expectedHolderSince: startOfTest + 1,
        },
        deps,
      ),
    ).toMatchObject({ value: { status: 'held-by-other' } });
    expect(await l.sessions()).toEqual([expect.objectContaining({ account_id: l.first })]);
  });

  it('a lapsed lease is free: another device takes the game two minutes after the last renewal', async () => {
    const l = await leagueWithGame();
    const opened = await openScoringSession(
      l.as(l.first),
      { gameId: l.gameId, deviceId: 'tablet' },
      deps,
    );
    const firstSession =
      opened.ok && opened.value.status === 'held-by-you' ? opened.value.sessionId : '';
    advance(60);
    expect(
      await renewScoringSession(l.as(l.first), { gameId: l.gameId, sessionId: firstSession }, deps),
    ).toMatchObject({
      value: { status: 'held-by-you', expiresAt: startOfTest + 60_000 + leaseMs },
    });
    advance(119);
    const phone = { gameId: l.gameId, deviceId: 'phone' };
    expect(await openScoringSession(l.as(l.second), phone, deps)).toMatchObject({
      value: { status: 'held-by-other' },
    });
    advance(1);
    expect(await openScoringSession(l.as(l.second), phone, deps)).toMatchObject({
      value: { status: 'held-by-you' },
    });
    expect(await l.sessions()).toEqual([expect.objectContaining({ account_id: l.second })]);
    expect(
      await renewScoringSession(l.as(l.first), { gameId: l.gameId, sessionId: firstSession }, deps),
    ).toMatchObject({ value: { status: 'ended', reason: 'taken-over' } });
  });

  it('a lapsed session nobody took carries on when its own device renews (record 036)', async () => {
    const l = await leagueWithGame();
    const opened = await openScoringSession(
      l.as(l.first),
      { gameId: l.gameId, deviceId: 'tablet' },
      deps,
    );
    const firstSession =
      opened.ok && opened.value.status === 'held-by-you' ? opened.value.sessionId : '';
    advance(600);
    expect(
      await renewScoringSession(l.as(l.first), { gameId: l.gameId, sessionId: firstSession }, deps),
    ).toEqual({
      ok: true,
      value: {
        status: 'held-by-you',
        sessionId: firstSession,
        expiresAt: startOfTest + 600_000 + leaseMs,
        sentAt: startOfTest + 600_000,
      },
    });
    expect((await l.sessions())[0]?.held_until.getTime()).toBe(startOfTest + 600_000 + leaseMs);
  });

  it('leaving the game frees it at once', async () => {
    const l = await leagueWithGame();
    const opened = await openScoringSession(
      l.as(l.first),
      { gameId: l.gameId, deviceId: 'tablet' },
      deps,
    );
    const firstSession =
      opened.ok && opened.value.status === 'held-by-you' ? opened.value.sessionId : '';
    expect(
      await releaseScoringSession(
        l.as(l.first),
        { gameId: l.gameId, sessionId: firstSession },
        deps,
      ),
    ).toMatchObject({ value: { status: 'ended', reason: 'released' } });
    expect(await l.sessions()).toEqual([]);
    expect(
      await openScoringSession(l.as(l.second), { gameId: l.gameId, deviceId: 'phone' }, deps),
    ).toMatchObject({ value: { status: 'held-by-you' } });
  });

  it('ending a lapsed session keeps it if it was renewed in the meantime', async () => {
    const l = await leagueWithGame();
    const opened = await openScoringSession(
      l.as(l.first),
      { gameId: l.gameId, deviceId: 'tablet' },
      deps,
    );
    const firstSession =
      opened.ok && opened.value.status === 'held-by-you' ? opened.value.sessionId : '';
    const ended = await withTransaction(
      db,
      { leagueId: l.leagueId, accountId: l.second },
      async (scope) => {
        const store = scoringSessionsStore(scope);
        // Not lapsed by this moment: kept.
        const early = await store.end(l.gameId, firstSession, startOfTest + leaseMs - 1);
        // Lapsed by this one: ended.
        const late = await store.end(l.gameId, firstSession, startOfTest + leaseMs);
        return { early, late };
      },
    );
    expect(ended).toEqual({ early: false, late: true });
  });
});
