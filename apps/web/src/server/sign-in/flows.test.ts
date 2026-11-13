// The sign-in flows on the sign-in stand-in, with a browser played by a cookie jar:
// the same answers whether or not an account exists (T-68), attempt limits (T-85,
// T-225), the session cookie (T-69), new-device and password-changed emails (T-70,
// T-85), and "sign out everywhere" (T-71).
import { captureEmail, createLocalSignInStandIn } from '@srleagues/providers';
import { describe, expect, it } from 'vitest';
import { cookieNames, type CookieJar, type CookieOptions } from './cookies.ts';
import type { Visit } from './device.ts';
import {
  askForCode,
  choosePassword,
  confirmPassword,
  enterCode,
  finishGoogle,
  signInWithPassword,
  signOut,
  signOutEverywhere,
  startGoogle,
  type FlowDeps,
} from './flows.ts';
import { renewIfDue, sharedRenewal } from './renew-session.ts';
import { createSignInMail } from './sign-in-mail.ts';

const origin = 'http://localhost:3000';
const password = 'correct horse battery';

function setup() {
  let at = Date.UTC(2026, 10, 13, 12);
  const now = () => new Date(at);
  const outbox = captureEmail({ now });
  const mail = createSignInMail({
    sender: outbox,
    fromAddress: 'hello@example.test',
    siteOrigin: origin,
    onNoticeFailed: () => undefined,
    now,
  });
  const standIn = createLocalSignInStandIn({
    environment: 'test',
    nodeEnv: 'test',
    codeSender: mail.codeSender,
    returnOrigins: [origin],
    now,
  });
  const deps: FlowDeps = {
    signIn: standIn.service,
    mail,
    secureCookies: false,
    siteOrigin: origin,
    now,
  };
  const advanceSeconds = (seconds: number) => {
    at += seconds * 1000;
  };
  /** The code in the newest email to `to`. */
  const codeFor = (to: string) => {
    const email = outbox.messages().findLast((m) => m.to === to);
    const code = /\b(\d{6})\b/.exec(email?.text ?? '')?.[1];
    if (code === undefined) throw new Error(`no code emailed to ${to}`);
    return code;
  };
  return { deps, outbox, standIn, advanceSeconds, codeFor };
}

type Env = ReturnType<typeof setup>;

/** A browser: its cookies, with what was set on each, and where it comes from. */
function browser(networkAddress = '192.0.2.10', userAgent = firefoxOnWindows) {
  const cookies = new Map<string, { value: string; options: CookieOptions }>();
  const jar: CookieJar = {
    get: (name) => cookies.get(name)?.value,
    set: (name, value, options) => {
      if (options.maxAge <= 0) cookies.delete(name);
      else cookies.set(name, { value, options });
    },
    delete: (name) => {
      cookies.delete(name);
    },
  };
  const visit: Visit = { jar, networkAddress, userAgent };
  return { jar, visit, cookies, names: () => [...cookies.keys()].sort() };
}

const firefoxOnWindows =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';
const safariOnIphone =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** Signs up `email` the whole way through in browser `b`. */
async function signUp(env: Env, b: ReturnType<typeof browser>, email: string) {
  await askForCode('sign-up', { email }, b.visit, env.deps);
  await enterCode({ code: env.codeFor(email) }, b.visit, env.deps);
  return choosePassword({ password }, b.visit, env.deps);
}

describe('signing up (T-67)', () => {
  it('goes email, code, password, and ends signed in with cookies the page cannot read', async () => {
    const env = setup();
    const b = browser();
    expect(await askForCode('sign-up', { email: 'new@example.test' }, b.visit, env.deps)).toEqual({
      to: '/signup/code',
    });
    expect(await enterCode({ code: env.codeFor('new@example.test') }, b.visit, env.deps)).toEqual({
      to: '/signup/password',
    });
    expect(await choosePassword({ password }, b.visit, env.deps)).toEqual({ to: '/account' });
    expect(b.names()).toEqual([cookieNames.device, cookieNames.renew, cookieNames.session]);
    for (const { options } of b.cookies.values()) {
      expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    }
    // The session cookie runs out just before its 60-minute token; the renewing token has no limit of ours.
    expect(b.cookies.get(cookieNames.session)?.options.maxAge).toBe(60 * 60 - 30);
    expect(b.cookies.get(cookieNames.renew)?.options.maxAge).toBe(400 * 24 * 60 * 60);
    const who = await env.deps.signIn.identify({
      accessToken: b.jar.get(cookieNames.session) ?? '',
    });
    expect(who.ok && who.value.email).toBe('new@example.test');
    // A new account is not a new device to warn about.
    expect(env.outbox.messages().map((m) => m.subject)).toEqual([
      'Your code to create your account',
    ]);
  });

  it('marks cookies Secure on an HTTPS site', async () => {
    const env = setup();
    const b = browser();
    await askForCode('sign-up', { email: 'new@example.test' }, b.visit, {
      ...env.deps,
      secureCookies: true,
    });
    expect(b.cookies.get(cookieNames.flow)?.options.secure).toBe(true);
  });

  it('shows the problem on the same screen and keeps the place to go after', async () => {
    const env = setup();
    const b = browser();
    expect(
      await askForCode(
        'sign-up',
        { email: 'not an address', next: '/north-valley' },
        b.visit,
        env.deps,
      ),
    ).toEqual({ to: '/signup?problem=invalidEmail&next=%2Fnorth-valley' });
    await askForCode(
      'sign-up',
      { email: 'new@example.test', next: '/north-valley' },
      b.visit,
      env.deps,
    );
    expect(await enterCode({ code: '000000' }, b.visit, env.deps)).toEqual({
      to: '/signup/code?problem=codeWrong',
    });
    await enterCode({ code: env.codeFor('new@example.test') }, b.visit, env.deps);
    expect(await choosePassword({ password: 'short' }, b.visit, env.deps)).toEqual({
      to: '/signup/password?problem=passwordTooShort',
    });
    expect(await choosePassword({ password: 'password123' }, b.visit, env.deps)).toEqual({
      to: '/signup/password?problem=passwordLeaked',
    });
    expect(await choosePassword({ password }, b.visit, env.deps)).toEqual({ to: '/north-valley' });
  });

  it('never sends anyone to another site after signing in', async () => {
    const env = setup();
    for (const next of ['//evil.example', 'https://evil.example/x', '/\\evil.example', 'x']) {
      const b = browser();
      expect(
        await signInWithPassword(
          { email: 'a@example.test', password: 'x', next },
          b.visit,
          env.deps,
        ),
      ).toEqual({ to: '/signin?problem=wrongEmailOrPassword' });
    }
  });

  it('refuses the code screen and the password screen with no flow under way', async () => {
    const env = setup();
    const b = browser();
    expect(await enterCode({ code: '123456' }, b.visit, env.deps)).toEqual({
      to: '/signup?problem=codeExpired',
    });
    expect(await choosePassword({ password }, b.visit, env.deps)).toEqual({
      to: '/signup?problem=proofInvalid',
    });
    // A flow cookie bent into another shape is no flow.
    b.jar.set(cookieNames.flow, 'not-a-flow', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60,
    });
    expect(await enterCode({ code: '123456' }, b.visit, env.deps)).toEqual({
      to: '/signup?problem=codeExpired',
    });
  });
});

describe('the same whether or not an account exists (T-68)', () => {
  it('asking for a code: the same answer and the same cookies', async () => {
    for (const purpose of ['sign-up', 'reset'] as const) {
      const env = setup();
      await signUp(env, browser(), 'taken@example.test');
      const known = browser();
      const unknown = browser();
      const a = await askForCode(purpose, { email: 'taken@example.test' }, known.visit, env.deps);
      const b = await askForCode(
        purpose,
        { email: 'nobody@example.test' },
        unknown.visit,
        env.deps,
      );
      expect(a).toEqual(b);
      expect(known.names()).toEqual(unknown.names());
    }
  });

  it('signing in: one problem for a wrong address and a wrong password', async () => {
    const env = setup();
    await signUp(env, browser(), 'taken@example.test');
    const wrongPassword = browser();
    const wrongAddress = browser();
    const a = await signInWithPassword(
      { email: 'taken@example.test', password: 'not the password' },
      wrongPassword.visit,
      env.deps,
    );
    const b = await signInWithPassword(
      { email: 'nobody@example.test', password: 'not the password' },
      wrongAddress.visit,
      env.deps,
    );
    expect(a).toEqual({ to: '/signin?problem=wrongEmailOrPassword' });
    expect(b).toEqual(a);
    expect(wrongPassword.names()).toEqual(wrongAddress.names());
  });

  it('locking out: the same wait for an address with an account and one without', async () => {
    const env = setup();
    await signUp(env, browser(), 'taken@example.test');
    const answers: Record<string, unknown> = {};
    for (const email of ['taken@example.test', 'nobody@example.test']) {
      const b = browser('198.51.100.7');
      let last: unknown;
      for (let i = 0; i < 10; i++) {
        last = await signInWithPassword({ email, password: 'not the password' }, b.visit, env.deps);
      }
      answers[email] = last;
    }
    expect(answers['taken@example.test']).toEqual(answers['nobody@example.test']);
  });
});

describe('attempt limits (T-85, T-225)', () => {
  it('slows wrong passwords for an address, then locks it, even with the right password', async () => {
    const env = setup();
    await signUp(env, browser(), 'taken@example.test');
    const b = browser('203.0.113.9');
    const tries = [];
    for (let i = 0; i < 10; i++) {
      tries.push(
        await signInWithPassword(
          { email: 'taken@example.test', password: 'not the password' },
          b.visit,
          env.deps,
        ),
      );
      env.advanceSeconds(31);
    }
    expect(tries.slice(0, 5).every((t) => t.to === '/signin?problem=wrongEmailOrPassword')).toBe(
      true,
    );
    // Locked: the right password is refused too, with a wait to show.
    const locked = await signInWithPassword(
      { email: 'taken@example.test', password },
      b.visit,
      env.deps,
    );
    expect(locked.to).toMatch(/^\/signin\?problem=tooManyAttempts&wait=\d+$/);
    expect(b.jar.get(cookieNames.session)).toBeUndefined();
    // After the lock, the right password works again.
    env.advanceSeconds(15 * 60);
    expect(
      await signInWithPassword({ email: 'taken@example.test', password }, b.visit, env.deps),
    ).toEqual({ to: '/account' });
  });

  it('limits codes asked for one address', async () => {
    const env = setup();
    const b = browser();
    const answers = [];
    for (let i = 0; i < 6; i++) {
      answers.push(await askForCode('sign-up', { email: 'new@example.test' }, b.visit, env.deps));
    }
    expect(answers.slice(0, 5).every((a) => a.to === '/signup/code')).toBe(true);
    expect(answers[5]?.to).toMatch(/^\/signup\?problem=tooManyAttempts&wait=\d+$/);
  });

  it('uses up a code after a few wrong tries', async () => {
    const env = setup();
    const b = browser();
    await askForCode('sign-up', { email: 'new@example.test' }, b.visit, env.deps);
    let last = { to: '' };
    for (let i = 0; i < 6; i++) last = await enterCode({ code: '000000' }, b.visit, env.deps);
    expect(last).toEqual({ to: '/signup/code?problem=codeUsedUp' });
    expect(await enterCode({ code: env.codeFor('new@example.test') }, b.visit, env.deps)).toEqual({
      to: '/signup/code?problem=codeUsedUp',
    });
  });
});

describe('devices and sessions (T-70, T-71)', () => {
  it('emails the account when it signs in on a device it has not used, and not again', async () => {
    const env = setup();
    const laptop = browser();
    await signUp(env, laptop, 'me@example.test');
    const phone = browser('192.0.2.20', safariOnIphone);
    await signInWithPassword({ email: 'me@example.test', password }, phone.visit, env.deps);
    await signOut(phone.visit, env.deps);
    await signInWithPassword({ email: 'me@example.test', password }, phone.visit, env.deps);
    const notices = env.outbox
      .messages()
      .filter((m) => m.subject === 'Your account was signed in on a new device');
    expect(notices).toHaveLength(1);
    expect(notices[0]?.text).toContain('Safari on iPhone');
  });

  it('signing in again on a device ends the session it had', async () => {
    const env = setup();
    const b = browser();
    await signUp(env, b, 'me@example.test');
    const first = b.jar.get(cookieNames.session) ?? '';
    await signInWithPassword({ email: 'me@example.test', password }, b.visit, env.deps);
    expect((await env.deps.signIn.identify({ accessToken: first })).ok).toBe(false);
  });

  it('"sign out everywhere" ends every session, this one too', async () => {
    const env = setup();
    const laptop = browser();
    await signUp(env, laptop, 'me@example.test');
    const phone = browser('192.0.2.20', safariOnIphone);
    await signInWithPassword({ email: 'me@example.test', password }, phone.visit, env.deps);
    const phoneToken = phone.jar.get(cookieNames.session) ?? '';
    const listed = await env.deps.signIn.listSessions({ accessToken: phoneToken });
    expect(listed.ok && listed.value.map((s) => s.deviceLabel).sort()).toEqual([
      'Firefox on Windows',
      'Safari on iPhone',
    ]);
    const laptopToken = laptop.jar.get(cookieNames.session) ?? '';
    expect(await signOutEverywhere(laptop.visit, env.deps)).toEqual({ to: '/signin' });
    expect(laptop.names()).toEqual([cookieNames.device]);
    for (const accessToken of [laptopToken, phoneToken]) {
      expect((await env.deps.signIn.identify({ accessToken })).ok).toBe(false);
    }
  });

  it('a new password signs out the other devices and emails the account', async () => {
    const env = setup();
    const laptop = browser();
    await signUp(env, laptop, 'me@example.test');
    const laptopToken = laptop.jar.get(cookieNames.session) ?? '';
    const phone = browser('192.0.2.20', safariOnIphone);
    await askForCode('reset', { email: 'me@example.test' }, phone.visit, env.deps);
    await enterCode({ code: env.codeFor('me@example.test') }, phone.visit, env.deps);
    expect(
      await choosePassword({ password: 'another long password' }, phone.visit, env.deps),
    ).toEqual({ to: '/account' });
    expect((await env.deps.signIn.identify({ accessToken: laptopToken })).ok).toBe(false);
    expect(env.outbox.messages().at(-1)?.subject).toBe('Your password was changed');
  });
});

describe('staying signed in (T-69, T-70)', () => {
  it('renews when the session cookie has run out, and the old renewing token is shared briefly', async () => {
    const env = setup();
    const b = browser();
    await signUp(env, b, 'me@example.test');
    const renew = sharedRenewal(
      (refreshToken) => env.deps.signIn.renew({ refreshToken }),
      env.deps.now,
    );
    // Nothing to do while the session cookie is there.
    expect(await renewIfDue(b.jar, renew, false, env.deps.now)).toBe(false);
    env.advanceSeconds(61 * 60);
    b.jar.delete(cookieNames.session); // the browser dropped it when it ran out
    const oldRenew = b.jar.get(cookieNames.renew) ?? '';
    const other = browser();
    other.jar.set(cookieNames.renew, oldRenew, b.cookies.get(cookieNames.renew)!.options);
    // Two requests at once with the same old token: both get the same new session.
    await Promise.all([
      renewIfDue(b.jar, renew, false, env.deps.now),
      renewIfDue(other.jar, renew, false, env.deps.now),
    ]);
    expect(b.jar.get(cookieNames.session)).toBeDefined();
    expect(b.jar.get(cookieNames.session)).toBe(other.jar.get(cookieNames.session));
    const who = await env.deps.signIn.identify({
      accessToken: b.jar.get(cookieNames.session) ?? '',
    });
    expect(who.ok).toBe(true);
  });

  it('clears the cookies when the session has ended', async () => {
    const env = setup();
    const b = browser();
    await signUp(env, b, 'me@example.test');
    const renewToken = b.jar.get(cookieNames.renew) ?? '';
    await signOut(b.visit, env.deps);
    b.jar.set(cookieNames.renew, renewToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60,
    });
    const renew = sharedRenewal((refreshToken) => env.deps.signIn.renew({ refreshToken }));
    expect(await renewIfDue(b.jar, renew, false, env.deps.now)).toBe(true);
    expect(b.names()).toEqual([cookieNames.device]);
  });
});

describe('the password again (T-70)', () => {
  it('goes on with the right password, and stays with a wrong one', async () => {
    const env = setup();
    const b = browser();
    await signUp(env, b, 'me@example.test');
    expect(
      await confirmPassword(
        { password: 'wrong one', next: '/north-valley/admin' },
        b.visit,
        env.deps,
      ),
    ).toEqual({ to: '/account/confirm?problem=wrongPassword&next=%2Fnorth-valley%2Fadmin' });
    expect(
      await confirmPassword({ password, next: '/north-valley/admin' }, b.visit, env.deps),
    ).toEqual({ to: '/north-valley/admin' });
  });

  it('asks a signed-out person to sign in', async () => {
    const env = setup();
    expect(await confirmPassword({ password }, browser().visit, env.deps)).toEqual({
      to: '/signin?problem=signInAgain',
    });
  });
});

describe('Google (T-67)', () => {
  it('goes to Google and back, signed in', async () => {
    const env = setup();
    const b = browser();
    const out = await startGoogle({ next: '/north-valley' }, b.visit, env.deps);
    const back = new URL(out.to);
    expect(back.origin + back.pathname).toBe(`${origin}/signin/google`);
    const verifier = JSON.parse(
      Buffer.from(b.jar.get(cookieNames.google) ?? '', 'base64url').toString('utf8'),
    ).verifier;
    env.standIn.approveExternalSignIn({ verifier, email: 'g@example.test' });
    expect(await finishGoogle(back.searchParams.get('code') ?? '', b.visit, env.deps)).toEqual({
      to: '/north-valley',
    });
    expect(b.jar.get(cookieNames.google)).toBeUndefined();
    expect(b.jar.get(cookieNames.session)).toBeDefined();
  });

  it('refuses a return with no sign-in started here', async () => {
    const env = setup();
    expect(await finishGoogle('made-up', browser().visit, env.deps)).toEqual({
      to: '/signin?problem=googleFailed',
    });
  });
});
