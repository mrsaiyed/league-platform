// No query runs outside the transaction it was written for: not one left running
// when the work returned, not one sent while COMMIT or ROLLBACK is under way, not a
// sibling of a query that failed, not one sent through a transaction kept past its
// end. Kysely refuses most of these itself; without the guard, a query sent during
// the COMMIT ran after it on the pg pool, as the login role (the superuser here)
// with no league, and saw every league.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { sql, type Transaction } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshSchema, newLeague, type MadeLeague } from '../schema/schema.test-helper.ts';
import { createDatabase } from './create-database.ts';
import type { DatabaseHandle } from './database-handle.ts';
import type { Database } from './schema-types.ts';
import { transactionOf } from './transaction-scope.ts';
import { withTransaction } from './with-transaction.ts';

let pglite: PGlite;
let server: PGLiteSocketServer;
let a: MadeLeague;
type Kind = 'pglite' | 'postgres';
const handles = new Map<Kind, DatabaseHandle>();
const handle = (kind: Kind) => {
  const found = handles.get(kind);
  if (found === undefined) throw new Error(`no ${kind} handle`);
  return found;
};

beforeAll(async () => {
  pglite = await freshSchema();
  a = await newLeague(pglite);
  await newLeague(pglite);
  server = new PGLiteSocketServer({ db: pglite, port: 0, host: '127.0.0.1' });
  await server.start();
  handles.set('pglite', createDatabase({ kind: 'pglite', pglite }));
  const url = `postgres://postgres:postgres@${server.getServerConn()}/postgres`;
  handles.set('postgres', createDatabase({ kind: 'postgres', url, ssl: 'off', maxConnections: 1 }));
});
afterAll(async () => {
  for (const open of handles.values()) await open.close();
  await server.stop();
  await pglite.close();
});

/** The leagues of every programs row the query saw, as the role it ran as. */
const sees = (trx: Transaction<Database>) =>
  sql<{
    league_id: string;
    role: string;
  }>`select league_id, current_user as role from programs`.execute(trx);

/** Safe outcomes for a stray query: refused, or run inside the fence. */
async function expectFenced(stray: Promise<{ rows: { league_id: string; role: string }[] }>) {
  const [outcome] = await Promise.allSettled([stray]);
  if (outcome?.status === 'fulfilled') {
    expect(outcome.value.rows.length).toBeGreaterThan(0);
    for (const row of outcome.value.rows)
      expect(row).toEqual({ league_id: a.leagueId, role: 'app_user' });
  } else {
    expect(outcome?.status).toBe('rejected');
  }
}

describe.each(['pglite', 'postgres'] as const)('guarded connections (%s)', (kind) => {
  it('never runs a query left running when the work returned outside the fence', async () => {
    let stray: ReturnType<typeof sees> | undefined;
    await withTransaction(handle(kind), { leagueId: a.leagueId }, async (scope) => {
      stray = sees(transactionOf(scope));
      // Looked at after the transaction; marked handled now so a refusal is not
      // reported as an unhandled rejection in the meantime.
      stray.catch(() => {});
      return 'done';
    });
    if (stray === undefined) throw new Error('the stray query was not started');
    await expectFenced(stray);
  });

  it('never runs a query sent while the commit is under way outside the fence', async () => {
    let stray: ReturnType<typeof sees> | undefined;
    await withTransaction(handle(kind), { leagueId: a.leagueId }, async (scope) => {
      const trx = transactionOf(scope);
      // Sent on the next turn of the event loop: after the work returned, while the
      // COMMIT is on its way to the server and before Kysely marks it committed.
      stray = new Promise<void>((resolve) => setImmediate(resolve)).then(() => sees(trx));
      stray.catch(() => {});
    });
    if (stray === undefined) throw new Error('the stray query was not started');
    await expectFenced(stray);
  });

  it('never runs the sibling of a failed query in Promise.all outside the fence', async () => {
    let sibling: ReturnType<typeof sees> | undefined;
    const run = withTransaction(handle(kind), { leagueId: a.leagueId }, async (scope) => {
      const trx = transactionOf(scope);
      const failing = sql`select 1 / 0`.execute(trx);
      sibling = sees(trx);
      await Promise.all([failing, sibling]);
    });
    await expect(run).rejects.toMatchObject({ code: '22012' });
    if (sibling === undefined) throw new Error('the sibling query was not started');
    // Queued behind the failure: PostgreSQL refuses it inside the failed
    // transaction, or the guard refuses it once the rollback has begun.
    await expect(sibling).rejects.toThrow();
  });

  it('refuses a query through a transaction kept past its end', async () => {
    const kept = await withTransaction(handle(kind), { leagueId: a.leagueId }, async (scope) =>
      transactionOf(scope),
    );
    await expect(sees(kept)).rejects.toThrow();
  });
});
