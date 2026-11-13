// What each sign-in form does (step 1.14, P6 §2 and §5, T4 §3), as plain functions
// of the form's fields, the browser's cookies and the ports, so they are tested
// without a server (flows.test.ts). actions.ts calls them from Next.js and sends
// the browser where they answer.
//
// The rules they keep beyond the sign-in service's own:
// - T-68: what the browser is told and where it is sent never depends on whether an
//   account exists. Asking for a code always goes on to "enter your code"; a wrong
//   address and a wrong password are one problem.
// - T-69, T-70: the session lives in cookies the page cannot read; signing in again
//   on a device ends the session it had before.
// - T-70: a sign-in on a device the account has not used before emails the account;
//   a changed password emails it too (T-85) and has ended every other session.
// - A place to go after signing in is only ever a path on this site (safeReturnPath).
import { signInEmail } from '@srleagues/contracts';
import { platformUrl } from '@srleagues/core';
import type { SessionTokens, SignInService } from '@srleagues/providers';
import {
  clearSessionCookies,
  cookieNames,
  readFlow,
  readGoogleFlow,
  setSessionCookies,
  writeFlow,
  writeGoogleFlow,
  type CookieJar,
} from './cookies.ts';
import { deviceOf, safeReturnPath, type Visit } from './device.ts';
import { screenUrl, type Problem } from './problems.ts';
import type { SignInMail } from './sign-in-mail.ts';

export type FlowDeps = {
  readonly signIn: SignInService;
  readonly mail: SignInMail;
  /** Whether the site is on HTTPS (PUBLIC_BASE_URL), so cookies are Secure. */
  readonly secureCookies: boolean;
  /** PUBLIC_BASE_URL, for Google's return address. */
  readonly siteOrigin: string;
  readonly now: () => Date;
};

/** Where to send the browser next: one of our paths, or Google's address. */
export type FlowAnswer = { readonly to: string };

type Fields = Readonly<Record<string, string | undefined>>;

const goTo = (to: string): FlowAnswer => ({ to });
// Checked again here: a place to go may come back from a cookie, which the browser can change.
const afterSignIn = (next: string | null) => goTo(safeReturnPath(next) ?? platformUrl('account'));

/** A cookie's value; an empty one counts as none. */
const cookie = (jar: CookieJar, name: string): string | undefined => {
  const value = jar.get(name);
  return value === undefined || value === '' ? undefined : value;
};
const tooMany = (retryAfterSeconds: number): { problem: Problem; wait: number } => ({
  problem: 'tooManyAttempts',
  wait: retryAfterSeconds,
});

/** Sign-up (`sign-up`) or the forgotten-password route (`reset`): email a code (T-67). */
export async function askForCode(
  purpose: 'sign-up' | 'reset',
  fields: Fields,
  visit: Visit,
  deps: FlowDeps,
): Promise<FlowAnswer> {
  const page = purpose === 'sign-up' ? 'signup' : 'forgotPassword';
  const next = safeReturnPath(fields['next']);
  const input = { email: fields['email'] ?? '', networkAddress: visit.networkAddress };
  const asked =
    purpose === 'sign-up'
      ? await deps.signIn.startSignUp(input)
      : await deps.signIn.startReset(input);
  if (!asked.ok) {
    const error = asked.error;
    if (error.code === 'too-many-attempts') {
      return goTo(screenUrl(page, { ...tooMany(error.retryAfterSeconds), next }));
    }
    const problem: Problem = error.code === 'invalid-email' ? 'invalidEmail' : 'codeNotSent';
    return goTo(screenUrl(page, { problem, next }));
  }
  // The service accepted the address, so it is one; kept as the service keeps it.
  const email = signInEmail.parse(input.email);
  writeFlow(
    visit.jar,
    { purpose, email, minutes: asked.value.codeValidMinutes, next },
    deps.secureCookies,
  );
  return goTo(platformUrl('enterCode'));
}

/** The 6-digit code from the email. */
export async function enterCode(fields: Fields, visit: Visit, deps: FlowDeps): Promise<FlowAnswer> {
  const flow = readFlow(visit.jar);
  if (flow === undefined) return goTo(screenUrl('signup', { problem: 'codeExpired' }));
  const checked = await deps.signIn.verifyCode({
    email: flow.email,
    code: fields['code'] ?? '',
    networkAddress: visit.networkAddress,
  });
  if (!checked.ok) {
    const error = checked.error;
    if (error.code === 'too-many-attempts') {
      return goTo(
        error.retryAfterSeconds === undefined
          ? screenUrl('enterCode', { problem: 'codeUsedUp' })
          : screenUrl('enterCode', tooMany(error.retryAfterSeconds)),
      );
    }
    const problem: Problem = error.code === 'code-wrong' ? 'codeWrong' : 'codeExpired';
    return goTo(screenUrl('enterCode', { problem }));
  }
  writeFlow(visit.jar, { ...flow, proof: checked.value.proof }, deps.secureCookies);
  return goTo(platformUrl('choosePassword'));
}

/** The new password: creates the account or replaces its password, and signs in. */
export async function choosePassword(
  fields: Fields,
  visit: Visit,
  deps: FlowDeps,
): Promise<FlowAnswer> {
  const flow = readFlow(visit.jar);
  if (flow?.proof === undefined) return goTo(screenUrl('signup', { problem: 'proofInvalid' }));
  const set = await deps.signIn.setPassword({
    proof: flow.proof,
    password: fields['password'] ?? '',
    device: deviceOf(visit, deps.secureCookies),
  });
  if (!set.ok) {
    switch (set.error.code) {
      case 'proof-invalid':
        visit.jar.delete(cookieNames.flow);
        return goTo(
          screenUrl(flow.purpose === 'sign-up' ? 'signup' : 'forgotPassword', {
            problem: 'proofInvalid',
          }),
        );
      case 'password-too-short':
        return goTo(screenUrl('choosePassword', { problem: 'passwordTooShort' }));
      case 'password-too-long':
        return goTo(screenUrl('choosePassword', { problem: 'passwordTooLong' }));
      case 'password-leaked':
        return goTo(screenUrl('choosePassword', { problem: 'passwordLeaked' }));
    }
  }
  await startSession(visit.jar, set.value.session, deps);
  // A changed password has ended every other session: the account hears of it (T-85),
  // at the address the service holds for it, never one read from a cookie. A new
  // account has nothing to warn about.
  if (set.value.outcome === 'password-changed') {
    const who = await deps.signIn.identify({ accessToken: set.value.session.accessToken });
    if (who.ok) await deps.mail.passwordChanged(who.value.email, deps.now());
  }
  return afterSignIn(flow.next);
}

/** Email and password. */
export async function signInWithPassword(
  fields: Fields,
  visit: Visit,
  deps: FlowDeps,
): Promise<FlowAnswer> {
  const next = safeReturnPath(fields['next']);
  const device = deviceOf(visit, deps.secureCookies);
  const signed = await deps.signIn.signIn({
    email: fields['email'] ?? '',
    password: fields['password'] ?? '',
    device,
  });
  if (!signed.ok) {
    const error = signed.error;
    return goTo(
      error.code === 'too-many-attempts'
        ? screenUrl('signin', { ...tooMany(error.retryAfterSeconds), next })
        : screenUrl('signin', { problem: 'wrongEmailOrPassword', next }),
    );
  }
  await startSession(visit.jar, signed.value.session, deps);
  if (signed.value.newDevice) {
    await deps.mail.newDevice(signInEmail.parse(fields['email']), device.label, deps.now());
  }
  return afterSignIn(next);
}

/** "Continue with Google": off to Google, which sends the browser back to googleReturn. */
export async function startGoogle(
  fields: Fields,
  visit: Visit,
  deps: FlowDeps,
): Promise<FlowAnswer> {
  const next = safeReturnPath(fields['next']);
  const started = await deps.signIn.startExternalSignIn({
    provider: 'google',
    returnAddress: deps.siteOrigin + platformUrl('googleReturn'),
  });
  if (!started.ok) return goTo(screenUrl('signin', { problem: 'googleFailed', next }));
  writeGoogleFlow(visit.jar, { verifier: started.value.verifier, next }, deps.secureCookies);
  return goTo(started.value.redirectTo);
}

/** Google sent the browser back with a code. */
export async function finishGoogle(
  code: string,
  visit: Visit,
  deps: FlowDeps,
): Promise<FlowAnswer> {
  const flow = readGoogleFlow(visit.jar);
  visit.jar.delete(cookieNames.google);
  if (flow === undefined || code === '') {
    return goTo(screenUrl('signin', { problem: 'googleFailed' }));
  }
  const device = deviceOf(visit, deps.secureCookies);
  const done = await deps.signIn.completeExternalSignIn({
    provider: 'google',
    code,
    verifier: flow.verifier,
    device,
  });
  if (!done.ok) return goTo(screenUrl('signin', { problem: 'googleFailed', next: flow.next }));
  await startSession(visit.jar, done.value.session, deps);
  if (done.value.newDevice && done.value.outcome === 'signed-in') {
    const who = await deps.signIn.identify({ accessToken: done.value.session.accessToken });
    if (who.ok) await deps.mail.newDevice(who.value.email, device.label, deps.now());
  }
  return afterSignIn(flow.next);
}

/** The password again before a sensitive action (T-70). */
export async function confirmPassword(
  fields: Fields,
  visit: Visit,
  deps: FlowDeps,
): Promise<FlowAnswer> {
  const next = safeReturnPath(fields['next']);
  const accessToken = cookie(visit.jar, cookieNames.session);
  if (accessToken === undefined) {
    return goTo(screenUrl('signin', { problem: 'signInAgain', next }));
  }
  const confirmed = await deps.signIn.confirmPassword({
    accessToken,
    password: fields['password'] ?? '',
    networkAddress: visit.networkAddress,
  });
  if (confirmed.ok) return afterSignIn(next);
  const error = confirmed.error;
  switch (error.code) {
    case 'wrong-password':
      return goTo(screenUrl('confirmPassword', { problem: 'wrongPassword', next }));
    case 'no-password':
      return goTo(screenUrl('confirmPassword', { problem: 'noPassword', next }));
    case 'too-many-attempts':
      return goTo(screenUrl('confirmPassword', { ...tooMany(error.retryAfterSeconds), next }));
    case 'access-expired':
    case 'session-ended':
      clearSessionCookies(visit.jar);
      return goTo(screenUrl('signin', { problem: 'signInAgain', next }));
  }
}

/** Signs this device out. Harmless with no session. */
export async function signOut(visit: Visit, deps: FlowDeps): Promise<FlowAnswer> {
  await endSessionIn(visit.jar, deps);
  return goTo(platformUrl('signin'));
}

/**
 * Ends every session of the account, this one too (T-71). When that cannot be done
 * (no session here, or it has ended), this device is still signed out and the
 * person is told to sign in and try again: they are never told it worked.
 */
export async function signOutEverywhere(visit: Visit, deps: FlowDeps): Promise<FlowAnswer> {
  const accessToken = cookie(visit.jar, cookieNames.session);
  const ended =
    accessToken === undefined
      ? undefined
      : await deps.signIn.signOutEverywhere({ accessToken, keepThisSession: false });
  await endSessionIn(visit.jar, deps);
  if (ended === undefined || !ended.ok) {
    return goTo(
      screenUrl('signin', { problem: 'signOutEverywhereFailed', next: platformUrl('account') }),
    );
  }
  return goTo(platformUrl('signin'));
}

/** Puts a new session in the cookies, ending the one this device had before. */
async function startSession(jar: CookieJar, session: SessionTokens, deps: FlowDeps) {
  await endSessionIn(jar, deps);
  setSessionCookies(jar, session, deps.secureCookies, deps.now());
}

/** Ends this device's session, if any, and forgets any sign-up or reset under way. */
async function endSessionIn(jar: CookieJar, deps: FlowDeps) {
  const refreshToken = cookie(jar, cookieNames.renew);
  const accessToken = cookie(jar, cookieNames.session);
  if (refreshToken !== undefined) await deps.signIn.signOut({ refreshToken });
  else if (accessToken !== undefined) await deps.signIn.signOut({ accessToken });
  clearSessionCookies(jar);
  jar.delete(cookieNames.flow);
}
