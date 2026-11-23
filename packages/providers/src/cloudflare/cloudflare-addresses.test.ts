// Cloudflare's addresses (record 081): made-up addresses inside and outside its published
// ranges. Nothing is fetched.
import { describe, expect, it } from 'vitest';
import {
  cloudflareIpv4Ranges,
  cloudflareIpv6Ranges,
  isCloudflareAddress,
} from './cloudflare-addresses.ts';

describe('isCloudflareAddress', () => {
  it('knows the first and last address of each published range', () => {
    expect(isCloudflareAddress('173.245.48.0')).toBe(true);
    expect(isCloudflareAddress('173.245.63.255')).toBe(true);
    expect(isCloudflareAddress('104.16.0.1')).toBe(true);
    expect(isCloudflareAddress('104.23.255.255')).toBe(true);
    expect(isCloudflareAddress('2606:4700:10::6816:1')).toBe(true);
    expect(isCloudflareAddress('[2400:cb00::1]')).toBe(true);
    expect(isCloudflareAddress('2a06:98c7:ffff::1')).toBe(true);
  });

  it('reads an IPv4 address written inside IPv6 as the IPv4 address', () => {
    expect(isCloudflareAddress('::ffff:104.16.0.1')).toBe(true);
    expect(isCloudflareAddress('::ffff:192.0.2.10')).toBe(false);
  });

  it('refuses addresses just outside, other networks, and what is not an address', () => {
    for (const address of [
      '173.245.64.0',
      '104.15.255.255',
      '104.32.0.0',
      '192.0.2.10',
      '10.0.0.5',
      '127.0.0.1',
      '::1',
      '2606:4701::1',
      '2a06:98c8::1',
      '',
      'cloudflare',
      '104.16.0.1, 192.0.2.10',
      '104.16.0.1/13',
    ]) {
      expect(isCloudflareAddress(address), address).toBe(false);
    }
  });

  it('keeps each list in order and every range well formed', () => {
    for (const ranges of [cloudflareIpv4Ranges, cloudflareIpv6Ranges]) {
      expect([...ranges]).toEqual([...ranges].sort());
      for (const range of ranges) expect(range).toMatch(/^[0-9a-f.:]+\/\d{1,3}$/);
    }
  });
});
