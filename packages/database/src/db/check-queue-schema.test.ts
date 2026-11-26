// T-257 (record 053), T-490: after every migration the job queue's schema is there, owned
// by queue_owner; the worker's login (app_user and queue_owner) may run pg-boss in it and
// starts again after pg-boss made its tables; the website's login reaches none of it.
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshSchema } from '../schema/schema.test-helper.ts';
import { checkLoginRole, checkWorkerLoginRole } from './check-login-role.ts';
import { checkQueueSchema } from './check-queue-schema.ts';
import { createDatabase } from './create-database.ts';
import type { DatabaseHandle } from './database-handle.ts';

const migration = readFileSync(
  new URL(
    '../../../../supabase/migrations/0031_the_job_queue_has_its_own_owner.sql',
    import.meta.url,
  ),
  'utf8',
);

let pglite: PGlite;
let db: DatabaseHandle;
beforeAll(async () => {
  pglite = await freshSchema();
  // The hosted database's set-up, by hand (step 2.95's procedures): the worker's login
  // holds app_user and queue_owner, the website's app_user only.
  await pglite.exec(`
    create role made_up_worker_login login;
    create role made_up_web_login login;
    create role made_up_create_only_login login;
    create role made_up_middle nologin;
    grant app_user to made_up_worker_login, made_up_web_login, made_up_create_only_login;
    grant queue_owner to made_up_worker_login;
  `);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

/** The statement a sentence ends with. */
const statementOf = (problem: string) => problem.slice(problem.lastIndexOf(': ') + 2);

const notUsable = [
  'the login role may not use the pgboss schema (grant it queue_owner)',
  'the login role may not make tables in the pgboss schema (grant it queue_owner)',
];

describe('the job queue’s schema after every migration (0031)', () => {
  it('is owned by queue_owner, a role with no login and no powers, and open to nobody else', async () => {
    const { rows } = await pglite.query<Record<string, unknown>>(`
      select pg_get_userbyid(n.nspowner) as owner, n.nspacl::text as acl,
        r.rolcanlogin, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication,
        r.rolbypassrls,
        (select count(*)::int from pg_auth_members m where m.roleid = r.oid
           and m.member <> 'made_up_worker_login'::regrole) as other_members
      from pg_namespace n, pg_roles r
      where n.nspname = 'pgboss' and r.rolname = 'queue_owner'`);
    expect(rows).toEqual([
      {
        owner: 'queue_owner',
        acl: '{queue_owner=UC/queue_owner}',
        rolcanlogin: false,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
        rolbypassrls: false,
        // The migrations' user revoked its own membership; no login was granted it.
        other_members: 0,
      },
    ]);
  });

  it('runs again without error, and changes nothing', async () => {
    await pglite.exec(migration);
    await pglite.exec(migration);
    expect(await checkQueueSchema(db, 'made_up_worker_login')).toEqual([]);
    expect(await checkQueueSchema(db, 'made_up_web_login')).toEqual(notUsable);
  });
});

describe('checkQueueSchema (the worker, T-257)', () => {
  it('passes for a login granted queue_owner and app_user, and reports one granted app_user only', async () => {
    expect(await checkQueueSchema(db, 'made_up_worker_login')).toEqual([]);
    expect(await checkQueueSchema(db, 'made_up_web_login')).toEqual(notUsable);
    expect(await checkQueueSchema(db, 'app_user')).toEqual(notUsable);
  });

  it('reports a login that may make tables there but not use them', async () => {
    await pglite.exec(`grant create on schema pgboss to made_up_create_only_login;`);
    expect(await checkQueueSchema(db, 'made_up_create_only_login')).toEqual([notUsable[0]]);
    await pglite.exec(`revoke create on schema pgboss from made_up_create_only_login;`);
  });

  it('reports the schema owned by another role than queue_owner', async () => {
    await pglite.exec('alter schema pgboss owner to made_up_middle');
    const said = await checkQueueSchema(db, 'made_up_worker_login');
    expect(said).toEqual([
      'the pgboss schema is owned by made_up_middle, not queue_owner: grant queue_owner to current_user with set true; alter schema pgboss owner to queue_owner; revoke queue_owner from current_user',
      ...notUsable,
    ]);
    await pglite.exec(statementOf(said[0] ?? ''));
    expect(await checkQueueSchema(db, 'made_up_worker_login')).toEqual([]);
  });
});

describe('the worker’s login (checkWorkerLoginRole, T-490)', () => {
  it('starts, and starts again after pg-boss made its tables, as its own login', async () => {
    expect(await checkWorkerLoginRole(db, 'made_up_worker_login')).toEqual([]);
    // What pg-boss does at its first start: tables owned by the login that makes them.
    await pglite.exec(`
      set role made_up_worker_login;
      create table pgboss.job (id uuid primary key, name text, data jsonb);
      create table pgboss.version (version int);
      reset role;
      set role queue_owner;
      create table pgboss.queue (name text);
      reset role;`);
    expect(await checkWorkerLoginRole(db, 'made_up_worker_login')).toEqual([]);
    expect(await checkQueueSchema(db, 'made_up_worker_login')).toEqual([]);
  });

  it('is still refused for any table it or queue_owner owns outside the queue’s schema (T-60)', async () => {
    await pglite.exec(`
      create table public.made_up_kept (id uuid);
      alter table public.made_up_kept owner to made_up_worker_login;`);
    expect(await checkWorkerLoginRole(db, 'made_up_worker_login')).toContainEqual(
      'made_up_worker_login owns a table (public.made_up_kept), so it could switch its fence off: reassign owned by made_up_worker_login to postgres',
    );
    await pglite.exec('alter table public.made_up_kept owner to queue_owner');
    expect(await checkWorkerLoginRole(db, 'made_up_worker_login')).toContainEqual(
      'made_up_worker_login may become queue_owner, which owns a table (public.made_up_kept): revoke queue_owner from made_up_worker_login',
    );
    await pglite.exec('drop table public.made_up_kept');
    expect(await checkWorkerLoginRole(db, 'made_up_worker_login')).toEqual([]);
  });

  it('is the website’s check otherwise: the same login is refused as the website’s', async () => {
    const said = await checkLoginRole(db, 'made_up_worker_login');
    expect(said).toContainEqual(
      'made_up_worker_login owns tables (pgboss.job and 1 more), so it could switch their fence off: reassign owned by made_up_worker_login to postgres',
    );
    expect(said).toContainEqual(
      'made_up_worker_login is a member of queue_owner, which owns the job queue (the pgboss schema), and the website must never read or change a queued job: revoke queue_owner from made_up_worker_login',
    );
    await pglite.exec('drop table pgboss.job, pgboss.version, pgboss.queue');
  });
});

describe('the website’s login reaches nothing of the job queue (checkLoginRole, T-490)', () => {
  it('passes as a member of app_user only, and cannot use the schema', async () => {
    expect(await checkLoginRole(db, 'made_up_web_login')).toEqual([]);
    const { rows } = await pglite.query<{ can_use: boolean }>(
      `select has_schema_privilege('made_up_web_login', 'pgboss', 'USAGE') as can_use`,
    );
    expect(rows).toEqual([{ can_use: false }]);
  });

  it('refuses a member of queue_owner, directly, in plain words with the mending statement', async () => {
    await pglite.exec('grant queue_owner to made_up_web_login with inherit false, set false');
    const said = await checkLoginRole(db, 'made_up_web_login');
    expect(said).toEqual([
      'made_up_web_login is a member of queue_owner, which owns the job queue (the pgboss schema), and the website must never read or change a queued job: revoke queue_owner from made_up_web_login',
    ]);
    await pglite.exec(statementOf(said[0] ?? ''));
    expect(await checkLoginRole(db, 'made_up_web_login')).toEqual([]);
  });

  it('refuses a member of queue_owner through another role', async () => {
    await pglite.exec(`
      grant queue_owner to made_up_middle;
      grant made_up_middle to made_up_web_login;`);
    const said = await checkLoginRole(db, 'made_up_web_login');
    expect(said).toEqual([
      'made_up_web_login is a member of queue_owner through made_up_middle, which owns the job queue (the pgboss schema), and the website must never read or change a queued job: revoke made_up_middle from made_up_web_login',
    ]);
    // T-496: the way is cut at the website's end; the middle role keeps its own membership.
    await pglite.exec(statementOf(said[0] ?? ''));
    expect(await checkLoginRole(db, 'made_up_web_login')).toEqual([]);
    await pglite.exec('revoke queue_owner from made_up_middle');
  });

  it('refuses any other right on the schema: its own, a role’s it reaches, or everyone’s', async () => {
    await pglite.exec(`
      grant usage on schema pgboss to made_up_web_login, public;
      grant create on schema pgboss to app_user;`);
    const said = await checkLoginRole(db, 'made_up_web_login');
    expect(said).toEqual([
      'app_user, made_up_web_login, public may use the job queue (the pgboss schema), so made_up_web_login could read or change a queued job: grant queue_owner to current_user with set true; set role queue_owner; revoke all on schema pgboss from app_user, made_up_web_login, public cascade; reset role; revoke queue_owner from current_user',
    ]);
    await pglite.exec(statementOf(said[0] ?? ''));
    expect(await checkLoginRole(db, 'made_up_web_login')).toEqual([]);
  });

  it('refuses the schema owned by a role it reaches', async () => {
    await pglite.exec('alter schema pgboss owner to made_up_web_login');
    const said = await checkLoginRole(db, 'made_up_web_login');
    expect(said[0]).toBe(
      'made_up_web_login owns the job queue (the pgboss schema), and the website must never read or change a queued job: grant queue_owner to current_user with set true; alter schema pgboss owner to queue_owner; revoke queue_owner from current_user',
    );
    await pglite.exec(statementOf(said[0] ?? ''));
    expect(await checkLoginRole(db, 'made_up_web_login')).toEqual([]);
  });
});

describe('the migration where its user is not a superuser (the audit of 2.110, H3)', () => {
  it('makes the role and the schema, runs twice, and leaves its user no way to the queue', async () => {
    await pglite.exec(`
      drop schema pgboss cascade;
      revoke queue_owner from made_up_worker_login;
      drop role queue_owner;
      create role made_up_migrator createrole;
      grant create on database postgres to made_up_migrator;
    `);
    expect(await checkQueueSchema(db, 'made_up_worker_login')).toEqual([
      'the pgboss schema does not exist (the release makes it, record 053)',
    ]);
    await pglite.exec(`set role made_up_migrator; ${migration} ${migration} reset role;`);
    const { rows } = await pglite.query<Record<string, unknown>>(`
      select pg_get_userbyid(n.nspowner) as owner, n.nspacl::text as acl,
        pg_has_role('made_up_migrator', 'queue_owner', 'USAGE') as migrator_uses,
        pg_has_role('made_up_migrator', 'queue_owner', 'SET') as migrator_sets
      from pg_namespace n where n.nspname = 'pgboss'`);
    expect(rows).toEqual([
      {
        owner: 'queue_owner',
        acl: '{queue_owner=UC/queue_owner}',
        migrator_uses: false,
        migrator_sets: false,
      },
    ]);
    await pglite.exec('grant queue_owner to made_up_worker_login');
    expect(await checkQueueSchema(db, 'made_up_worker_login')).toEqual([]);
    expect(await checkWorkerLoginRole(db, 'made_up_worker_login')).toEqual([]);
  });
});
