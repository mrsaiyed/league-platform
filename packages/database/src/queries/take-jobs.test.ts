// takeJobs is the worker's alone: a league scope does not compile, and a transaction
// with a league or an account set is refused by the database (record 012).
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { freshSchema, newLeague, type MadeLeague } from '../schema/schema.test-helper.ts';
import { insertJob } from './insert-job.ts';
import { takeJobs } from './take-jobs.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let league: MadeLeague;
beforeAll(async () => {
  pglite = await freshSchema();
  league = await newLeague(pglite);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

describe('takeJobs', () => {
  it('takes due jobs in a transaction with no league and no account', async () => {
    await withTransaction(db, { leagueId: league.leagueId }, (scope) =>
      insertJob(scope, { type: 'email.send', leagueId: league.leagueId, ids: {} }),
    );
    const taken = await withTransaction(db, {}, (scope) => takeJobs(scope, 10, 60));
    expect(taken).toEqual([
      expect.objectContaining({ type: 'email.send', leagueId: league.leagueId, attempt: 1 }),
    ]);
  });

  it('cannot be given a league scope', async () => {
    await withTransaction(db, { leagueId: league.leagueId }, async (scope) => {
      // @ts-expect-error A league scope is not a NoLeagueScope.
      const call = () => takeJobs(scope, 10, 60);
      expect(typeof call).toBe('function');
    });
  });

  it("is refused in a transaction with an account set, as a signed-in request's is", async () => {
    await expect(
      withTransaction(db, { accountId: league.ownerId }, (scope) => takeJobs(scope, 10, 60)),
    ).rejects.toMatchObject({ code: '42501', message: expect.stringContaining('for the worker') });
  });
});
