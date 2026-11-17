// The two logins a test is given, on a real PostgreSQL (step 2.202): app_login is fit
// for the app (T-60), and the tables' owner, made as Supabase's `postgres` is, is not,
// for each of its reasons, and cannot become app_user.
import { checkLoginRole, withTransaction } from '@srleagues/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  roleFacts,
  sessionFacts,
  setRoleAppUser,
  type RoleFacts,
} from '../../packages/database/src/real-postgres/real-postgres.test-helper.ts';
import { appDatabase, ownerDatabase, ownerSession } from './server.ts';

let owner: RoleFacts;
let app: RoleFacts;
beforeAll(async () => {
  const session = await ownerSession();
  try {
    owner = await roleFacts(session, 'postgres');
    app = await roleFacts(session, 'app_login');
  } finally {
    await session.close();
  }
});

describe('app_login, made as on the test copy on 2026-11-13', () => {
  const db = appDatabase(1);
  afterAll(() => db.close());

  it('passes checkLoginRole', async () => {
    expect(await checkLoginRole(db)).toEqual([]);
  });

  it('has no power of its own, and holds app_user and sign_in_store only', () => {
    expect(app).toEqual({
      superuser: false,
      createRole: false,
      createDatabase: false,
      bypassesFence: false,
      replication: false,
      memberships: [
        { of: 'app_user', admin: false, inherit: true, set: true },
        { of: 'sign_in_store', admin: false, inherit: true, set: true },
      ],
    });
  });

  it('runs every transaction as app_user, as the app does', async () => {
    const facts = await withTransaction(db, {}, sessionFacts);
    expect(facts.role).toBe('app_user');
    expect(facts.leagueId).toBe('');
  });
});

describe('the tables’ owner, made as Supabase’s postgres is', () => {
  it('is not a superuser, may make roles and bypasses the fence, and nothing more', () => {
    expect(owner).toMatchObject({
      superuser: false,
      createRole: true,
      createDatabase: false,
      bypassesFence: true,
      replication: false,
    });
  });

  it('holds the roles it made with ADMIN only: it may not act as them', () => {
    expect(owner.memberships).toEqual([
      { of: 'app_login', admin: true, inherit: false, set: false },
      { of: 'app_user', admin: true, inherit: false, set: false },
      { of: 'sign_in_store', admin: true, inherit: false, set: false },
    ]);
  });

  it('fails checkLoginRole, which names each of its faults', async () => {
    const db = ownerDatabase();
    try {
      expect(await checkLoginRole(db)).toEqual([
        'it bypasses row-level security',
        'it owns tables in public, or can act as their owner',
        'it is a member of app_user but may not switch to it (set role)',
      ]);
    } finally {
      await db.close();
    }
  });

  it('cannot set role app_user', async () => {
    const session = await ownerSession();
    try {
      // 42501: permission denied to set role "app_user".
      expect(await setRoleAppUser(session)).toBe('42501');
    } finally {
      await session.close();
    }
  });

  it('cannot open the app’s transaction either', async () => {
    const db = ownerDatabase();
    try {
      await expect(withTransaction(db, {}, sessionFacts)).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await db.close();
    }
  });
});
