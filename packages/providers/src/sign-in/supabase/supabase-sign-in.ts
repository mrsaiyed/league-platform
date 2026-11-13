// THE SUPABASE ADAPTER FOR THE SIGN-IN INTERFACE (T-5, T-6, T4 §3, records 013 and 018).
//
// NOT VERIFIED AGAINST THE LIVE SERVICE. It is tested against a fake Supabase Auth
// built from Supabase's published answers (handwritten, not recorded), with no
// network and no project (T-201). Before it signs a real person in, the supervised
// session of step 1.25 checks it against a staging project, and record 018 lists what
// to check.
//
// What Supabase does: keeps the accounts and the password hashes, makes and checks
// the emailed codes (we fetch each code with the admin call and send it through our
// own email service, T4 §3), signs in with a password or Google, issues and renews
// the tokens, and ends sessions. What we keep in the injected store, because Supabase
// does not: devices and the session list (T-70, T-71), our own guess and code limits
// with T-225's numbers (Supabase's are per network only), attempts per code (Supabase
// answers a wrong code and an expired one alike), and the proof between code and
// password. Two differences are closed here rather than left to Supabase's settings:
//
// - Refresh tokens: Supabase lets an old refresh token be used again for a few
//   seconds. We allow no window (T-69): a refresh token we have seen used before ends
//   the session, at Supabase too.
// - Passwords over 72 bytes: Supabase's hash reads no further, so the 73rd byte on
//   would be ignored at sign-in. New passwords over 72 bytes are refused, and a typed
//   one over 72 bytes is never sent: it is just wrong (T-225).
//
// Parallel calls: every count is taken by one atomic store call before anything else
// is awaited, as in the stand-in (record 013).
//
// Refusals are sorted by Supabase's error code, never by status alone: each call
// accepts only the codes it expects, and anything else is thrown as unexpected. A
// refusal that is not the person's doing (Supabase busy, down or silent) never counts
// as a wrong guess, and never uses up a proof.
import { createHash, randomBytes } from 'node:crypto';
import {
  emailCode,
  networkAddress as networkAddressShape,
  newPassword,
  passwordAttempt,
  passwordMaxBytes,
  signInDevice,
  signInEmail,
  type SignInDevice,
} from '@srleagues/contracts';
import { fail, ok } from '@srleagues/core';
import { isAllowedReturnAddress } from '../return-address.ts';
import { signInDefaults, type SignInSettings } from '../sign-in-settings.ts';
import type {
  CodePurpose,
  ExternalSignedIn,
  SessionError,
  SessionTokens,
  SignInCodeSender,
  SignInService,
  TooManyAttempts,
} from '../sign-in-service.ts';
import {
  createGoTrueClient,
  SupabaseAuthUnexpected,
  type FetchLike,
  type GoTrueRefusal,
  type GoTrueSession,
  type GoTrueUser,
  type StartTimer,
} from './gotrue-client.ts';
import type { PendingCode, StoredSession, SupabaseSignInStore } from './sign-in-store.ts';

type VerifyType = NonNullable<PendingCode['verifyType']>;

export type SupabaseSignInOptions = {
  /** The project's address, such as `https://abcd.supabase.co`. From the app's config (T-30). */
  readonly projectUrl: string;
  /** The project's secret (server) key. From the app's config, never written in code (T-30). */
  readonly secretKey: string;
  readonly fetch: FetchLike;
  /** What Supabase does not keep (record 018). The in-memory one is for development and tests only. */
  readonly store: SupabaseSignInStore;
  /** Where codes go: our own email service (T4 §3), never Supabase's sender. */
  readonly codeSender: SignInCodeSender;
  /** Our own origins Google may send the browser back to. None means Google is refused. */
  readonly returnOrigins?: readonly string[];
  /** Plain http to this machine for return addresses and the project address: development only. */
  readonly allowLocalHttp?: boolean;
  readonly now?: () => Date;
  readonly settings?: Partial<SignInSettings>;
  /** Milliseconds from a steady clock, to measure how long a call took. Injected for tests. */
  readonly elapsed?: () => number;
  /** Waits; injected so tests need not. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** The time limit on each call to Supabase, and its timer (`gotrue-client.ts`). */
  readonly callTimeoutMs?: number;
  readonly startTimer?: StartTimer;
};

const minute = 60_000;
/** An access token this close to running out is treated as run out, so it never dies mid-request. */
const expiryMarginMs = 30_000;
const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const token = () => randomBytes(32).toString('base64url');
const digest = (value: string) => createHash('sha256').update(value).digest('base64url');

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

const tooMany = (retryAfterSeconds: number): TooManyAttempts => ({
  code: 'too-many-attempts',
  retryAfterSeconds,
});

/** Supabase's own limits, if one is hit, look like ours. One minute if it does not say. */
const supabaseLimited = (refusal: GoTrueRefusal): TooManyAttempts | null =>
  refusal.status === 429 ? tooMany(refusal.retryAfterSeconds ?? 60) : null;

/** A refusal we have no answer for is the app's or the project's problem, not the person's. */
const unexpected = (what: string, refusal: GoTrueRefusal): never => {
  throw new SupabaseAuthUnexpected(what, refusal.status, refusal.code);
};

/** The refusal's code, if it is one this call expects; anything else is thrown. */
const expectedRefusal = <C extends string>(
  what: string,
  refusal: GoTrueRefusal,
  expected: readonly C[],
): C => {
  const found = expected.find((code) => code === refusal.code);
  return found === undefined ? unexpected(what, refusal) : found;
};

function checkProjectUrl(projectUrl: string, allowLocalHttp: boolean) {
  let url: URL;
  try {
    url = new URL(projectUrl);
  } catch {
    throw new Error('The Supabase project address is not an address.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowLocalHttp && local && url.protocol === 'http:')) {
    throw new Error('The Supabase project address must use https.');
  }
}

export function createSupabaseSignIn(options: SupabaseSignInOptions): SignInService {
  const allowLocalHttp = options.allowLocalHttp ?? false;
  checkProjectUrl(options.projectUrl, allowLocalHttp);
  if (!options.secretKey) throw new Error('The Supabase secret key is missing.');
  const settings: SignInSettings = { ...signInDefaults, ...options.settings };
  const now = options.now ?? (() => new Date());
  const elapsed = options.elapsed ?? (() => performance.now());
  const sleep = options.sleep ?? realSleep;
  const { store, codeSender } = options;
  const auth = createGoTrueClient({
    projectUrl: options.projectUrl,
    secretKey: options.secretKey,
    fetch: options.fetch,
    ...(options.callTimeoutMs === undefined ? {} : { timeoutMs: options.callTimeoutMs }),
    ...(options.startTimer === undefined ? {} : { startTimer: options.startTimer }),
  });
  const returnRules = { allowedOrigins: options.returnOrigins ?? [], allowLocalHttp };

  const reserveGuess = (email: string | null, network: string) =>
    store.limits.reserveGuess({
      email,
      network,
      perEmail: settings.guessesPerEmail,
      perNetwork: settings.guessesPerNetwork,
    });

  const tokensOf = (session: GoTrueSession): SessionTokens => ({
    sessionId: session.sessionId,
    accessToken: session.accessToken,
    accessExpiresAt: session.accessExpiresAt,
    refreshToken: session.refreshToken,
  });

  /** Puts a session Supabase has issued on the account's list (T-71). */
  const recordSession = async (
    session: GoTrueSession,
    deviceLabel: string,
    passwordEnteredAt: Date | null,
  ) => {
    const at = now();
    await store.sessions.addSession({
      sessionId: session.sessionId,
      accountId: session.user.id,
      deviceLabel,
      signedInAt: at,
      lastActiveAt: at,
      lastSignInAt: at,
      passwordEnteredAt,
      accessTokenHash: digest(session.accessToken),
      accessExpiresAt: session.accessExpiresAt,
      refreshTokenHash: digest(session.refreshToken),
      ended: false,
    });
  };

  /**
   * The session behind an access token, if it is ours, live, not run out, and still
   * alive at Supabase. Marks it active now.
   */
  const liveSession = async (
    accessToken: string,
  ): Promise<{ session: StoredSession; user: GoTrueUser } | SessionError> => {
    const session = await store.sessions.sessionByAccessToken(digest(accessToken));
    if (!session || session.ended) return { code: 'session-ended' };
    if (now().getTime() >= session.accessExpiresAt.getTime() - expiryMarginMs) {
      return { code: 'access-expired' };
    }
    const user = await auth.user(accessToken);
    if (!user.ok) {
      const refused = expectedRefusal('user', user.refusal, [
        'session_not_found',
        'user_not_found',
        'bad_jwt',
      ]);
      // Supabase's clock found it run out before ours: renewing is the answer.
      if (refused === 'bad_jwt') return { code: 'access-expired' };
    }
    if (!user.ok || user.value.id !== session.accountId) {
      // Ended at Supabase (a password change, reuse caught there, or by hand).
      await store.sessions.endSession(session.sessionId);
      return { code: 'session-ended' };
    }
    await store.sessions.touchSession(session.sessionId, now());
    return { session, user: user.value };
  };

  /** Ends a session at Supabase too, if its tokens still allow it. A failure changes nothing. */
  const endAtSupabase = async (refreshToken: string) => {
    const renewed = await auth.refresh(refreshToken);
    if (renewed.ok) await auth.signOut(renewed.value.accessToken, 'local');
  };

  const requestCode = async (rawEmail: string, rawNetwork: string, purpose: CodePurpose) => {
    const network = parseNetwork(rawNetwork);
    const parsed = signInEmail.safeParse(rawEmail);
    if (!parsed.success) return fail({ code: 'invalid-email' as const });
    const email = parsed.data;
    // Counted whether or not an account exists, so the limit looks the same (T-68).
    const limited = await store.limits.countCodeRequest({
      email,
      network,
      perEmail: settings.codesPerHour,
      perNetwork: settings.codesPerHourPerNetwork,
    });
    if (limited) return fail(tooMany(limited.retryAfterSeconds));

    // Sign-up asks for a code that also makes a Supabase user if there is none; a
    // reset asks for one only for an existing user. An account is "ours" once it has
    // finished signing up through us (the store says): a Supabase user left by a
    // sign-up never finished is not an account, and a reset for it sends no code.
    const generated = await auth.generateCode(
      purpose === 'sign-up' ? 'magiclink' : 'recovery',
      email,
    );
    if (!generated.ok) {
      const limit = supabaseLimited(generated.refusal);
      if (limit) return fail(limit);
      // Any other refusal of a reset is read as "no such user": the answer is the same
      // as for an address with an account, and no code is sent.
      if (purpose === 'sign-up') unexpected('generate_link', generated.refusal);
    } else if (!emailCode.safeParse(generated.value.code).success) {
      // The project's code length is not 6 (record 018 lists the settings).
      throw new SupabaseAuthUnexpected('generate_link: the code is not 6 digits');
    }
    // Asked either way, with an id that matches nothing when Supabase has no user, so
    // the store sees the same calls whether or not the account exists (T-68).
    const accountExists =
      (await store.accounts.accountExists(generated.ok ? generated.value.user.id : token())) &&
      generated.ok;
    let code: string | null = null;
    let verifyType: VerifyType | null = null;
    if (generated.ok && (purpose === 'sign-up' || accountExists)) {
      code = generated.value.code;
      verifyType = generated.value.verifyType;
    }
    const expiresAt = new Date(now().getTime() + settings.codeValidMinutes * minute);
    // Every request hands the sender a message, one with no code for a reset with no
    // account, so asking costs the same either way (T-68).
    const sent = await codeSender.send({ to: email, purpose, code, accountExists, expiresAt });
    // A code no one received is not kept.
    if (!sent.ok) return fail({ code: 'code-not-sent' as const });
    await store.codes.putCode(email, {
      verifyType,
      expiresAt,
      attemptsLeft: settings.attemptsPerCode,
    });
    return ok({ codeValidMinutes: settings.codeValidMinutes });
  };

  /**
   * Signs in by password at Supabase, never sending one over 72 bytes (T-225), and
   * never answering sooner than `passwordMinMilliseconds`: Supabase skips the hash for
   * an address it does not know, so its answer is quicker then (T-68).
   */
  const passwordSignIn = async (email: string | null, password: string) => {
    const started = elapsed();
    try {
      return await passwordSignInOnce(email, password);
    } finally {
      const left = settings.passwordMinMilliseconds - (elapsed() - started);
      if (left > 0) await sleep(left);
    }
  };

  const passwordSignInOnce = async (email: string | null, password: string) => {
    const attempt = passwordAttempt.safeParse(password);
    const typed =
      attempt.success && Buffer.byteLength(attempt.data, 'utf8') <= passwordMaxBytes
        ? attempt.data
        : null;
    // One call either way, so an address that is not one, or a password that cannot
    // be right, costs the same as a wrong password (T-68). The password sent in their
    // place is random, so it can match nothing.
    const answer = await auth.signInWithPassword(
      email ?? 'not-an-address@invalid.invalid',
      email !== null && typed !== null ? typed : token(),
    );
    if (answer.ok && (typed === null || email === null)) {
      // Cannot happen; never let a session made this way out.
      await auth.signOut(answer.value.accessToken, 'local');
      return { wrong: true as const };
    }
    if (answer.ok) return { session: answer.value };
    const limit = supabaseLimited(answer.refusal);
    if (limit) return { limited: limit };
    // `email_not_confirmed` is a sign-up never finished: no account, so just wrong.
    expectedRefusal('password sign-in', answer.refusal, [
      'invalid_credentials',
      'email_not_confirmed',
    ]);
    return { wrong: true as const };
  };

  /** A password check whose try is taken back if it was not the person's doing (Supabase busy or down). */
  const checkPassword = async (email: string | null, password: string, ticket: string) => {
    let answer;
    try {
      answer = await passwordSignIn(email, password);
    } catch (error) {
      await store.limits.cancelGuess(ticket);
      throw error;
    }
    if ('limited' in answer) await store.limits.cancelGuess(ticket);
    return answer;
  };

  const service: SignInService = {
    startSignUp: ({ email, networkAddress }) => requestCode(email, networkAddress, 'sign-up'),
    startReset: ({ email, networkAddress }) => requestCode(email, networkAddress, 'reset'),

    async verifyCode({ email: rawEmail, code: rawCode, networkAddress }) {
      const network = parseNetwork(networkAddress);
      // Wrong codes count against the network (T-225); a try that turns out not to be
      // a wrong code is taken back.
      const reserved = await reserveGuess(null, network);
      if ('retryAfterSeconds' in reserved) return fail(tooMany(reserved.retryAfterSeconds));
      const email = signInEmail.safeParse(rawEmail);
      const attempt = email.success
        ? await store.codes.takeCodeAttempt(email.data, now())
        : ({ status: 'none' } as const);
      if (attempt.status !== 'taken') {
        await store.limits.cancelGuess(reserved.ticket);
        return fail(
          attempt.status === 'none' ? { code: 'code-expired' } : { code: 'too-many-attempts' },
        );
      }
      const wrong = () =>
        fail({ code: attempt.attemptsLeft <= 0 ? 'too-many-attempts' : 'code-wrong' } as const);
      const code = emailCode.safeParse(rawCode);
      if (!email.success || !code.success) return wrong();
      const { verifyType } = attempt;
      let verified;
      try {
        // No code was sent (T-68): the same call, which cannot succeed.
        verified =
          verifyType === null
            ? await auth.verifyNothing(token())
            : await auth.verifyCode(verifyType, email.data, code.data);
        if (!verified.ok && !supabaseLimited(verified.refusal)) {
          // Supabase answers `otp_expired` for a wrong code too; ours says which.
          expectedRefusal('verify', verified.refusal, ['otp_expired']);
        }
      } catch (error) {
        await store.limits.cancelGuess(reserved.ticket);
        throw error;
      }
      if (!verified.ok) {
        const limit = supabaseLimited(verified.refusal);
        if (limit) {
          // Supabase was busy: the code was not checked, so it is not a wrong guess.
          await store.limits.cancelGuess(reserved.ticket);
          return fail(limit);
        }
        return wrong();
      }
      const made = verified.value;
      if (made === null) return wrong();
      await store.limits.cancelGuess(reserved.ticket);
      await store.codes.dropCode(email.data);
      const proof = token();
      const proofExpiresAt = new Date(now().getTime() + settings.proofValidMinutes * minute);
      await store.codes.putProof(digest(proof), {
        email: email.data,
        accountId: made.user.id,
        expiresAt: proofExpiresAt,
        supabase: {
          accessToken: made.accessToken,
          refreshToken: made.refreshToken,
          accessExpiresAt: made.accessExpiresAt,
          sessionId: made.sessionId,
        },
      });
      return ok({ proof, proofExpiresAt });
    },

    async setPassword({ proof, password, device }) {
      const where = parseDevice(device);
      const proofHash = digest(proof);
      if (!(await store.codes.peekProof(proofHash, now()))) return fail({ code: 'proof-invalid' });
      const checked = newPassword.safeParse(password);
      if (!checked.success) {
        const tooLong = checked.error.issues.some((issue) => issue.message === 'too-long');
        return fail({ code: tooLong ? 'password-too-long' : 'password-too-short' });
      }
      // Taking it also ends the address's other proofs, in one step: of two proofs
      // used at once, only one goes on to Supabase.
      const held = await store.codes.takeProof(proofHash, now());
      if (!held) return fail({ code: 'proof-invalid' });
      let set;
      try {
        set = await auth.setPassword(held.supabase.accessToken, checked.data);
      } catch (error) {
        // Supabase down or silent: not the person's doing, so the proof is kept.
        await store.codes.putProof(proofHash, held);
        throw error;
      }
      if (!set.ok) {
        const { refusal } = set;
        if (refusal.status === 429) {
          await store.codes.putProof(proofHash, held);
          return unexpected('user update', refusal);
        }
        const refused = expectedRefusal('user update', refusal, [
          'weak_password',
          'same_password',
          'session_not_found',
          'bad_jwt',
        ]);
        if (refused === 'weak_password') {
          // The proof is kept, so the person can try another password.
          await store.codes.putProof(proofHash, held);
          if (refusal.reasons.includes('pwned')) return fail({ code: 'password-leaked' });
          if (refusal.reasons.includes('length')) return fail({ code: 'password-too-short' });
          return unexpected('user update', refusal);
        }
        // The proof's session has ended at Supabase or run out.
        if (refused !== 'same_password') return fail({ code: 'proof-invalid' });
        // The same password again is still a reset: carry on, and end the other sessions below.
      }
      // T-85: a new password signs out every other device. Supabase does this on a
      // password change; asking again does not depend on it, and covers the same password.
      await auth.signOut(held.supabase.accessToken, 'others');
      await store.codes.dropProofsFor(held.email);
      await store.limits.clearGuesses(held.email);
      const { created } = await store.accounts.claimAccount(held.accountId);
      await store.accounts.setHasPassword(held.accountId);
      const endedSessions = await store.sessions.endSessionsOf(held.accountId);
      const seen = await store.accounts.rememberDevice(held.accountId, where.deviceId);
      const session: GoTrueSession = {
        ...held.supabase,
        user: { id: held.accountId, email: held.email },
      };
      await recordSession(session, where.label, now());
      return ok({
        accountId: held.accountId,
        session: tokensOf(session),
        newDevice: created ? false : seen,
        outcome: created ? 'account-created' : 'password-changed',
        endedSessions,
      });
    },

    async signIn({ email: rawEmail, password, device }) {
      const where = parseDevice(device);
      const parsedEmail = signInEmail.safeParse(rawEmail);
      // An address that is not one has no account and no count of its own.
      const email = parsedEmail.success ? parsedEmail.data : null;
      const reserved = await reserveGuess(email, where.networkAddress);
      if ('retryAfterSeconds' in reserved) return fail(tooMany(reserved.retryAfterSeconds));
      const answer = await checkPassword(email, password, reserved.ticket);
      if ('limited' in answer) return fail(answer.limited);
      if ('wrong' in answer) return fail({ code: 'wrong-email-or-password' });
      await store.limits.forgiveGuess(reserved.ticket);
      const { session } = answer;
      await store.accounts.claimAccount(session.user.id);
      await store.accounts.setHasPassword(session.user.id);
      const newDevice = await store.accounts.rememberDevice(session.user.id, where.deviceId);
      await recordSession(session, where.label, now());
      return ok({ accountId: session.user.id, session: tokensOf(session), newDevice });
    },

    async startExternalSignIn({ provider, returnAddress }) {
      if (!isAllowedReturnAddress(returnAddress, returnRules)) {
        return fail({ code: 'return-address-refused' });
      }
      // PKCE: Supabase keeps the challenge and checks the verifier when we finish.
      const verifier = token();
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      return ok({
        redirectTo: auth.authorizeAddress(provider, returnAddress, challenge),
        verifier,
      });
    },

    async completeExternalSignIn({ code, verifier, device }) {
      const where = parseDevice(device);
      if (!code || !verifier) return fail({ code: 'external-sign-in-failed' });
      const exchanged = await auth.exchangeCode(code, verifier);
      if (!exchanged.ok) {
        // A code already used or made up, or a verifier that does not match.
        expectedRefusal('pkce exchange', exchanged.refusal, [
          'flow_state_not_found',
          'bad_code_verifier',
        ]);
        return fail({ code: 'external-sign-in-failed' });
      }
      const session = exchanged.value;
      const { created } = await store.accounts.claimAccount(session.user.id);
      const seen = await store.accounts.rememberDevice(session.user.id, where.deviceId);
      await recordSession(session, where.label, null);
      const base = { accountId: session.user.id, session: tokensOf(session) };
      const result: ExternalSignedIn = created
        ? { ...base, newDevice: false, outcome: 'account-created' }
        : { ...base, newDevice: seen, outcome: 'signed-in' };
      return ok(result);
    },

    async identify({ accessToken }) {
      const live = await liveSession(accessToken);
      if ('code' in live) return fail(live);
      const { session, user } = live;
      return ok({
        accountId: session.accountId,
        email: user.email,
        sessionId: session.sessionId,
        hasPassword: await store.accounts.hasPassword(session.accountId),
        passwordEnteredAt: session.passwordEnteredAt,
        lastSignInAt: session.lastSignInAt,
      });
    },

    async renew({ refreshToken }) {
      const use = await store.sessions.useRefreshToken(digest(refreshToken));
      // Not one of ours: never passed to Supabase.
      if (use.status === 'unknown') return fail({ code: 'session-ended' });
      if (use.status === 'old' || use.session.ended) {
        // T-69: an old refresh token used again means it was copied. Supabase would
        // still accept it for a few seconds; we end the session, there too.
        await store.sessions.endSession(use.session.sessionId);
        await endAtSupabase(refreshToken);
        return fail({ code: 'session-ended' });
      }
      let renewed;
      try {
        renewed = await auth.refresh(refreshToken);
        // Only these end the session; anything else (Supabase busy, say) is thrown, and
        // is not a reason to sign the person out.
        if (!renewed.ok) {
          expectedRefusal('refresh', renewed.refusal, [
            'refresh_token_not_found',
            'refresh_token_already_used',
            'session_not_found',
          ]);
        }
      } catch (error) {
        // The token may be tried again: Supabase either did not rotate it, or will
        // hand back the same new tokens within its reuse window.
        await store.sessions.releaseRefreshToken(digest(refreshToken));
        throw error;
      }
      if (!renewed.ok || renewed.value.sessionId !== use.session.sessionId) {
        if (renewed.ok) await auth.signOut(renewed.value.accessToken, 'local');
        await store.sessions.endSession(use.session.sessionId);
        return fail({ code: 'session-ended' });
      }
      await store.sessions.renewSession(use.session.sessionId, {
        accessTokenHash: digest(renewed.value.accessToken),
        accessExpiresAt: renewed.value.accessExpiresAt,
        refreshTokenHash: digest(renewed.value.refreshToken),
        at: now(),
      });
      return ok(tokensOf(renewed.value));
    },

    async confirmPassword({ accessToken, password, networkAddress }) {
      const network = parseNetwork(networkAddress);
      const live = await liveSession(accessToken);
      if ('code' in live) return fail(live);
      const { session, user } = live;
      // Only the account's own signed-in owner can hear this; it is not a guess.
      if (!(await store.accounts.hasPassword(session.accountId))) {
        return fail({ code: 'no-password' });
      }
      const reserved = await reserveGuess(user.email, network);
      if ('retryAfterSeconds' in reserved) return fail(tooMany(reserved.retryAfterSeconds));
      // Supabase has no "check this password" call: a sign-in checks it, and the
      // session it makes is ended at once.
      const answer = await checkPassword(user.email, password, reserved.ticket);
      if ('limited' in answer) return fail(answer.limited);
      if ('wrong' in answer) return fail({ code: 'wrong-password' });
      await auth.signOut(answer.session.accessToken, 'local');
      if (answer.session.user.id !== session.accountId) return fail({ code: 'wrong-password' });
      const still = await store.sessions.sessionByAccessToken(digest(accessToken));
      if (!still || still.ended) return fail({ code: 'session-ended' });
      await store.limits.forgiveGuess(reserved.ticket);
      const at = now();
      await store.sessions.passwordEntered(session.sessionId, at);
      return ok({ passwordEnteredAt: at });
    },

    async signOut(input) {
      if ('accessToken' in input) {
        const session = await store.sessions.sessionByAccessToken(digest(input.accessToken));
        if (!session || !(await store.sessions.endSession(session.sessionId))) {
          return ok({ ended: false });
        }
        // An access token that has run out can no longer end the session at Supabase.
        // It stays alive there, out of reach: we never renew an ended session.
        if (now().getTime() < session.accessExpiresAt.getTime()) {
          await auth.signOut(input.accessToken, 'local');
        }
        return ok({ ended: true });
      }
      const use = await store.sessions.useRefreshToken(digest(input.refreshToken));
      if (use.status === 'unknown' || !(await store.sessions.endSession(use.session.sessionId))) {
        return ok({ ended: false });
      }
      await endAtSupabase(input.refreshToken);
      return ok({ ended: true });
    },

    async signOutEverywhere({ accessToken, keepThisSession }) {
      const live = await liveSession(accessToken);
      if ('code' in live) return fail(live);
      const { session } = live;
      // Our list decides what is ended; Supabase is told as well.
      await auth.signOut(accessToken, keepThisSession ? 'others' : 'global');
      const endedSessions = await store.sessions.endSessionsOf(
        session.accountId,
        keepThisSession ? session.sessionId : undefined,
      );
      return ok({ endedSessions });
    },

    async listSessions({ accessToken }) {
      const live = await liveSession(accessToken);
      if ('code' in live) return fail(live);
      const current = live.session;
      const sessions = await store.sessions.liveSessionsOf(current.accountId);
      const list = [...sessions]
        .sort(
          (a, b) =>
            b.lastActiveAt.getTime() - a.lastActiveAt.getTime() ||
            b.signedInAt.getTime() - a.signedInAt.getTime() ||
            a.sessionId.localeCompare(b.sessionId),
        )
        .map((s) => ({
          sessionId: s.sessionId,
          deviceLabel: s.deviceLabel,
          signedInAt: s.signedInAt,
          lastActiveAt: s.lastActiveAt,
          current: s.sessionId === current.sessionId,
        }));
      return ok(list);
    },
  };

  return service;
}
