// "This device has signed in to this address before" (T-504, T-505). At a successful
// sign-in the server adds a tag to the known-device cookie: an HMAC, under a server-only
// secret, of this device's id (the device cookie) and the address. At the next sign-in
// or ask for a code, the server vouches for the device only when the device cookie and
// the address typed give a tag the cookie holds. The sign-in service then counts that
// device's tries on their own, never with strangers' (T-504); it trusts it for nothing
// more. The cookie is http-only and holds no address and no account: a tag cannot be
// made without the secret, and one is good only with its own device cookie and address.
// The same work is done for every address that fits, so it tells nothing (T-68).
import { signInEmail } from '@srleagues/contracts';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { derivedSecret, type PlayerKeySettings } from '../player-key.ts';
import { cookieNames, cookieOptions, longestCookieSeconds, type CookieJar } from './cookies.ts';

export type KnownDevices = {
  /** The device's id when it has signed in to `email` here before, else undefined. */
  readonly vouch: (jar: CookieJar, email: string, deviceId: string) => string | undefined;
  /** After a successful sign-in to `email` on this device: remembered in the cookie. */
  readonly remember: (jar: CookieJar, email: string, deviceId: string, secure: boolean) => void;
};

/** A shared tablet may know a few accounts; the oldest is forgotten past this. */
export const knownTagsKept = 5;

const tagShape = /^[A-Za-z0-9_-]{43}$/;
const label = 'srleagues known device v1';

const tagsIn = (jar: CookieJar): string[] =>
  (jar.get(cookieNames.knownDevice) ?? '').split('.').filter((tag) => tagShape.test(tag));

/** The known-device tags under one secret: exported for its tests. */
export function knownDevicesUnder(secret: string | Uint8Array): KnownDevices {
  const tagOf = (email: string, deviceId: string): string | undefined => {
    const address = signInEmail.safeParse(email);
    if (!address.success) return undefined;
    return createHmac('sha256', secret)
      .update(`${label}\n${deviceId}\n${address.data}`)
      .digest('base64url');
  };
  return {
    vouch(jar, email, deviceId) {
      const tag = tagOf(email, deviceId);
      if (tag === undefined) return undefined;
      const wanted = Buffer.from(tag);
      let found = false;
      for (const kept of tagsIn(jar)) {
        if (timingSafeEqual(Buffer.from(kept), wanted)) found = true;
      }
      return found ? deviceId : undefined;
    },
    remember(jar, email, deviceId, secure) {
      const tag = tagOf(email, deviceId);
      if (tag === undefined) return;
      const tags = [...tagsIn(jar).filter((kept) => kept !== tag), tag].slice(-knownTagsKept);
      jar.set(cookieNames.knownDevice, tags.join('.'), cookieOptions(secure, longestCookieSeconds));
    },
  };
}

// Kept on globalThis, as the player key is: Next.js may load this file more than once in
// one process, and every copy must use the same secret.
const slot = Symbol.for('srleagues.known-devices');
type Holder = { [slot]?: KnownDevices };
const holder = globalThis as Holder;

/**
 * The server's known-device tags. The secret is SESSION_SECRET's or SUPABASE_SECRET_KEY's,
 * each derived under this label (never the key itself); with neither (the local stand-in),
 * one made up per process, so a restart only forgets which devices are known.
 */
export function knownDevicesFrom(settings: PlayerKeySettings): KnownDevices {
  holder[slot] ??= knownDevicesUnder(
    settings.SESSION_SECRET !== undefined
      ? derivedSecret(settings.SESSION_SECRET, label)
      : settings.SUPABASE_SECRET_KEY !== undefined
        ? derivedSecret(settings.SUPABASE_SECRET_KEY, label)
        : randomBytes(32),
  );
  return holder[slot];
}
