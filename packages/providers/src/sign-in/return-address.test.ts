import { describe, expect, it } from 'vitest';
import { isAllowedReturnAddress } from './return-address.ts';

const rules = {
  allowedOrigins: ['https://app.example.test', 'http://localhost:3000'],
  allowLocalHttp: true,
};

describe('return addresses for Google sign-in', () => {
  it('allows our own origins, with any path', () => {
    expect(isAllowedReturnAddress('https://app.example.test/auth/return?x=1', rules)).toBe(true);
    expect(isAllowedReturnAddress('http://localhost:3000/auth/return', rules)).toBe(true);
  });

  it('refuses scripts, other schemes, foreign hosts and look-alikes', () => {
    for (const address of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'ftp://app.example.test/',
      'https://evil.example.test/auth/return',
      'https://app.example.test.evil.test/',
      'https://app.example.test:8443/',
      'https://user:pass@app.example.test/',
      '//app.example.test/auth/return',
      '/auth/return',
      'not an address',
    ]) {
      expect(isAllowedReturnAddress(address, rules), address).toBe(false);
    }
  });

  it('allows plain http only to this machine, and only when local http is on', () => {
    const local = { allowedOrigins: ['http://localhost:3000', 'http://app.example.test'] };
    expect(
      isAllowedReturnAddress('http://app.example.test/', { ...local, allowLocalHttp: true }),
    ).toBe(false);
    expect(
      isAllowedReturnAddress('http://localhost:3000/', { ...local, allowLocalHttp: false }),
    ).toBe(false);
    expect(
      isAllowedReturnAddress('http://localhost:3000/', { ...local, allowLocalHttp: true }),
    ).toBe(true);
  });

  it('refuses everything when no origin is allowed', () => {
    expect(
      isAllowedReturnAddress('https://app.example.test/', {
        allowedOrigins: [],
        allowLocalHttp: true,
      }),
    ).toBe(false);
  });
});
