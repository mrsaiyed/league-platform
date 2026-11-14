// THE LOCAL SIGN-IN STAND-IN. FOR DEVELOPMENT AND TESTS ONLY, NEVER FOR PRODUCTION.
//
// It keeps everything in this process's memory, forgets it all on restart, uses cheap
// password hashing, refuses only a sample of leaked passwords, and hands codes to a
// capture instead of emailing them. It exists so the web app (step 1.14) and its
// tests can run with no vendor account (T-201). It follows the same rules the real
// service is set up with (T4 §3, T-225), so screens built on it behave the same on
// Supabase (step 1.15). It refuses to start unless told it is in development or a
// test, and refuses if the app's NODE_ENV is "production".
//
// Parallel calls: every check and count happens before the first await, and every
// lookup after an await is finished before the next one, so two requests at once
// cannot both slip under a limit or both create the same account.
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  emailCode,
  networkAddress as networkAddressShape,
  newPassword,
  passwordAttempt,
  signInDevice,
  signInEmail,
  type SignInDevice,
} from '@srleagues/contracts';
import { fail, ok } from '@srleagues/core';
import { isAllowedReturnAddress } from '../return-address.ts';
import type {
  CodePurpose,
  ExternalSignedIn,
  SessionError,
  SessionIdentity,
  SessionTokens,
  SignInCodeSender,
  SignInService,
  TooManyAttempts,
} from '../sign-in-service.ts';
import { signInDefaults, type SignInSettings } from '../sign-in-settings.ts';
import { createAttemptLimiter } from './attempt-limiter.ts';
import { sampleLeakedPasswords } from './leaked-passwords.ts';
import { scryptPasswordHasher, type PasswordHash, type PasswordHasher } from './password-hash.ts';

/**
 * The numbers of T4 §3 and T-225, shared with the Supabase adapter, and two the real
 * service keeps on its own side (the access token's life and the leaked-password list).
 */
export type LocalSignInSettings = SignInSettings & {
  /** T-69: the access token is short-lived; the session itself has no limit (T-70). */
  readonly accessTokenMinutes: number;
  /** Stands in for the public lists of leaked passwords (T-85). Lower case. */
  readonly leakedPasswords: readonly string[];
};

export const localSignInDefaults: LocalSignInSettings = {
  ...signInDefaults,
  accessTokenMinutes: 60,
  leakedPasswords: sampleLeakedPasswords,
};

export type LocalSignInOptions = {
  /** Anything else is refused at start: this stand-in must never run in production. */
  readonly environment: 'development' | 'test';
  /**
   * The NODE_ENV the app's config module read at startup (T-30: only that module
   * reads the environment). "production" is refused, whatever `environment` says.
   */
  readonly nodeEnv: string | undefined;
  /** Where codes go: a capture in tests, the local email capture in development. */
  readonly codeSender: SignInCodeSender;
  /** Our own origins Google may send the browser back to. None means Google is refused. */
  readonly returnOrigins?: readonly string[];
  readonly now?: () => Date;
  readonly settings?: Partial<LocalSignInSettings>;
  /** The password hash; tests may pass one that counts its calls. */
  readonly hasher?: PasswordHasher;
};

export type LocalSignInStandIn = {
  readonly service: SignInService;
  /**
   * Plays the part of Google's consent screen: the person "chose" this address for
   * the external sign-in started with `verifier`. Without it, completing fails.
   */
  readonly approveExternalSignIn: (input: {
    readonly verifier: string;
    readonly email: string;
  }) => void;
};

type Account = {
  readonly id: string;
  readonly email: string;
  hash: PasswordHash | undefined;
  readonly devices: Set<string>;
};

type PendingCode = {
  /** Null when no code was sent (a reset for an address with no account): nothing can match. */
  readonly code: string | null;
  readonly expiresAt: number;
  attemptsLeft: number;
};

type Session = {
  readonly id: string;
  readonly account: Account;
  readonly deviceLabel: string;
  readonly signedInAt: Date;
  lastActiveAt: Date;
  lastSignInAt: Date;
  passwordEnteredAt: Date | null;
  accessToken: string;
  refreshToken: string;
  ended: boolean;
};

type PendingExternal = {
  readonly verifier: string;
  readonly expiresAt: number;
  email: string | null;
};

const minute = 60_000;
const hour = 60 * minute;
const token = () => randomBytes(32).toString('base64url');

/** A device or network address that does not fit is the app's mistake: thrown (T-23). */
const parseDevice = (device: SignInDevice) => {
  const parsed = signInDevice.safeParse(device);
  if (!parsed.success) throw new TypeError('The sign-in device does not fit its shape.');
  return parsed.data;
};
const parseNetwork = (address: string) => {
  const parsed = networkAddressShape.safeParse(address);
  if (!parsed.success) throw new TypeError('The network address is not an IP address.');
  return parsed.data;
};

export function createLocalSignInStandIn(options: LocalSignInOptions): LocalSignInStandIn {
  if (
    (options.environment !== 'development' && options.environment !== 'test') ||
    options.nodeEnv === 'production'
  ) {
    throw new Error('The local sign-in stand-in is for development and tests only.');
  }
  const settings: LocalSignInSettings = { ...localSignInDefaults, ...options.settings };
  const now = options.now ?? (() => new Date());
  const hasher = options.hasher ?? scryptPasswordHasher;
  const leaked = new Set(settings.leakedPasswords.map((p) => p.toLowerCase()));
  const returnRules = { allowedOrigins: options.returnOrigins ?? [], allowLocalHttp: true };

  const accounts = new Map<string, Account>();
  const pendingCodes = new Map<string, PendingCode>();
  const codeRequestsByEmail = new Map<string, number[]>();
  const codeRequestsByNetwork = new Map<string, number[]>();
  const proofs = new Map<string, { email: string; expiresAt: number }>();
  const sessions = new Map<string, Session>();
  const accessTokens = new Map<string, { session: Session; expiresAt: number }>();
  const refreshTokens = new Map<string, Session>();
  const external = new Map<string, PendingExternal>();
  const guessesPerEmail = createAttemptLimiter(settings.guessesPerEmail, now);
  const guessesPerNetwork = createAttemptLimiter(settings.guessesPerNetwork, now);

  const tooMany = (retryAfterSeconds: number): TooManyAttempts => ({
    code: 'too-many-attempts',
    retryAfterSeconds,
  });

  /** Seconds to wait if `key` has had `limit` requests in the last hour, else null. */
  const hourlyWait = (counts: Map<string, number[]>, key: string, limit: number) => {
    const at = now().getTime();
    const recent = (counts.get(key) ?? []).filter((t) => at - t < hour);
    counts.set(key, recent);
    const oldest = recent[0];
    if (oldest === undefined || recent.length < limit) return null;
    return Math.max(1, Math.ceil((oldest + hour - at) / 1000));
  };

  const requestCode = async (rawEmail: string, rawNetwork: string, purpose: CodePurpose) => {
    const network = parseNetwork(rawNetwork);
    const parsed = signInEmail.safeParse(rawEmail);
    if (!parsed.success) return fail({ code: 'invalid-email' as const });
    const email = parsed.data;
    // Counted whether or not an account exists, so the limit looks the same (T-68).
    const waits = [
      hourlyWait(codeRequestsByEmail, email, settings.codesPerHour),
      hourlyWait(codeRequestsByNetwork, network, settings.codesPerHourPerNetwork),
    ].filter((w) => w !== null);
    if (waits.length) return fail(tooMany(Math.max(...waits)));
    const at = now().getTime();
    codeRequestsByEmail.get(email)?.push(at);
    codeRequestsByNetwork.get(network)?.push(at);

    const account = accounts.get(email);
    const expiresAt = at + settings.codeValidMinutes * minute;
    // Sign-up always sends a code: to an address that already has an account it is
    // the reset route (T-67). Reset has a code only if there is an account. Either
    // way the sender gets a message (one with no code sends nothing), so asking costs
    // the same work, and the address gets a pending entry, so guessing behaves the
    // same (T-68).
    const code =
      purpose === 'sign-up' || account !== undefined
        ? String(randomInt(0, 1_000_000)).padStart(6, '0')
        : null;
    const sent = await options.codeSender.send({
      to: email,
      purpose,
      code,
      accountExists: account !== undefined,
      expiresAt: new Date(expiresAt),
    });
    // A code no one received is not kept.
    if (!sent.ok) return fail({ code: 'code-not-sent' as const });
    pendingCodes.set(email, { code, expiresAt, attemptsLeft: settings.attemptsPerCode });
    return ok({ codeValidMinutes: settings.codeValidMinutes });
  };

  const issueAccess = (session: Session): SessionTokens => {
    // The previous access token stops working once a new one is issued.
    accessTokens.delete(session.accessToken);
    session.accessToken = token();
    const expiresAt = now().getTime() + settings.accessTokenMinutes * minute;
    accessTokens.set(session.accessToken, { session, expiresAt });
    return {
      sessionId: session.id,
      accessToken: session.accessToken,
      accessExpiresAt: new Date(expiresAt),
      refreshToken: session.refreshToken,
    };
  };

  const startSession = (
    account: Account,
    device: { deviceId: string; label: string },
    passwordEnteredAt: Date | null,
  ): { session: SessionTokens; newDevice: boolean } => {
    const newDevice = !account.devices.has(device.deviceId);
    account.devices.add(device.deviceId);
    const at = now();
    const session: Session = {
      id: randomUUID(),
      account,
      deviceLabel: device.label,
      signedInAt: at,
      lastActiveAt: at,
      lastSignInAt: at,
      passwordEnteredAt,
      accessToken: '',
      refreshToken: token(),
      ended: false,
    };
    sessions.set(session.id, session);
    refreshTokens.set(session.refreshToken, session);
    return { session: issueAccess(session), newDevice };
  };

  /** Ends the account's live sessions, except `keep`; returns how many. */
  const endSessions = (account: Account, keep?: Session): number => {
    let ended = 0;
    for (const session of sessions.values()) {
      if (session.account === account && !session.ended && session !== keep) {
        session.ended = true;
        ended++;
      }
    }
    return ended;
  };

  const liveSession = (accessToken: string): Session | SessionError => {
    const entry = accessTokens.get(accessToken);
    if (!entry || entry.session.ended) return { code: 'session-ended' };
    if (now().getTime() >= entry.expiresAt) return { code: 'access-expired' };
    entry.session.lastActiveAt = now();
    return entry.session;
  };

  /**
   * Checks both guess limits, then counts this try as wrong before anything is
   * awaited (T-85). Returns the wait, or a way to take the count back if it was right.
   */
  const reserveGuess = (
    email: string | null,
    network: string,
  ): { readonly limited: TooManyAttempts } | { readonly forgive: () => void } => {
    const checks = [guessesPerNetwork.check(network)];
    if (email !== null) checks.push(guessesPerEmail.check(email));
    const waits = checks.flatMap((c) => (c.allowed ? [] : [c.retryAfterSeconds]));
    if (waits.length) return { limited: tooMany(Math.max(...waits)) };
    const forgiveNetwork = guessesPerNetwork.recordFailure(network);
    if (email !== null) guessesPerEmail.recordFailure(email);
    return {
      forgive: () => {
        forgiveNetwork();
        if (email !== null) guessesPerEmail.clear(email);
      },
    };
  };

  /** Ends other proofs and codes for the address once its password is set. */
  const forgetProofsFor = (email: string) => {
    for (const [proof, held] of proofs) if (held.email === email) proofs.delete(proof);
    pendingCodes.delete(email);
  };

  const service: SignInService = {
    startSignUp: ({ email, networkAddress }) => requestCode(email, networkAddress, 'sign-up'),
    startReset: ({ email, networkAddress }) => requestCode(email, networkAddress, 'reset'),

    async verifyCode({ email: rawEmail, code: rawCode, networkAddress }) {
      const network = parseNetwork(networkAddress);
      const allowed = guessesPerNetwork.check(network);
      if (!allowed.allowed) {
        return fail({ code: 'too-many-attempts', retryAfterSeconds: allowed.retryAfterSeconds });
      }
      const email = signInEmail.safeParse(rawEmail);
      const pending = email.success ? pendingCodes.get(email.data) : undefined;
      if (!email.success || !pending || now().getTime() >= pending.expiresAt) {
        return fail({ code: 'code-expired' });
      }
      if (pending.attemptsLeft <= 0) return fail({ code: 'too-many-attempts' });
      const code = emailCode.safeParse(rawCode);
      if (pending.code !== null && code.success && code.data === pending.code) {
        pendingCodes.delete(email.data);
        const proof = token();
        const expiresAt = now().getTime() + settings.proofValidMinutes * minute;
        proofs.set(proof, { email: email.data, expiresAt });
        return ok({ proof, proofExpiresAt: new Date(expiresAt) });
      }
      pending.attemptsLeft--;
      guessesPerNetwork.recordFailure(network);
      return fail({ code: pending.attemptsLeft <= 0 ? 'too-many-attempts' : 'code-wrong' });
    },

    async setPassword({ proof, password, device }) {
      const where = parseDevice(device);
      const held = proofs.get(proof);
      if (!held || now().getTime() >= held.expiresAt) return fail({ code: 'proof-invalid' });
      const checked = newPassword.safeParse(password);
      if (!checked.success) {
        const tooLong = checked.error.issues.some((issue) => issue.message === 'too-long');
        return fail({ code: tooLong ? 'password-too-long' : 'password-too-short' });
      }
      if (leaked.has(checked.data.toLowerCase())) return fail({ code: 'password-leaked' });
      proofs.delete(proof);
      const hash = await hasher.hash(checked.data);
      // From here to the return nothing is awaited, so the lookup and the creation
      // cannot interleave with another request for the same address.
      forgetProofsFor(held.email);
      const existing = accounts.get(held.email);
      if (!existing) {
        const account: Account = { id: randomUUID(), email: held.email, hash, devices: new Set() };
        accounts.set(account.email, account);
        const started = startSession(account, where, now());
        return ok({
          accountId: account.id,
          session: started.session,
          newDevice: false,
          outcome: 'account-created',
          endedSessions: 0,
        });
      }
      existing.hash = hash;
      guessesPerEmail.clear(existing.email);
      // T-85: a changed password signs out every other device.
      const endedSessions = endSessions(existing);
      const started = startSession(existing, where, now());
      return ok({
        accountId: existing.id,
        session: started.session,
        newDevice: started.newDevice,
        outcome: 'password-changed',
        endedSessions,
      });
    },

    async signIn({ email: rawEmail, password, device }) {
      const where = parseDevice(device);
      const parsedEmail = signInEmail.safeParse(rawEmail);
      // An address that is not one has no account and no count of its own.
      const email = parsedEmail.success ? parsedEmail.data : null;
      const reserved = reserveGuess(email, where.networkAddress);
      if ('limited' in reserved) return fail(reserved.limited);
      const attempt = passwordAttempt.safeParse(password);
      const account = email === null ? undefined : accounts.get(email);
      const hashUsed = attempt.success ? account?.hash : undefined;
      // Always one hash's work, account or not (T-68).
      const matches = await hasher.matches(attempt.success ? attempt.data : '', hashUsed);
      if (!matches || !account || account.hash !== hashUsed) {
        return fail({ code: 'wrong-email-or-password' });
      }
      reserved.forgive();
      const started = startSession(account, where, now());
      return ok({ accountId: account.id, ...started });
    },

    async startExternalSignIn({ returnAddress }) {
      if (!isAllowedReturnAddress(returnAddress, returnRules)) {
        return fail({ code: 'return-address-refused' });
      }
      const back = new URL(returnAddress);
      const verifier = token();
      const code = token();
      external.set(code, {
        verifier,
        expiresAt: now().getTime() + settings.codeValidMinutes * minute,
        email: null,
      });
      back.searchParams.set('code', code);
      return ok({ redirectTo: back.toString(), verifier });
    },

    async completeExternalSignIn({ code, verifier, device }) {
      const where = parseDevice(device);
      const pending = external.get(code);
      external.delete(code);
      if (
        !pending ||
        pending.verifier !== verifier ||
        pending.email === null ||
        now().getTime() >= pending.expiresAt
      ) {
        return fail({ code: 'external-sign-in-failed' });
      }
      const existing = accounts.get(pending.email);
      const account: Account = existing ?? {
        id: randomUUID(),
        email: pending.email,
        hash: undefined,
        devices: new Set(),
      };
      accounts.set(account.email, account);
      const started = startSession(account, where, null);
      const result: ExternalSignedIn = existing
        ? { accountId: account.id, ...started, outcome: 'signed-in' }
        : {
            accountId: account.id,
            session: started.session,
            newDevice: false,
            outcome: 'account-created',
          };
      return ok(result);
    },

    async identify({ accessToken }) {
      const session = liveSession(accessToken);
      if ('code' in session) return fail(session);
      const identity: SessionIdentity = {
        accountId: session.account.id,
        email: session.account.email,
        // Every account here was made after its address was proved (a code, or Google).
        emailConfirmed: true,
        sessionId: session.id,
        hasPassword: session.account.hash !== undefined,
        passwordEnteredAt: session.passwordEnteredAt,
        lastSignInAt: session.lastSignInAt,
      };
      return ok(identity);
    },

    async renew({ refreshToken }) {
      const session = refreshTokens.get(refreshToken);
      if (!session || session.ended) return fail({ code: 'session-ended' });
      if (session.refreshToken !== refreshToken) {
        // T-69: an old refresh token used again means it was copied; end the session.
        session.ended = true;
        return fail({ code: 'session-ended' });
      }
      session.refreshToken = token();
      refreshTokens.set(session.refreshToken, session);
      session.lastActiveAt = now();
      return ok(issueAccess(session));
    },

    async confirmPassword({ accessToken, password, networkAddress }) {
      const network = parseNetwork(networkAddress);
      const session = liveSession(accessToken);
      if ('code' in session) return fail(session);
      const { account } = session;
      // Only the account's own signed-in owner can hear this; it is not a guess.
      if (account.hash === undefined) return fail({ code: 'no-password' });
      const reserved = reserveGuess(account.email, network);
      if ('limited' in reserved) return fail(reserved.limited);
      const attempt = passwordAttempt.safeParse(password);
      const hashUsed = account.hash;
      const matches = await hasher.matches(attempt.success ? attempt.data : '', hashUsed);
      if (session.ended) return fail({ code: 'session-ended' });
      if (!matches || !attempt.success || account.hash !== hashUsed) {
        return fail({ code: 'wrong-password' });
      }
      reserved.forgive();
      const at = now();
      session.passwordEnteredAt = at;
      session.lastSignInAt = at;
      return ok({ passwordEnteredAt: at });
    },

    async signOut(input) {
      const session =
        'accessToken' in input
          ? accessTokens.get(input.accessToken)?.session
          : refreshTokens.get(input.refreshToken);
      if (!session || session.ended) return ok({ ended: false });
      session.ended = true;
      return ok({ ended: true });
    },

    async signOutEverywhere({ accessToken, keepThisSession }) {
      const session = liveSession(accessToken);
      if ('code' in session) return fail(session);
      const endedSessions = endSessions(session.account, keepThisSession ? session : undefined);
      return ok({ endedSessions });
    },

    async listSessions({ accessToken }) {
      const current = liveSession(accessToken);
      if ('code' in current) return fail(current);
      const list = [...sessions.values()]
        .filter((s) => s.account === current.account && !s.ended)
        .sort(
          (a, b) =>
            b.lastActiveAt.getTime() - a.lastActiveAt.getTime() ||
            b.signedInAt.getTime() - a.signedInAt.getTime() ||
            a.id.localeCompare(b.id),
        )
        .map((s) => ({
          sessionId: s.id,
          deviceLabel: s.deviceLabel,
          signedInAt: s.signedInAt,
          lastActiveAt: s.lastActiveAt,
          current: s === current,
        }));
      return ok(list);
    },
  };

  return {
    service,
    approveExternalSignIn({ verifier, email }) {
      const address = signInEmail.parse(email);
      for (const pending of external.values()) {
        if (pending.verifier === verifier) pending.email = address;
      }
    },
  };
}
