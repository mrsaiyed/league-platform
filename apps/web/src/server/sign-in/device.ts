// The device a sign-in comes from (T-70, T-71): its own long-lived id (the device
// cookie), a name people recognise on the account page ("Firefox on Windows"), and
// the network it is on, which only limits wrong guesses (T-85) and is never shown.
import { networkAddress as networkAddressShape, type SignInDevice } from '@srleagues/contracts';
import { isCloudflareAddress } from '@srleagues/providers';
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
 * Whose word is taken for the address a request came from (TRUSTED_PROXY,
 * config-schema.ts; records 031 and 081):
 * - `none` (the default in local and test only): nobody's. Next.js fills
 *   X-Forwarded-For from the connection only when the browser did not send one, so on
 *   its own the header is whatever the browser claims. Every request then shares one
 *   key (unknownNetwork), so one person's wrong guesses can lock out everyone; staging
 *   and production therefore refuse to start until the setting is chosen.
 * - `one`: exactly one proxy of the host's stands in front of the app and appends
 *   the address it was reached from; its entry, the last one, is believed. Entries
 *   before it are what the browser claimed.
 * - `cloudflare`: Cloudflare stands in front of that one proxy of the host's (Render).
 *   The host's entry is then Cloudflare's own server for every visitor, so the visitor is
 *   the address Cloudflare names in CF-Connecting-IP, believed only when the host's entry
 *   is one of Cloudflare's published addresses: the request really came through
 *   Cloudflare, which sets that header itself. A request that reached the host some other
 *   way (straight to the host's own address) can say anything in CF-Connecting-IP, so the
 *   header is refused as a spoof and the request is keyed by the host's entry, the
 *   address that really reached the host, as with `one`.
 */
export type TrustedProxy = 'none' | 'one' | 'cloudflare';

/** The request headers networkAddressOf reads: X-Forwarded-For and CF-Connecting-IP. */
export type AddressHeaders = { readonly get: (name: string) => string | null };

/** `address` as the sign-in service keys it, or unknownNetwork when it is not an address. */
function keyOf(address: string | null | undefined): string {
  const trimmed = address?.trim() ?? '';
  return networkAddressShape.safeParse(trimmed).success ? trimmed : unknownNetwork;
}

/**
 * The one line written when CF-Connecting-IP arrives from outside the listed Cloudflare
 * ranges (record 081). A spoof straight to the host's address looks the same, so one now
 * and then is expected; many, from ordinary visitors, are the sign of a range Cloudflare
 * added that the list lacks (every visitor through it then shares one key). Fixed words,
 * no address: the log holds nobody's address.
 */
export const outsideCloudflareRangesLine =
  'sign-in: CF-Connecting-IP came from outside the listed Cloudflare ranges (a spoof, or a range missing from the list)';

/** The network a request came from, for the attempt limits (T-85, T-225). */
export function networkAddressOf(
  headers: AddressHeaders,
  trust: TrustedProxy,
  warn: (line: string) => void = console.warn,
): string {
  if (trust === 'none') return unknownNetwork;
  // The host's proxy appends the address it was reached from: the last entry.
  const hostEntry = keyOf(headers.get('x-forwarded-for')?.split(',').at(-1));
  if (trust === 'one' || hostEntry === unknownNetwork) return hostEntry;
  if (!isCloudflareAddress(hostEntry)) {
    if (headers.get('cf-connecting-ip') !== null) warn(outsideCloudflareRangesLine);
    return hostEntry;
  }
  // Through Cloudflare: one address, as Cloudflare writes it; anything else is not believed.
  return keyOf(headers.get('cf-connecting-ip'));
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
