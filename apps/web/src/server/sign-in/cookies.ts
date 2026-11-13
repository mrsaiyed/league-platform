// The sign-in cookies (T-69, T-70). Every one is out of reach of the page's scripts
// (HttpOnly), sent only over HTTPS when the site is on HTTPS (Secure; plain http is
// this computer in development), and not sent on requests other sites start, other
// than a plain link followed to one of our pages (SameSite=Lax: record 031).
//
// - session: the short-lived access token. It is set to run out a little before
//   the token does, so a request either carries a good token or none; with none and
//   a renewing token, the proxy renews (renew-session.ts).
// - renew: the renewing token, which changes on every use. No time limit of ours
//   (T-70): it is set for the longest a browser keeps a cookie, and set again on
//   every renewal, so a device in use stays signed in.
// - device: the device's own id, apart from any session, so a sign-in on a device
//   the account has not used before can be told apart (T-70).
// - flow: the address being proved and, after the right code, the proof, between
//   the screens of sign-up and forgotten password. Fifteen minutes.
// - google: what Google's return needs (the verifier and where to go next). Ten minutes.
import { z } from 'zod';
import { sessionCookieName } from '../session-cookie.ts';

export const cookieNames = {
  session: sessionCookieName,
  renew: 'srl_renew',
  device: 'srl_device',
  flow: 'srl_flow',
  google: 'srl_google',
} as const;

export type CookieOptions = {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: 'lax';
  readonly path: '/';
  /** Seconds. */
  readonly maxAge: number;
};

/** The browser's cookies as a flow sees them; Next.js's cookies() and the proxy fill it. */
export type CookieJar = {
  readonly get: (name: string) => string | undefined;
  readonly set: (name: string, value: string, options: CookieOptions) => void;
  readonly delete: (name: string) => void;
};

/** About 13 months: the longest browsers keep a cookie (P6 §5). */
export const longestCookieSeconds = 400 * 24 * 60 * 60;
/** The session cookie runs out this long before its token, so it is never sent stale. */
const accessMarginSeconds = 30;

export function cookieOptions(secure: boolean, maxAge: number): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: Math.max(0, maxAge) };
}

export type SessionCookieTokens = {
  readonly accessToken: string;
  readonly accessExpiresAt: Date;
  readonly refreshToken: string;
};

export function setSessionCookies(
  jar: CookieJar,
  tokens: SessionCookieTokens,
  secure: boolean,
  now: Date,
): void {
  const accessSeconds =
    Math.floor((tokens.accessExpiresAt.getTime() - now.getTime()) / 1000) - accessMarginSeconds;
  jar.set(cookieNames.session, tokens.accessToken, cookieOptions(secure, accessSeconds));
  jar.set(cookieNames.renew, tokens.refreshToken, cookieOptions(secure, longestCookieSeconds));
}

export function clearSessionCookies(jar: CookieJar): void {
  jar.delete(cookieNames.session);
  jar.delete(cookieNames.renew);
}

const returnPathShape = z.string().max(2000);

const flowShape = z.strictObject({
  purpose: z.enum(['sign-up', 'reset']),
  email: z.string().max(254),
  /** How long the code works, as the service said, for the code screen. */
  minutes: z.number().int().positive().max(120),
  next: returnPathShape.nullable(),
  proof: z.string().max(4096).optional(),
});
export type Flow = z.infer<typeof flowShape>;

const googleShape = z.strictObject({
  verifier: z.string().max(4096),
  next: returnPathShape.nullable(),
});
export type GoogleFlow = z.infer<typeof googleShape>;

const flowSeconds = 15 * 60;
const googleSeconds = 10 * 60;

export function writeFlow(jar: CookieJar, flow: Flow, secure: boolean): void {
  jar.set(cookieNames.flow, encode(flow), cookieOptions(secure, flowSeconds));
}

/** The flow under way, or undefined when there is none or it was tampered into another shape. */
export function readFlow(jar: CookieJar): Flow | undefined {
  return decode(jar.get(cookieNames.flow), flowShape);
}

export function writeGoogleFlow(jar: CookieJar, flow: GoogleFlow, secure: boolean): void {
  jar.set(cookieNames.google, encode(flow), cookieOptions(secure, googleSeconds));
}

export function readGoogleFlow(jar: CookieJar): GoogleFlow | undefined {
  return decode(jar.get(cookieNames.google), googleShape);
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decode<T>(raw: string | undefined, shape: z.ZodType<T>): T | undefined {
  if (raw === undefined || raw === '' || raw.length > 8192) return undefined;
  try {
    const parsed = shape.safeParse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
