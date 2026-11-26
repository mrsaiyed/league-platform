// The in-memory store's own promises, the ones the adapter's parallel-call guarantees
// rest on (record 018). The store backed by our tables passes the same: its test,
// packages/database/src/sign-in/database-sign-in-store.test.ts, runs a copy of these
// cases on PGlite (record 052). Change both together.
import { describe, expect, it } from 'vitest';
import { createMemorySignInStore } from './memory-sign-in-store.ts';

const at = new Date(Date.UTC(2026, 10, 13, 12));
const store = () =>
  createMemorySignInStore({ environment: 'test', nodeEnv: 'test', now: () => at });
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

describe('the in-memory sign-in store', () => {
  it('lets each refresh token be used once; a second use reads as old', async () => {
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
    const s = store();
    const claims = await Promise.all([
      s.accounts.claimAccount('a-1'),
      s.accounts.claimAccount('a-1'),
    ]);
    expect(claims.map((c) => c.created).sort()).toEqual([false, true]);
  });

  it('keeps one waiting change of email per account: asking again replaces it (T-455)', async () => {
    const s = store();
    await s.accounts.claimAccount('a-1');
    await s.accounts.claimAccount('a-2');
    const end = new Date(at.getTime() + 10 * 60_000);
    const change = (newEmail: string, codeHash: string) => ({
      newEmail,
      codeHash,
      expiresAt: end,
      attemptsLeft: 2,
    });
    await s.codes.putEmailChange('a-1', change('y@example.com', 'hash-1'));
    await s.codes.putEmailChange('a-1', change('z@example.com', 'hash-2'));
    await s.codes.putEmailChange('a-2', change('z@example.com', 'hash-3'));
    expect(await s.codes.takeEmailChangeAttempt('a-1', at)).toEqual({
      status: 'taken',
      newEmail: 'z@example.com',
      codeHash: 'hash-2',
      attemptsLeft: 1,
    });
    expect(await s.codes.takeEmailChangeAttempt('a-1', at)).toMatchObject({ attemptsLeft: 0 });
    expect(await s.codes.takeEmailChangeAttempt('a-1', at)).toEqual({ status: 'used-up' });
    // Another account's change is its own, untouched.
    expect(await s.codes.takeEmailChangeAttempt('a-2', at)).toMatchObject({
      codeHash: 'hash-3',
      attemptsLeft: 1,
    });
    expect(await s.codes.takeEmailChangeAttempt('a-2', end)).toEqual({ status: 'none' });
    await s.codes.dropEmailChange('a-2');
    expect(await s.codes.takeEmailChangeAttempt('a-2', at)).toEqual({ status: 'none' });
  });

  it('counts code requests per address and per network, and counts none that it refuses', async () => {
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
