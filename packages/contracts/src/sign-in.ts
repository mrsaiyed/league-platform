// The shape of what reaches the sign-in service (T-67, T-85, T4 §3, T-225). The web
// app checks form input against these before it calls the service; the service
// checks again, since it is the authority on passwords (T-85).
import { z } from 'zod';

/** T-85: at least 8 characters (counted as characters, not UTF-16 units). */
export const passwordMinCharacters = 8;

/**
 * T-225: at most 72 bytes in UTF-8. The sign-in service's one-way hash reads no more
 * than that, so a longer password would silently lose its end; it is refused instead.
 */
export const passwordMaxBytes = 72;

/** T-67: the emailed code has 6 digits. */
export const emailCodeLength = 6;

const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;
const characters = (value: string) => [...value].length;

/**
 * T-225: a password is put in Unicode's compatible form (NFKC) before anything else,
 * so the same password typed on two keyboards that encode an accent differently is
 * the same password.
 */
const normalizedPassword = z.string().transform((value) => value.normalize('NFKC'));

/** An email address, trimmed and lower-cased, so one person is one address. At most 254 characters. */
export const signInEmail = z.string().trim().toLowerCase().max(254).pipe(z.email());
export type SignInEmail = z.infer<typeof signInEmail>;

/** The 6-digit code from the email. Spaces a person types between digits are dropped. */
export const emailCode = z
  .string()
  .max(64)
  .transform((value) => value.replace(/\s+/g, ''))
  .pipe(z.string().regex(new RegExp(`^[0-9]{${emailCodeLength}}$`)));
export type EmailCode = z.infer<typeof emailCode>;

/**
 * A new password, normalized: the length rules only. Whether it is on the public
 * lists of leaked passwords is the sign-in service's check (T-85). Never trimmed.
 */
export const newPassword = normalizedPassword.pipe(
  z
    .string()
    .refine((value) => characters(value) >= passwordMinCharacters, { error: 'too-short' })
    .refine((value) => utf8Bytes(value) <= passwordMaxBytes, { error: 'too-long' }),
);

/** A password typed to sign in, normalized: only its outer limits, so a wrong one is just wrong. */
export const passwordAttempt = z.string().min(1).max(1024).pipe(normalizedPassword);

const ipv4 = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const hexGroup = /^[0-9a-f]{1,4}$/;

/** The eight groups of an IPv6 address, or null if it is not one. */
function ipv6Groups(address: string): string[] | null {
  let text = address;
  const tail: string[] = [];
  const lastColon = text.lastIndexOf(':');
  if (lastColon < 0) return null;
  const last = text.slice(lastColon + 1);
  if (last.includes('.')) {
    // An IPv4 address written in the last two groups.
    if (!ipv4.test(last)) return null;
    const [a = 0, b = 0, c = 0, d = 0] = last.split('.').map(Number);
    tail.push((a * 256 + b).toString(16), (c * 256 + d).toString(16));
    text = text.slice(0, lastColon + 1);
    if (!text.endsWith('::')) text = text.slice(0, -1);
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const split = (part: string | undefined) => (part ? part.split(':') : []);
  const head = split(halves[0]);
  let groups: string[];
  if (halves.length === 2) {
    const back = [...split(halves[1]), ...tail];
    const missing = 8 - head.length - back.length;
    if (missing < 1) return null;
    groups = [...head, ...Array<string>(missing).fill('0'), ...back];
  } else {
    groups = [...head, ...tail];
  }
  if (groups.length !== 8 || !groups.every((g) => hexGroup.test(g))) return null;
  return groups.map((g) => g.padStart(4, '0'));
}

/**
 * The network a request comes from, as the key wrong guesses are counted against
 * (T-85, T-225). An IPv4 address stands for itself (an IPv4 address written inside
 * IPv6 is read as IPv4). An IPv6 address stands for its /64, since one household or
 * phone is usually given a whole /64 and could otherwise step through addresses.
 */
export const networkAddress = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(64)
  .transform((value, context) => {
    const bare = value.replace(/^\[(.*)\]$/, '$1').replace(/%.*$/, '');
    if (ipv4.test(bare)) return bare;
    const groups = ipv6Groups(bare);
    if (!groups) {
      context.addIssue({ code: 'custom', message: 'not-an-ip-address' });
      return z.NEVER;
    }
    const mapped = groups.slice(0, 6).join(':') === '0000:0000:0000:0000:0000:ffff';
    if (mapped) {
      const n = groups.slice(6).map((g) => parseInt(g, 16));
      return [(n[0] ?? 0) >> 8, (n[0] ?? 0) & 255, (n[1] ?? 0) >> 8, (n[1] ?? 0) & 255].join('.');
    }
    return `${groups.slice(0, 4).join(':')}::/64`;
  });

/**
 * The device a request comes from. `deviceId` is the opaque value of the app's own
 * long-lived device cookie (separate from the session), so a sign-in on a device the
 * account has not used before can be recognized (T-70). `label` is what the account
 * page shows ("Firefox on Windows", T-71). `networkAddress` is used only to limit
 * wrong guesses (T-85); it is never shown.
 */
export const signInDevice = z.strictObject({
  deviceId: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
  label: z.string().trim().min(1).max(200),
  networkAddress,
});
/** A device as the app passes it in. */
export type SignInDevice = z.input<typeof signInDevice>;
