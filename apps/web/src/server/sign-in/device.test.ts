// The device's name, the network a request comes from, the place to go after
// signing in, and the password-again rule (T-70).
import { describe, expect, it } from 'vitest';
import {
  deviceLabel,
  networkAddressOf,
  outsideCloudflareRangesLine,
  safeReturnPath,
  unknownNetwork,
} from './device.ts';
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
  /** The request headers a browser and the proxies in front of the app sent. */
  const sent = (forwardedFor: string | null, cloudflareSays?: string) =>
    new Headers({
      ...(forwardedFor === null ? {} : { 'x-forwarded-for': forwardedFor }),
      ...(cloudflareSays === undefined ? {} : { 'cf-connecting-ip': cloudflareSays }),
    });
  // Made-up visitors (documentation ranges) and a Cloudflare server (its published range).
  const visitor = '192.0.2.10';
  const cloudflareServer = '104.16.0.1';

  it('believes no forwarded address by default: everyone shares one key', () => {
    expect(networkAddressOf(sent(visitor), 'none')).toBe(unknownNetwork);
    expect(networkAddressOf(sent(`6.6.6.6, ${visitor}`), 'none')).toBe(unknownNetwork);
    expect(networkAddressOf(sent(cloudflareServer, visitor), 'none')).toBe(unknownNetwork);
  });

  it('behind one trusted proxy, believes only its entry, the last one', () => {
    expect(networkAddressOf(sent(`6.6.6.6, ${visitor}`), 'one')).toBe(visitor);
    expect(networkAddressOf(sent('::ffff:127.0.0.1'), 'one')).toBe('::ffff:127.0.0.1');
    expect(networkAddressOf(sent(`${visitor}, not-an-address`), 'one')).toBe(unknownNetwork);
    expect(networkAddressOf(sent(null), 'one')).toBe(unknownNetwork);
    // CF-Connecting-IP means nothing to `one`.
    expect(networkAddressOf(sent(cloudflareServer, visitor), 'one')).toBe(cloudflareServer);
  });

  it('behind Cloudflare, keys each visitor by the address Cloudflare names, not by Cloudflare', () => {
    // As Cloudflare in front of the host's proxy sends it: the visitor's claim, Cloudflare's
    // own entry for the visitor, and the host's entry for Cloudflare's server, last.
    const through = sent(`6.6.6.6, ${visitor}, ${cloudflareServer}`, visitor);
    expect(networkAddressOf(through, 'cloudflare')).toBe(visitor);
    const other = sent(`${'198.51.100.7'}, ${'162.158.1.2'}`, '198.51.100.7');
    expect(networkAddressOf(other, 'cloudflare')).toBe('198.51.100.7');
    // An IPv6 visitor, and Cloudflare's IPv6 server.
    const six = sent('2001:db8:1:2::5, 2606:4700:10::1', '2001:db8:1:2::5');
    expect(networkAddressOf(six, 'cloudflare')).toBe('2001:db8:1:2::5');
  });

  it('writes one fixed line, with no address, when CF-Connecting-IP comes from outside the ranges', () => {
    const lines: string[] = [];
    const warn = (line: string) => lines.push(line);
    // From outside the listed ranges (a spoof, or a range the list lacks): one fixed line.
    expect(networkAddressOf(sent('203.0.113.9', visitor), 'cloudflare', warn)).toBe('203.0.113.9');
    expect(lines).toEqual([outsideCloudflareRangesLine]);
    expect(outsideCloudflareRangesLine).not.toMatch(/\d+\.\d+|:[0-9a-f]*:/i);
    // Through Cloudflare, with no such header, or with another setting: nothing is written.
    networkAddressOf(sent(`${visitor}, ${cloudflareServer}`, visitor), 'cloudflare', warn);
    networkAddressOf(sent('203.0.113.9'), 'cloudflare', warn);
    networkAddressOf(sent('203.0.113.9', visitor), 'one', warn);
    expect(lines).toHaveLength(1);
  });

  it('refuses CF-Connecting-IP as a spoof on a request that did not come through Cloudflare', () => {
    // Straight to the host's own address: the host's entry is the sender, who wrote the header.
    const spoofed = sent(`${cloudflareServer}, 203.0.113.9`, visitor);
    expect(networkAddressOf(spoofed, 'cloudflare')).toBe('203.0.113.9');
    // Writing a Cloudflare address into X-Forwarded-For too does not help: only the last
    // entry, the host's, is read.
    const claimed = sent(`${cloudflareServer}, 203.0.113.9`, cloudflareServer);
    expect(networkAddressOf(claimed, 'cloudflare')).toBe('203.0.113.9');
    // Each new value of the header gives the same key: it cannot reset the count.
    for (const claim of ['198.51.100.1', '198.51.100.2', '2001:db8::1']) {
      expect(networkAddressOf(sent('203.0.113.9', claim), 'cloudflare')).toBe('203.0.113.9');
    }
  });

  it('behind Cloudflare, fails closed when its header is missing or not one address', () => {
    for (const said of [undefined, '', 'not-an-address', `${visitor}, 198.51.100.1`]) {
      expect(networkAddressOf(sent(cloudflareServer, said), 'cloudflare')).toBe(unknownNetwork);
    }
    expect(networkAddressOf(sent(null, visitor), 'cloudflare')).toBe(unknownNetwork);
    expect(networkAddressOf(sent('not-an-address', visitor), 'cloudflare')).toBe(unknownNetwork);
  });
});

describe('safeReturnPath', () => {
  it('keeps paths on this site and refuses everything else', () => {
    expect(safeReturnPath('/north-valley/admin?x=1')).toBe('/north-valley/admin?x=1');
    for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', 'x', '', 3]) {
      expect(safeReturnPath(bad)).toBeNull();
    }
  });

  it('refuses paths that become another site once the browser normalises or decodes them', () => {
    for (const bad of [
      '/.//evil.com',
      '/..//evil.com',
      '/%2e%2e//evil.com',
      '/%2e//evil.com/x?y=1',
      '/a/../..//evil.com',
      '/%2F%2Fevil.com',
      '/%5Cevil.com',
      '/x%0d%0aSet-Cookie:a=b',
      '/\u0000evil',
    ]) {
      expect(safeReturnPath(bad), bad).toBeNull();
    }
    expect(safeReturnPath('/north-valley/./teams')).toBe('/north-valley/teams');
    expect(safeReturnPath('/find?q=a%20b')).toBe('/find?q=a%20b');
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
