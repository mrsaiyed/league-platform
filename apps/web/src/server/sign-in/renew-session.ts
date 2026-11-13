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
import type { Result } from '@srleagues/core';
import type { RenewError, SessionTokens } from '@srleagues/providers';
import { createHash } from 'node:crypto';
import { clearSessionCookies, cookieNames, setSessionCookies, type CookieJar } from './cookies.ts';

export type Renew = (refreshToken: string) => Promise<Result<SessionTokens, RenewError>>;

/** How long a renewal's answer is handed to late requests with the same old token. */
export const sharedRenewalSeconds = 30;

/** The most renewals remembered at once; the oldest is forgotten first. */
export const sharedRenewalLimit = 10_000;

/**
 * What a renewing token can look like. Anything else is refused before the service
 * is asked, so junk sent in the cookie costs the service nothing.
 */
const renewTokenShape = /^[A-Za-z0-9._~+/=-]{8,2048}$/;

/** Whether a cookie's value could be a renewing token at all. */
export function looksLikeRenewToken(value: string): boolean {
  return renewTokenShape.test(value);
}

/**
 * The service's renew, with renewals of one token shared for a short while (see above). Only an
 * answer is shared: a renewal that threw (the service busy or unreachable) is
 * forgotten at once, so the next request tries again.
 */
export function sharedRenewal(
  renew: Renew,
  now: () => Date = () => new Date(),
  limit: number = sharedRenewalLimit,
): Renew {
  type Entry = {
    readonly answer: Promise<Result<SessionTokens, RenewError>>;
    readonly until: number;
  };
  const recent = new Map<string, Entry>();
  return (refreshToken) => {
    const at = now().getTime();
    for (const [key, entry] of recent) if (entry.until <= at) recent.delete(key);
    // Kept by a one-way hash: the map never holds a token that still works.
    const key = createHash('sha256').update(refreshToken).digest('base64url');
    const kept = recent.get(key);
    if (kept !== undefined) return kept.answer;
    const answer = renew(refreshToken);
    const entry: Entry = { answer, until: at + sharedRenewalSeconds * 1000 };
    while (recent.size >= limit) {
      const oldest = recent.keys().next();
      if (oldest.done === true) break;
      recent.delete(oldest.value);
    }
    recent.set(key, entry);
    answer.catch(() => {
      if (recent.get(key) === entry) recent.delete(key);
    });
    return answer;
  };
}

/**
 * What the proxy does with a request's cookies: renews when there is a renewing
 * token and no session cookie, and clears both when the session has ended or the
 * token cannot be one. When the service cannot be reached (renew throws), the
 * cookies are left alone: this request is served as a visitor's and the next one
 * tries again. Answers whether it changed any cookie.
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
  if (!looksLikeRenewToken(refreshToken)) {
    clearSessionCookies(jar);
    return true;
  }
  let renewed: Result<SessionTokens, RenewError>;
  try {
    renewed = await renew(refreshToken);
  } catch {
    return false;
  }
  if (renewed.ok) setSessionCookies(jar, renewed.value, secure, now());
  else clearSessionCookies(jar);
  return true;
}
