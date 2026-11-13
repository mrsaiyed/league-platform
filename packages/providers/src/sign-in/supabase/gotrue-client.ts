// The calls the adapter makes to Supabase Auth (its server is called GoTrue), over an
// injected fetch, with no vendor library (T-191: nothing new to add). NOT VERIFIED
// AGAINST THE LIVE SERVICE: the request and answer shapes follow Supabase's published
// API and are tested against handwritten answers only (record 018).
//
// Answers are read defensively: an answer that does not have the shape we rely on
// is thrown as unexpected, never guessed at. Nothing thrown carries an address,
// a password, a code or a token (T-86).

/** The part of `fetch` the adapter uses, so tests can pass a fake Supabase. */
export type FetchLike = (
  url: string,
  init: {
    readonly method: string;
    readonly headers: Record<string, string>;
    readonly body?: string;
  },
) => Promise<Response>;

export type GoTrueUser = {
  readonly id: string;
  readonly email: string;
};

export type GoTrueSession = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessExpiresAt: Date;
  /** The `session_id` claim of the access token. */
  readonly sessionId: string;
  readonly user: GoTrueUser;
};

/** Which check an emailed code answers at `/verify`. */
export type GoTrueVerifyType = 'signup' | 'magiclink' | 'recovery';

export type GoTrueGeneratedCode = {
  readonly user: GoTrueUser;
  /** The emailed code (`properties.email_otp`). */
  readonly code: string;
  /**
   * `properties.verification_type`: Supabase answers `signup` for a magic link that
   * made a new user, and `/verify` must be asked with the same.
   */
  readonly verifyType: GoTrueVerifyType;
};

const verifyTypes: readonly string[] = ['signup', 'magiclink', 'recovery'];

export type GoTrueRefusal = {
  readonly status: number;
  /** Supabase's error code, such as `invalid_credentials`, if it gave one. */
  readonly code: string | undefined;
  /** For `weak_password`: why, such as `pwned` or `length`. */
  readonly reasons: readonly string[];
  readonly retryAfterSeconds: number | undefined;
};

export type GoTrueAnswer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly refusal: GoTrueRefusal };

/** Something Supabase answered that the adapter cannot read, or a 5xx. Carries no personal content. */
export class SupabaseAuthUnexpected extends Error {
  readonly status: number | undefined;
  readonly code: string | undefined;
  constructor(what: string, status?: number, code?: string) {
    super(
      `Supabase Auth answered ${what} unexpectedly` +
        (status === undefined ? '' : ` (status ${status}${code ? `, ${code}` : ''})`),
    );
    this.name = 'SupabaseAuthUnexpected';
    this.status = status;
    this.code = code;
  }
}

export type GoTrueClientOptions = {
  readonly projectUrl: string;
  readonly secretKey: string;
  readonly fetch: FetchLike;
};

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/** The claims of an access token Supabase has just handed us. Read, not verified: it came from Supabase itself. */
function claimsOf(accessToken: string): { sessionId: string; exp: number } | undefined {
  const payload = accessToken.split('.')[1];
  if (payload === undefined) return undefined;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!isObject(claims)) return undefined;
    const sessionId = text(claims['session_id']);
    const exp = claims['exp'];
    if (sessionId === undefined || typeof exp !== 'number') return undefined;
    return { sessionId, exp };
  } catch {
    return undefined;
  }
}

function userOf(value: unknown, what: string): GoTrueUser {
  if (!isObject(value)) throw new SupabaseAuthUnexpected(what);
  const id = text(value['id']);
  const email = text(value['email']);
  if (id === undefined || email === undefined) throw new SupabaseAuthUnexpected(what);
  return { id, email: email.toLowerCase() };
}

function sessionOf(body: unknown, what: string): GoTrueSession {
  if (!isObject(body)) throw new SupabaseAuthUnexpected(what);
  const accessToken = text(body['access_token']);
  const refreshToken = text(body['refresh_token']);
  const claims = accessToken === undefined ? undefined : claimsOf(accessToken);
  if (accessToken === undefined || refreshToken === undefined || claims === undefined) {
    throw new SupabaseAuthUnexpected(what);
  }
  const expiresAt = body['expires_at'];
  return {
    accessToken,
    refreshToken,
    // `expires_at` is in seconds; the token's own `exp` claim is the fallback.
    accessExpiresAt: new Date((typeof expiresAt === 'number' ? expiresAt : claims.exp) * 1000),
    sessionId: claims.sessionId,
    user: userOf(body['user'], what),
  };
}

function refusalOf(status: number, body: unknown, headers: Headers): GoTrueRefusal {
  const json = isObject(body) ? body : {};
  // Newer answers carry `code` as a string; older ones `error_code`, or OAuth's `error`.
  const code =
    text(json['error_code']) ??
    text(json['code']) ??
    text(headers.get('x-sb-error-code')) ??
    text(json['error']);
  const weak = json['weak_password'];
  const reasons =
    isObject(weak) && Array.isArray(weak['reasons'])
      ? weak['reasons'].filter((r): r is string => typeof r === 'string')
      : [];
  const retry = Number(headers.get('retry-after'));
  return {
    status,
    code,
    reasons,
    retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : undefined,
  };
}

export type GoTrueClient = ReturnType<typeof createGoTrueClient>;

export function createGoTrueClient(options: GoTrueClientOptions) {
  const base = `${options.projectUrl.replace(/\/+$/, '')}/auth/v1`;

  /**
   * One call. `bearer` is the person's access token, or the secret key for the admin
   * calls. A 4xx comes back as a refusal; a 5xx or a failed connection is thrown.
   */
  async function call(
    what: string,
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    bearer: string,
    body?: Json,
  ): Promise<GoTrueAnswer<unknown>> {
    const headers: Record<string, string> = {
      apikey: options.secretKey,
      authorization: `Bearer ${bearer}`,
      // Asks for the newer error shape, with string error codes.
      'x-supabase-api-version': '2024-01-01',
      accept: 'application/json',
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    let response: Response;
    try {
      response = await options.fetch(`${base}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new SupabaseAuthUnexpected(`${what}: no connection`);
    }
    const raw = await response.text();
    let parsed: unknown = undefined;
    if (raw.length) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = undefined;
      }
    }
    if (response.ok) return { ok: true, value: parsed };
    const refusal = refusalOf(response.status, parsed, response.headers);
    if (response.status >= 500 || response.status < 400) {
      throw new SupabaseAuthUnexpected(what, response.status, refusal.code);
    }
    return { ok: false, refusal };
  }

  const mapAnswer = <T>(
    answer: GoTrueAnswer<unknown>,
    read: (body: unknown) => T,
  ): GoTrueAnswer<T> => (answer.ok ? { ok: true, value: read(answer.value) } : answer);

  const admin = options.secretKey;

  return {
    /**
     * A code for the address without sending any email (we send our own, T4 §3).
     * `magiclink` makes a user if there is none; `recovery` answers 404 instead.
     */
    async generateCode(type: 'magiclink' | 'recovery', email: string) {
      const what = 'generate_link';
      const answer = await call(what, 'POST', '/admin/generate_link', admin, { type, email });
      return mapAnswer<GoTrueGeneratedCode>(answer, (body) => {
        // Older answers put the user's fields at the top level, newer under `user`.
        const json = isObject(body) ? body : {};
        const properties = isObject(json['properties']) ? json['properties'] : json;
        const code = text(properties['email_otp']);
        const verifyType = text(properties['verification_type']) ?? type;
        if (code === undefined || !verifyTypes.includes(verifyType)) {
          throw new SupabaseAuthUnexpected(what);
        }
        return {
          user: userOf(isObject(json['user']) ? json['user'] : json, what),
          code,
          verifyType: verifyType as GoTrueVerifyType,
        };
      });
    },

    /** Checks an emailed code; a right one gives a session. */
    async verifyCode(type: GoTrueVerifyType, email: string, code: string) {
      const what = 'verify';
      const answer = await call(what, 'POST', '/verify', admin, { type, email, token: code });
      return mapAnswer(answer, (body) => sessionOf(body, what));
    },

    /** A check that cannot succeed, for the same work when no code was sent (T-68). */
    async verifyNothing(tokenHash: string) {
      await call('verify', 'POST', '/verify', admin, { type: 'recovery', token_hash: tokenHash });
    },

    /** Sets the password of the session's user. Supabase ends the user's other sessions. */
    async setPassword(accessToken: string, password: string) {
      const answer = await call('user update', 'PUT', '/user', accessToken, { password });
      return mapAnswer(answer, () => null);
    },

    async signInWithPassword(email: string, password: string) {
      const what = 'password sign-in';
      const answer = await call(what, 'POST', '/token?grant_type=password', admin, {
        email,
        password,
      });
      return mapAnswer(answer, (body) => sessionOf(body, what));
    },

    async refresh(refreshToken: string) {
      const what = 'refresh';
      const answer = await call(what, 'POST', '/token?grant_type=refresh_token', admin, {
        refresh_token: refreshToken,
      });
      return mapAnswer(answer, (body) => sessionOf(body, what));
    },

    /** Finishes Google (PKCE): the code the browser came back with and our verifier. */
    async exchangeCode(authCode: string, verifier: string) {
      const what = 'pkce exchange';
      const answer = await call(what, 'POST', '/token?grant_type=pkce', admin, {
        auth_code: authCode,
        code_verifier: verifier,
      });
      return mapAnswer(answer, (body) => sessionOf(body, what));
    },

    /** Who the access token belongs to, if its session is still alive at Supabase. */
    async user(accessToken: string) {
      const answer = await call('user', 'GET', '/user', accessToken);
      return mapAnswer(answer, (body) => userOf(body, 'user'));
    },

    /** Ends this session (`local`), every other one (`others`) or all (`global`). */
    async signOut(accessToken: string, scope: 'local' | 'others' | 'global') {
      const answer = await call('logout', 'POST', `/logout?scope=${scope}`, accessToken);
      return mapAnswer(answer, () => null);
    },

    /** Where to send the browser for Google: Supabase's authorize address, with our PKCE challenge. */
    authorizeAddress(provider: 'google', returnAddress: string, challenge: string) {
      const url = new URL(`${base}/authorize`);
      url.searchParams.set('provider', provider);
      url.searchParams.set('redirect_to', returnAddress);
      url.searchParams.set('code_challenge', challenge);
      url.searchParams.set('code_challenge_method', 's256');
      return url.toString();
    },
  };
}
