import { describe, expect, it } from 'vitest';
import {
  emailCode,
  networkAddress,
  newPassword,
  passwordAttempt,
  signInDevice,
  signInEmail,
} from './sign-in.ts';

const message = (result: { error?: { issues: readonly { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe('sign-in shapes', () => {
  it('trims and lower-cases an email address, and refuses what is not one', () => {
    expect(signInEmail.parse('  Ana@Example.TEST ')).toBe('ana@example.test');
    expect(signInEmail.safeParse('ana@').success).toBe(false);
  });

  it('takes an address of 254 characters and refuses one of 255', () => {
    const longest = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(56)}.test`;
    expect(longest).toHaveLength(254);
    expect(signInEmail.safeParse(longest).success).toBe(true);
    expect(signInEmail.safeParse(`a${longest}`).success).toBe(false);
  });

  it('takes a 6-digit code, ignoring spaces between digits', () => {
    expect(emailCode.parse('123 456')).toBe('123456');
    expect(emailCode.safeParse('12345').success).toBe(false);
    expect(emailCode.safeParse('12345a').success).toBe(false);
    expect(emailCode.safeParse(' '.repeat(100) + '123456').success).toBe(false);
  });

  it('wants a new password of 8 characters to 72 bytes, with no other rules (T-85, T-225)', () => {
    expect(newPassword.safeParse('abcdefgh').success).toBe(true);
    expect(newPassword.safeParse('  spaced  ').data).toBe('  spaced  ');
    expect(message(newPassword.safeParse('abcdefg'))).toBe('too-short');
    expect(newPassword.safeParse('x'.repeat(72)).success).toBe(true);
    expect(message(newPassword.safeParse('x'.repeat(73)))).toBe('too-long');
    expect(message(newPassword.safeParse('€'.repeat(25)))).toBe('too-long');
  });

  it('counts characters, not UTF-16 units, for the minimum', () => {
    expect(message(newPassword.safeParse('😀'.repeat(7)))).toBe('too-short');
    expect(newPassword.safeParse('😀'.repeat(8)).success).toBe(true);
  });

  it('puts passwords in NFKC form, new and typed alike', () => {
    expect(newPassword.parse('café au lait')).toBe('café au lait');
    expect(passwordAttempt.parse('Ｐａｓｓ')).toBe('Pass');
  });

  it('lets any non-empty password up to 1024 characters be tried at sign-in', () => {
    expect(passwordAttempt.safeParse('short').success).toBe(true);
    expect(passwordAttempt.safeParse('').success).toBe(false);
    expect(passwordAttempt.safeParse('x'.repeat(1025)).success).toBe(false);
  });

  it('describes a device by an opaque id, a label and a network address', () => {
    const device = { deviceId: 'abcDEF012_-abcdef', label: ' Firefox ', networkAddress: '::1' };
    expect(signInDevice.parse(device).label).toBe('Firefox');
    expect(signInDevice.safeParse({ ...device, deviceId: 'short' }).success).toBe(false);
    expect(signInDevice.safeParse({ ...device, extra: 1 }).success).toBe(false);
  });
});

describe('network addresses (T-225)', () => {
  it('keeps an IPv4 address as it is, trimmed', () => {
    expect(networkAddress.parse(' 192.0.2.10 ')).toBe('192.0.2.10');
  });

  it('reads an IPv4 address written inside IPv6 as IPv4', () => {
    expect(networkAddress.parse('::ffff:192.0.2.10')).toBe('192.0.2.10');
    expect(networkAddress.parse('::FFFF:c000:020a')).toBe('192.0.2.10');
  });

  it('groups an IPv6 address by its /64, however it is written', () => {
    const key = '2001:0db8:0001:0002::/64';
    for (const written of [
      '2001:db8:1:2::1',
      '2001:DB8:1:2:FFFF:FFFF:FFFF:FFFF',
      '[2001:db8:1:2::9]',
      '2001:0db8:0001:0002:0000:0000:0000:0003',
      '2001:db8:1:2::1%eth0',
      '2001:db8:1:2::192.0.2.1',
    ]) {
      expect(networkAddress.parse(written), written).toBe(key);
    }
    expect(networkAddress.parse('::1')).toBe('0000:0000:0000:0000::/64');
    expect(networkAddress.parse('2001:db8:1:3::1')).not.toBe(key);
  });

  it('refuses what is empty or not an IP address', () => {
    for (const bad of [
      '',
      '   ',
      'localhost',
      '256.1.1.1',
      '1.2.3',
      '1::2::3',
      '1:2:3:4:5:6:7:8:9',
      '1:2:3:4:5:6:7::8',
      'g::1',
      '12345::1',
      '::ffff:999.1.1.1',
    ]) {
      expect(networkAddress.safeParse(bad).success, bad).toBe(false);
    }
  });
});
