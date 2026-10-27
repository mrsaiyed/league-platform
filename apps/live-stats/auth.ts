import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Scorer sign-in with one shared passcode, the way Faraj League's admin works.
 * Watching needs no sign-in; scoring and roster changes do. Accounts and roles
 * come with the wider platform.
 *
 * A session is a cookie holding its expiry and a signature made with a key
 * derived from the passcode, so it survives a server restart, and changing the
 * passcode signs every device out.
 */
export function scorerAuth(passcode: string, { secure }: { secure: boolean }) {
  const DAYS = 7;
  const key = createHash('sha256').update(`live-stats-session\0${passcode}`).digest();
  const digest = (s: string) => createHash('sha256').update(s).digest();
  const expected = digest(passcode);
  const sign = (expires: number) =>
    createHmac('sha256', key).update(String(expires)).digest('base64url');
  const attrs = `Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
  return {
    matches: (attempt: string) => timingSafeEqual(digest(attempt), expected),
    issue(now = Date.now()) {
      const expires = now + DAYS * 86_400_000;
      return `ls_session=${expires}.${sign(expires)}; Max-Age=${DAYS * 86_400}; ${attrs}`;
    },
    clear: () => `ls_session=; Max-Age=0; ${attrs}`,
    valid(cookie: string | undefined, now = Date.now()) {
      const m = /(?:^|;\s*)ls_session=(\d+)\.([\w-]+)/.exec(cookie ?? '');
      if (!m || !(Number(m[1]) > now)) return false;
      const want = Buffer.from(sign(Number(m[1]))),
        got = Buffer.from(m[2]!);
      return want.length === got.length && timingSafeEqual(want, got);
    },
  };
}

/** At most `limit` wrong passcodes from one address in `windowMs`. */
export function attemptLimiter(limit = 10, windowMs = 15 * 60_000) {
  const failures = new Map<string, number[]>();
  const recent = (ip: string, now: number) => {
    const list = (failures.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (list.length) failures.set(ip, list);
    else failures.delete(ip);
    return list;
  };
  return {
    blocked: (ip: string, now = Date.now()) => recent(ip, now).length >= limit,
    fail(ip: string, now = Date.now()) {
      if (failures.size > 10_000) failures.clear();
      failures.set(ip, [...recent(ip, now), now]);
    },
    clear: (ip: string) => void failures.delete(ip),
  };
}
