// THE IN-MEMORY STORE FOR THE SUPABASE ADAPTER. FOR DEVELOPMENT AND TESTS ONLY.
//
// It keeps everything in this process and forgets it on restart (everyone would be
// signed out, and every device would look new), and two web servers would each keep
// their own. Production needs the store backed by our own tables (record 018). Each
// method finishes before it returns and awaits nothing, so each is atomic.
import { randomUUID } from 'node:crypto';
import type { AttemptLimits } from '../sign-in-settings.ts';
import { createAttemptLimiter, type AttemptLimiter } from '../local/attempt-limiter.ts';
import type {
  HeldProof,
  PendingCode,
  StoredSession,
  SupabaseSignInStore,
} from './sign-in-store.ts';

export type MemorySignInStoreOptions = {
  /** Anything else is refused at start. */
  readonly environment: 'development' | 'test';
  /** The NODE_ENV the app's config module read (T-30). "production" is refused. */
  readonly nodeEnv: string | undefined;
  readonly now?: () => Date;
};

const hour = 60 * 60_000;

type Session = {
  -readonly [K in keyof StoredSession]: StoredSession[K];
} & { refreshTokenHash: string; usedRefreshHashes: Set<string> };

type Ticket = {
  readonly undoNetwork: () => void;
  readonly undoEmail: () => void;
  readonly email: string | null;
};

export function createMemorySignInStore(options: MemorySignInStoreOptions): SupabaseSignInStore {
  if (
    (options.environment !== 'development' && options.environment !== 'test') ||
    options.nodeEnv === 'production'
  ) {
    throw new Error('The in-memory sign-in store is for development and tests only.');
  }
  const now = options.now ?? (() => new Date());

  const codeRequests = { email: new Map<string, number[]>(), network: new Map<string, number[]>() };
  const limiters = new Map<string, AttemptLimiter>();
  const emailLimiterKeys = new Set<string>();
  const tickets = new Map<string, Ticket>();
  const codes = new Map<string, PendingCode & { attemptsLeft: number }>();
  const proofs = new Map<string, HeldProof>();
  const accounts = new Map<string, { hasPassword: boolean; devices: Set<string> }>();
  const sessions = new Map<string, Session>();
  const byAccess = new Map<string, Session>();
  const byRefresh = new Map<string, Session>();

  /** One limiter per scope and set of numbers; the numbers do not change while running. */
  const limiter = (scope: 'email' | 'network', limits: AttemptLimits) => {
    const key = `${scope}:${JSON.stringify(limits)}`;
    let found = limiters.get(key);
    if (!found) {
      found = createAttemptLimiter(limits, now);
      limiters.set(key, found);
      if (scope === 'email') emailLimiterKeys.add(key);
    }
    return found;
  };

  /** Seconds to wait if `key` has had `limit` requests in the last hour, else null. */
  const hourlyWait = (counts: Map<string, number[]>, key: string, limit: number) => {
    const at = now().getTime();
    const recent = (counts.get(key) ?? []).filter((t) => at - t < hour);
    counts.set(key, recent);
    const oldest = recent[0];
    if (oldest === undefined || recent.length < limit) return null;
    return Math.max(1, Math.ceil((oldest + hour - at) / 1000));
  };

  const snapshot = (s: Session): StoredSession => ({
    sessionId: s.sessionId,
    accountId: s.accountId,
    deviceLabel: s.deviceLabel,
    signedInAt: s.signedInAt,
    lastActiveAt: s.lastActiveAt,
    lastSignInAt: s.lastSignInAt,
    passwordEnteredAt: s.passwordEnteredAt,
    accessTokenHash: s.accessTokenHash,
    accessExpiresAt: s.accessExpiresAt,
    ended: s.ended,
  });

  const account = (accountId: string) => {
    let found = accounts.get(accountId);
    if (!found) {
      found = { hasPassword: false, devices: new Set() };
      accounts.set(accountId, found);
    }
    return found;
  };

  return {
    limits: {
      async countCodeRequest({ email, network, perEmail, perNetwork }) {
        const waits = [
          hourlyWait(codeRequests.email, email, perEmail),
          hourlyWait(codeRequests.network, network, perNetwork),
        ].filter((w) => w !== null);
        if (waits.length) return { retryAfterSeconds: Math.max(...waits) };
        const at = now().getTime();
        codeRequests.email.get(email)?.push(at);
        codeRequests.network.get(network)?.push(at);
        return null;
      },
      async reserveGuess({ email, network, perEmail, perNetwork }) {
        const byNetwork = limiter('network', perNetwork);
        const byEmail = limiter('email', perEmail);
        const checks = [byNetwork.check(network)];
        if (email !== null) checks.push(byEmail.check(email));
        const waits = checks.flatMap((c) => (c.allowed ? [] : [c.retryAfterSeconds]));
        if (waits.length) return { retryAfterSeconds: Math.max(...waits) };
        const undoNetwork = byNetwork.recordFailure(network);
        const undoEmail = email === null ? () => {} : byEmail.recordFailure(email);
        const ticket = randomUUID();
        tickets.set(ticket, { undoNetwork, undoEmail, email });
        return { ticket };
      },
      async forgiveGuess(ticket) {
        const held = tickets.get(ticket);
        tickets.delete(ticket);
        if (!held) return;
        held.undoNetwork();
        if (held.email !== null) {
          for (const key of emailLimiterKeys) limiters.get(key)?.clear(held.email);
        }
      },
      async cancelGuess(ticket) {
        const held = tickets.get(ticket);
        tickets.delete(ticket);
        held?.undoNetwork();
        held?.undoEmail();
      },
      async clearGuesses(email) {
        for (const key of emailLimiterKeys) limiters.get(key)?.clear(email);
      },
    },

    codes: {
      async putCode(email, code) {
        codes.set(email, { ...code });
      },
      async takeCodeAttempt(email, at) {
        const pending = codes.get(email);
        if (!pending || at.getTime() >= pending.expiresAt.getTime()) return { status: 'none' };
        if (pending.attemptsLeft <= 0) return { status: 'used-up' };
        pending.attemptsLeft--;
        return {
          status: 'taken',
          verifyType: pending.verifyType,
          attemptsLeft: pending.attemptsLeft,
        };
      },
      async dropCode(email) {
        codes.delete(email);
      },
      async putProof(proofHash, proof) {
        proofs.set(proofHash, proof);
      },
      async peekProof(proofHash, at) {
        const proof = proofs.get(proofHash);
        return proof && at.getTime() < proof.expiresAt.getTime() ? proof : undefined;
      },
      async takeProof(proofHash, at) {
        const proof = proofs.get(proofHash);
        proofs.delete(proofHash);
        return proof && at.getTime() < proof.expiresAt.getTime() ? proof : undefined;
      },
      async dropProofsFor(email) {
        for (const [hash, proof] of proofs) if (proof.email === email) proofs.delete(hash);
        codes.delete(email);
      },
    },

    accounts: {
      async claimAccount(accountId) {
        const created = !accounts.has(accountId);
        account(accountId);
        return { created };
      },
      async accountExists(accountId) {
        return accounts.has(accountId);
      },
      async hasPassword(accountId) {
        return accounts.get(accountId)?.hasPassword ?? false;
      },
      async setHasPassword(accountId) {
        account(accountId).hasPassword = true;
      },
      async rememberDevice(accountId, deviceId) {
        const devices = account(accountId).devices;
        const isNew = !devices.has(deviceId);
        devices.add(deviceId);
        return isNew;
      },
    },

    sessions: {
      async addSession({ refreshTokenHash, ...stored }) {
        const session: Session = { ...stored, refreshTokenHash, usedRefreshHashes: new Set() };
        sessions.set(session.sessionId, session);
        byAccess.set(session.accessTokenHash, session);
        byRefresh.set(refreshTokenHash, session);
      },
      async sessionByAccessToken(accessTokenHash) {
        const session = byAccess.get(accessTokenHash);
        return session && session.accessTokenHash === accessTokenHash
          ? snapshot(session)
          : undefined;
      },
      async useRefreshToken(refreshTokenHash) {
        const session = byRefresh.get(refreshTokenHash);
        if (!session) return { status: 'unknown' };
        if (
          session.refreshTokenHash !== refreshTokenHash ||
          session.usedRefreshHashes.has(refreshTokenHash)
        ) {
          return { status: 'old', session: snapshot(session) };
        }
        session.usedRefreshHashes.add(refreshTokenHash);
        return { status: 'current', session: snapshot(session) };
      },
      async releaseRefreshToken(refreshTokenHash) {
        byRefresh.get(refreshTokenHash)?.usedRefreshHashes.delete(refreshTokenHash);
      },
      async renewSession(sessionId, tokens) {
        const session = sessions.get(sessionId);
        if (!session) return;
        byAccess.delete(session.accessTokenHash);
        session.accessTokenHash = tokens.accessTokenHash;
        session.accessExpiresAt = tokens.accessExpiresAt;
        session.refreshTokenHash = tokens.refreshTokenHash;
        session.lastActiveAt = tokens.at;
        byAccess.set(tokens.accessTokenHash, session);
        byRefresh.set(tokens.refreshTokenHash, session);
      },
      async touchSession(sessionId, at) {
        const session = sessions.get(sessionId);
        if (session) session.lastActiveAt = at;
      },
      async passwordEntered(sessionId, at) {
        const session = sessions.get(sessionId);
        if (!session) return;
        session.passwordEnteredAt = at;
        session.lastSignInAt = at;
      },
      async endSession(sessionId) {
        const session = sessions.get(sessionId);
        if (!session || session.ended) return false;
        session.ended = true;
        return true;
      },
      async endSessionsOf(accountId, keep) {
        let ended = 0;
        for (const session of sessions.values()) {
          if (session.accountId === accountId && !session.ended && session.sessionId !== keep) {
            session.ended = true;
            ended++;
          }
        }
        return ended;
      },
      async liveSessionsOf(accountId) {
        return [...sessions.values()]
          .filter((s) => s.accountId === accountId && !s.ended)
          .map(snapshot);
      },
    },
  };
}
