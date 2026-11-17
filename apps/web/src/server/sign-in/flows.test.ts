// The sign-in flows on the sign-in stand-in, with a browser played by a cookie jar:
// the same answers whether or not an account exists (T-68), attempt limits (T-85,
// T-225), the session cookie (T-69), new-device and password-changed emails (T-70,
// T-85), and "sign out everywhere" (T-71).
import type { EmailSender } from '@srleagues/core';
import { captureEmail, createLocalSignInStandIn } from '@srleagues/providers';
import { describe, expect, it, vi } from 'vitest';
import {
  cookieNames,
  readFlow,
  readTypedEmail,
  type CookieJar,
  type CookieOptions,
} from './cookies.ts';
import type { Visit } from './device.ts';
import {
  askForCode,
  choosePassword,
  confirmPassword,
  enterCode,
  finishGoogle,
  sendCodeAgain,
  signInWithPassword,
  signOut,
  signOutEverywhere,
  startGoogle,
  type FlowDeps,
} from './flows.ts';
import {
  renewIfDue,
  sharedRenewal,
  sharedRenewalLimit,
  sharedRenewalSeconds,
} from './renew-session.ts';
import { createSignInMail } from './sign-in-mail.ts';

const origin = 'http://localhost:3000';
const password = 'correct horse battery';

/** `sender` wraps the capture's own sending, to make it slow or fail. */
function setup(sender?: (outbox: EmailSender) => EmailSender) {
  let at = Date.UTC(2026, 10, 13, 12);
  const now = () => new Date(at);
  const outbox = captureEmail({ now });
  const failed: string[] = [];
  const mail = createSignInMail({
    sender: sender === undefined ? outbox : sender(outbox),
    fromAddress: 'hello@example.test',
    siteOrigin: origin,
    onNoticeFailed: (kind) => failed.push(kind),
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
  return { deps, outbox, standIn, advanceSeconds, codeFor, failed };
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
    await signOut({}, phone.visit, env.deps);
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
    expect(await signOutEverywhere(laptop.visit, env.deps)).toEqual({
      to: '/?notice=signedOutEverywhere',
    });
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

  it('after the shared 30 seconds, the old renewing token ends the session (T4 §3)', async () => {
    expect(sharedRenewalSeconds).toBe(30);
    const env = setup();
    const b = browser();
    await signUp(env, b, 'me@example.test');
    const renew = sharedRenewal(
      (refreshToken) => env.deps.signIn.renew({ refreshToken }),
      env.deps.now,
    );
    env.advanceSeconds(61 * 60);
    b.jar.delete(cookieNames.session);
    const oldRenew = b.jar.get(cookieNames.renew) ?? '';
    const options = b.cookies.get(cookieNames.renew)!.options;
    await renewIfDue(b.jar, renew, false, env.deps.now);
    const renewed = b.jar.get(cookieNames.session) ?? '';
    env.advanceSeconds(sharedRenewalSeconds + 1);
    const thief = browser('198.51.100.66');
    thief.jar.set(cookieNames.renew, oldRenew, options);
    await renewIfDue(thief.jar, renew, false, env.deps.now);
    expect(thief.jar.get(cookieNames.session)).toBeUndefined();
    expect((await env.deps.signIn.identify({ accessToken: renewed })).ok).toBe(false);
  });

  it('clears the cookies when the session has ended', async () => {
    const env = setup();
    const b = browser();
    await signUp(env, b, 'me@example.test');
    const renewToken = b.jar.get(cookieNames.renew) ?? '';
    await signOut({}, b.visit, env.deps);
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

// Findings of the security review of step 1.14.
describe('after review', () => {
  const options = {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60,
  } as const;
  const flowOf = (b: ReturnType<typeof browser>): Record<string, unknown> =>
    JSON.parse(Buffer.from(b.jar.get(cookieNames.flow) ?? '', 'base64url').toString('utf8'));
  const writeFlowRaw = (b: ReturnType<typeof browser>, flow: unknown) =>
    b.jar.set(
      cookieNames.flow,
      Buffer.from(JSON.stringify(flow), 'utf8').toString('base64url'),
      options,
    );

  it('checks again a place to go that comes back from a cookie', async () => {
    const env = setup();
    const b = browser();
    await askForCode('sign-up', { email: 'new@example.test' }, b.visit, env.deps);
    await enterCode({ code: env.codeFor('new@example.test') }, b.visit, env.deps);
    writeFlowRaw(b, { ...flowOf(b), next: '/.//evil.com' });
    expect(await choosePassword({ password }, b.visit, env.deps)).toEqual({ to: '/account' });
  });

  it('sends the password-changed email to the account, never to an address in the cookie', async () => {
    const env = setup();
    await signUp(env, browser(), 'me@example.test');
    const b = browser();
    await askForCode('reset', { email: 'me@example.test' }, b.visit, env.deps);
    await enterCode({ code: env.codeFor('me@example.test') }, b.visit, env.deps);
    writeFlowRaw(b, { ...flowOf(b), email: 'someone-else@example.test' });
    await choosePassword({ password: 'another long password' }, b.visit, env.deps);
    const notice = env.outbox.messages().find((m) => m.subject === 'Your password was changed');
    expect(notice?.to).toBe('me@example.test');
    expect(env.outbox.messages().some((m) => m.to === 'someone-else@example.test')).toBe(false);
  });

  it('sends the new-device email to the address the service holds, not the one typed', async () => {
    const env = setup();
    await signUp(env, browser(), 'me@example.test');
    const service = env.deps.signIn;
    const identify = vi.fn(async (input: Parameters<typeof service.identify>[0]) => {
      const who = await service.identify(input);
      return who.ok ? { ...who, value: { ...who.value, email: 'held@example.test' } } : who;
    });
    const deps: FlowDeps = { ...env.deps, signIn: { ...service, identify } };
    const phone = browser('192.0.2.20', safariOnIphone);
    await signInWithPassword({ email: ' ME@example.test ', password }, phone.visit, deps);
    expect(identify).toHaveBeenCalledWith({ accessToken: phone.jar.get(cookieNames.session) });
    const notices = env.outbox
      .messages()
      .filter((m) => m.subject === 'Your account was signed in on a new device');
    expect(notices.map((m) => m.to)).toEqual(['held@example.test']);
  });

  it('ends the session on the server too when the password again finds it expired', async () => {
    const env = setup();
    const b = browser();
    await signUp(env, b, 'me@example.test');
    const accessToken = b.jar.get(cookieNames.session) ?? '';
    const service = env.deps.signIn;
    const signOutCalls = vi.fn(service.signOut);
    const deps: FlowDeps = {
      ...env.deps,
      signIn: {
        ...service,
        confirmPassword: async () => ({ ok: false, error: { code: 'access-expired' } }) as const,
        signOut: signOutCalls,
      },
    };
    expect(await confirmPassword({ password }, b.visit, deps)).toEqual({
      to: '/signin?problem=signInAgain',
    });
    expect(signOutCalls).toHaveBeenCalledTimes(1);
    expect(b.names()).toEqual([cookieNames.device]);
    expect((await service.identify({ accessToken })).ok).toBe(false);
  });

  it('forgets a sign-up under way when a session starts or ends', async () => {
    const env = setup();
    await signUp(env, browser(), 'me@example.test');
    const b = browser();
    await askForCode('sign-up', { email: 'other@example.test' }, b.visit, env.deps);
    expect(b.jar.get(cookieNames.flow)).toBeDefined();
    await signInWithPassword({ email: 'me@example.test', password }, b.visit, env.deps);
    expect(b.jar.get(cookieNames.flow)).toBeUndefined();
    await askForCode('sign-up', { email: 'other@example.test' }, b.visit, env.deps);
    await signOut({}, b.visit, env.deps);
    expect(b.jar.get(cookieNames.flow)).toBeUndefined();
  });

  it('"sign out everywhere" says it failed only when it did, and never that it worked (M30)', async () => {
    const env = setup();
    const already = '/?notice=alreadySignedOut';
    // No session on this device: it is signed out already, and nothing is claimed of others.
    expect(await signOutEverywhere(browser().visit, env.deps)).toEqual({ to: already });
    const empty = browser();
    empty.jar.set(cookieNames.session, '', options);
    expect(await signOutEverywhere(empty.visit, env.deps)).toEqual({ to: already });
    // A session that has already ended (signed out from elsewhere): this device is still
    // signed out, and it is told so, not that the others could not be signed out.
    const b = browser();
    await signUp(env, b, 'me@example.test');
    await env.deps.signIn.signOut({ accessToken: b.jar.get(cookieNames.session) ?? '' });
    expect(await signOutEverywhere(b.visit, env.deps)).toEqual({ to: already });
    expect(b.jar.get(cookieNames.session)).toBeUndefined();
    // A live session the service would not end everywhere (its access token ran out):
    // the other devices are still signed in, and the person is told it failed.
    const late = browser('192.0.2.30');
    await signUp(env, late, 'late@example.test');
    const phone = browser('192.0.2.31', safariOnIphone);
    await signInWithPassword({ email: 'late@example.test', password }, phone.visit, env.deps);
    env.advanceSeconds(61 * 60);
    expect(await signOutEverywhere(late.visit, env.deps)).toEqual({
      to: '/signin?problem=signOutEverywhereFailed&next=%2Faccount',
    });
    expect(late.jar.get(cookieNames.session)).toBeUndefined();
  });

  it('treats an empty session cookie as none when asking for the password again', async () => {
    const env = setup();
    const b = browser();
    b.jar.set(cookieNames.session, '', options);
    expect(await confirmPassword({ password }, b.visit, env.deps)).toEqual({
      to: '/signin?problem=signInAgain',
    });
  });

  it('answers a code request without waiting on the email service, and only reports a failure', async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const env = setup(() => ({
      send: async () => {
        await held;
        throw new Error('the email service is down');
      },
    }));
    // Answered while the email is still held, and the same as for any address.
    expect(
      await askForCode('sign-up', { email: 'x@example.test' }, browser().visit, env.deps),
    ).toEqual({ to: '/signup/code' });
    expect(env.failed).toEqual([]);
    release();
    await vi.waitFor(() => expect(env.failed).toEqual(['code']));
  });

  it('answers a reset alike for an address with an account and one without, while sending is held (T-68)', async () => {
    let held = false;
    const waiting: (() => void)[] = [];
    const env = setup((outbox) => ({
      send: async (message) => {
        if (held) await new Promise<void>((resolve) => waiting.push(resolve));
        return outbox.send(message);
      },
    }));
    await signUp(env, browser(), 'me@example.test');
    held = true;
    const known = browser();
    const unknown = browser();
    const a = await askForCode('reset', { email: 'me@example.test' }, known.visit, env.deps);
    const b = await askForCode('reset', { email: 'nobody@example.test' }, unknown.visit, env.deps);
    expect(a).toEqual(b);
    expect(known.names()).toEqual(unknown.names());
    // The account's email is still waiting: the answer did not wait for it.
    await vi.waitFor(() => expect(waiting).toHaveLength(1));
    for (const go of waiting) go();
  });

  it('leaves the cookies alone when the service cannot be reached, and tries again next time', async () => {
    const env = setup();
    const b = browser();
    await signUp(env, b, 'me@example.test');
    b.jar.delete(cookieNames.session);
    const renewToken = b.jar.get(cookieNames.renew);
    let calls = 0;
    let down = true;
    const renew = sharedRenewal(async (refreshToken) => {
      calls++;
      if (down) throw new Error('busy');
      return env.deps.signIn.renew({ refreshToken });
    }, env.deps.now);
    expect(await renewIfDue(b.jar, renew, false, env.deps.now)).toBe(false);
    expect(b.jar.get(cookieNames.renew)).toBe(renewToken);
    down = false;
    expect(await renewIfDue(b.jar, renew, false, env.deps.now)).toBe(true);
    expect(calls).toBe(2);
    expect(b.jar.get(cookieNames.session)).toBeDefined();
  });

  it('never asks the service about a renewing cookie that cannot be a token', async () => {
    const env = setup();
    const renewCalls = vi.fn(async () => {
      throw new Error('must not be called');
    });
    const renew = sharedRenewal(renewCalls, env.deps.now);
    for (const junk of ['', 'short', 'has spaces in it', 'x'.repeat(5000), 'semi;colon;token']) {
      const b = browser();
      b.jar.set(cookieNames.renew, junk, options);
      b.jar.set(cookieNames.device, 'device-0000000000000001', options);
      await renewIfDue(b.jar, renew, false, env.deps.now);
      expect(b.names(), junk).toEqual([cookieNames.device]);
    }
    expect(renewCalls).not.toHaveBeenCalled();
  });

  it('remembers at most a fixed number of renewals', async () => {
    let calls = 0;
    const limit = 3;
    const renew = sharedRenewal(
      async () => {
        calls++;
        return { ok: false, error: { code: 'session-ended' } } as const;
      },
      () => new Date(),
      limit,
    );
    const token = (n: number) => 'token-' + n.toString().padStart(8, '0');
    for (let i = 0; i <= limit; i++) await renew(token(i));
    // The first was forgotten to make room, so asking again calls the service again.
    await renew(token(0));
    expect(calls).toBe(limit + 2);
    // A recent one is still shared.
    await renew(token(limit));
    expect(calls).toBe(limit + 2);
    expect(sharedRenewalLimit).toBeLessThanOrEqual(10_000);
  });
});

describe('the screens say what is happening (step 2.163)', () => {
  it('"Send a new code" sends another to the same address and stays on the code screen (M24)', async () => {
    const env = setup();
    const b = browser();
    await askForCode(
      'sign-up',
      { email: 'pat@example.test', next: '/north-valley' },
      b.visit,
      env.deps,
    );
    const first = env.codeFor('pat@example.test');
    expect(await sendCodeAgain(b.visit, env.deps)).toEqual({
      to: '/signup/code?notice=codeSentAgain',
    });
    const sent = env.outbox.messages().filter((m) => m.to === 'pat@example.test');
    expect(sent).toHaveLength(2);
    // The same address, purpose and page to come back to.
    expect(readFlow(b.jar)).toMatchObject({
      purpose: 'sign-up',
      email: 'pat@example.test',
      next: '/north-valley',
    });
    // The newest code is the one that works.
    const second = env.codeFor('pat@example.test');
    if (second !== first) {
      expect(await enterCode({ code: first }, b.visit, env.deps)).not.toEqual({
        to: '/signup/password',
      });
    }
    expect(await enterCode({ code: second }, b.visit, env.deps)).toEqual({
      to: '/signup/password',
    });
  });

  it('"Send a new code" keeps to the limits there are and says so on the code screen', async () => {
    const env = setup();
    const b = browser();
    await askForCode('sign-up', { email: 'pat@example.test' }, b.visit, env.deps);
    const answers = [];
    for (let i = 0; i < 5; i++) answers.push(await sendCodeAgain(b.visit, env.deps));
    expect(answers.slice(0, 4)).toEqual(Array(4).fill({ to: '/signup/code?notice=codeSentAgain' }));
    // Five codes an hour (T-225): the fifth "new code" is the sixth asked for.
    expect(answers[4]?.to).toMatch(/^\/signup\/code\?problem=tooManyAttempts&wait=\d+$/);
    // With nothing under way it is the first screen again, as an old code is.
    expect(await sendCodeAgain(browser().visit, env.deps)).toEqual({
      to: '/signup?problem=codeExpired',
    });
  });

  it('"Send a new code" answers alike for an address with an account and one without (T-68)', async () => {
    for (const purpose of ['sign-up', 'reset'] as const) {
      const env = setup();
      await signUp(env, browser(), 'taken@example.test');
      const known = browser();
      const unknown = browser();
      await askForCode(purpose, { email: 'taken@example.test' }, known.visit, env.deps);
      await askForCode(purpose, { email: 'nobody@example.test' }, unknown.visit, env.deps);
      expect(await sendCodeAgain(known.visit, env.deps)).toEqual(
        await sendCodeAgain(unknown.visit, env.deps),
      );
      expect(known.names()).toEqual(unknown.names());
    }
  });

  it('a refused sign-in keeps the address typed, for either kind of address (M28, T-68)', async () => {
    const env = setup();
    await signUp(env, browser(), 'taken@example.test');
    const names: string[][] = [];
    for (const email of ['taken@example.test', 'nobody@example.test']) {
      const b = browser();
      await signInWithPassword({ email, password: 'not the password' }, b.visit, env.deps);
      expect(readTypedEmail(b.jar)).toBe(email);
      const kept = b.cookies.get(cookieNames.typed)?.options;
      expect(kept).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });
      names.push(b.names());
    }
    expect(names[0]).toEqual(names[1]);
    // Gone once the person signs in, and on signing out.
    const b = browser();
    await signInWithPassword({ email: 'taken@example.test', password: 'nope' }, b.visit, env.deps);
    await signInWithPassword({ email: 'taken@example.test', password }, b.visit, env.deps);
    expect(readTypedEmail(b.jar)).toBeUndefined();
    const c = browser();
    await signInWithPassword({ email: 'taken@example.test', password: 'nope' }, c.visit, env.deps);
    await signOut({}, c.visit, env.deps);
    expect(readTypedEmail(c.jar)).toBeUndefined();
  });

  it('signing out leaves the person where they were, saying so (R-30)', async () => {
    const env = setup();
    const signedIn = async () => {
      const b = browser();
      await signUp(env, b, `out-${Math.random().toString(36).slice(2)}@example.test`);
      return b;
    };
    // A league page: back on it.
    let b = await signedIn();
    expect(await signOut({ next: '/north-valley/schedule?team=owls' }, b.visit, env.deps)).toEqual({
      to: '/north-valley/schedule?team=owls&notice=signedOut',
    });
    expect(b.jar.get(cookieNames.session)).toBeUndefined();
    // No page named, or one that is not ours: our front page.
    b = await signedIn();
    expect(await signOut({}, b.visit, env.deps)).toEqual({ to: '/?notice=signedOut' });
    for (const elsewhere of ['//evil.example', 'https://evil.example/', '/\\evil.example']) {
      expect(await signOut({ next: elsewhere }, browser().visit, env.deps)).toEqual({
        to: '/?notice=signedOut',
      });
    }
    // A staff page asks a signed-out person to sign in (U-15): the sign-in screen, saying so.
    b = await signedIn();
    expect(
      await signOut({ next: '/north-valley/admin/teams', staff: 'yes' }, b.visit, env.deps),
    ).toEqual({ to: '/signin?notice=signedOut&next=%2Fnorth-valley%2Fadmin%2Fteams' });
    // A notice already in the address is replaced, never repeated.
    expect(
      await signOut({ next: '/north-valley?notice=signedOut' }, browser().visit, env.deps),
    ).toEqual({ to: '/north-valley?notice=signedOut' });
  });

  it('with Google not set up, a hand-sent "Continue with Google" never reaches the service (M27)', async () => {
    const env = setup();
    const started = vi.fn(env.deps.signIn.startExternalSignIn);
    const deps = {
      ...env.deps,
      google: false,
      signIn: { ...env.deps.signIn, startExternalSignIn: started },
    };
    expect(await startGoogle({ next: '/north-valley' }, browser().visit, deps)).toEqual({
      to: '/signin?problem=googleFailed&next=%2Fnorth-valley',
    });
    expect(started).not.toHaveBeenCalled();
  });
});
