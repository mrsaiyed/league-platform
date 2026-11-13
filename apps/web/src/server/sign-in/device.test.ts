// The device's name, the network a request comes from, the place to go after
// signing in, and the password-again rule (T-70).
import { describe, expect, it } from 'vitest';
import { deviceLabel, networkAddressOf, safeReturnPath, unknownNetwork } from './device.ts';
import { needsPasswordAgain } from './password-again.ts';
import { problemOf, screenUrl } from './problems.ts';

describe('deviceLabel', () => {
  it('names common browsers and systems', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0',
      ),
    ).toBe('Edge on Windows');
    expect(
      deviceLabel(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      ),
    ).toBe('Safari on macOS');
    expect(
      deviceLabel(
        'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
      ),
    ).toBe('Chrome on Android');
    expect(deviceLabel('curl/8.0')).toBe('A web browser');
  });
});

describe('networkAddressOf', () => {
  it('believes only the last entry, written by the nearest server', () => {
    expect(networkAddressOf('6.6.6.6, 192.0.2.10')).toBe('192.0.2.10');
    expect(networkAddressOf('::ffff:127.0.0.1')).toBe('::ffff:127.0.0.1');
    expect(networkAddressOf('192.0.2.10, not-an-address')).toBe(unknownNetwork);
    expect(networkAddressOf(null)).toBe(unknownNetwork);
  });
});

describe('safeReturnPath', () => {
  it('keeps paths on this site and refuses everything else', () => {
    expect(safeReturnPath('/north-valley/admin?x=1')).toBe('/north-valley/admin?x=1');
    for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', 'x', '', 3]) {
      expect(safeReturnPath(bad)).toBeNull();
    }
  });
});

describe('problems', () => {
  it('reads back only the names it writes', () => {
    expect(problemOf({ problem: 'codeWrong' })).toEqual({ name: 'codeWrong', wait: 0 });
    expect(problemOf({ problem: 'tooManyAttempts', wait: '30' })).toEqual({
      name: 'tooManyAttempts',
      wait: 30,
    });
    expect(problemOf({ problem: 'toString' })).toBeUndefined();
    expect(problemOf({ problem: '<script>' })).toBeUndefined();
    expect(screenUrl('signin', { problem: 'tooManyAttempts', wait: 4.2 })).toBe(
      '/signin?problem=tooManyAttempts&wait=5',
    );
  });
});

describe('needsPasswordAgain', () => {
  const now = new Date('2026-11-13T12:00:00Z');
  const account = {
    accountId: 'a',
    sessionId: 's',
    hasPassword: true,
    passwordEnteredAt: new Date('2026-11-13T11:30:00Z'),
    lastSignInAt: new Date('2026-11-01T00:00:00Z'),
  };
  it('asks when the password was typed over an hour ago, or never', () => {
    expect(needsPasswordAgain(account, now)).toBe(false);
    expect(
      needsPasswordAgain({ ...account, passwordEnteredAt: new Date('2026-11-13T10:59:00Z') }, now),
    ).toBe(true);
    expect(needsPasswordAgain({ ...account, passwordEnteredAt: null }, now)).toBe(true);
  });
  it('takes a recent Google sign-in for an account with no password', () => {
    const google = { ...account, hasPassword: false, passwordEnteredAt: null };
    expect(
      needsPasswordAgain({ ...google, lastSignInAt: new Date('2026-11-13T11:30:00Z') }, now),
    ).toBe(false);
    expect(needsPasswordAgain(google, now)).toBe(true);
  });
});
