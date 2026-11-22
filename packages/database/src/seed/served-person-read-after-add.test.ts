// Step 2.239: a person added on the made-up database served as PostgreSQL (the way the
// test copy, APP_ENV=staging, reaches it: `pg` and its pool over a `postgres://`
// address) is read back as the same owner, by the same commands the person's own page
// runs. On PGlite in the process this always held; over the pool it did not.
import {
  createPerson,
  getPerson,
  listPeople,
  type CommandDeps,
  type Job,
  type PeopleTx,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { accessStore } from '../stores/access-store.ts';
import { activityLogStore } from '../stores/activity-log-store.ts';
import { peopleStore } from '../stores/people-store.ts';
import { serveMadeUpDatabase, type MadeUpDatabaseServer } from './serve-made-up-database.ts';

let served: MadeUpDatabaseServer;
let db: DatabaseHandle;
let deps: CommandDeps<PeopleTx>;
beforeAll(async () => {
  served = await serveMadeUpDatabase({ underWay: true });
  db = createDatabase({ kind: 'postgres', url: served.url, ssl: 'off' });
  const transaction = commandTransaction(db, (scope) => ({
    jobs: { enqueue: async (_job: Job) => {} },
    people: peopleStore(scope),
    access: accessStore(scope),
    activity: activityLogStore(scope),
  }));
  deps = { transaction, events: [], log: () => {}, now: () => 0 };
}, 120_000);
afterAll(async () => {
  await db?.close();
  await served?.close();
});

describe('a person added on the served database', () => {
  it('is read back on their own record by the owner who added them', async () => {
    const lakeside = served.leagues[0];
    if (lakeside === undefined) throw new Error('no seed league');
    const owner = {
      leagueId: lakeside.leagueId,
      accountId: lakeside.ownerAccountId,
      requestId: 'r-2.239',
    };
    const made = await createPerson(owner, { firstName: 'Jon', lastName: 'Smiht' }, deps);
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const listed = await listPeople(owner, {}, deps);
    expect(listed.ok && listed.value.some((person) => person.id === made.value.personId)).toBe(
      true,
    );
    const read = await getPerson(owner, { personId: made.value.personId }, deps);
    expect(read.ok ? read.value.id : read.error).toBe(made.value.personId);
  }, 60_000);
});
