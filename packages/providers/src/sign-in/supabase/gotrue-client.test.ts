// How the client reads Supabase Auth's answers, against handwritten ones (record 018).
import { describe, expect, it } from 'vitest';
import { createGoTrueClient, SupabaseAuthUnexpected, type FetchLike } from './gotrue-client.ts';

const projectUrl = 'https://fake-project.supabase.test/';
const secretKey = 'sb_secret_fake_for_tests_only';
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const accessToken = `${b64({ alg: 'HS256' })}.${b64({ session_id: 's-1', exp: 1_800_000_000 })}.sig`;

function clientAnswering(answer: () => Response | Promise<Response>) {
  const seen: { url: string; init: Parameters<FetchLike>[1] }[] = [];
  const fetch: FetchLike = async (url, init) => {
    seen.push({ url, init });
    return answer();
  };
  return { client: createGoTrueClient({ projectUrl, secretKey, fetch }), seen };
}

describe('the Supabase Auth client', () => {
  it('reads a session, with the session id from the token', async () => {
    const { client, seen } = clientAnswering(() =>
      Response.json({
        access_token: accessToken,
        refresh_token: 'r-1',
        expires_at: 1_700_000_000,
        user: { id: 'u-1', email: 'Ana@Example.test' },
      }),
    );
    const answer = await client.signInWithPassword('ana@example.test', 'a password here');
    expect(answer).toEqual({
      ok: true,
      value: {
        accessToken,
        refreshToken: 'r-1',
        accessExpiresAt: new Date(1_700_000_000_000),
        sessionId: 's-1',
        user: { id: 'u-1', email: 'ana@example.test', emailConfirmedAt: null },
      },
    });
    expect(seen[0]?.url).toBe(
      'https://fake-project.supabase.test/auth/v1/token?grant_type=password',
    );
    expect(seen[0]?.init.headers).toMatchObject({
      apikey: secretKey,
      'x-supabase-api-version': '2024-01-01',
      'content-type': 'application/json',
    });
  });

  it('keeps when the address was confirmed, and anything else as never (record 055)', async () => {
    const at = '2026-11-01T10:00:00.000Z';
    const answers: [unknown, Date | null][] = [
      [at, new Date(at)],
      [null, null],
      [undefined, null],
      ['', null],
      ['not a time', null],
      [1_700_000_000, null],
    ];
    for (const [given, expected] of answers) {
      const { client } = clientAnswering(() =>
        Response.json({ id: 'u-1', email: 'ana@example.test', email_confirmed_at: given }),
      );
      const answer = await client.user(accessToken);
      expect(answer.ok ? answer.value.emailConfirmedAt : 'refused').toEqual(expected);
    }
  });

  it('reads the error code, the weak-password reasons and the wait', async () => {
    const { client } = clientAnswering(() =>
      Response.json(
        { code: 'weak_password', message: 'weak', weak_password: { reasons: ['pwned', 7] } },
        { status: 422, headers: { 'retry-after': '2.5' } },
      ),
    );
    expect(await client.setPassword(accessToken, 'password123')).toEqual({
      ok: false,
      refusal: { status: 422, code: 'weak_password', reasons: ['pwned'], retryAfterSeconds: 3 },
    });
  });

  it('reads the older error shape too', async () => {
    const { client } = clientAnswering(() =>
      Response.json({ error_code: 'invalid_credentials', msg: 'no' }, { status: 400 }),
    );
    const answer = await client.signInWithPassword('ana@example.test', 'wrong');
    expect(answer.ok ? undefined : answer.refusal.code).toBe('invalid_credentials');
  });

  it('throws on a 5xx, no connection, or an answer of the wrong shape, with nothing personal', async () => {
    const down = clientAnswering(() => new Response('ana@example.test', { status: 502 }));
    await expect(down.client.user(accessToken)).rejects.toThrow(SupabaseAuthUnexpected);
    const gone = clientAnswering(() => Promise.reject(new Error('ECONNREFUSED ana@example.test')));
    await expect(gone.client.user(accessToken)).rejects.toThrow(/no connection/);
    const odd = clientAnswering(() => Response.json({ access_token: 'not-a-jwt' }));
    const error = await odd.client.refresh('r-1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SupabaseAuthUnexpected);
    expect(String(error)).not.toMatch(/ana@|r-1|not-a-jwt/);
  });

  it('gives up on a call with no answer in time, and stops the timer after one that answers', async () => {
    const timers: { ms: number; fire: () => void; stopped: boolean }[] = [];
    const startTimer = (ms: number, fire: () => void) => {
      const timer = { ms, fire, stopped: false };
      timers.push(timer);
      return () => {
        timer.stopped = true;
      };
    };
    let signal: AbortSignal | undefined;
    // A fetch that never answers and ignores the signal.
    const hanging: FetchLike = (_url, init) => {
      signal = init.signal;
      return new Promise<Response>(() => {});
    };
    const client = createGoTrueClient({
      projectUrl,
      secretKey,
      fetch: hanging,
      timeoutMs: 1234,
      startTimer,
    });
    const pending = client.user(accessToken);
    expect(timers[0]?.ms).toBe(1234);
    timers[0]?.fire();
    await expect(pending).rejects.toThrow(/no answer in time/);
    expect(signal?.aborted).toBe(true);

    const answering = createGoTrueClient({
      projectUrl,
      secretKey,
      fetch: async () => Response.json({ id: 'u-1', email: 'ana@example.test' }),
      startTimer,
    });
    expect((await answering.user(accessToken)).ok).toBe(true);
    expect(timers[1]).toMatchObject({ ms: 10_000, stopped: true });
  });

  it('reads a generated code in the newer and the older shape', async () => {
    const newer = clientAnswering(() =>
      Response.json({
        user: { id: 'u-1', email: 'ana@example.test' },
        properties: { email_otp: '123456', verification_type: 'signup' },
      }),
    );
    const older = clientAnswering(() =>
      Response.json({ id: 'u-1', email: 'ana@example.test', email_otp: '123456' }),
    );
    const expected = {
      ok: true,
      value: { user: { id: 'u-1', email: 'ana@example.test' }, code: '123456' },
    };
    expect(await newer.client.generateCode('magiclink', 'ana@example.test')).toMatchObject({
      ...expected,
      value: { ...expected.value, verifyType: 'signup' },
    });
    expect(await older.client.generateCode('recovery', 'ana@example.test')).toMatchObject({
      ...expected,
      value: { ...expected.value, verifyType: 'recovery' },
    });
    expect(JSON.parse(newer.seen[0]?.init.body ?? '{}')).toEqual({
      type: 'magiclink',
      email: 'ana@example.test',
    });
  });
});
