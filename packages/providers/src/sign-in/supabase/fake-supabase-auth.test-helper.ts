// A FAKE SUPABASE AUTH, FOR TESTS ONLY. It answers the calls the adapter makes in
// the shapes Supabase publishes (handwritten from its API reference and its server's
// source, not recorded: no real project is ever contacted, T-201), and behaves the
// way the adapter relies on, including the parts that differ from our rules: an old
// refresh token works again for a few seconds, a wrong code and an expired one get
// the same answer, the password hash reads only 72 bytes, and a magic link for a new
// address makes a user and answers `signup`. Where the real service may differ, the
// adapter is marked "not verified against the live service" (record 018).
import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { FetchLike } from './gotrue-client.ts';

export type FakeSupabaseAuthOptions = {
  readonly now: () => Date;
  readonly secretKey: string;
  /** The project's JWT expiry (T-225: 60 minutes). */
  readonly accessTokenMinutes?: number;
  /** Supabase's refresh-token reuse interval, 10 seconds by default. */
  readonly reuseSeconds?: number;
  /** The project's code expiry (set to T-225's 10 minutes). */
  readonly codeSeconds?: number;
  /** Stands in for the leaked-password check. Lower case. */
  readonly leakedPasswords?: readonly string[];
};

export type FakeCall = {
  readonly method: string;
  /** The path after `/auth/v1`, with its query. */
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
};

type User = {
  readonly id: string;
  readonly email: string;
  readonly createdAt: Date;
  passwordDigest: string | null;
  confirmedAt: Date | null;
  readonly providers: Set<string>;
  otp: { token: string; type: string; expiresAt: number } | null;
};

type Session = { readonly id: string; readonly userId: string; ended: boolean };
type Refresh = { readonly sessionId: string; usedAt: number | null; child: string | null };
type Access = { readonly sessionId: string; readonly exp: number };

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const refuse = (status: number, code: string, message: string, extra: object = {}) =>
  json(status, { code, message, ...extra }, { 'x-sb-error-code': code });

const b64 = (value: string) => Buffer.from(value, 'utf8').toString('base64url');

/** bcrypt reads at most 72 bytes; the fake's hash does the same, so a cut is caught. */
const passwordDigest = (password: string) =>
  createHash('sha256').update(Buffer.from(password, 'utf8').subarray(0, 72)).digest('hex');

export function createFakeSupabaseAuth(options: FakeSupabaseAuthOptions) {
  const accessSeconds = (options.accessTokenMinutes ?? 60) * 60;
  const reuseMs = (options.reuseSeconds ?? 10) * 1000;
  const codeMs = (options.codeSeconds ?? 600) * 1000;
  const leaked = new Set(options.leakedPasswords ?? []);
  const nowMs = () => options.now().getTime();

  const users = new Map<string, User>();
  const usersByEmail = new Map<string, User>();
  const sessions = new Map<string, Session>();
  const refreshTokens = new Map<string, Refresh>();
  const accessTokens = new Map<string, Access>();
  const flows = new Map<string, { challenge: string; email: string }>();
  const calls: FakeCall[] = [];
  const overrides: {
    method: string;
    path: string;
    answer: (call: FakeCall) => Response | undefined;
  }[] = [];
  let serial = 0;

  const userJson = (user: User) => ({
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    email_confirmed_at: user.confirmedAt?.toISOString() ?? null,
    app_metadata: { provider: [...user.providers][0] ?? 'email', providers: [...user.providers] },
    user_metadata: {},
    identities: [...user.providers].map((provider) => ({
      identity_id: randomUUID(),
      user_id: user.id,
      provider,
    })),
    created_at: user.createdAt.toISOString(),
    updated_at: options.now().toISOString(),
    is_anonymous: false,
  });

  const accessFor = (session: Session) => {
    const iat = Math.floor(nowMs() / 1000);
    const exp = iat + accessSeconds;
    const claims = {
      aud: 'authenticated',
      exp,
      iat,
      sub: session.userId,
      role: 'authenticated',
      session_id: session.id,
      aal: 'aal1',
    };
    const accessToken = `${b64('{"alg":"HS256","typ":"JWT"}')}.${b64(JSON.stringify(claims))}.${b64(`fake-signature-${++serial}`)}`;
    accessTokens.set(accessToken, { sessionId: session.id, exp });
    return { accessToken, exp };
  };

  const sessionJson = (session: Session, refreshToken: string) => {
    const user = users.get(session.userId);
    if (!user) throw new Error('fake: a session without its user');
    const { accessToken, exp } = accessFor(session);
    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: accessSeconds,
      expires_at: exp,
      refresh_token: refreshToken,
      user: userJson(user),
    };
  };

  const newRefreshToken = (sessionId: string) => {
    const refreshToken = `fake-refresh-${++serial}-${randomUUID().slice(0, 8)}`;
    refreshTokens.set(refreshToken, { sessionId, usedAt: null, child: null });
    return refreshToken;
  };

  const startSession = (user: User) => {
    const session: Session = { id: randomUUID(), userId: user.id, ended: false };
    sessions.set(session.id, session);
    return json(200, sessionJson(session, newRefreshToken(session.id)));
  };

  const findOrCreate = (email: string) => {
    let user = usersByEmail.get(email);
    let created = false;
    if (!user) {
      user = {
        id: randomUUID(),
        email,
        createdAt: options.now(),
        passwordDigest: null,
        confirmedAt: null,
        providers: new Set(['email']),
        otp: null,
      };
      users.set(user.id, user);
      usersByEmail.set(email, user);
      created = true;
    }
    return { user, created };
  };

  /** The session behind a user's bearer token, or the refusal Supabase gives. */
  const authenticate = (call: FakeCall): Session | Response => {
    const bearer = (call.headers['authorization'] ?? '').replace(/^Bearer /, '');
    const access = accessTokens.get(bearer);
    if (!access) return refuse(403, 'bad_jwt', 'invalid JWT: unable to parse or verify signature');
    if (Math.floor(nowMs() / 1000) >= access.exp) {
      return refuse(403, 'bad_jwt', 'invalid JWT: token has invalid claims: token is expired');
    }
    const session = sessions.get(access.sessionId);
    if (!session || session.ended) {
      return refuse(
        403,
        'session_not_found',
        'Session from session_id claim in JWT does not exist',
      );
    }
    return session;
  };

  const endSessions = (userId: string, keep?: string) => {
    for (const session of sessions.values()) {
      if (session.userId === userId && session.id !== keep) session.ended = true;
    }
  };

  const field = (body: unknown, name: string): string =>
    typeof body === 'object' &&
    body !== null &&
    typeof (body as Record<string, unknown>)[name] === 'string'
      ? ((body as Record<string, unknown>)[name] as string)
      : '';

  function answer(call: FakeCall): Response {
    if (call.headers['apikey'] !== options.secretKey) {
      return refuse(401, 'no_api_key', 'No API key found in request');
    }
    const [path = '', query = ''] = call.path.split('?');
    const params = new URLSearchParams(query);
    const body = call.body;

    if (call.method === 'POST' && path === '/admin/generate_link') {
      if (call.headers['authorization'] !== `Bearer ${options.secretKey}`) {
        return refuse(403, 'not_admin', 'User not allowed');
      }
      const email = field(body, 'email').toLowerCase();
      const type = field(body, 'type');
      let user = usersByEmail.get(email);
      let verificationType = type;
      if (type === 'recovery') {
        if (!user) return refuse(404, 'user_not_found', 'User with this email not found');
      } else if (type === 'magiclink') {
        user = findOrCreate(email).user;
        if (!user.confirmedAt) verificationType = 'signup';
      } else {
        return refuse(400, 'validation_failed', 'Invalid link type');
      }
      const token = String(randomInt(0, 1_000_000)).padStart(6, '0');
      user.otp = { token, type: verificationType, expiresAt: nowMs() + codeMs };
      return json(200, {
        ...userJson(user),
        action_link: `https://fake.supabase.test/auth/v1/verify?token=hashed&type=${verificationType}`,
        email_otp: token,
        hashed_token: createHash('sha256').update(token).digest('hex'),
        redirect_to: 'https://fake.supabase.test',
        verification_type: verificationType,
      });
    }

    if (call.method === 'POST' && path === '/verify') {
      const user = usersByEmail.get(field(body, 'email').toLowerCase());
      const otp = user?.otp;
      if (
        !user ||
        !otp ||
        otp.type !== field(body, 'type') ||
        otp.token !== field(body, 'token') ||
        nowMs() >= otp.expiresAt
      ) {
        return refuse(403, 'otp_expired', 'Token has expired or is invalid');
      }
      user.otp = null;
      user.confirmedAt ??= options.now();
      return startSession(user);
    }

    if (call.method === 'POST' && path === '/token') {
      const grant = params.get('grant_type');
      if (grant === 'password') {
        const user = usersByEmail.get(field(body, 'email').toLowerCase());
        if (
          !user ||
          !user.passwordDigest ||
          user.passwordDigest !== passwordDigest(field(body, 'password'))
        ) {
          return refuse(400, 'invalid_credentials', 'Invalid login credentials');
        }
        if (!user.confirmedAt) return refuse(400, 'email_not_confirmed', 'Email not confirmed');
        return startSession(user);
      }
      if (grant === 'refresh_token') {
        const presented = field(body, 'refresh_token');
        const entry = refreshTokens.get(presented);
        const session = entry ? sessions.get(entry.sessionId) : undefined;
        if (!entry || !session || session.ended) {
          return refuse(
            400,
            'refresh_token_not_found',
            'Invalid Refresh Token: Refresh Token Not Found',
          );
        }
        if (entry.usedAt !== null) {
          if (nowMs() - entry.usedAt <= reuseMs && entry.child !== null) {
            // Within the reuse interval: the same new refresh token, a fresh access token.
            return json(200, sessionJson(session, entry.child));
          }
          session.ended = true;
          return refuse(400, 'refresh_token_already_used', 'Invalid Refresh Token: Already Used');
        }
        entry.usedAt = nowMs();
        entry.child = newRefreshToken(session.id);
        return json(200, sessionJson(session, entry.child));
      }
      if (grant === 'pkce') {
        const authCode = field(body, 'auth_code');
        const flow = flows.get(authCode);
        flows.delete(authCode);
        if (!flow)
          return refuse(
            404,
            'flow_state_not_found',
            'invalid flow state, no valid flow state found',
          );
        const challenge = createHash('sha256')
          .update(field(body, 'code_verifier'))
          .digest('base64url');
        if (challenge !== flow.challenge) {
          return refuse(
            403,
            'bad_code_verifier',
            'code challenge does not match previously saved code verifier',
          );
        }
        // Google's address is verified, so it links to an account with the same address.
        const { user } = findOrCreate(flow.email);
        if (user.passwordDigest === null && !user.providers.has('google'))
          user.providers.delete('email');
        user.providers.add('google');
        user.confirmedAt ??= options.now();
        return startSession(user);
      }
      return refuse(400, 'validation_failed', 'unsupported_grant_type');
    }

    if (path === '/user') {
      const session = authenticate(call);
      if (session instanceof Response) return session;
      const user = users.get(session.userId);
      if (!user) return refuse(404, 'user_not_found', 'User from sub claim in JWT does not exist');
      if (call.method === 'GET') return json(200, userJson(user));
      if (call.method === 'PUT') {
        const password = field(body, 'password');
        if (leaked.has(password.toLowerCase())) {
          return refuse(422, 'weak_password', 'Password is known to be weak and easy to guess', {
            weak_password: { reasons: ['pwned'] },
          });
        }
        if ([...password].length < 8) {
          return refuse(422, 'weak_password', 'Password should be at least 8 characters.', {
            weak_password: { reasons: ['length'] },
          });
        }
        if (user.passwordDigest === passwordDigest(password)) {
          return refuse(
            422,
            'same_password',
            'New password should be different from the old password.',
          );
        }
        user.passwordDigest = passwordDigest(password);
        user.providers.add('email');
        // Supabase ends the user's other sessions when the password changes.
        endSessions(user.id, session.id);
        return json(200, userJson(user));
      }
    }

    if (call.method === 'POST' && path === '/logout') {
      const session = authenticate(call);
      if (session instanceof Response) return session;
      const scope = params.get('scope') ?? 'global';
      if (scope === 'local') session.ended = true;
      else if (scope === 'others') endSessions(session.userId, session.id);
      else endSessions(session.userId);
      return new Response(null, { status: 204 });
    }

    return refuse(404, 'not_found', 'Not found');
  }

  const fetch: FetchLike = async (url, init) => {
    const parsed = new URL(url);
    if (!parsed.pathname.startsWith('/auth/v1/'))
      throw new Error(`fake: not an Auth address: ${url}`);
    const call: FakeCall = {
      method: init.method,
      path: parsed.pathname.slice('/auth/v1'.length) + parsed.search,
      headers: Object.fromEntries(
        Object.entries(init.headers).map(([k, v]) => [k.toLowerCase(), v]),
      ),
      body: init.body === undefined ? undefined : JSON.parse(init.body),
    };
    calls.push(call);
    for (const override of overrides) {
      if (override.method === call.method && call.path.startsWith(override.path)) {
        const answered = override.answer(call);
        if (answered) return answered;
      }
    }
    return answer(call);
  };

  return {
    fetch,
    /** Every call made, oldest first. */
    calls: () => [...calls],
    /** Answers matching calls another way; returning undefined lets the fake answer. */
    override(method: string, path: string, answer: (call: FakeCall) => Response | undefined) {
      overrides.push({ method, path, answer });
    },
    /**
     * Plays the browser's trip through Google: it was sent to `redirectTo` (Supabase's
     * authorize address) and the person chose `email`. Returns the code the browser
     * comes back to our return address with.
     */
    googleConsent(redirectTo: string, email: string): string {
      const url = new URL(redirectTo);
      const challenge = url.searchParams.get('code_challenge');
      if (
        url.pathname !== '/auth/v1/authorize' ||
        url.searchParams.get('provider') !== 'google' ||
        !challenge
      ) {
        throw new Error('fake: not a Google authorize address');
      }
      const authCode = randomUUID();
      flows.set(authCode, { challenge, email: email.trim().toLowerCase() });
      return authCode;
    },
    /** The number of live sessions Supabase holds for an address. */
    liveSessionsFor(email: string): number {
      const user = usersByEmail.get(email);
      return [...sessions.values()].filter((s) => s.userId === user?.id && !s.ended).length;
    },
    hasUser: (email: string) => usersByEmail.has(email),
  };
}

export type FakeSupabaseAuth = ReturnType<typeof createFakeSupabaseAuth>;
