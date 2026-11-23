// T-60: a login that could see past row-level security is reported, whether by its own
// powers or by a role it may become, at any depth (step 2.202's fix round).
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshSchema } from '../schema/schema.test-helper.ts';
import { checkLoginRole } from './check-login-role.ts';
import { createDatabase } from './create-database.ts';
import type { DatabaseHandle } from './database-handle.ts';

let pglite: PGlite;
let db: DatabaseHandle;
beforeAll(async () => {
  pglite = await freshSchema();
  await pglite.exec(`
    create role made_up_app_login login;
    grant app_user to made_up_app_login;
    grant sign_in_store to made_up_app_login;
    create role made_up_stranger login;
    create role made_up_owner login;
    grant app_user to made_up_owner;
    grant postgres to made_up_owner;
    create role made_up_admin_only login;
    grant app_user to made_up_admin_only with admin true, inherit false, set false;

    create role made_up_bypass nologin bypassrls;
    grant app_user to made_up_bypass;
    create role made_up_via login;
    grant made_up_bypass to made_up_via;
    create role made_up_middle nologin;
    grant made_up_bypass to made_up_middle;
    create role made_up_deep login;
    grant app_user to made_up_deep;
    grant made_up_middle to made_up_deep;
    create role made_up_inert login;
    grant app_user to made_up_inert;
    grant made_up_bypass to made_up_inert with admin false, inherit false, set false;
    create role made_up_may_grant login;
    grant app_user to made_up_may_grant;
    grant made_up_bypass to made_up_may_grant with admin true, inherit false, set false;

    create role made_up_platform_owner nologin;
    create table platform.made_up_kept (id int);
    alter table platform.made_up_kept owner to made_up_platform_owner;
    create role made_up_platform_login login;
    grant app_user to made_up_platform_login;
    grant made_up_platform_owner to made_up_platform_login with inherit true, set false;
    create schema made_up_later;
    create role made_up_later_owner nologin;
    create table made_up_later.one (id int);
    create table made_up_later.two (id int);
    alter table made_up_later.one owner to made_up_later_owner;
    alter table made_up_later.two owner to made_up_later_owner;
    create role made_up_later_login login;
    grant app_user to made_up_later_login;
    grant made_up_later_owner to made_up_later_login;
    create role made_up_sign_in_owner login;
    grant app_user to made_up_sign_in_owner;
    alter table sign_in.users owner to made_up_sign_in_owner;

    create role made_up_powers login createrole createdb replication;
    grant app_user to made_up_powers;
    create role made_up_super nologin superuser;
    create role made_up_super_login login;
    grant app_user to made_up_super_login;
    grant made_up_super to made_up_super_login;
  `);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

describe('checkLoginRole', () => {
  it('reports the superuser this test logs in as, each power with its own statement', async () => {
    expect(await checkLoginRole(db)).toEqual([
      'postgres is a superuser: alter role postgres nosuperuser',
      'postgres bypasses row-level security: alter role postgres nobypassrls',
      'postgres may create roles: alter role postgres nocreaterole',
      'postgres may create databases: alter role postgres nocreatedb',
      'postgres may start replication: alter role postgres noreplication',
      expect.stringMatching(
        /^postgres owns tables \(\S+ and \d+ more\), so it could switch their fence off: the app must log in as a role of its own \(as app_login is\), not as the tables’ owner$/,
      ),
    ]);
  });

  it('accepts app_user and a login that is a member of app_user and sign_in_store', async () => {
    // The memberships the product gives its login on purpose (record 052, T-60).
    expect(await checkLoginRole(db, 'app_user')).toEqual([]);
    expect(await checkLoginRole(db, 'made_up_app_login')).toEqual([]);
  });

  it('reports a login that is not app_user, or can become the owner', async () => {
    expect(await checkLoginRole(db, 'made_up_stranger')).toEqual([
      'made_up_stranger is not app_user and cannot become it: grant app_user to made_up_stranger',
    ]);
    expect(await checkLoginRole(db, 'made_up_owner')).toEqual([
      expect.stringMatching(
        /^made_up_owner may become postgres, which is a superuser, bypasses row-level security, may create roles, may create databases, may start replication and owns tables \(\S+ and \d+ more\): revoke postgres from made_up_owner$/,
      ),
    ]);
    expect(await checkLoginRole(db, 'made_up_nobody')).toEqual(['the login role does not exist']);
  });

  it('reports a member of app_user that may not switch to it, as the tables’ owner is', async () => {
    // The membership the role that made app_user holds from PostgreSQL 16 on (step 2.202).
    expect(await checkLoginRole(db, 'made_up_admin_only')).toEqual([
      'made_up_admin_only is a member of app_user but may not switch to it (set role): grant app_user to made_up_admin_only with set true',
    ]);
  });

  it('reports a role the login may become that bypasses the fence, directly or deeper', async () => {
    // The reviewer's plant on the real server: app_user reached through the bypassing role.
    expect(await checkLoginRole(db, 'made_up_via')).toEqual([
      'made_up_via may become made_up_bypass, which bypasses row-level security: revoke made_up_bypass from made_up_via',
    ]);
    expect(await checkLoginRole(db, 'made_up_deep')).toEqual([
      'made_up_deep may become made_up_bypass through made_up_middle, which bypasses row-level security: revoke made_up_bypass from made_up_middle',
    ]);
    expect(await checkLoginRole(db, 'made_up_super_login')).toEqual([
      'made_up_super_login may become made_up_super, which is a superuser: revoke made_up_super from made_up_super_login',
    ]);
  });

  it('reads each membership’s SET and ADMIN options, from PostgreSQL 16 on', async () => {
    // A membership with neither lets the login neither become the role nor grant it.
    expect(await checkLoginRole(db, 'made_up_inert')).toEqual([]);
    // ADMIN lets it grant itself the role with SET, so it counts.
    expect(await checkLoginRole(db, 'made_up_may_grant')).toEqual([
      'made_up_may_grant may become made_up_bypass, which bypasses row-level security: revoke made_up_bypass from made_up_may_grant',
    ]);
  });

  it('counts any membership on an older server, which keeps no options', async () => {
    expect(await checkLoginRole(db, 'made_up_inert', false)).toEqual([
      'made_up_inert may become made_up_bypass, which bypasses row-level security: revoke made_up_bypass from made_up_inert',
    ]);
  });

  it('reports a table owned in any schema but the server’s own, by the login or a role it reaches', async () => {
    expect(await checkLoginRole(db, 'made_up_platform_login')).toEqual([
      'made_up_platform_login may act as made_up_platform_owner, which owns a table (platform.made_up_kept): revoke made_up_platform_owner from made_up_platform_login',
    ]);
    expect(await checkLoginRole(db, 'made_up_later_login')).toEqual([
      'made_up_later_login may become made_up_later_owner, which owns tables (made_up_later.one and 1 more): revoke made_up_later_owner from made_up_later_login',
    ]);
    expect(await checkLoginRole(db, 'made_up_sign_in_owner')).toEqual([
      'made_up_sign_in_owner owns a table (sign_in.users), so it could switch its fence off: reassign owned by made_up_sign_in_owner to postgres',
    ]);
  });

  it('reports each power a plain login must not have, with its own statement', async () => {
    expect(await checkLoginRole(db, 'made_up_powers')).toEqual([
      'made_up_powers may create roles: alter role made_up_powers nocreaterole',
      'made_up_powers may create databases: alter role made_up_powers nocreatedb',
      'made_up_powers may start replication: alter role made_up_powers noreplication',
    ]);
  });
});
