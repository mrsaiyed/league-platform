// The two logins a test is given, on a real PostgreSQL (step 2.202): app_login is fit
// for the app (T-60), and the tables' owner, made as Supabase's `postgres` is, is not,
// for each of its reasons, and cannot become app_user.
import { checkLoginRole, withTransaction } from '@srleagues/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  plantLoginFault,
  roleFacts,
  sessionFacts,
  setRoleAppUser,
  type LoginFault,
  type RoleFacts,
} from '../../packages/database/src/real-postgres/real-postgres.test-helper.ts';
import { appDatabase, fresh, ownerDatabase, ownerSession } from './server.ts';

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
        'postgres bypasses row-level security: alter role postgres nobypassrls',
        'postgres may create roles: alter role postgres nocreaterole',
        expect.stringMatching(
          /^postgres owns tables \(\S+ and \d+ more\), so it could switch their fence off: the app must log in as a role of its own \(as app_login is\), not as the tables’ owner$/,
        ),
        'postgres is a member of app_user but may not switch to it (set role): grant app_user to postgres with set true',
      ]);
    } finally {
      await db.close();
    }
  });

  it('cannot set role app_user', async () => {
    // Its ADMIN-only memberships in app_login, app_user and sign_in_store are reached, but
    // none of those has a power or a table, so none is reported above.
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

// Step 2.202's fix round: the faults an independent review planted, or that it found the
// check did not look for. Each is planted by the tables' owner, the check must name it
// with the statement that takes it away, and once taken away app_login passes again.
describe('a fault planted in what app_login may become', () => {
  const planted: [LoginFault, (word: string) => string[]][] = [
    [
      'may-become-bypass',
      (w) => [
        `app_login may become p_byp_${w}, which bypasses row-level security: revoke p_byp_${w} from app_login`,
      ],
    ],
    [
      'may-become-bypass-deeper',
      (w) => [
        `app_login may become p_byp_${w} through p_mid_${w}, which bypasses row-level security: revoke p_byp_${w} from p_mid_${w}`,
      ],
    ],
    [
      'may-act-as-platform-owner',
      (w) => [
        `app_login may act as p_own_${w}, which owns a table (platform.p_own_${w}_kept): revoke p_own_${w} from app_login`,
        // Step 2.238: the planted table is also one no migration made (the fence check's (d)).
        `platform.p_own_${w}_kept is a table that no migration made, so nothing has checked its fence: drop table platform.p_own_${w}_kept (or make it in a migration)`,
      ],
    ],
    ['may-create-roles', () => ['app_login may create roles: alter role app_login nocreaterole']],
  ];

  for (const [fault, said] of planted) {
    it(`${fault}: refused, naming it; then passes again`, async () => {
      const word = fresh();
      const owner = await ownerSession();
      const db = appDatabase(1);
      try {
        const undo = await plantLoginFault(owner, fault, word);
        try {
          expect(await checkLoginRole(db)).toEqual(said(word));
        } finally {
          await undo();
        }
        expect(await checkLoginRole(db)).toEqual([]);
      } finally {
        await db.close();
        await owner.close();
      }
    });
  }
});
