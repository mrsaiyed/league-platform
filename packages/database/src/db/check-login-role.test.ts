// T-60: a login that could see past row-level security is reported.
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
    create role made_up_stranger login;
    create role made_up_owner login;
    grant app_user to made_up_owner;
    grant postgres to made_up_owner;
    create role made_up_admin_only login;
    grant app_user to made_up_admin_only with admin true, inherit false, set false;
  `);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

describe('checkLoginRole', () => {
  it('reports the superuser this test logs in as', async () => {
    expect(await checkLoginRole(db)).toEqual([
      'it is a superuser',
      'it bypasses row-level security',
      'it owns tables in public, or can act as their owner',
    ]);
  });

  it('accepts app_user and a login that is a member of it', async () => {
    expect(await checkLoginRole(db, 'app_user')).toEqual([]);
    expect(await checkLoginRole(db, 'made_up_app_login')).toEqual([]);
  });

  it('reports a login that is not app_user, or can act as the owner', async () => {
    expect(await checkLoginRole(db, 'made_up_stranger')).toEqual([
      'it is not app_user and not a member of app_user',
    ]);
    expect(await checkLoginRole(db, 'made_up_owner')).toEqual([
      'it owns tables in public, or can act as their owner',
    ]);
    expect(await checkLoginRole(db, 'made_up_nobody')).toEqual(['the login role does not exist']);
  });

  it('reports a member of app_user that may not switch to it, as the tables’ owner is', async () => {
    // The membership the role that made app_user holds from PostgreSQL 16 on (step 2.202).
    expect(await checkLoginRole(db, 'made_up_admin_only')).toEqual([
      'it is a member of app_user but may not switch to it (set role)',
    ]);
  });
});
