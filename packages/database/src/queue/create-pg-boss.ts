// pg-boss for the database the app uses (T-7): its own tables in the `pgboss`
// schema, outside `public`, which app_user cannot use; the worker's connection
// reaches them, not the app's role. On first start pg-boss creates that schema,
// which needs a login allowed to create it (record 012: an open question for the
// hosted database, not verified).
import { PgBoss, fromPglite } from 'pg-boss';
import { sslSetting } from '../migrations/postgres-driver.ts';
import type { DatabaseSource } from '../db/create-database.ts';

/** A pg-boss for `source`. Nothing connects until the queue starts it. */
export function createPgBoss(source: DatabaseSource): PgBoss {
  if (source.kind === 'pglite') {
    return new PgBoss({ db: fromPglite(source.pglite), backend: 'pglite', schema: 'pgboss' });
  }
  const target = new URL(source.url);
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat'])
    target.searchParams.delete(key);
  return new PgBoss({
    connectionString: target.toString(),
    ssl: sslSetting(source),
    max: source.maxConnections ?? 4,
    schema: 'pgboss',
    application_name: 'srleagues-worker',
  });
}
