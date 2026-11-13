// Each operation of the sign-in interface on the local stand-in (T4 §3, T-225).
import { describe, expect, it } from 'vitest';
import { fail } from '@srleagues/core';
import type { SignInCodeMessage } from '../sign-in-service.ts';
import { createSignInCodeCapture } from './code-capture.ts';
import { createLocalSignInStandIn } from './local-sign-in.ts';
import {
  codeFor,
  here,
  laptop,
  phone,
  proofFor,
  returnOrigin,
  setup,
  signInWithGoogle,
  signUp,
  strongPassword,
  value,
} from './local-sign-in.test-helper.ts';

const elsewhere = '203.0.113.7';
const errorCode = (result: { ok: boolean; error?: { code: string } }) =>
  result.ok ? 'ok' : result.error?.code;

describe('starting', () => {
  const codeSender = createSignInCodeCapture().sender;

  it('refuses to run anywhere but development and tests', () => {
    const environment = 'production' as 'test';
    expect(() => createLocalSignInStandIn({ environment, nodeEnv: 'test', codeSender })).toThrow(
      /development and tests only/,
    );
    expect(() =>
      createLocalSignInStandIn({ environment: 'development', nodeEnv: undefined, codeSender }),
    ).not.toThrow();
  });

  it("refuses when the app's NODE_ENV is production, whatever it was told", () => {
    expect(() =>
      createLocalSignInStandIn({ environment: 'test', nodeEnv: 'production', codeSender }),
    ).toThrow(/development and tests only/);
  });

  it("throws on a device or network address that does not fit: the app's mistake", async () => {
    const env = setup();
    await expect(
      env.sign.signIn({
        email: 'ana@example.test',
        password: strongPassword,
        device: { ...laptop, deviceId: 'x' },
      }),
    ).rejects.toThrow(TypeError);
    for (const networkAddress of ['', '   ', 'not-an-ip', '999.1.1.1', '1::2::3']) {
      await expect(
        env.sign.startSignUp({ email: 'ana@example.test', networkAddress }),
      ).rejects.toThrow(TypeError);
    }
  });
});

describe('sign-up with an emailed code', () => {
  it('sends a 6-digit code, valid 10 minutes, to the address as typed but normalized', async () => {
    const env = setup();
    expect(
      await env.sign.startSignUp({ email: '  Ana@Example.TEST ', networkAddress: here }),
    ).toEqual({ ok: true, value: { codeValidMinutes: 10 } });
    const [message] = env.capture.messages();
    expect(message).toMatchObject({
      to: 'ana@example.test',
      purpose: 'sign-up',
      accountExists: false,
    });
    expect(message?.code).toMatch(/^[0-9]{6}$/);
    expect(message?.expiresAt).toEqual(new Date(Date.UTC(2026, 10, 13, 12, 10)));
  });

  it('refuses an address that is not one, or is longer than 254 characters', async () => {
    const env = setup();
    const longest = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(56)}.test`;
    expect(longest).toHaveLength(254);
    expect((await env.sign.startSignUp({ email: longest, networkAddress: here })).ok).toBe(true);
    for (const email of ['not an address', `x${longest}`]) {
      expect(await env.sign.startSignUp({ email, networkAddress: here })).toEqual({
        ok: false,
        error: { code: 'invalid-email' },
      });
    }
    expect(env.capture.messages()).toHaveLength(1);
  });

  it('creates the account from the code and a password, and signs the device in', async () => {
    const env = setup();
    const created = await signUp(env, 'ana@example.test');
    expect(created).toMatchObject({
      outcome: 'account-created',
      newDevice: false,
      endedSessions: 0,
    });
    const who = value(await env.sign.identify({ accessToken: created.session.accessToken }));
    expect(who).toEqual({
      accountId: created.accountId,
      email: 'ana@example.test',
      sessionId: created.session.sessionId,
      hasPassword: true,
      passwordEnteredAt: new Date(Date.UTC(2026, 10, 13, 12)),
      lastSignInAt: new Date(Date.UTC(2026, 10, 13, 12)),
    });
  });

  it('accepts the code with spaces typed between the digits', async () => {
    const env = setup();
    await env.sign.startSignUp({ email: 'ana@example.test', networkAddress: here });
    const code = codeFor(env, 'ana@example.test');
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    const result = await env.sign.verifyCode({
      email: 'ana@example.test',
      code: spaced,
      networkAddress: here,
    });
    expect(result.ok).toBe(true);
  });

  it('allows a few attempts per code, then the code is used up', async () => {
    const env = setup();
    await env.sign.startSignUp({ email: 'ana@example.test', networkAddress: here });
    const real = codeFor(env, 'ana@example.test');
    const wrong = real === '000000' ? '111111' : '000000';
    const tries = [];
    for (let i = 0; i < 5; i++) {
      tries.push(
        await env.sign.verifyCode({ email: 'ana@example.test', code: wrong, networkAddress: here }),
      );
    }
    expect(tries.map(errorCode)).toEqual([
      'code-wrong',
      'code-wrong',
      'code-wrong',
      'code-wrong',
      'too-many-attempts',
    ]);
    expect(
      await env.sign.verifyCode({ email: 'ana@example.test', code: real, networkAddress: here }),
    ).toEqual({ ok: false, error: { code: 'too-many-attempts' } });
  });

  it('lets a code expire after 10 minutes, and a new code replaces the old', async () => {
    const env = setup();
    const verify = (code: string) =>
      env.sign.verifyCode({ email: 'ana@example.test', code, networkAddress: here });
    await env.sign.startSignUp({ email: 'ana@example.test', networkAddress: here });
    const first = codeFor(env, 'ana@example.test');
    env.advanceSeconds(10 * 60);
    expect(await verify(first)).toEqual({ ok: false, error: { code: 'code-expired' } });
    await env.sign.startSignUp({ email: 'ana@example.test', networkAddress: here });
    const second = codeFor(env, 'ana@example.test');
    expect((await verify(second)).ok).toBe(true);
    expect(await verify(second)).toEqual({ ok: false, error: { code: 'code-expired' } });
  });

  it('sends a few codes per hour per address, then asks to wait', async () => {
    const env = setup();
    for (let i = 0; i < 5; i++) {
      expect(
        (await env.sign.startSignUp({ email: 'ana@example.test', networkAddress: here })).ok,
      ).toBe(true);
      env.advanceSeconds(60);
    }
    expect(await env.sign.startReset({ email: 'ana@example.test', networkAddress: here })).toEqual({
      ok: false,
      error: { code: 'too-many-attempts', retryAfterSeconds: 55 * 60 },
    });
    expect(
      (await env.sign.startSignUp({ email: 'ben@example.test', networkAddress: here })).ok,
    ).toBe(true);
    env.advanceSeconds(55 * 60);
    expect(
      (await env.sign.startSignUp({ email: 'ana@example.test', networkAddress: here })).ok,
    ).toBe(true);
    expect(env.capture.messages()).toHaveLength(7);
  });

  it('sends at most 30 codes an hour to one network, whatever the addresses (T-225)', async () => {
    const env = setup();
    for (let i = 0; i < 30; i++) {
      const result = await env.sign.startSignUp({
        email: `p${i}@example.test`,
        networkAddress: here,
      });
      expect(result.ok).toBe(true);
    }
    expect(await env.sign.startSignUp({ email: 'p30@example.test', networkAddress: here })).toEqual(
      {
        ok: false,
        error: { code: 'too-many-attempts', retryAfterSeconds: 60 * 60 },
      },
    );
    const otherNetwork = await env.sign.startSignUp({
      email: 'p30@example.test',
      networkAddress: elsewhere,
    });
    expect(otherNetwork.ok).toBe(true);
  });

  it('counts a whole IPv6 /64 as one network', async () => {
    const env = setup({ settings: { codesPerHourPerNetwork: 2 } });
    const ask = (email: string, networkAddress: string) =>
      env.sign.startSignUp({ email, networkAddress });
    expect((await ask('a@example.test', '2001:db8:1:2::1')).ok).toBe(true);
    expect((await ask('b@example.test', '[2001:DB8:1:2:ffff::9]')).ok).toBe(true);
    expect(errorCode(await ask('c@example.test', '2001:0db8:0001:0002:0:0:0:3'))).toBe(
      'too-many-attempts',
    );
    expect((await ask('c@example.test', '2001:db8:1:3::1')).ok).toBe(true);
  });

  it('limits wrong codes per network across addresses (T-225)', async () => {
    const env = setup({
      settings: {
        guessesPerNetwork: {
          windowMinutes: 15,
          slowAfter: 10,
          slowSeconds: 5,
          lockAfter: 4,
          lockMinutes: 15,
        },
      },
    });
    for (let i = 0; i < 4; i++) {
      await env.sign.startReset({ email: `p${i}@example.test`, networkAddress: here });
      await env.sign.verifyCode({
        email: `p${i}@example.test`,
        code: '000000',
        networkAddress: here,
      });
    }
    await env.sign.startSignUp({ email: 'ana@example.test', networkAddress: elsewhere });
    const code = codeFor(env, 'ana@example.test');
    expect(
      await env.sign.verifyCode({ email: 'ana@example.test', code, networkAddress: here }),
    ).toEqual({ ok: false, error: { code: 'too-many-attempts', retryAfterSeconds: 15 * 60 } });
    expect(
      (await env.sign.verifyCode({ email: 'ana@example.test', code, networkAddress: elsewhere }))
        .ok,
    ).toBe(true);
  });

  it('keeps no code the sender could not take, and says so', async () => {
    const offered: SignInCodeMessage[] = [];
    const env = setup({
      codeSender: {
        send: async (message) => {
          offered.push(message);
          return fail({ code: 'code-not-sent' as const });
        },
      },
    });
    expect(await env.sign.startSignUp({ email: 'ana@example.test', networkAddress: here })).toEqual(
      {
        ok: false,
        error: { code: 'code-not-sent' },
      },
    );
    expect(
      await env.sign.verifyCode({
        email: 'ana@example.test',
        code: offered[0]?.code ?? '',
        networkAddress: here,
      }),
    ).toEqual({ ok: false, error: { code: 'code-expired' } });
  });
});

describe('setting a password', () => {
  it('needs 8 characters to 72 bytes, and refuses leaked passwords (T-85, T-225)', async () => {
    const env = setup();
    const proof = await proofFor(env, 'ana@example.test');
    const tryPassword = async (password: string) =>
      errorCode(await env.sign.setPassword({ proof, password, device: laptop }));
    expect(await tryPassword('seven77')).toBe('password-too-short');
    // Seven characters, though fourteen UTF-16 units: still too short.
    expect(await tryPassword('😀'.repeat(7))).toBe('password-too-short');
    expect(await tryPassword('x'.repeat(73))).toBe('password-too-long');
    expect(await tryPassword('é'.repeat(37))).toBe('password-too-long');
    expect(await tryPassword('Password1')).toBe('password-leaked');
    // Full-width letters are the same password once normalized (NFKC).
    expect(await tryPassword('Ｐａｓｓｗｏｒｄ１')).toBe('password-leaked');
    // No rules about symbols or capitals, and the proof survived the refusals.
    expect(await tryPassword('😀'.repeat(8))).toBe('ok');
  });

  it('normalizes a password, so two ways of typing an accent are one password', async () => {
    const env = setup();
    await signUp(env, 'ana@example.test', 'café au lait');
    const signedIn = await env.sign.signIn({
      email: 'ana@example.test',
      password: 'café au lait',
      device: laptop,
    });
    expect(signedIn.ok).toBe(true);
  });

  it('takes each proof once, and not after it runs out', async () => {
    const env = setup();
    const proof = await proofFor(env, 'ana@example.test');
    value(await env.sign.setPassword({ proof, password: strongPassword, device: laptop }));
    expect(await env.sign.setPassword({ proof, password: strongPassword, device: laptop })).toEqual(
      {
        ok: false,
        error: { code: 'proof-invalid' },
      },
    );
    const late = await proofFor(env, 'ben@example.test');
    env.advanceSeconds(15 * 60);
    expect(
      await env.sign.setPassword({ proof: late, password: strongPassword, device: laptop }),
    ).toEqual({ ok: false, error: { code: 'proof-invalid' } });
  });

  it('ends every other proof for the address once a password is set', async () => {
    const env = setup();
    const first = await proofFor(env, 'ana@example.test');
    const second = await proofFor(env, 'ana@example.test');
    value(await env.sign.setPassword({ proof: second, password: strongPassword, device: laptop }));
    expect(
      await env.sign.setPassword({ proof: first, password: 'someone else now', device: phone }),
    ).toEqual({ ok: false, error: { code: 'proof-invalid' } });
  });

  it('makes one account when two proofs for a new address are used at once', async () => {
    const env = setup();
    const first = await proofFor(env, 'ana@example.test');
    // A second proof is taken before either is used, so both are outstanding.
    const second = await proofFor(env, 'ana@example.test');
    const [a, b] = await Promise.all([
      env.sign.setPassword({ proof: first, password: strongPassword, device: laptop }),
      env.sign.setPassword({ proof: second, password: 'another long phrase', device: phone }),
    ]);
    const [one, two] = [value(a), value(b)];
    expect(one.accountId).toBe(two.accountId);
    expect([one.outcome, two.outcome].sort()).toEqual(['account-created', 'password-changed']);
  });
});

describe('sign-in', () => {
  it('signs in with the right password and refuses a wrong one', async () => {
    const env = setup();
    const created = await signUp(env, 'ana@example.test');
    const signedIn = value(
      await env.sign.signIn({
        email: 'ANA@example.test',
        password: strongPassword,
        device: laptop,
      }),
    );
    expect(signedIn.accountId).toBe(created.accountId);
    expect(signedIn.session.sessionId).not.toBe(created.session.sessionId);
    expect(
      await env.sign.signIn({
        email: 'ana@example.test',
        password: 'not it at all',
        device: laptop,
      }),
    ).toEqual({ ok: false, error: { code: 'wrong-email-or-password' } });
  });

  it('says when the device is new to the account (T-70)', async () => {
    const env = setup();
    await signUp(env, 'ana@example.test');
    const signIn = async (device: typeof laptop) =>
      value(await env.sign.signIn({ email: 'ana@example.test', password: strongPassword, device }))
        .newDevice;
    expect(await signIn(laptop)).toBe(false);
    expect(await signIn(phone)).toBe(true);
    expect(await signIn(phone)).toBe(false);
  });

  it('still does the work of a hash for an address with no account (T-68)', async () => {
    const env = setup();
    await env.sign.signIn({
      email: 'nobody@example.test',
      password: strongPassword,
      device: laptop,
    });
    await env.sign.signIn({ email: 'not an address', password: strongPassword, device: laptop });
    await env.sign.signIn({
      email: 'nobody@example.test',
      password: 'x'.repeat(2000),
      device: laptop,
    });
    expect(env.hashCalls.matchesWithNoHash).toBe(3);
  });

  it('refuses a password over the outer limit as just wrong, and counts it', async () => {
    const env = setup();
    await signUp(env, 'ana@example.test');
    for (let i = 0; i < 5; i++) {
      expect(
        errorCode(
          await env.sign.signIn({
            email: 'ana@example.test',
            password: 'x'.repeat(2000),
            device: laptop,
          }),
        ),
      ).toBe('wrong-email-or-password');
    }
    expect(
      errorCode(
        await env.sign.signIn({
          email: 'ana@example.test',
          password: strongPassword,
          device: laptop,
        }),
      ),
    ).toBe('too-many-attempts');
  });

  it('slows, then locks, wrong guesses for an address; a right password resets the count', async () => {
    const env = setup();
    await signUp(env, 'ana@example.test');
    const guess = (password: string) =>
      env.sign.signIn({ email: 'ana@example.test', password, device: laptop });
    for (let i = 0; i < 4; i++) await guess('wrong password');
    value(await guess(strongPassword));
    for (let i = 0; i < 5; i++) await guess('wrong password');
    expect(await guess(strongPassword)).toEqual({
      ok: false,
      error: { code: 'too-many-attempts', retryAfterSeconds: 30 },
    });
    for (let i = 0; i < 5; i++) {
      env.advanceSeconds(30);
      await guess('wrong password');
    }
    env.advanceSeconds(30);
    expect(await guess(strongPassword)).toEqual({
      ok: false,
      error: { code: 'too-many-attempts', retryAfterSeconds: 14 * 60 + 30 },
    });
    env.advanceSeconds(15 * 60);
    expect((await guess(strongPassword)).ok).toBe(true);
  });

  it('lets no more than the limit through when guesses arrive at once', async () => {
    const env = setup();
    await signUp(env, 'ana@example.test');
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        env.sign.signIn({ email: 'ana@example.test', password: 'wrong password', device: laptop }),
      ),
    );
    expect(results.filter((r) => errorCode(r) === 'wrong-email-or-password')).toHaveLength(5);
    expect(results.filter((r) => errorCode(r) === 'too-many-attempts')).toHaveLength(15);
  });

  it('limits one network by the default numbers: slowed from 30 wrong, locked at 100 (T-225)', async () => {
    const env = setup();
    await signUp(env, 'ana@example.test');
    const guess = (i: number) =>
      env.sign.signIn({ email: `guess${i}@example.test`, password: 'x', device: laptop });
    for (let i = 0; i < 30; i++) expect(errorCode(await guess(i))).toBe('wrong-email-or-password');
    expect(await guess(30)).toEqual({
      ok: false,
      error: { code: 'too-many-attempts', retryAfterSeconds: 5 },
    });
    for (let i = 30; i < 100; i++) {
      env.advanceSeconds(5);
      expect(errorCode(await guess(i))).toBe('wrong-email-or-password');
    }
    env.advanceSeconds(5);
    const locked = await env.sign.signIn({
      email: 'ana@example.test',
      password: strongPassword,
      device: laptop,
    });
    expect(locked).toEqual({
      ok: false,
      error: { code: 'too-many-attempts', retryAfterSeconds: 15 * 60 - 5 },
    });
    const fromPhone = await env.sign.signIn({
      email: 'ana@example.test',
      password: strongPassword,
      device: phone,
    });
    expect(fromPhone.ok).toBe(true);
  });

  it('counts guesses at an address that is not one against the network only', async () => {
    const env = setup({
      settings: {
        guessesPerNetwork: {
          windowMinutes: 15,
          slowAfter: 10,
          slowSeconds: 5,
          lockAfter: 3,
          lockMinutes: 15,
        },
      },
    });
    await signUp(env, 'ana@example.test');
    for (let i = 0; i < 3; i++) {
      await env.sign.signIn({ email: `not an address ${i}`, password: 'x', device: laptop });
    }
    const result = await env.sign.signIn({
      email: 'ana@example.test',
      password: strongPassword,
      device: laptop,
    });
    expect(errorCode(result)).toBe('too-many-attempts');
  });
});

describe('Google sign-in', () => {
  it('creates an account for a new address and signs an existing one in', async () => {
    const env = setup();
    const created = await signInWithGoogle(env, 'Cara@Example.test');
    expect(created).toMatchObject({ outcome: 'account-created', newDevice: false });
    const who = value(await env.sign.identify({ accessToken: created.session.accessToken }));
    expect(who).toMatchObject({
      email: 'cara@example.test',
      hasPassword: false,
      passwordEnteredAt: null,
      lastSignInAt: new Date(Date.UTC(2026, 10, 13, 12)),
    });
    const passwordAccount = await signUp(env, 'dan@example.test');
    const linked = await signInWithGoogle(env, 'dan@example.test', phone);
    expect(linked).toMatchObject({
      outcome: 'signed-in',
      accountId: passwordAccount.accountId,
      newDevice: true,
    });
  });

  it('sends the browser back only to our own addresses', async () => {
    const env = setup();
    const start = (returnAddress: string) =>
      env.sign.startExternalSignIn({ provider: 'google', returnAddress });
    for (const returnAddress of [
      'javascript:alert(1)',
      'https://evil.example.test/auth/return',
      'http://localhost:4000/auth/return',
      'not an address',
    ]) {
      expect(await start(returnAddress), returnAddress).toEqual({
        ok: false,
        error: { code: 'return-address-refused' },
      });
    }
    const started = value(await start(`${returnOrigin}/auth/return?then=%2Fprofile`));
    const back = new URL(started.redirectTo);
    expect(back.origin + back.pathname).toBe(`${returnOrigin}/auth/return`);
    expect(back.searchParams.get('then')).toBe('/profile');
  });

  it('refuses Google entirely when no return address is allowed', async () => {
    const env = setup({ returnOrigins: [] });
    const result = await env.sign.startExternalSignIn({
      provider: 'google',
      returnAddress: `${returnOrigin}/auth/return`,
    });
    expect(errorCode(result)).toBe('return-address-refused');
  });

  it('fails without approval, with the wrong verifier, or a second time', async () => {
    const env = setup();
    const start = async () =>
      value(
        await env.sign.startExternalSignIn({
          provider: 'google',
          returnAddress: `${returnOrigin}/`,
        }),
      );
    const complete = (code: string, verifier: string) =>
      env.sign.completeExternalSignIn({ provider: 'google', code, verifier, device: laptop });
    const codeOf = (started: { redirectTo: string }) =>
      new URL(started.redirectTo).searchParams.get('code') ?? '';
    const failed = { ok: false, error: { code: 'external-sign-in-failed' } };
    const unapproved = await start();
    expect(await complete(codeOf(unapproved), unapproved.verifier)).toEqual(failed);
    const approved = await start();
    env.approveExternalSignIn({ verifier: approved.verifier, email: 'cara@example.test' });
    expect(await complete(codeOf(approved), 'someone else')).toEqual(failed);
    expect(await complete(codeOf(approved), approved.verifier)).toEqual(failed);
  });
});

describe('sessions', () => {
  it('has a short-lived access token renewed by a refresh token that changes each time (T-69)', async () => {
    const env = setup();
    const { session } = await signUp(env, 'ana@example.test');
    env.advanceSeconds(60 * 60);
    expect(await env.sign.identify({ accessToken: session.accessToken })).toEqual({
      ok: false,
      error: { code: 'access-expired' },
    });
    const renewed = value(await env.sign.renew({ refreshToken: session.refreshToken }));
    expect(renewed.sessionId).toBe(session.sessionId);
    expect(renewed.refreshToken).not.toBe(session.refreshToken);
    expect((await env.sign.identify({ accessToken: renewed.accessToken })).ok).toBe(true);
    // No time limit on the session itself (T-70): a year later it still renews.
    env.advanceSeconds(365 * 24 * 60 * 60);
    expect((await env.sign.renew({ refreshToken: renewed.refreshToken })).ok).toBe(true);
  });

  it('stops the old access token as soon as a new one is issued', async () => {
    const env = setup();
    const { session } = await signUp(env, 'ana@example.test');
    const renewed = value(await env.sign.renew({ refreshToken: session.refreshToken }));
    expect(await env.sign.identify({ accessToken: session.accessToken })).toEqual({
      ok: false,
      error: { code: 'session-ended' },
    });
    expect((await env.sign.identify({ accessToken: renewed.accessToken })).ok).toBe(true);
  });

  it('ends the session when an old refresh token is used again (T-69)', async () => {
    const env = setup();
    const { session } = await signUp(env, 'ana@example.test');
    const renewed = value(await env.sign.renew({ refreshToken: session.refreshToken }));
    expect(await env.sign.renew({ refreshToken: session.refreshToken })).toEqual({
      ok: false,
      error: { code: 'session-ended' },
    });
    expect(await env.sign.renew({ refreshToken: renewed.refreshToken })).toEqual({
      ok: false,
      error: { code: 'session-ended' },
    });
    expect(await env.sign.identify({ accessToken: renewed.accessToken })).toEqual({
      ok: false,
      error: { code: 'session-ended' },
    });
  });

  it('signs out this session by an access token that has run out, or by the refresh token', async () => {
    const env = setup();
    const first = await signUp(env, 'ana@example.test');
    env.advanceSeconds(2 * 60 * 60);
    expect(await env.sign.signOut({ accessToken: first.session.accessToken })).toEqual({
      ok: true,
      value: { ended: true },
    });
    expect(await env.sign.signOut({ accessToken: first.session.accessToken })).toEqual({
      ok: true,
      value: { ended: false },
    });
    expect(errorCode(await env.sign.renew({ refreshToken: first.session.refreshToken }))).toBe(
      'session-ended',
    );
    const second = value(
      await env.sign.signIn({ email: 'ana@example.test', password: strongPassword, device: phone }),
    );
    expect(await env.sign.signOut({ refreshToken: second.session.refreshToken })).toEqual({
      ok: true,
      value: { ended: true },
    });
    expect(errorCode(await env.sign.identify({ accessToken: second.session.accessToken }))).toBe(
      'session-ended',
    );
  });

  it('lists active sessions by device and time, most recently active first (T-71)', async () => {
    const env = setup();
    const first = await signUp(env, 'ana@example.test');
    env.advanceSeconds(60);
    const second = value(
      await env.sign.signIn({ email: 'ana@example.test', password: strongPassword, device: phone }),
    );
    await signUp(env, 'ben@example.test');
    env.advanceSeconds(60);
    const list = value(await env.sign.listSessions({ accessToken: first.session.accessToken }));
    expect(list).toEqual([
      {
        sessionId: first.session.sessionId,
        deviceLabel: 'Firefox on Windows',
        signedInAt: new Date(Date.UTC(2026, 10, 13, 12)),
        lastActiveAt: new Date(Date.UTC(2026, 10, 13, 12, 2)),
        current: true,
      },
      {
        sessionId: second.session.sessionId,
        deviceLabel: 'Safari on iPhone',
        signedInAt: new Date(Date.UTC(2026, 10, 13, 12, 1)),
        lastActiveAt: new Date(Date.UTC(2026, 10, 13, 12, 1)),
        current: false,
      },
    ]);
    env.advanceSeconds(60);
    value(await env.sign.identify({ accessToken: second.session.accessToken }));
    const after = value(await env.sign.listSessions({ accessToken: second.session.accessToken }));
    expect(after.map((s) => s.sessionId)).toEqual([
      second.session.sessionId,
      first.session.sessionId,
    ]);
  });

  it('signs out everywhere else at once, or everywhere including here (T-70, T-71)', async () => {
    const env = setup();
    const mine = await signUp(env, 'ana@example.test');
    const other = value(
      await env.sign.signIn({ email: 'ana@example.test', password: strongPassword, device: phone }),
    );
    const third = value(
      await env.sign.signIn({ email: 'ana@example.test', password: strongPassword, device: phone }),
    );
    const someoneElse = await signUp(env, 'ben@example.test');
    expect(
      await env.sign.signOutEverywhere({
        accessToken: mine.session.accessToken,
        keepThisSession: true,
      }),
    ).toEqual({ ok: true, value: { endedSessions: 2 } });
    expect((await env.sign.identify({ accessToken: mine.session.accessToken })).ok).toBe(true);
    for (const ended of [other, third]) {
      expect(errorCode(await env.sign.identify({ accessToken: ended.session.accessToken }))).toBe(
        'session-ended',
      );
      expect(errorCode(await env.sign.renew({ refreshToken: ended.session.refreshToken }))).toBe(
        'session-ended',
      );
    }
    expect(
      await env.sign.signOutEverywhere({
        accessToken: mine.session.accessToken,
        keepThisSession: false,
      }),
    ).toEqual({ ok: true, value: { endedSessions: 1 } });
    expect(errorCode(await env.sign.identify({ accessToken: mine.session.accessToken }))).toBe(
      'session-ended',
    );
    expect((await env.sign.identify({ accessToken: someoneElse.session.accessToken })).ok).toBe(
      true,
    );
  });
});

describe('the password again before a sensitive action (T-70)', () => {
  it('records when the password was typed', async () => {
    const env = setup();
    const { session } = await signUp(env, 'ana@example.test');
    env.advanceSeconds(2 * 60 * 60);
    const renewed = value(await env.sign.renew({ refreshToken: session.refreshToken }));
    const confirm = (password: string) =>
      env.sign.confirmPassword({
        accessToken: renewed.accessToken,
        password,
        networkAddress: here,
      });
    expect(await confirm('not my password')).toEqual({
      ok: false,
      error: { code: 'wrong-password' },
    });
    expect(await confirm(strongPassword)).toEqual({
      ok: true,
      value: { passwordEnteredAt: new Date(Date.UTC(2026, 10, 13, 14)) },
    });
    const who = value(await env.sign.identify({ accessToken: renewed.accessToken }));
    expect(who.passwordEnteredAt).toEqual(new Date(Date.UTC(2026, 10, 13, 14)));
    expect(who.lastSignInAt).toEqual(new Date(Date.UTC(2026, 10, 13, 14)));
  });

  it('counts wrong passwords like wrong sign-ins, per address', async () => {
    const env = setup();
    const { session } = await signUp(env, 'ana@example.test');
    for (let i = 0; i < 5; i++) {
      await env.sign.confirmPassword({
        accessToken: session.accessToken,
        password: 'wrong',
        networkAddress: here,
      });
    }
    expect(
      await env.sign.signIn({ email: 'ana@example.test', password: strongPassword, device: phone }),
    ).toEqual({ ok: false, error: { code: 'too-many-attempts', retryAfterSeconds: 30 } });
  });

  it('counts wrong passwords per network too', async () => {
    const env = setup({
      settings: {
        guessesPerNetwork: {
          windowMinutes: 15,
          slowAfter: 10,
          slowSeconds: 5,
          lockAfter: 3,
          lockMinutes: 15,
        },
      },
    });
    const ana = await signUp(env, 'ana@example.test', strongPassword, phone);
    const ben = await signUp(env, 'ben@example.test', strongPassword, phone);
    const confirm = (accessToken: string, password: string, networkAddress: string) =>
      env.sign.confirmPassword({ accessToken, password, networkAddress });
    for (let i = 0; i < 3; i++) await confirm(ana.session.accessToken, 'wrong', here);
    expect(errorCode(await confirm(ben.session.accessToken, strongPassword, here))).toBe(
      'too-many-attempts',
    );
    expect((await confirm(ben.session.accessToken, strongPassword, elsewhere)).ok).toBe(true);
  });

  it('lets no more than the limit through when guesses arrive at once', async () => {
    const env = setup();
    const { session } = await signUp(env, 'ana@example.test');
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        env.sign.confirmPassword({
          accessToken: session.accessToken,
          password: 'wrong',
          networkAddress: here,
        }),
      ),
    );
    expect(results.filter((r) => errorCode(r) === 'wrong-password')).toHaveLength(5);
    expect(results.filter((r) => errorCode(r) === 'too-many-attempts')).toHaveLength(7);
  });

  it('answers no-password for an account made with Google, and never counts it', async () => {
    const env = setup({
      settings: {
        guessesPerNetwork: {
          windowMinutes: 15,
          slowAfter: 10,
          slowSeconds: 5,
          lockAfter: 2,
          lockMinutes: 15,
        },
      },
    });
    const google = await signInWithGoogle(env, 'cara@example.test');
    for (let i = 0; i < 5; i++) {
      expect(
        await env.sign.confirmPassword({
          accessToken: google.session.accessToken,
          password: 'anything',
          networkAddress: here,
        }),
      ).toEqual({ ok: false, error: { code: 'no-password' } });
    }
    const ana = await signUp(env, 'ana@example.test');
    const confirmed = await env.sign.confirmPassword({
      accessToken: ana.session.accessToken,
      password: strongPassword,
      networkAddress: here,
    });
    expect(confirmed.ok).toBe(true);
    // A fresh Google sign-in is the proof for such an account.
    env.advanceSeconds(2 * 60 * 60);
    const again = await signInWithGoogle(env, 'cara@example.test');
    const who = value(await env.sign.identify({ accessToken: again.session.accessToken }));
    expect(who).toMatchObject({
      hasPassword: false,
      lastSignInAt: new Date(Date.UTC(2026, 10, 13, 14)),
    });
  });
});

describe('reset by code', () => {
  it('replaces the password, ends every other session, and says the password changed (T-85)', async () => {
    const env = setup();
    const original = await signUp(env, 'ana@example.test');
    const onPhone = value(
      await env.sign.signIn({ email: 'ana@example.test', password: strongPassword, device: phone }),
    );
    value(await env.sign.startReset({ email: 'ana@example.test', networkAddress: here }));
    const message = env.capture.messages().at(-1);
    expect(message).toMatchObject({
      to: 'ana@example.test',
      purpose: 'reset',
      accountExists: true,
    });
    const { proof } = value(
      await env.sign.verifyCode({
        email: 'ana@example.test',
        code: message?.code ?? '',
        networkAddress: here,
      }),
    );
    const reset = value(
      await env.sign.setPassword({ proof, password: 'a brand new phrase', device: phone }),
    );
    expect(reset).toMatchObject({
      accountId: original.accountId,
      outcome: 'password-changed',
      endedSessions: 2,
      newDevice: false,
    });
    for (const ended of [original, onPhone]) {
      expect(errorCode(await env.sign.identify({ accessToken: ended.session.accessToken }))).toBe(
        'session-ended',
      );
      expect(errorCode(await env.sign.renew({ refreshToken: ended.session.refreshToken }))).toBe(
        'session-ended',
      );
    }
    expect((await env.sign.identify({ accessToken: reset.session.accessToken })).ok).toBe(true);
    expect(
      await env.sign.signIn({
        email: 'ana@example.test',
        password: strongPassword,
        device: laptop,
      }),
    ).toEqual({ ok: false, error: { code: 'wrong-email-or-password' } });
    const withNew = await env.sign.signIn({
      email: 'ana@example.test',
      password: 'a brand new phrase',
      device: laptop,
    });
    expect(withNew.ok).toBe(true);
  });

  it('treats sign-up for an address that has an account as the reset route (T-67)', async () => {
    const env = setup();
    const original = await signUp(env, 'ana@example.test');
    value(await env.sign.startSignUp({ email: 'ana@example.test', networkAddress: here }));
    expect(env.capture.messages().at(-1)).toMatchObject({
      purpose: 'sign-up',
      accountExists: true,
    });
    const again = await signUp(env, 'ana@example.test', 'another long phrase');
    expect(again).toMatchObject({ accountId: original.accountId, outcome: 'password-changed' });
  });

  it('gives a Google-only account a password through the same route', async () => {
    const env = setup();
    const google = await signInWithGoogle(env, 'cara@example.test');
    expect(
      await env.sign.signIn({
        email: 'cara@example.test',
        password: strongPassword,
        device: laptop,
      }),
    ).toEqual({ ok: false, error: { code: 'wrong-email-or-password' } });
    const withPassword = await signUp(env, 'cara@example.test');
    expect(withPassword.accountId).toBe(google.accountId);
  });
});
