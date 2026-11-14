// T-257 (record 053): the worker's login may make pg-boss's tables in their own
// schema, which the release made; any other login may not.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshSchema } from '../schema/schema.test-helper.ts';
import { checkQueueSchema } from './check-queue-schema.ts';
import { createDatabase } from './create-database.ts';
import type { DatabaseHandle } from './database-handle.ts';

let pglite: PGlite;
let db: DatabaseHandle;
beforeAll(async () => {
  pglite = await freshSchema();
  await pglite.exec(`
    create role made_up_worker_login login;
    create role made_up_web_login login;
    grant app_user to made_up_worker_login, made_up_web_login;
  `);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

describe('checkQueueSchema', () => {
  it('reports a schema the release has not made yet', async () => {
    expect(await checkQueueSchema(db, 'made_up_worker_login')).toEqual([
      'the pgboss schema does not exist (the release makes it, record 053)',
    ]);
  });

  it('accepts a login granted queue_owner, and reports any other', async () => {
    // What the release does (record 053), here by hand.
    await pglite.exec(`
      create role queue_owner nologin;
      create schema pgboss authorization queue_owner;
      revoke all on schema pgboss from public;
      grant queue_owner to made_up_worker_login;
    `);
    expect(await checkQueueSchema(db, 'made_up_worker_login')).toEqual([]);
    expect(await checkQueueSchema(db, 'made_up_web_login')).toEqual([
      'the login role may not make tables in the pgboss schema (grant it queue_owner)',
    ]);
    expect(await checkQueueSchema(db, 'app_user')).toHaveLength(1);
  });

  it('checks the login the handle uses when no role is named', async () => {
    // This test logs in as the superuser, which may make tables anywhere.
    expect(await checkQueueSchema(db)).toEqual([]);
  });
});
