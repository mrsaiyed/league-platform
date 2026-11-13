// The device a sign-in comes from (T-70, T-71): its own long-lived id (the device
// cookie), a name people recognise on the account page ("Firefox on Windows"), and
// the network it is on, which only limits wrong guesses (T-85) and is never shown.
import { networkAddress as networkAddressShape, type SignInDevice } from '@srleagues/contracts';
import { randomBytes } from 'node:crypto';
import { t } from '../messages.ts';
import { cookieNames, cookieOptions, longestCookieSeconds, type CookieJar } from './cookies.ts';

const deviceIdShape = /^[A-Za-z0-9_-]{16,128}$/;

/** What a request says about where it comes from. */
export type Visit = {
  readonly jar: CookieJar;
  /** The address the request came from (networkAddressOf). */
  readonly networkAddress: string;
  readonly userAgent: string;
};

/**
 * This device, for the sign-in service. The device cookie is made on first use and
 * set again on every sign-in, so a device in use is never forgotten by us.
 */
export function deviceOf(visit: Visit, secure: boolean): SignInDevice {
  const kept = visit.jar.get(cookieNames.device);
  const deviceId =
    kept !== undefined && deviceIdShape.test(kept) ? kept : randomBytes(24).toString('base64url');
  visit.jar.set(cookieNames.device, deviceId, cookieOptions(secure, longestCookieSeconds));
  return { deviceId, label: deviceLabel(visit.userAgent), networkAddress: visit.networkAddress };
}

// Names of browsers and systems are product names, the same in every language.
const browsers: readonly (readonly [RegExp, string])[] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\//, 'Opera'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\b(?:Chrome|CriOS)\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
];
const systems: readonly (readonly [RegExp, string])[] = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
];

/** "Firefox on Windows", or plain words when the browser does not say. */
export function deviceLabel(userAgent: string): string {
  const text = userAgent.slice(0, 512);
  const browser = browsers.find(([pattern]) => pattern.test(text))?.[1];
  const system = systems.find(([pattern]) => pattern.test(text))?.[1];
  if (browser === undefined || system === undefined) return t('device.unknown');
  return t('device.label', { browser, system });
}

/**
 * The one key every request shares when its address is not believed. The service
 * needs one; sharing it fails closed: guesses from everyone count together.
 */
export const unknownNetwork = '0.0.0.0';

/**
 * Whether X-Forwarded-For is believed (TRUSTED_PROXY, config-schema.ts):
 * - `none` (the default in local and test only): never. Next.js fills the header
 *   from the connection only when the browser did not send one, so on its own the
 *   header is whatever the browser claims. Every request then shares one key
 *   (unknownNetwork), so one person's wrong guesses can lock out everyone; staging
 *   and production therefore refuse to start until the setting is chosen.
 * - `one`: exactly one proxy of the host's stands in front of the app and appends
 *   the address it was reached from; its entry, the last one, is believed. Entries
 *   before it are what the browser claimed.
 */
export type TrustedProxy = 'none' | 'one';

/** The network a request came from, for the attempt limits (T-85, T-225). */
export function networkAddressOf(forwardedFor: string | null, trust: TrustedProxy): string {
  if (trust === 'none') return unknownNetwork;
  const last = forwardedFor?.split(',').at(-1)?.trim() ?? '';
  return networkAddressShape.safeParse(last).success ? last : unknownNetwork;
}

const site = 'http://site.invalid';

/** A path that stays on this site: one leading slash, no backslash, space or control character. */
function staysHere(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !/[\\\s\p{Cc}]/u.test(path);
}

/**
 * A place of ours to go after signing in: a path on this site, never another site
 * (`//elsewhere`, `/\elsewhere`, `/.//elsewhere`, `/%2e%2e//elsewhere` or a full
 * address), or null. The path is checked as given, as the browser will read it
 * (normalised), and decoded.
 */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2000) return null;
  if (!staysHere(value)) return null;
  let parsed: URL;
  try {
    parsed = new URL(value, site);
  } catch {
    return null;
  }
  if (parsed.origin !== site) return null;
  const path = parsed.pathname + parsed.search;
  if (!staysHere(path)) return null;
  try {
    if (!staysHere(decodeURIComponent(parsed.pathname))) return null;
  } catch {
    return null;
  }
  return path;
}
