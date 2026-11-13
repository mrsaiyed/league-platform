// Each operation of the sign-in interface on the Supabase adapter, against a fake
// Supabase Auth (T4 §3, T-225, record 018). Not verified against the live service.
import { describe, expect, it } from 'vitest';
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

  it('sends 5 codes an hour per address and 30 per network (T-225)', async () => {
    const env = setup();
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(
        errorCode(await env.sign.startSignUp({ email: 'ana@example.test', networkAddress: here })),
      );
    }
    expect(results).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'too-many-attempts']);
    const network = [];
    for (let i = 0; i < 26; i++) {
      network.push(
        errorCode(
          await env.sign.startSignUp({ email: `p${i}@example.test`, networkAddress: here }),
        ),
      );
    }
    expect(network.filter((r) => r === 'ok')).toHaveLength(25);
    expect(network.at(-1)).toBe('too-many-attempts');
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
    expect(outcomes.filter((o) => o === 'account-created')).toHaveLength(1);
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
