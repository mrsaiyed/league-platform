// Staying signed in (T-69, T-70): the session renews itself on a visit. The session
// cookie runs out just before its access token (cookies.ts); a request that comes
// with the renewing token and no session cookie is renewed by the proxy before any
// page sees it, and the page sees the new token.
//
// The renewing token changes on every use, and using an old one again ends the
// session (T-69). A browser often sends several requests at once (a page and what it
// fetches), all with the same old token: so renewals of one token in this server are
// shared, and for a short while a late request with the token just used gets the
// same new tokens instead of ending the session. That window is this server's only:
// two servers do not share it (record 031).
import { fail, type Result } from '@srleagues/core';
import type { RenewError, SessionTokens } from '@srleagues/providers';
import { createHash } from 'node:crypto';
import { clearSessionCookies, cookieNames, setSessionCookies, type CookieJar } from './cookies.ts';

export type Renew = (refreshToken: string) => Promise<Result<SessionTokens, RenewError>>;

/** How long a renewal's answer is handed to late requests with the same old token. */
export const sharedRenewalSeconds = 30;

/** `renew`, with renewals of one token shared for a short while (see above). */
export function sharedRenewal(renew: Renew, now: () => Date = () => new Date()): Renew {
  const recent = new Map<
    string,
    { readonly answer: Promise<Result<SessionTokens, RenewError>>; readonly until: number }
  >();
  return (refreshToken) => {
    const at = now().getTime();
    for (const [key, entry] of recent) if (entry.until <= at) recent.delete(key);
    // Kept by a one-way hash: the map never holds a token that still works.
    const key = createHash('sha256').update(refreshToken).digest('base64url');
    const kept = recent.get(key);
    if (kept !== undefined) return kept.answer;
    const answer = renew(refreshToken).catch(() => fail({ code: 'session-ended' as const }));
    recent.set(key, { answer, until: at + sharedRenewalSeconds * 1000 });
    return answer;
  };
}

/**
 * What the proxy does with a request's cookies: renews when there is a renewing token
 * and no session cookie; clears both when the session has ended. Answers whether it
 * changed anything.
 */
export async function renewIfDue(
  jar: CookieJar,
  renew: Renew,
  secure: boolean,
  now: () => Date,
): Promise<boolean> {
  const accessToken = jar.get(cookieNames.session);
  const refreshToken = jar.get(cookieNames.renew);
  if ((accessToken !== undefined && accessToken !== '') || refreshToken === undefined) {
    return false;
  }
  if (refreshToken === '') {
    clearSessionCookies(jar);
    return true;
  }
  const renewed = await renew(refreshToken);
  if (renewed.ok) setSessionCookies(jar, renewed.value, secure, now());
  else clearSessionCookies(jar);
  return true;
}
