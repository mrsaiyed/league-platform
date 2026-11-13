// Core's setLeagueName command against the real database: one transaction per call
// (commandTransaction), committed on success and rolled back on a refusal or a throw.
import type { PGlite } from '@electric-sql/pglite';
import {
  onEvent,
  setLeagueName,
  type CommandDeps,
  type CommandLogLine,
  type EventHandler,
  type Job,
  type LeagueNameChanged,
  type LeaguesTx,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  freshSchema,
  newAccount,
  newLeague,
  one,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { leaguesStore } from './leagues-store.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let strangerId: string;
beforeAll(async () => {
  pglite = await freshSchema();
  strangerId = await newAccount(pglite);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

/**
 * Each test gets its own league, jobs and log lines. The real job queue arrives with
 * the worker (step 1.19); jobs here are only collected, not written in the
 * database transaction.
 */
async function setUp() {
  const a: MadeLeague = await newLeague(pglite);
  const jobs: Job[] = [];
  const lines: CommandLogLine[] = [];
  const deps = (events: readonly EventHandler<LeaguesTx>[] = []): CommandDeps<LeaguesTx> => ({
    transaction: commandTransaction(db, (scope) => ({
      jobs: { enqueue: async (job: Job) => void jobs.push(job) },
      leagues: leaguesStore(scope),
      access: accessStore(scope),
      activity: activityLogStore(scope),
    })),
    events,
    log: (line) => void lines.push(line),
    now: () => 0,
  });
  const league = () =>
    one<{ name: string; version: number }>(
      pglite,
      'select name, version from leagues where id = $1',
      [a.leagueId],
    );
  const as = (accountId: string) => ({ leagueId: a.leagueId, accountId, requestId: 'request-1' });
  return { a, jobs, lines, deps, league, as };
}

describe('setLeagueName on the database', () => {
  it("lets the owner rename the league, in the owner's own fenced transaction", async () => {
    const { a, lines, deps, league, as } = await setUp();
    const result = await setLeagueName(as(a.ownerId), { name: 'First', version: 1 }, deps());
    expect(result).toEqual({ ok: true, value: { name: 'First', version: 2 } });
    expect(await league()).toEqual({ name: 'First', version: 2 });
    expect(lines).toMatchObject([{ command: 'leagues.set_name', outcome: 'ok' }]);
  });

  it('refuses anyone else and a stale version, changing nothing', async () => {
    const { a, deps, league, as } = await setUp();
    const stranger = await setLeagueName(as(strangerId), { name: 'X', version: 1 }, deps());
    expect(stranger).toEqual({ ok: false, error: { code: 'not-allowed' } });
    const stale = await setLeagueName(as(a.ownerId), { name: 'X', version: 7 }, deps());
    expect(stale).toEqual({ ok: false, error: { code: 'changed-since-read' } });
    expect(await league()).toEqual({ name: 'Made-up League', version: 1 });
  });

  it('rolls the rename back when a handler of its event fails', async () => {
    const { a, jobs, deps, league, as } = await setUp();
    const failing = onEvent<LeagueNameChanged, LeaguesTx>(
      'leagues.name_changed',
      async (event, tx) => {
        await tx.jobs.enqueue({ type: 'cache.clear', leagueId: event.leagueId, ids: {} });
        throw new Error('standings could not be updated');
      },
    );
    await expect(
      setLeagueName(as(a.ownerId), { name: 'Second', version: 1 }, deps([failing])),
    ).rejects.toThrow('standings could not be updated');
    expect(await league()).toEqual({ name: 'Made-up League', version: 1 });
    // Collected in memory, so not rolled back: what step 1.19's queue must fix.
    expect(jobs).toHaveLength(1);
  });

  it("records a handler's job when the rename commits", async () => {
    const { a, jobs, deps, league, as } = await setUp();
    const queueing = onEvent<LeagueNameChanged, LeaguesTx>('leagues.name_changed', (event, tx) =>
      tx.jobs.enqueue({ type: 'cache.clear', leagueId: event.leagueId, ids: {} }),
    );
    await setLeagueName(as(a.ownerId), { name: 'Second', version: 1 }, deps([queueing]));
    expect(await league()).toEqual({ name: 'Second', version: 2 });
    expect(jobs).toEqual([{ type: 'cache.clear', leagueId: a.leagueId, ids: {} }]);
  });
});
