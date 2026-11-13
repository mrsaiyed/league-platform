// A database with one league for the queue tests, and small helpers to record a
// job as a command would and read back what became of it.
import type { PGlite } from '@electric-sql/pglite';
import type { Job, JobRunLine } from '@srleagues/core';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { insertJob } from '../queries/index.ts';
import { freshSchema, newLeague, one, type MadeLeague } from '../schema/schema.test-helper.ts';

export type QueueSetUp = {
  pglite: PGlite;
  db: DatabaseHandle;
  league: MadeLeague;
  lines: JobRunLine[];
  /** Records a job in the league, as a command's transaction does; returns its id. */
  record: (job?: Partial<Omit<Job, 'leagueId'>>) => Promise<string>;
  /** The job's row, as the owner sees it. */
  row: (id: string) => Promise<{ state: string; attempts: number; last_error: string | null }>;
  close: () => Promise<void>;
};

export async function queueSetUp(): Promise<QueueSetUp> {
  const pglite = await freshSchema();
  const league = await newLeague(pglite);
  const db = createDatabase({ kind: 'pglite', pglite });
  return {
    pglite,
    db,
    league,
    lines: [],
    record: async (job = {}) => {
      await withTransaction(db, { leagueId: league.leagueId }, (scope) =>
        insertJob(scope, { type: 'email.send', ids: {}, ...job, leagueId: league.leagueId }),
      );
      const newest = await one<{ id: string }>(
        pglite,
        'select id from jobs order by created_at desc, id desc limit 1',
      );
      return newest.id;
    },
    row: (id) => one(pglite, 'select state, attempts, last_error from jobs where id = $1', [id]),
    close: async () => {
      await db.close();
      await pglite.close();
    },
  };
}

/** Waits until `check` is true, or fails after `ms`. */
export async function eventually(check: () => Promise<boolean> | boolean, ms = 15_000) {
  const until = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > until) throw new Error('waited too long');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
