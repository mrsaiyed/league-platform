// Each operation of the sign-in interface on the Supabase adapter, against a fake
// Supabase Auth (T4 §3, T-225, record 018). Not verified against the live service.
import { describe, expect, it, vi } from 'vitest';
import { fail } from '@srleagues/core';
import { createSignInCodeCapture } from '../local/code-capture.ts';
import { createMemorySignInStore } from './memory-sign-in-store.ts';
import { createSupabaseSignIn } from './supabase-sign-in.ts';
import { SupabaseAuthUnexpected } from './gotrue-client.ts';
import {
  codeFor,
  here,
  laptop,
  phone,
  projectUrl,
  proofFor,
  returnOrigin,
  secretKey,
  setup,
  signInWithGoogle,
  signUp,
  strongPassword,
  value,
  type Setup,
} from './supabase-sign-in.test-helper.ts';

const elsewhere = '203.0.113.7';
const errorCode = (result: { ok: boolean; error?: { code: string } }) =>
  result.ok ? 'ok' : result.error?.code;

describe('starting', () => {
  const base = () => ({
    projectUrl,
    secretKey,
    fetch: () => Promise.reject(new Error('no network in tests')),
    store: createMemorySignInStore({ environment: 'test', nodeEnv: 'test' }),
    codeSender: createSignInCodeCapture().sender,
  });

  it('needs an https project address and a secret key', () => {
    expect(() => createSupabaseSignIn({ ...base(), projectUrl: 'http://example.test' })).toThrow(
      /https/,
    );
    expect(() => createSupabaseSignIn({ ...base(), projectUrl: 'not an address' })).toThrow();
    expect(() => createSupabaseSignIn({ ...base(), secretKey: '' })).toThrow(/secret key/);
    expect(() =>
      createSupabaseSignIn({
        ...base(),
        projectUrl: 'http://127.0.0.1:54321',
        allowLocalHttp: true,
      }),
    ).not.toThrow();
  });

  it('refuses the in-memory store outside development and tests', () => {
    expect(() =>
      createMemorySignInStore({ environment: 'production' as 'test', nodeEnv: 'production' }),
    ).toThrow(/development and tests only/);
    expect(() => createMemorySignInStore({ environment: 'test', nodeEnv: 'production' })).toThrow();
  });

  it("throws on a device or network address that does not fit: the app's mistake", async () => {
    const env = setup();
    await expect(
      env.sign.startSignUp({ email: 'ana@example.test', networkAddress: 'not an ip' }),
    ).rejects.toThrow(TypeError);
    await expect(
      env.sign.signIn({
        email: 'ana@example.test',
        password: strongPassword,
        device: { ...laptop, deviceId: 'short' },
      }),
    ).rejects.toThrow(TypeError);
  });

  it('sends the secret key only as the key, and never asks Supabase to send an email', async () => {
    const env = setup();
    await signUp(env, 'ana@example.test');
    const calls = env.fake.calls();
    expect(calls.every((c) => c.headers['apikey'] === secretKey)).toBe(true);
    // Codes come from the admin call that sends nothing; Supabase's own sender is never used.
    expect(calls.some((c) => c.path.startsWith('/otp') || c.path.startsWith('/recover'))).toBe(
      false,
    );
  });
});

describe('sign-up with an emailed code', () => {
  it('sends a 6-digit code, valid 10 minutes, through our own sender', async () => {
    const env = setup();
    expect(
      await env.sign.startSignUp({ email: '  Ana@Example.TEST ', networkAddress: here }),
    ).toEqual({ ok: true, value: { codeValidMinutes: 10 } });
    const [message] = env.capture.messages();
    expect(message).toMatchObject({
      to: 'ana@example.test',
      purpose: 'sign-up',
      accountExists: false,
      expiresAt: new Date(Date.UTC(2026, 10, 13, 12, 10)),
    });
    expect(message?.code).toMatch(/^\d{6}$/);
  });

  it('refuses an address that is not one, without asking Supabase', async () => {
    const env = setup();
    expect(await env.sign.startSignUp({ email: 'nope', networkAddress: here })).toEqual(
      fail({ code: 'invalid-email' }),
    );
    expect(env.fake.calls()).toHaveLength(0);
  });

  it('creates the account from the code and a password, and signs the device in', async () => {
    const env = setup();
    const done = await signUp(env, 'ana@example.test');
    expect(done).toMatchObject({ outcome: 'account-created', newDevice: false, endedSessions: 0 });
    const who = value(await env.sign.identify({ accessToken: done.session.accessToken }));
    expect(who).toMatchObject({
      accountId: done.accountId,
      email: 'ana@example.test',
      emailConfirmed: true,
      sessionId: done.session.sessionId,
      hasPassword: true,
    });
    expect(
      value(
        await env.sign.signIn({
          email: 'ana@example.test',
          password: strongPassword,
          device: laptop,
        }),
      ).accountId,
    ).toBe(done.accountId);
  });

  it('says whether the address had an account after a right code, and nothing before (R-31, T-68)', async () => {
    const env = setup();
    await signUp(env, 'ana@example.test');
    for (const purpose of ['sign-up', 'reset'] as const) {
      const ask = purpose === 'sign-up' ? env.sign.startSignUp : env.sign.startReset;
      const asked = [
        await ask({ email: 'ana@example.test', networkAddress: here }),
        await ask({ email: 'bo@example.test', networkAddress: here }),
      ];
      // Before a right code: the same answers for both.
      expect(asked[0]).toEqual(asked[1]);
      const wrong = (email: string) =>
        env.sign.verifyCode({ email, code: '000000', networkAddress: here });
      expect(await wrong('ana@example.test')).toEqual(await wrong('bo@example.test'));
      // After a right code: the holder of the mailbox is told.
      const known = value(
        await env.sign.verifyCode({
          email: 'ana@example.test',
          code: codeFor(env, 'ana@example.test'),
          networkAddress: here,
        }),
      );
      expect(known.accountExists).toBe(true);
      if (purpose === 'sign-up') {
        const unknown = value(
          await env.sign.verifyCode({
            email: 'bo@example.test',
            code: codeFor(env, 'bo@example.test'),
            networkAddress: here,
          }),
        );
        expect(unknown.accountExists).toBe(false);
      }
    }
  });

  it('accepts the code with spaces typed between the digits', async () => {
    const env = setup();
    await env.sign.startSignUp({ email: 'ana@example.test', networkAddress: here });
    const code = codeFor(env, 'ana@example.test');
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    expect(
      (await env.sign.verifyCode({ email: 'ana@example.test', code: spaced, networkAddress: here }))
        .ok,
    ).toBe(true);
  });

  it('allows 5 attempts per code, where Supabase would allow more', async () => {
    const env = setup();
    await env.sign.startSignUp({ email: 'ana@example.test', networkAddress: here });
    const code = codeFor(env, 'ana@example.test');
    const wrong = code === '000000' ? '111111' : '000000';
    const tries = [];
    for (let i = 0; i < 5; i++) {
      tries.push(
        errorCode(
          await env.sign.verifyCode({
            email: 'ana@example.test',
            code: wrong,
            networkAddress: here,
          }),
        ),
      );
    }
    tries.push(
      errorCode(
        await env.sign.verifyCode({ email: 'ana@example.test', code, networkAddress: here }),
      ),
    );
    expect(tries).toEqual([
      'code-wrong',
      'code-wrong',
      'code-wrong',
      'code-wrong',
      'too-many-attempts',
      'too-many-attempts',
    ]);
  });

  it('says a code has expired after 10 minutes, where Supabase says "expired or invalid"', async () => {
    const env = setup();
    await env.sign.startSignUp({ email: 'ana@example.test', networkAddress: here });
    const code = codeFor(env, 'ana@example.test');
    env.advanceSeconds(10 * 60);
    expect(
      await env.sign.verifyCode({ email: 'ana@example.test', code, networkAddress: here }),
    ).toEqual(fail({ code: 'code-expired' }));
  });

  it('sends 5 codes an hour per address, 60 sign-ups and 200 other codes per network (T-225, T-507, T-509)', async () => {
    const env = setup();
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(
        errorCode(await env.sign.startSignUp({ email: 'ana@example.test', networkAddress: here })),
      );
    }
    expect(results).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'too-many-attempts']);
    const network = [];
    for (let i = 0; i < 56; i++) {
      network.push(
        errorCode(
          await env.sign.startSignUp({ email: `p${i}@example.test`, networkAddress: here }),
        ),
      );
    }
    expect(network.filter((r) => r === 'ok')).toHaveLength(55);
    expect(network.at(-1)).toBe('too-many-attempts');
    // Codes for resetting are counted apart, on their own 200 an hour.
    const resets = [];
    for (let i = 0; i < 201; i++) {
      resets.push(
        errorCode(await env.sign.startReset({ email: `r${i}@example.test`, networkAddress: here })),
      );
    }
    expect(resets.filter((r) => r === 'ok')).toHaveLength(200);
    expect(resets.at(-1)).toBe('too-many-attempts');
  });

  it('limits wrong codes per network across addresses (T-225)', async () => {
    const env = setup({
      settings: {
        guessesPerNetwork: {
          windowMinutes: 15,
          slowAfter: 3,
          slowSeconds: 5,
          lockAfter: 4,
          lockMinutes: 15,
        },
      },
    });
    const results = [];
    for (let i = 0; i < 5; i++) {
      const email = `p${i}@example.test`;
      await env.sign.startSignUp({ email, networkAddress: here });
      const code = codeFor(env, email);
      results.push(
        errorCode(
          await env.sign.verifyCode({
            email,
            code: code === '000000' ? '111111' : '000000',
            networkAddress: here,
          }),
        ),
      );
      env.advanceSeconds(10);
    }
    expect(results).toEqual([
      'code-wrong',
      'code-wrong',
      'code-wrong',
      'code-wrong',
      'too-many-attempts',
    ]);
    // Another network is not held back.
    await env.sign.startSignUp({ email: 'other@example.test', networkAddress: elsewhere });
    expect(
      errorCode(
        await env.sign.verifyCode({
          email: 'other@example.test',
          code: codeFor(env, 'other@example.test'),
          networkAddress: elsewhere,
        }),
      ),
    ).toBe('ok');
  });

  it('keeps no code the sender could not take, and says so', async () => {
    const env = setup({ codeSender: { send: async () => fail({ code: 'code-not-sent' }) } });
    expect(await env.sign.startSignUp({ email: 'ana@example.test', networkAddress: here })).toEqual(
      fail({ code: 'code-not-sent' }),
    );
    expect(
      await env.sign.verifyCode({
        email: 'ana@example.test',
        code: '123456',
        networkAddress: here,
      }),
    ).toEqual(fail({ code: 'code-expired' }));
  });

  it('turns Supabase being busy into a wait, like our own limits', async () => {
    const env = setup();
    env.fake.override('POST', '/admin/generate_link', () =>
      Response.json(
        { code: 'over_request_rate_limit' },
        { status: 429, headers: { 'retry-after': '42' } },
      ),
    );
    expect(await env.sign.startSignUp({ email: 'ana@example.test', networkAddress: here })).toEqual(
      fail({ code: 'too-many-attempts', retryAfterSeconds: 42 }),
    );
  });

  it('does not count a code check against the network when Supabase is busy or down', async () => {
    const env = setup({
      settings: {
        guessesPerNetwork: {
          windowMinutes: 15,
          slowAfter: 2,
          slowSeconds: 5,
          lockAfter: 3,
          lockMinutes: 15,
        },
      },
    });
    await env.sign.startSignUp({ email: 'ana@example.test', networkAddress: here });
    const code = codeFor(env, 'ana@example.test');
    let answer: (() => Response) | undefined = () =>
      Response.json({ code: 'over_request_rate_limit' }, { status: 429 });
    env.fake.override('POST', '/verify', () => answer?.());
    const check = () =>
      env.sign.verifyCode({ email: 'ana@example.test', code, networkAddress: here });
    expect(await check()).toEqual(fail({ code: 'too-many-attempts', retryAfterSeconds: 60 }));
    answer = () => new Response('{}', { status: 500 });
    await expect(check()).rejects.toThrow(SupabaseAuthUnexpected);
    answer = () => Response.json({ code: 'unexpected_failure' }, { status: 400 });
    await expect(check()).rejects.toThrow(/unexpected_failure/);
    answer = undefined;
    // Three tries used of the code's five, none of them counted against the network.
    expect(errorCode(await check())).toBe('ok');
  });

  it('answers a reset the same way, with no code, whatever Supabase refuses it with', async () => {
    const env = setup();
    env.fake.override('POST', '/admin/generate_link', () =>
      Response.json({ code: 'validation_failed' }, { status: 422 }),
    );
    expect(await env.sign.startReset({ email: 'ana@example.test', networkAddress: here })).toEqual({
      ok: true,
      value: { codeValidMinutes: 10 },
    });
    expect(env.capture.messages()).toMatchObject([{ code: null, accountExists: false }]);
    // A sign-up refused is not an answer we have.
    await expect(
      env.sign.startSignUp({ email: 'ana@example.test', networkAddress: here }),
    ).rejects.toThrow(/validation_failed/);
  });

  it('refuses a project whose codes are not 6 digits', async () => {
    const env = setup();
    env.fake.override('POST', '/admin/generate_link', () =>
      Response.json({
        id: 'u1',
        email: 'ana@example.test',
        email_otp: '12345678',
        verification_type: 'signup',
      }),
    );
    await expect(
      env.sign.startSignUp({ email: 'ana@example.test', networkAddress: here }),
    ).rejects.toThrow(SupabaseAuthUnexpected);
  });
});

describe('setting a password', () => {
  it('needs 8 characters to 72 bytes, and refuses leaked passwords (T-85, T-225)', async () => {
    const env = setup();
    const proof = await proofFor(env, 'ana@example.test');
    const set = (password: string) =>
      env.sign.setPassword({ proof, password, device: laptop }).then(errorCode);
    expect(await set('short')).toBe('password-too-short');
    expect(await set('é'.repeat(37))).toBe('password-too-long');
    expect(await set('password123')).toBe('password-leaked');
    // The proof survives each of these, so the person can try again.
    expect(await set(strongPassword)).toBe('ok');
    expect(await set(strongPassword)).toBe('proof-invalid');
  });

  it('takes each proof once, and not after it runs out', async () => {
    const env = setup();
    const proof = await proofFor(env, 'ana@example.test');
    env.advanceSeconds(15 * 60);
    expect(await env.sign.setPassword({ proof, password: strongPassword, device: laptop })).toEqual(
      fail({ code: 'proof-invalid' }),
    );
    expect(
      await env.sign.setPassword({ proof: 'made-up', password: strongPassword, device: laptop }),
    ).toEqual(fail({ code: 'proof-invalid' }));
  });

  it('makes one account when two proofs for a new address are used at once', async () => {
    const env = setup();
    const first = await proofFor(env, 'ana@example.test');
    // The second code ends the first at Supabase too; ours keeps both proofs, and one wins.
    const second = await proofFor(env, 'ana@example.test');
    const results = await Promise.all(
      [first, second].map((proof) =>
        env.sign.setPassword({ proof, password: strongPassword, device: laptop }),
      ),
    );
    const outcomes = results.map((r) => (r.ok ? r.value.outcome : r.error.code));
    expect(outcomes.sort()).toEqual(['account-created', 'proof-invalid']);
    // Only one of them reached Supabase.
    expect(env.callsSince(0).filter((c) => c === 'PUT /user')).toHaveLength(1);
  });

  it('keeps the proof when Supabase is down, silent or busy', async () => {
    const env = setup();
    const proof = await proofFor(env, 'ana@example.test');
    let answer: (() => Response) | undefined = () => new Response('{}', { status: 503 });
    env.fake.override('PUT', '/user', () => answer?.());
    const set = () => env.sign.setPassword({ proof, password: strongPassword, device: laptop });
    await expect(set()).rejects.toThrow(SupabaseAuthUnexpected);
    answer = () => Response.json({ code: 'over_request_rate_limit' }, { status: 429 });
    await expect(set()).rejects.toThrow(SupabaseAuthUnexpected);
    answer = () => {
      throw new Error('ECONNRESET');
    };
    await expect(set()).rejects.toThrow(/no connection/);
    answer = undefined;
    expect(value(await set()).outcome).toBe('account-created');
  });

  it('throws on a refusal it does not expect, and turns an ended session into proof-invalid', async () => {
    const env = setup();
    const proof = await proofFor(env, 'ana@example.test');
    let code = 'validation_failed';
    env.fake.override('PUT', '/user', () => Response.json({ code }, { status: 422 }));
    await expect(
      env.sign.setPassword({ proof, password: strongPassword, device: laptop }),
    ).rejects.toThrow(/validation_failed/);
    const again = await proofFor(env, 'ana@example.test');
    code = 'session_not_found';
    expect(
      await env.sign.setPassword({ proof: again, password: strongPassword, device: laptop }),
    ).toEqual(fail({ code: 'proof-invalid' }));
  });
});

describe('sign-in', () => {
  it('signs in with the right password and refuses a wrong one', async () => {
    const env = setup();
    const { accountId } = await signUp(env, 'ana@example.test');
    const right = value(
      await env.sign.signIn({ email: 'ANA@example.test', password: strongPassword, device: phone }),
    );
    expect(right).toMatchObject({ accountId, newDevice: true });
    expect(
      await env.sign.signIn({
        email: 'ana@example.test',
        password: 'wrong password',
        device: laptop,
      }),
    ).toEqual(fail({ code: 'wrong-email-or-password' }));
  });

  it('says when the device is new to the account (T-70)', async () => {
    const env = setup();
    await signUp(env, 'ana@example.test');
    const again = (device = laptop) =>
      env.sign.signIn({ email: 'ana@example.test', password: strongPassword, device });
    expect(value(await again()).newDevice).toBe(false);
    expect(value(await again(phone)).newDevice).toBe(true);
    expect(value(await again(phone)).newDevice).toBe(false);
  });

  it('never sends a password over 72 bytes, which Supabase would cut and match (T-225)', async () => {
    const env = setup();
    const long = 'a'.repeat(72);
    await signUp(env, 'ana@example.test', long);
    const before = env.fake.calls().length;
    expect(
      await env.sign.signIn({ email: 'ana@example.test', password: `${long}b`, device: laptop }),
    ).toEqual(fail({ code: 'wrong-email-or-password' }));
    // One call still goes, with a random password in its place (T-68: the same work).
    const sent = env.fake.calls().slice(before);
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(sent[0]?.body)).not.toContain(long);
    expect(
      (await env.sign.signIn({ email: 'ana@example.test', password: long, device: laptop })).ok,
    ).toBe(true);
  });

  it('slows, then locks, wrong guesses for an address; a right password resets the count', async () => {
    const env = setup();
    await signUp(env, 'ana@example.test');
    const guess = (password = 'wrong password') =>
      env.sign.signIn({ email: 'ana@example.test', password, device: laptop }).then(errorCode);
    for (let i = 0; i < 4; i++) expect(await guess()).toBe('wrong-email-or-password');
    expect(await guess(strongPassword)).toBe('ok');
    const later = [];
    for (let i = 0; i < 6; i++) later.push(await guess());
    expect(later).toEqual([...Array(5).fill('wrong-email-or-password'), 'too-many-attempts']);
  });

  it('lets no more than the limit through when guesses arrive at once', async () => {
    const env = setup();
    await signUp(env, 'ana@example.test');
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        env.sign.signIn({ email: 'ana@example.test', password: 'wrong password', device: laptop }),
      ),
    );
    expect(results.map(errorCode).filter((c) => c === 'wrong-email-or-password')).toHaveLength(5);
  });

  it('never answers a password sooner than the floor, so a quick "no such address" looks like a wrong password (T-68)', async () => {
    let clock = 0;
    let took = 200;
    const env = setup({ elapsed: () => clock });
    await signUp(env, 'ana@example.test');
    env.fake.override('POST', '/token?grant_type=password', () => {
      clock += took;
      return undefined;
    });
    await env.sign.signIn({ email: 'nobody@example.test', password: 'whatever', device: laptop });
    await env.sign.signIn({ email: 'ana@example.test', password: strongPassword, device: laptop });
    expect(env.sleeps).toEqual([550, 550]);
    // A slow answer gets no wait added.
    took = 900;
    await env.sign.signIn({ email: 'ana@example.test', password: 'wrong one', device: laptop });
    expect(env.sleeps).toHaveLength(2);
    // The password again before a sensitive action is held to the same floor.
    took = 100;
    const { session } = value(
      await env.sign.signIn({
        email: 'ana@example.test',
        password: strongPassword,
        device: laptop,
      }),
    );
    await env.sign.confirmPassword({
      accessToken: session.accessToken,
      password: strongPassword,
      networkAddress: here,
    });
    expect(env.sleeps.slice(2)).toEqual([650, 650]);
  });

  it('does not count a try against the person when Supabase is busy or down', async () => {
    const env = setup();
    await signUp(env, 'ana@example.test');
    let busy: (() => Response) | undefined = () =>
      Response.json({ code: 'over_request_rate_limit' }, { status: 429 });
    env.fake.override('POST', '/token?grant_type=password', () => busy?.());
    const guess = () =>
      env.sign
        .signIn({ email: 'ana@example.test', password: 'wrong password', device: laptop })
        .then(errorCode);
    for (let i = 0; i < 12; i++) expect(await guess()).toBe('too-many-attempts');
    busy = () => new Response('{}', { status: 502 });
    for (let i = 0; i < 12; i++) await expect(guess()).rejects.toThrow(SupabaseAuthUnexpected);
    busy = undefined;
    const later = [];
    for (let i = 0; i < 6; i++) later.push(await guess());
    expect(later).toEqual([...Array(5).fill('wrong-email-or-password'), 'too-many-attempts']);
  });

  it('throws on a password refusal it does not expect, rather than calling it wrong', async () => {
    const env = setup();
    await signUp(env, 'ana@example.test');
    env.fake.override('POST', '/token?grant_type=password', () =>
      Response.json({ code: 'validation_failed' }, { status: 400 }),
    );
    await expect(
      env.sign.signIn({ email: 'ana@example.test', password: strongPassword, device: laptop }),
    ).rejects.toThrow(/validation_failed/);
  });

  it('refuses a sign-up that was never finished as just wrong', async () => {
    const env = setup();
    await env.sign.startSignUp({ email: 'ana@example.test', networkAddress: here });
    expect(
      await env.sign.signIn({
        email: 'ana@example.test',
        password: strongPassword,
        device: laptop,
      }),
    ).toEqual(fail({ code: 'wrong-email-or-password' }));
  });
});

describe('Google sign-in', () => {
  it('creates an account for a new address and signs an existing one in', async () => {
    const env = setup();
    const made = await signInWithGoogle(env, 'gia@example.test');
    expect(made).toMatchObject({ outcome: 'account-created', newDevice: false });
    const who = value(await env.sign.identify({ accessToken: made.session.accessToken }));
    expect(who.hasPassword).toBe(false);
    expect(who.passwordEnteredAt).toBeNull();

    const { accountId } = await signUp(env, 'ana@example.test');
    const again = await signInWithGoogle(env, 'ana@example.test', phone);
    expect(again).toMatchObject({ accountId, outcome: 'signed-in', newDevice: true });
  });

  it('sends the browser to Supabase with a PKCE challenge, and back only to our addresses', async () => {
    const env = setup();
    const started = value(
      await env.sign.startExternalSignIn({
        provider: 'google',
        returnAddress: `${returnOrigin}/auth/return`,
      }),
    );
    const url = new URL(started.redirectTo);
    expect(url.origin + url.pathname).toBe(`${projectUrl}/auth/v1/authorize`);
    expect(url.searchParams.get('code_challenge_method')).toBe('s256');
    expect(url.searchParams.get('redirect_to')).toBe(`${returnOrigin}/auth/return`);
    expect(
      await env.sign.startExternalSignIn({
        provider: 'google',
        returnAddress: 'https://evil.example/auth/return',
      }),
    ).toEqual(fail({ code: 'return-address-refused' }));
    const none = setup({ returnOrigins: [] });
    expect(
      await none.sign.startExternalSignIn({
        provider: 'google',
        returnAddress: `${returnOrigin}/auth/return`,
      }),
    ).toEqual(fail({ code: 'return-address-refused' }));
  });

  it('fails with the wrong verifier, or a second time', async () => {
    const env = setup();
    const started = value(
      await env.sign.startExternalSignIn({
        provider: 'google',
        returnAddress: `${returnOrigin}/auth/return`,
      }),
    );
    const code = env.fake.googleConsent(started.redirectTo, 'gia@example.test');
    const finish = (verifier: string) =>
      env.sign.completeExternalSignIn({ provider: 'google', code, verifier, device: laptop });
    expect(await finish('not-the-verifier')).toEqual(fail({ code: 'external-sign-in-failed' }));
    expect(await finish(started.verifier)).toEqual(fail({ code: 'external-sign-in-failed' }));
    expect(
      await env.sign.completeExternalSignIn({
        provider: 'google',
        code: '',
        verifier: started.verifier,
        device: laptop,
      }),
    ).toEqual(fail({ code: 'external-sign-in-failed' }));
  });

  it('throws on a refusal it does not expect', async () => {
    const env = setup();
    env.fake.override('POST', '/token?grant_type=pkce', () =>
      Response.json({ code: 'validation_failed' }, { status: 400 }),
    );
    await expect(
      env.sign.completeExternalSignIn({
        provider: 'google',
        code: 'some-code',
        verifier: 'some-verifier',
        device: laptop,
      }),
    ).rejects.toThrow(/validation_failed/);
  });
});

describe('sessions', () => {
  it('renews with a refresh token that changes each time, and the old access token stops (T-69)', async () => {
    const env = setup();
    const { session } = await signUp(env, 'ana@example.test');
    env.advanceSeconds(60 * 60);
    expect(await env.sign.identify({ accessToken: session.accessToken })).toEqual(
      fail({ code: 'access-expired' }),
    );
    const renewed = value(await env.sign.renew({ refreshToken: session.refreshToken }));
    expect(renewed.sessionId).toBe(session.sessionId);
    expect(renewed.refreshToken).not.toBe(session.refreshToken);
    expect((await env.sign.identify({ accessToken: renewed.accessToken })).ok).toBe(true);
    expect(await env.sign.identify({ accessToken: session.accessToken })).toEqual(
      fail({ code: 'session-ended' }),
    );
  });

  it('ends the session when an old refresh token is used again, even inside Supabase’s reuse window', async () => {
    const env = setup();
    const { session } = await signUp(env, 'ana@example.test');
    const renewed = value(await env.sign.renew({ refreshToken: session.refreshToken }));
    env.advanceSeconds(2);
    expect(await env.sign.renew({ refreshToken: session.refreshToken })).toEqual(
      fail({ code: 'session-ended' }),
    );
    expect(await env.sign.renew({ refreshToken: renewed.refreshToken })).toEqual(
      fail({ code: 'session-ended' }),
    );
    expect(await env.sign.identify({ accessToken: renewed.accessToken })).toEqual(
      fail({ code: 'session-ended' }),
    );
    expect(env.fake.liveSessionsFor('ana@example.test')).toBe(0);
  });

  it('never passes a refresh token it did not issue to Supabase', async () => {
    const env = setup();
    const before = env.fake.calls().length;
    expect(await env.sign.renew({ refreshToken: 'made-up' })).toEqual(
      fail({ code: 'session-ended' }),
    );
    expect(env.fake.calls()).toHaveLength(before);
  });

  it('lets a renewal be tried again when Supabase could not be reached', async () => {
    const env = setup();
    const { session } = await signUp(env, 'ana@example.test');
    let down = true;
    env.fake.override('POST', '/token?grant_type=refresh_token', () =>
      down ? new Response('{}', { status: 503 }) : undefined,
    );
    await expect(env.sign.renew({ refreshToken: session.refreshToken })).rejects.toThrow(
      SupabaseAuthUnexpected,
    );
    down = false;
    expect((await env.sign.renew({ refreshToken: session.refreshToken })).ok).toBe(true);
  });

  it('treats an access token as run out 30 seconds early', async () => {
    const env = setup();
    const { session } = await signUp(env, 'ana@example.test');
    env.advanceSeconds(60 * 60 - 31);
    expect((await env.sign.identify({ accessToken: session.accessToken })).ok).toBe(true);
    env.advanceSeconds(1);
    expect(await env.sign.identify({ accessToken: session.accessToken })).toEqual(
      fail({ code: 'access-expired' }),
    );
  });

  it('reads Supabase finding the token run out as access-expired, and leaves the session to renew', async () => {
    const env = setup();
    const { session } = await signUp(env, 'ana@example.test');
    let expired = true;
    env.fake.override('GET', '/user', () =>
      expired ? Response.json({ code: 'bad_jwt' }, { status: 403 }) : undefined,
    );
    expect(await env.sign.identify({ accessToken: session.accessToken })).toEqual(
      fail({ code: 'access-expired' }),
    );
    expired = false;
    const renewed = value(await env.sign.renew({ refreshToken: session.refreshToken }));
    expect((await env.sign.identify({ accessToken: renewed.accessToken })).ok).toBe(true);
  });

  it('throws on a refusal it does not expect from Supabase, and ends nothing', async () => {
    const env = setup();
    const { session } = await signUp(env, 'ana@example.test');
    let odd = true;
    env.fake.override('GET', '/user', () =>
      odd ? Response.json({ code: 'over_request_rate_limit' }, { status: 429 }) : undefined,
    );
    env.fake.override('POST', '/token?grant_type=refresh_token', () =>
      odd ? Response.json({ code: 'validation_failed' }, { status: 400 }) : undefined,
    );
    await expect(env.sign.identify({ accessToken: session.accessToken })).rejects.toThrow(
      SupabaseAuthUnexpected,
    );
    await expect(env.sign.renew({ refreshToken: session.refreshToken })).rejects.toThrow(
      /validation_failed/,
    );
    odd = false;
    expect((await env.sign.identify({ accessToken: session.accessToken })).ok).toBe(true);
    expect((await env.sign.renew({ refreshToken: session.refreshToken })).ok).toBe(true);
  });

  it('notices a session ended at Supabase', async () => {
    const env = setup();
    const { session } = await signUp(env, 'ana@example.test');
    env.fake.override('GET', '/user', () =>
      Response.json({ code: 'session_not_found' }, { status: 403 }),
    );
    expect(await env.sign.identify({ accessToken: session.accessToken })).toEqual(
      fail({ code: 'session-ended' }),
    );
  });

  it('signs out by the access token, or by the refresh token after it has run out', async () => {
    const env = setup();
    const first = await signUp(env, 'ana@example.test');
    expect(await env.sign.signOut({ accessToken: first.session.accessToken })).toEqual({
      ok: true,
      value: { ended: true },
    });
    expect(await env.sign.signOut({ accessToken: first.session.accessToken })).toEqual({
      ok: true,
      value: { ended: false },
    });
    const second = value(
      await env.sign.signIn({ email: 'ana@example.test', password: strongPassword, device: phone }),
    );
    env.advanceSeconds(2 * 60 * 60);
    expect(await env.sign.signOut({ refreshToken: second.session.refreshToken })).toEqual({
      ok: true,
      value: { ended: true },
    });
    expect(await env.sign.renew({ refreshToken: second.session.refreshToken })).toEqual(
      fail({ code: 'session-ended' }),
    );
    expect(env.fake.liveSessionsFor('ana@example.test')).toBe(0);
  });

  it('lists active sessions by device and time, most recently active first (T-71)', async () => {
    const env = setup();
    const onLaptop = await signUp(env, 'ana@example.test');
    env.advanceSeconds(60);
    const onPhone = value(
      await env.sign.signIn({ email: 'ana@example.test', password: strongPassword, device: phone }),
    );
    env.advanceSeconds(60);
    const list = value(await env.sign.listSessions({ accessToken: onLaptop.session.accessToken }));
    expect(list.map((s) => [s.deviceLabel, s.current])).toEqual([
      ['Firefox on Windows', true],
      ['Safari on iPhone', false],
    ]);
    expect(list[1]?.sessionId).toBe(onPhone.session.sessionId);
  });

  it('signs out everywhere else at once, or everywhere including here (T-70, T-71)', async () => {
    const env = setup();
    const here1 = await signUp(env, 'ana@example.test');
    const there = value(
      await env.sign.signIn({ email: 'ana@example.test', password: strongPassword, device: phone }),
    );
    expect(
      await env.sign.signOutEverywhere({
        accessToken: here1.session.accessToken,
        keepThisSession: true,
      }),
    ).toEqual({ ok: true, value: { endedSessions: 1 } });
    expect(errorCode(await env.sign.identify({ accessToken: there.session.accessToken }))).toBe(
      'session-ended',
    );
    expect(env.fake.liveSessionsFor('ana@example.test')).toBe(1);
    expect(
      await env.sign.signOutEverywhere({
        accessToken: here1.session.accessToken,
        keepThisSession: false,
      }),
    ).toEqual({ ok: true, value: { endedSessions: 1 } });
    expect(env.fake.liveSessionsFor('ana@example.test')).toBe(0);
  });
});

describe('the password again before a sensitive action (T-70)', () => {
  it('records when the password was typed, and leaves no extra session at Supabase', async () => {
    const env = setup();
    const { session } = await signUp(env, 'ana@example.test');
    env.advanceSeconds(2 * 60 * 60);
    const renewed = value(await env.sign.renew({ refreshToken: session.refreshToken }));
    const confirmed = value(
      await env.sign.confirmPassword({
        accessToken: renewed.accessToken,
        password: strongPassword,
        networkAddress: here,
      }),
    );
    expect(confirmed.passwordEnteredAt).toEqual(new Date(Date.UTC(2026, 10, 13, 14)));
    const who = value(await env.sign.identify({ accessToken: renewed.accessToken }));
    expect(who.passwordEnteredAt).toEqual(confirmed.passwordEnteredAt);
    expect(env.fake.liveSessionsFor('ana@example.test')).toBe(1);
  });

  it('counts wrong passwords like wrong sign-ins, per address', async () => {
    const env = setup();
    const { session } = await signUp(env, 'ana@example.test');
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(
        errorCode(
          await env.sign.confirmPassword({
            accessToken: session.accessToken,
            password: 'wrong password',
            networkAddress: here,
          }),
        ),
      );
    }
    expect(results).toEqual([...Array(5).fill('wrong-password'), 'too-many-attempts']);
  });

  it('answers no-password for an account made with Google, and never counts it', async () => {
    const env = setup();
    const { session } = await signInWithGoogle(env, 'gia@example.test');
    for (let i = 0; i < 12; i++) {
      expect(
        await env.sign.confirmPassword({
          accessToken: session.accessToken,
          password: 'anything at all',
          networkAddress: here,
        }),
      ).toEqual(fail({ code: 'no-password' }));
    }
  });
});

describe('reset by code', () => {
  it('replaces the password, ends every other session, and says the password changed (T-85)', async () => {
    const env = setup();
    const { accountId } = await signUp(env, 'ana@example.test');
    value(
      await env.sign.signIn({ email: 'ana@example.test', password: strongPassword, device: phone }),
    );
    value(await env.sign.startReset({ email: 'ana@example.test', networkAddress: here }));
    const message = env.capture.messages().at(-1);
    expect(message).toMatchObject({ purpose: 'reset', accountExists: true });
    const { proof } = value(
      await env.sign.verifyCode({
        email: 'ana@example.test',
        code: codeFor(env, 'ana@example.test'),
        networkAddress: here,
      }),
    );
    const done = value(
      await env.sign.setPassword({ proof, password: 'a brand new phrase', device: laptop }),
    );
    expect(done).toMatchObject({ accountId, outcome: 'password-changed', endedSessions: 2 });
    expect(env.fake.liveSessionsFor('ana@example.test')).toBe(1);
    expect(
      errorCode(
        await env.sign.signIn({
          email: 'ana@example.test',
          password: strongPassword,
          device: laptop,
        }),
      ),
    ).toBe('wrong-email-or-password');
  });

  it('counts the same password set again as a reset, and still ends the other sessions', async () => {
    const env = setup();
    await signUp(env, 'ana@example.test');
    value(
      await env.sign.signIn({ email: 'ana@example.test', password: strongPassword, device: phone }),
    );
    const proof = await proofFor(env, 'ana@example.test');
    const done = value(
      await env.sign.setPassword({ proof, password: strongPassword, device: laptop }),
    );
    expect(done).toMatchObject({ outcome: 'password-changed', endedSessions: 2 });
    expect(env.fake.liveSessionsFor('ana@example.test')).toBe(1);
  });

  it('sends no reset code for a sign-up that was never finished', async () => {
    const env = setup();
    await env.sign.startSignUp({ email: 'ana@example.test', networkAddress: here });
    env.capture.clear();
    await env.sign.startReset({ email: 'ana@example.test', networkAddress: here });
    expect(env.capture.messages()).toMatchObject([{ code: null, accountExists: false }]);
  });

  it('gives a Google-only account a password through the same route', async () => {
    const env = setup();
    const { accountId } = await signInWithGoogle(env, 'gia@example.test');
    const proof = await proofFor(env, 'gia@example.test');
    const done = value(
      await env.sign.setPassword({ proof, password: strongPassword, device: laptop }),
    );
    expect(done).toMatchObject({ accountId, outcome: 'password-changed' });
    const who = value(await env.sign.identify({ accessToken: done.session.accessToken }));
    expect(who.hasPassword).toBe(true);
  });
});

describe('changing the password while signed in (T-85, step 2.128)', () => {
  const newOne = 'a brand new passphrase';

  it('ends every other session at Supabase and ours, keeps this one, and swaps which password signs in', async () => {
    const env = setup();
    const { session } = await signUp(env, 'ana@example.test');
    const other = value(
      await env.sign.signIn({ email: 'ana@example.test', password: strongPassword, device: phone }),
    );
    const change = (oldPassword: string, newPassword: string) =>
      env.sign.changePassword({
        accessToken: session.accessToken,
        oldPassword,
        newPassword,
        networkAddress: here,
      });
    expect(await change('not my password', newOne)).toEqual(fail({ code: 'wrong-password' }));
    expect(await change(strongPassword, 'short')).toEqual(fail({ code: 'password-too-short' }));
    expect(env.fake.liveSessionsFor('ana@example.test')).toBe(2);
    expect(await change(strongPassword, newOne)).toEqual({ ok: true, value: { endedSessions: 1 } });
    expect((await env.sign.identify({ accessToken: session.accessToken })).ok).toBe(true);
    expect(errorCode(await env.sign.identify({ accessToken: other.session.accessToken }))).toBe(
      'session-ended',
    );
    expect(env.fake.liveSessionsFor('ana@example.test')).toBe(1);
    const signIn = (password: string) =>
      env.sign.signIn({ email: 'ana@example.test', password, device: laptop });
    expect(errorCode(await signIn(strongPassword))).toBe('wrong-email-or-password');
    expect((await signIn(newOne)).ok).toBe(true);
  });

  it('counts a wrong old password like a wrong sign-in', async () => {
    const env = setup();
    const { session } = await signUp(env, 'ana@example.test');
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(
        errorCode(
          await env.sign.changePassword({
            accessToken: session.accessToken,
            oldPassword: 'wrong password',
            newPassword: newOne,
            networkAddress: here,
          }),
        ),
      );
    }
    expect(results).toEqual([...Array(5).fill('wrong-password'), 'too-many-attempts']);
  });

  it('answers no-password for an account made with Google', async () => {
    const env = setup();
    const { session } = await signInWithGoogle(env, 'gia@example.test');
    expect(
      await env.sign.changePassword({
        accessToken: session.accessToken,
        oldPassword: 'anything at all',
        newPassword: newOne,
        networkAddress: here,
      }),
    ).toEqual(fail({ code: 'no-password' }));
  });
});

describe('changing the email while signed in (T-73, step 2.128, T-455)', () => {
  const ana = 'ana@example.test';
  const fresh = 'ana.new@example.test';
  const start = (env: Setup, accessToken: string, newEmail = fresh, takenElsewhere = false) =>
    env.sign.startEmailChange({
      accessToken,
      password: strongPassword,
      newEmail,
      takenElsewhere,
      networkAddress: here,
    });
  const confirm = (env: Setup, accessToken: string, code: string) =>
    env.sign.confirmEmailChange({ accessToken, code, networkAddress: here });
  const signsIn = async (env: Setup, email: string) =>
    (await env.sign.signIn({ email, password: strongPassword, device: laptop })).ok;
  const wrongOf = (code: string) => (code === '000000' ? '111111' : '000000');

  it('a wrong code changes nothing; the right one moves the address at Supabase and ends the others', async () => {
    const env = setup();
    const { session } = await signUp(env, ana);
    const other = value(
      await env.sign.signIn({ email: ana, password: strongPassword, device: phone }),
    );
    expect(
      await env.sign.startEmailChange({
        accessToken: session.accessToken,
        password: 'not my password',
        newEmail: fresh,
        takenElsewhere: false,
        networkAddress: here,
      }),
    ).toEqual(fail({ code: 'wrong-password' }));
    value(await start(env, session.accessToken));
    const code = codeFor(env, fresh);
    expect(await confirm(env, session.accessToken, wrongOf(code))).toEqual(
      fail({ code: 'code-wrong' }),
    );
    // A sign-up screen cannot spend it.
    expect(await env.sign.verifyCode({ email: fresh, code, networkAddress: here })).toEqual(
      fail({ code: 'code-expired' }),
    );
    expect(await signsIn(env, fresh)).toBe(false);
    expect(value(await confirm(env, session.accessToken, code))).toMatchObject({
      oldEmail: ana,
      newEmail: fresh,
    });
    expect(value(await env.sign.identify({ accessToken: session.accessToken })).email).toBe(fresh);
    expect(errorCode(await env.sign.identify({ accessToken: other.session.accessToken }))).toBe(
      'session-ended',
    );
    expect(await signsIn(env, fresh)).toBe(true);
    expect(await signsIn(env, ana)).toBe(false);
    expect(await confirm(env, session.accessToken, code)).toEqual(fail({ code: 'code-expired' }));
  });

  it('a taken address, at Supabase or in our records, answers as a free one at every step', async () => {
    const env = setup();
    const { session } = await signUp(env, ana);
    await signUp(env, 'bo@example.test');
    env.capture.clear();
    // Each change's code typed before the next is asked (the old test asked a second,
    // free change first, and so hid M1).
    const taken = await start(env, session.accessToken, 'bo@example.test');
    const before = env.callsSince(0).length;
    const takenFirst = await confirm(env, session.accessToken, codeFor(env, 'bo@example.test'));
    const takenCalls = env.callsSince(before).length;
    const elsewhere = await start(env, session.accessToken, 'cy@example.test', true);
    const elsewhereFirst = await confirm(env, session.accessToken, '123456');
    const free = await start(env, session.accessToken, 'dee@example.test');
    const beforeFree = env.callsSince(0).length;
    const freeFirst = await confirm(
      env,
      session.accessToken,
      wrongOf(codeFor(env, 'dee@example.test')),
    );
    expect(taken.ok).toBe(true);
    expect(elsewhere).toEqual(taken);
    expect(free).toEqual(taken);
    expect(takenFirst).toEqual(fail({ code: 'code-wrong' }));
    expect(elsewhereFirst).toEqual(takenFirst);
    expect(freeFirst).toEqual(takenFirst);
    // As much work at Supabase for a right code it refuses as for a wrong one (T-68).
    expect(env.callsSince(beforeFree).length).toBe(takenCalls);
    // Our records' taken address gets no code. One taken only at Supabase cannot be known
    // before its code is typed: Supabase hears nothing until then (T-455).
    expect(env.capture.messages().map((m) => [m.to, m.purpose, m.code !== null])).toEqual([
      ['bo@example.test', 'email-change', true],
      ['cy@example.test', 'email-change', false],
      ['dee@example.test', 'email-change', true],
    ]);
    expect(await signsIn(env, ana)).toBe(true);
    expect(await signsIn(env, 'bo@example.test')).toBe(true);
  });
});

describe('a waiting change of email is the account’s own (T-455; the review’s H1, M1, M2, L2)', () => {
  const ana = 'ana@example.test';
  const bo = 'bo@example.test';
  const target = 'shared.new@example.test';
  const begin = (env: Setup, accessToken: string, newEmail = target, takenElsewhere = false) =>
    env.sign.startEmailChange({
      accessToken,
      password: strongPassword,
      newEmail,
      takenElsewhere,
      networkAddress: here,
    });
  const confirm = (env: Setup, accessToken: string, code: string) =>
    env.sign.confirmEmailChange({ accessToken, code, networkAddress: here });
  const signsIn = async (env: Setup, email: string) =>
    (await env.sign.signIn({ email, password: strongPassword, device: phone })).ok;
  const emailOf = async (env: Setup, accessToken: string) =>
    value(await env.sign.identify({ accessToken })).email;
  const wrongOf = (code: string) => (code === '000000' ? '111111' : '000000');

  it('B typing A’s code for the same address changes nothing of A, anywhere (H1)', async () => {
    const env = setup();
    const a = await signUp(env, ana);
    const b = await signUp(env, bo);
    const aElsewhere = value(
      await env.sign.signIn({ email: ana, password: strongPassword, device: phone }),
    );
    value(await begin(env, a.session.accessToken));
    const codeOfA = codeFor(env, target);
    value(await begin(env, b.session.accessToken));
    const codeOfB = codeFor(env, target);
    expect(codeOfB).not.toBe(codeOfA);
    expect(await confirm(env, b.session.accessToken, codeOfA)).toEqual(
      fail({ code: 'code-wrong' }),
    );
    expect(await emailOf(env, a.session.accessToken)).toBe(ana);
    expect(await emailOf(env, aElsewhere.session.accessToken)).toBe(ana);
    expect(await emailOf(env, b.session.accessToken)).toBe(bo);
    expect(await signsIn(env, target)).toBe(false);
    expect(await signsIn(env, ana)).toBe(true);
    // A's own code is still A's alone.
    expect(value(await confirm(env, a.session.accessToken, codeOfA))).toMatchObject({
      oldEmail: ana,
      newEmail: target,
    });
    // B's right code now meets a taken address: a wrong code's answer, nothing moves.
    expect(await confirm(env, b.session.accessToken, codeOfB)).toEqual(
      fail({ code: 'code-wrong' }),
    );
    expect(await emailOf(env, b.session.accessToken)).toBe(bo);
    expect(await signsIn(env, bo)).toBe(true);
  });

  it('A’s waiting row copied to B’s key does not take A’s code: the hash names the account (T-461)', async () => {
    const env = setup();
    const a = await signUp(env, ana);
    const b = await signUp(env, bo);
    const put = vi.spyOn(env.store.codes, 'putEmailChange');
    value(await begin(env, a.session.accessToken));
    const codeOfA = codeFor(env, target);
    value(await begin(env, b.session.accessToken, 'bo.new@example.test'));
    const [rowOfA, rowOfB] = put.mock.calls;
    if (!rowOfA || !rowOfB) throw new Error('Both waiting changes were stored.');
    const [idOfA, changeOfA] = rowOfA;
    const [idOfB] = rowOfB;
    expect(idOfB).not.toBe(idOfA);
    // The store's row of A, word for word, under B's account.
    await env.store.codes.putEmailChange(idOfB, changeOfA);
    expect(await confirm(env, b.session.accessToken, codeOfA)).toEqual(
      fail({ code: 'code-wrong' }),
    );
    expect(await emailOf(env, b.session.accessToken)).toBe(bo);
    expect(await emailOf(env, a.session.accessToken)).toBe(ana);
    expect(await signsIn(env, target)).toBe(false);
    expect(await signsIn(env, bo)).toBe(true);
  });

  it('a taken address and a free one answer alike on the first code typed (M1)', async () => {
    const env = setup();
    const a = await signUp(env, ana);
    const c = await signUp(env, 'cy@example.test');
    const d = await signUp(env, 'dee@example.test');
    await signUp(env, bo);
    env.capture.clear();
    // Each typed at once, before anything else is asked.
    value(await begin(env, a.session.accessToken, bo));
    const takenThere = await confirm(
      env,
      a.session.accessToken,
      env.capture.latestCodeFor(bo) ?? '123456',
    );
    value(await begin(env, c.session.accessToken, 'elsewhere@example.test', true));
    const takenHere = await confirm(env, c.session.accessToken, '123456');
    value(await begin(env, d.session.accessToken, 'free@example.test'));
    const free = await confirm(
      env,
      d.session.accessToken,
      wrongOf(codeFor(env, 'free@example.test')),
    );
    expect(takenThere).toEqual(fail({ code: 'code-wrong' }));
    expect(takenHere).toEqual(takenThere);
    expect(free).toEqual(takenThere);
    expect(await emailOf(env, a.session.accessToken)).toBe(ana);
    expect(await signsIn(env, bo)).toBe(true);
  });

  it('asking again replaces the waiting change: the first code is dead (M2)', async () => {
    const env = setup();
    const a = await signUp(env, ana);
    await signUp(env, bo);
    value(await begin(env, a.session.accessToken, 'y@example.test'));
    const first = codeFor(env, 'y@example.test');
    value(await begin(env, a.session.accessToken, bo));
    expect(await confirm(env, a.session.accessToken, first)).toEqual(fail({ code: 'code-wrong' }));
    value(await begin(env, a.session.accessToken, 'z@example.test'));
    expect(await confirm(env, a.session.accessToken, first)).toEqual(fail({ code: 'code-wrong' }));
    expect(await emailOf(env, a.session.accessToken)).toBe(ana);
    expect(await signsIn(env, 'y@example.test')).toBe(false);
  });

  it('the address taken after our check passed: nothing changes, the answer a wrong code’s', async () => {
    const env = setup();
    const a = await signUp(env, ana);
    const aElsewhere = value(
      await env.sign.signIn({ email: ana, password: strongPassword, device: phone }),
    );
    value(await begin(env, a.session.accessToken));
    const code = codeFor(env, target);
    await signUp(env, target);
    expect(await confirm(env, a.session.accessToken, code)).toEqual(fail({ code: 'code-wrong' }));
    expect(await emailOf(env, a.session.accessToken)).toBe(ana);
    expect(await emailOf(env, aElsewhere.session.accessToken)).toBe(ana);
    expect(await signsIn(env, ana)).toBe(true);
  });

  it('a new password ends a waiting change of email (L2)', async () => {
    const env = setup();
    const a = await signUp(env, ana);
    value(await begin(env, a.session.accessToken));
    const code = codeFor(env, target);
    value(
      await env.sign.changePassword({
        accessToken: a.session.accessToken,
        oldPassword: strongPassword,
        newPassword: 'a brand new passphrase',
        networkAddress: here,
      }),
    );
    expect(await confirm(env, a.session.accessToken, code)).toEqual(fail({ code: 'code-expired' }));
    expect(await emailOf(env, a.session.accessToken)).toBe(ana);
  });
});
