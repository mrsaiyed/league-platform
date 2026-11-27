// The known-device cookie (T-505): set at a successful sign-in, read and checked at the
// next one. It vouches only for its own device cookie and address, under the server's
// own secret, and holds nothing a person could read an address or an account from.
import { describe, expect, it } from 'vitest';
import {
  cookieNames,
  cookieOptions,
  longestCookieSeconds,
  type CookieJar,
  type CookieOptions,
} from './cookies.ts';
import { knownDevicesUnder, knownTagsKept } from './known-device.ts';

function jar() {
  const cookies = new Map<string, { value: string; options: CookieOptions }>();
  const it: CookieJar = {
    get: (name) => cookies.get(name)?.value,
    set: (name, value, options) => cookies.set(name, { value, options }),
    delete: (name) => cookies.delete(name),
  };
  return { jar: it, cookies };
}

const ownDevice = 'device-own-phone-0000001';
const otherDevice = 'device-other-phone-00002';
const known = knownDevicesUnder('made-up secret for tests');

describe('the known-device cookie (T-505)', () => {
  it('vouches for the device and the address it was made for, and for nothing else', () => {
    const b = jar();
    known.remember(b.jar, 'ana@example.test', ownDevice, true);
    expect(known.vouch(b.jar, 'ana@example.test', ownDevice)).toBe(ownDevice);
    // The address as the service keeps it: case and spaces do not matter.
    expect(known.vouch(b.jar, '  Ana@Example.TEST ', ownDevice)).toBe(ownDevice);
    expect(known.vouch(b.jar, 'bob@example.test', ownDevice)).toBeUndefined();
    expect(known.vouch(b.jar, 'ana@example.test', otherDevice)).toBeUndefined();
    expect(known.vouch(jar().jar, 'ana@example.test', ownDevice)).toBeUndefined();
  });

  it('is http-only, kept as long as the device cookie, and holds no address or device id', () => {
    const b = jar();
    known.remember(b.jar, 'ana@example.test', ownDevice, true);
    const set = b.cookies.get(cookieNames.knownDevice);
    expect(set?.options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: longestCookieSeconds,
    });
    expect(set?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(set?.value).not.toContain('ana');
    expect(set?.value).not.toContain(ownDevice);
  });

  it('is good only under the secret that made it, and not once changed', () => {
    const b = jar();
    known.remember(b.jar, 'ana@example.test', ownDevice, false);
    const elsewhere = knownDevicesUnder('another made-up secret');
    expect(elsewhere.vouch(b.jar, 'ana@example.test', ownDevice)).toBeUndefined();
    const value = b.jar.get(cookieNames.knownDevice) ?? '';
    const changed = `${value.slice(0, -1)}${value.endsWith('A') ? 'B' : 'A'}`;
    b.jar.set(cookieNames.knownDevice, changed, cookieOptions(false, 60));
    expect(known.vouch(b.jar, 'ana@example.test', ownDevice)).toBeUndefined();
    b.jar.set(cookieNames.knownDevice, `junk.${'x'.repeat(5000)}`, cookieOptions(false, 60));
    expect(known.vouch(b.jar, 'ana@example.test', ownDevice)).toBeUndefined();
  });

  it('keeps the newest few addresses of a shared device and forgets the oldest', () => {
    const b = jar();
    const people = Array.from({ length: knownTagsKept + 1 }, (_, i) => `p${i}@example.test`);
    for (const email of people) known.remember(b.jar, email, ownDevice, false);
    known.remember(b.jar, people[1] ?? '', ownDevice, false);
    expect(people.map((email) => known.vouch(b.jar, email, ownDevice) !== undefined)).toEqual([
      false,
      ...Array<boolean>(knownTagsKept).fill(true),
    ]);
    expect(b.jar.get(cookieNames.knownDevice)?.split('.')).toHaveLength(knownTagsKept);
  });

  it('remembers nothing for what is not an address', () => {
    const b = jar();
    known.remember(b.jar, 'not an address', ownDevice, false);
    expect(b.cookies.has(cookieNames.knownDevice)).toBe(false);
    expect(known.vouch(b.jar, 'not an address', ownDevice)).toBeUndefined();
  });
});
