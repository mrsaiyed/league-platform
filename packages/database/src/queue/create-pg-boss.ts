// pg-boss for the database the app uses (T-7): its own tables in the `pgboss` schema,
// outside `public`, which app_user cannot use; the worker's connection reaches them,
// not the app's role.
//
// Who makes those tables (T-257, record 053): on a hosted database the worker never
// creates a schema. The release makes `pgboss`, owned by the role queue_owner, and the
// worker's login is granted queue_owner; pg-boss then makes and upgrades its own
// tables inside it when it starts, following the pinned pg-boss version. So it is
// started here with `createSchema: false`, and the worker checks the schema first
// (checkQueueSchema). On PGlite, for local work and tests, pg-boss makes the schema
// itself, as there is no release there.
import { PgBoss, fromPglite } from 'pg-boss';
import { queueSchema } from '../db/check-queue-schema.ts';
import { sslSetting } from '../migrations/postgres-driver.ts';
import type { DatabaseSource } from '../db/create-database.ts';

/** A pg-boss for `source`. Nothing connects until the queue starts it. */
export function createPgBoss(source: DatabaseSource): PgBoss {
  if (source.kind === 'pglite') {
    return new PgBoss({ db: fromPglite(source.pglite), backend: 'pglite', schema: queueSchema });
  }
  const target = new URL(source.url);
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat'])
    target.searchParams.delete(key);
  return new PgBoss({
    connectionString: target.toString(),
    ssl: sslSetting(source),
    max: source.maxConnections ?? 4,
    schema: queueSchema,
    createSchema: false,
    application_name: 'srleagues-worker',
  });
}
