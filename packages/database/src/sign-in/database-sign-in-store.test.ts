// The production sign-in store on PGlite (record 052). The first block is the
// in-memory store's own cases (packages/providers/src/sign-in/supabase/
// memory-sign-in-store.test.ts), copied as they are: the promises the adapter's
// parallel-call guarantees rest on (record 018). Keep the two in step. The rest is
// what only a store in the database must do: keep everything across a restart, run
// as sign_in_store, and keep the counts the in-memory store's limiter keeps.
//
// PGlite has one connection, so two calls at once run one after the other here; on
// PostgreSQL the row and advisory locks make the second wait for the first. Not
// verified until a test runs against a real server.
import type { PGlite } from '@electric-sql/pglite';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { signInTransactionOf, withSignInTransaction } from '../db/sign-in-transaction.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { freshSchema } from '../schema/schema.test-helper.ts';
import { createDatabaseSignInStore } from './database-sign-in-store.ts';

let pglite: PGlite;
let db: DatabaseHandle;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

/** Each case starts from empty tables, as each in-memory case starts from a new store. */
async function emptyTables() {
  await pglite.exec(`
    delete from sign_in.refresh_tokens; delete from sign_in.sessions;
    delete from sign_in.devices; delete from sign_in.users;
    delete from sign_in.codes; delete from sign_in.proofs;
    delete from sign_in.code_requests; delete from sign_in.guesses; delete from sign_in.guess_locks;
  `);
}

let clock = new Date(Date.UTC(2026, 10, 13, 12));
const at = new Date(Date.UTC(2026, 10, 13, 12));
const store = () => createDatabaseSignInStore({ db, now: () => clock });
const session = {
  sessionId: 's-1',
  accountId: 'a-1',
  deviceLabel: 'Firefox on Windows',
  signedInAt: at,
  lastActiveAt: at,
  lastSignInAt: at,
  passwordEnteredAt: at,
  accessTokenHash: 'access-1',
  accessExpiresAt: new Date(at.getTime() + 60 * 60_000),
  refreshTokenHash: 'refresh-1',
  ended: false,
};

describe('the database sign-in store: the in-memory store’s cases', () => {
  beforeAll(() => {
    clock = at;
  });

  it('lets each refresh token be used once; a second use reads as old', async () => {
    await emptyTables();
    const s = store();
    await s.sessions.addSession(session);
    const [first, second] = await Promise.all([
      s.sessions.useRefreshToken('refresh-1'),
      s.sessions.useRefreshToken('refresh-1'),
    ]);
    expect(first.status).toBe('current');
    expect(second.status).toBe('old');
    expect((await s.sessions.useRefreshToken('nothing')).status).toBe('unknown');
  });

  it('gives a released refresh token back, and retires it on renewal', async () => {
    await emptyTables();
    const s = store();
    await s.sessions.addSession(session);
    await s.sessions.useRefreshToken('refresh-1');
    await s.sessions.releaseRefreshToken('refresh-1');
    expect((await s.sessions.useRefreshToken('refresh-1')).status).toBe('current');
    await s.sessions.renewSession('s-1', {
      accessTokenHash: 'access-2',
      accessExpiresAt: session.accessExpiresAt,
      refreshTokenHash: 'refresh-2',
      at,
    });
    expect((await s.sessions.useRefreshToken('refresh-1')).status).toBe('old');
    expect(await s.sessions.sessionByAccessToken('access-1')).toBeUndefined();
    expect((await s.sessions.sessionByAccessToken('access-2'))?.sessionId).toBe('s-1');
  });

  it('hands a proof to one of two callers at once', async () => {
    await emptyTables();
    const s = store();
    const proof = {
      email: 'ana@example.test',
      accountId: 'a-1',
      expiresAt: new Date(at.getTime() + 60_000),
      supabase: { accessToken: 'x', refreshToken: 'y', accessExpiresAt: at, sessionId: 's-1' },
    };
    await s.codes.putProof('p-1', proof);
    const taken = await Promise.all([s.codes.takeProof('p-1', at), s.codes.takeProof('p-1', at)]);
    expect(taken.filter(Boolean)).toHaveLength(1);
  });

  it('hands one of two proofs for one address to one caller, and keeps other addresses’', async () => {
    await emptyTables();
    const s = store();
    const proof = (email: string) => ({
      email,
      accountId: 'a-1',
      expiresAt: new Date(at.getTime() + 60_000),
      supabase: { accessToken: 'x', refreshToken: 'y', accessExpiresAt: at, sessionId: 's-1' },
    });
    await s.codes.putProof('p-1', proof('ana@example.test'));
    await s.codes.putProof('p-2', proof('ana@example.test'));
    await s.codes.putProof('p-3', proof('ben@example.test'));
    const taken = await Promise.all([s.codes.takeProof('p-1', at), s.codes.takeProof('p-2', at)]);
    expect(taken.filter(Boolean)).toHaveLength(1);
    expect(await s.codes.peekProof('p-3', at)).toBeDefined();
  });

  it('forgets proofs that have run out, with the tokens they hold', async () => {
    await emptyTables();
    const s = store();
    const proof = {
      email: 'ana@example.test',
      accountId: 'a-1',
      expiresAt: new Date(at.getTime() + 60_000),
      supabase: { accessToken: 'x', refreshToken: 'y', accessExpiresAt: at, sessionId: 's-1' },
    };
    await s.codes.putProof('p-1', proof);
    const later = new Date(at.getTime() + 60_000);
    expect(await s.codes.peekProof('p-1', later)).toBeUndefined();
    // Gone, not just hidden: an earlier time does not bring it back.
    expect(await s.codes.takeProof('p-1', at)).toBeUndefined();
  });

  it('claims an account for exactly one caller', async () => {
    await emptyTables();
    const s = store();
    const claims = await Promise.all([
      s.accounts.claimAccount('a-1'),
      s.accounts.claimAccount('a-1'),
    ]);
    expect(claims.map((c) => c.created).sort()).toEqual([false, true]);
  });

  it('counts code requests per address and per network, and counts none that it refuses', async () => {
    await emptyTables();
    const s = store();
    const ask = (email: string) =>
      s.limits.countCodeRequest({ email, network: '192.0.2.1', perEmail: 2, perNetwork: 3 });
    expect(await ask('a@example.test')).toBeNull();
    expect(await ask('a@example.test')).toBeNull();
    expect(await ask('a@example.test')).toEqual({ retryAfterSeconds: 3600 });
    expect(await ask('b@example.test')).toBeNull();
    expect(await ask('c@example.test')).toEqual({ retryAfterSeconds: 3600 });
  });
});

const limits = { windowMinutes: 15, slowAfter: 2, slowSeconds: 30, lockAfter: 3, lockMinutes: 15 };
const wide = { windowMinutes: 15, slowAfter: 100, slowSeconds: 5, lockAfter: 200, lockMinutes: 15 };
const minutes = (n: number) => new Date(at.getTime() + n * 60_000);

describe('the database sign-in store: what only the database can do', () => {
  it('keeps everything across a restart: a new store on the same database sees it', async () => {
    await emptyTables();
    clock = at;
    const before = store();
    await before.accounts.claimAccount('a-1');
    await before.accounts.setHasPassword('a-1');
    expect(await before.accounts.rememberDevice('a-1', 'device-1')).toBe(true);
    await before.sessions.addSession(session);
    await before.codes.putCode('ana@example.test', {
      verifyType: 'signup',
      expiresAt: minutes(10),
      attemptsLeft: 5,
    });

    const after = store();
    expect(await after.accounts.accountExists('a-1')).toBe(true);
    expect(await after.accounts.hasPassword('a-1')).toBe(true);
    expect(await after.accounts.rememberDevice('a-1', 'device-1')).toBe(false);
    expect((await after.sessions.liveSessionsOf('a-1')).map((x) => x.sessionId)).toEqual(['s-1']);
    expect(await after.codes.takeCodeAttempt('ana@example.test', at)).toEqual({
      status: 'taken',
      verifyType: 'signup',
      attemptsLeft: 4,
    });
  });

  it('takes code attempts until they are used up, and none once the code has run out', async () => {
    await emptyTables();
    const s = store();
    await s.codes.putCode('ana@example.test', {
      verifyType: null,
      expiresAt: minutes(10),
      attemptsLeft: 1,
    });
    expect(await s.codes.takeCodeAttempt('ana@example.test', at)).toEqual({
      status: 'taken',
      verifyType: null,
      attemptsLeft: 0,
    });
    expect(await s.codes.takeCodeAttempt('ana@example.test', at)).toEqual({ status: 'used-up' });
    expect(await s.codes.takeCodeAttempt('ana@example.test', minutes(10))).toEqual({
      status: 'none',
    });
    expect(await s.codes.takeCodeAttempt('ben@example.test', at)).toEqual({ status: 'none' });
    await s.codes.dropProofsFor('ana@example.test');
    expect(await s.codes.takeCodeAttempt('ana@example.test', at)).toEqual({ status: 'none' });
  });

  it('slows, then locks, wrong guesses per address, and a right one clears the address', async () => {
    await emptyTables();
    clock = at;
    const s = store();
    const guess = () =>
      s.limits.reserveGuess({
        email: 'ana@example.test',
        network: '192.0.2.1',
        perEmail: limits,
        perNetwork: wide,
      });
    expect(await guess()).toHaveProperty('ticket');
    expect(await guess()).toHaveProperty('ticket');
    // Two wrong: each try now waits 30 seconds after the last.
    expect(await guess()).toEqual({ retryAfterSeconds: 30 });
    clock = new Date(at.getTime() + 30_000);
    const third = await guess();
    expect(third).toHaveProperty('ticket');
    // Three wrong: locked for 15 minutes from the third.
    clock = new Date(at.getTime() + 60_000);
    expect(await guess()).toEqual({ retryAfterSeconds: 15 * 60 - 30 });
    // Taking the third back (no code to check) lifts the lock it set.
    if ('ticket' in third) await s.limits.cancelGuess(third.ticket);
    clock = new Date(at.getTime() + 90_000);
    const right = await guess();
    expect(right).toHaveProperty('ticket');
    if ('ticket' in right) await s.limits.forgiveGuess(right.ticket);
    // Forgiven: the address's guesses are gone, so it is not slowed.
    expect(await guess()).toHaveProperty('ticket');
    await s.limits.clearGuesses('ana@example.test');
    expect(await guess()).toHaveProperty('ticket');
  });

  it('counts guesses per network whatever the address, and a lock runs out', async () => {
    await emptyTables();
    clock = at;
    const s = store();
    const guess = (email: string | null) =>
      s.limits.reserveGuess({ email, network: '198.51.100.7', perEmail: wide, perNetwork: limits });
    expect(await guess('a@example.test')).toHaveProperty('ticket');
    clock = minutes(1);
    expect(await guess(null)).toHaveProperty('ticket');
    clock = minutes(2);
    expect(await guess('b@example.test')).toHaveProperty('ticket');
    clock = minutes(3);
    expect(await guess('c@example.test')).toEqual({ retryAfterSeconds: 14 * 60 });
    clock = minutes(17);
    expect(await guess('c@example.test')).toHaveProperty('ticket');
  });

  it('ends sessions, keeps one when asked, and lists only live ones', async () => {
    await emptyTables();
    const s = store();
    const other = (id: string) => ({
      ...session,
      sessionId: id,
      accessTokenHash: `access-${id}`,
      refreshTokenHash: `refresh-${id}`,
    });
    await s.sessions.addSession(other('s-1'));
    await s.sessions.addSession(other('s-2'));
    await s.sessions.addSession(other('s-3'));
    expect(await s.sessions.endSession('s-1')).toBe(true);
    expect(await s.sessions.endSession('s-1')).toBe(false);
    expect(await s.sessions.endSessionsOf('a-1', 's-3')).toBe(1);
    expect((await s.sessions.liveSessionsOf('a-1')).map((x) => x.sessionId)).toEqual(['s-3']);
    await s.sessions.touchSession('s-3', minutes(5));
    await s.sessions.passwordEntered('s-3', minutes(6));
    expect(await s.sessions.sessionByAccessToken('access-s-3')).toMatchObject({
      lastActiveAt: minutes(5),
      passwordEnteredAt: minutes(6),
      lastSignInAt: minutes(6),
      ended: false,
    });
    expect(await s.sessions.endSessionsOf('a-1')).toBe(1);
    expect(await s.sessions.liveSessionsOf('a-1')).toEqual([]);
  });

  it('runs as sign_in_store, which reaches no table of the app', async () => {
    const who = await withSignInTransaction(db, async (scope) => {
      const { rows } = await sql<{
        role: string;
      }>`select current_user as role`.execute(signInTransactionOf(scope));
      return rows[0]?.role;
    });
    expect(who).toBe('sign_in_store');
    await expect(
      withSignInTransaction(db, (scope) =>
        sql`select count(*) from public.accounts`.execute(signInTransactionOf(scope)),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('refuses to open inside another transaction', async () => {
    await expect(
      withTransaction(db, {}, () =>
        withSignInTransaction(db, async () => undefined).then(() => undefined),
      ),
    ).rejects.toThrow('inside another transaction');
  });
});
