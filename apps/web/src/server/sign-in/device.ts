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

/** Used when no address can be read. The service needs one; all such requests share it. */
export const unknownNetwork = '0.0.0.0';

/**
 * The address a request came from, from X-Forwarded-For: its last entry, the one
 * written by the nearest server in front of the app (the host's own proxy, or
 * Next.js itself from the connection). The entries before it are what the browser
 * claimed and are never believed. Record 031: hosting must put one proxy that
 * appends the real address in front of the app.
 */
export function networkAddressOf(forwardedFor: string | null): string {
  const last = forwardedFor?.split(',').at(-1)?.trim() ?? '';
  return networkAddressShape.safeParse(last).success ? last : unknownNetwork;
}

/**
 * A place of ours to go after signing in: a path on this site, never another site
 * (`//elsewhere`, `/\elsewhere` or a full address), or null.
 */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2000) return null;
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\s]/.test(value)) return null;
  try {
    const parsed = new URL(value, 'http://site.invalid');
    if (parsed.origin !== 'http://site.invalid') return null;
    return parsed.pathname + parsed.search;
  } catch {
    return null;
  }
}
