import { describe, expect, it } from 'vitest';
import { redact, redactText } from './redact.ts';

const id = '01900000-0000-7000-8000-000000000001';

describe('redact: sensitive keys', () => {
  it('masks personal and secret keys, in any spelling', () => {
    const out = redact({
      password: 'x',
      user_password: 'x',
      'x-api-key': 'x',
      apiKey: 'x',
      cookie: 'a=b',
      setCookie: 'a=b',
      phoneNumber: '1',
      answers: ['a'],
      formAnswer: 'a',
      body: 'hi',
      sessionId: 's',
      resetCodeId: 'c',
      tokenId: 't',
      firstname: 'a',
      authorization: 'Basic abcdefgh',
    }) as Record<string, unknown>;
    for (const [key, value] of Object.entries(out)) expect(value, key).toBe('[redacted]');
  });

  it('does not over-redact harmless keys', () => {
    const input = {
      errorMessage: 'bad thing',
      statusCode: 500,
      filename: 'a.ts',
      hostname: 'web-1',
      jobName: 'send-invite',
      context: 'worker',
      platform: 'linux',
      format: 'json',
      leagueId: id,
      accountId: id,
      requestId: 'req-1',
    };
    expect(redact(input)).toEqual(input);
  });
});

describe('redact: text', () => {
  it('scrubs emails, bearer, basic auth, prefixed keys and JWTs', () => {
    const text = [
      'a@b.com',
      'Bearer abcdefgh12345',
      'Basic dXNlcjpwYXNzd29yZA==',
      'sk_live_abcdefghijklmnop',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc',
    ].join(' | ');
    const out = redactText(text);
    for (const leaked of ['a@b.com', 'abcdefgh12345', 'dXNlcjpw', 'sk_live', 'eyJhbGci']) {
      expect(out).not.toContain(leaked);
    }
  });

  it('scrubs credentials in URLs and connection strings, with or without a TLD', () => {
    const out = redactText(
      'connect postgres://app:hunter2@localhost:5432/db and https://bob:pw@example.com/x and https://tok@host.io',
    );
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('bob');
    expect(out).not.toContain('pw@');
    expect(out).not.toContain('tok@');
    expect(out).toContain('postgres://[redacted]@localhost:5432/db');
  });

  it('scrubs short codes after code, otp and pin', () => {
    for (const text of [
      'code 123456',
      'Your code is 4821',
      'OTP: 998877',
      'pin=0042',
      'PIN #12345678',
    ]) {
      expect(redactText(text), text).not.toMatch(/\d{4}/);
    }
  });

  it('scrubs phone-number shapes but not ordinary numbers or dates', () => {
    for (const text of [
      'call +1 415 555 0132',
      'call (415) 555-0132',
      'call 415-555-0132',
      'call 415.555.0132',
    ]) {
      expect(redactText(text), text).not.toMatch(/555/);
    }
    expect(redactText('at 1731456789012 on 2026-11-12, 3 of 14, took 1234 ms')).toBe(
      'at 1731456789012 on 2026-11-12, 3 of 14, took 1234 ms',
    );
  });

  it('keeps UUIDs, 32-hex trace ids, long paths and kebab names; scrubs mixed secret runs', () => {
    const trace = '4bf92f3577b34da6a3ce929d0e0e4736';
    expect(redactText(id)).toBe(id);
    expect(redactText(`trace ${trace} for ${id}`)).toBe(`trace ${trace} for ${id}`);
    const path = 'C:/projects/some/very-long/directory-name-that-keeps-going-on/and-on/file.ts';
    expect(redactText(path)).toBe(path);
    const kebab = 'a-very-long-kebab-case-name-with-no-digits-in-it-at-all';
    expect(redactText(kebab)).toBe(kebab);
    expect(redactText(`key ${'Ab3'.repeat(15)} end`)).toBe('key [redacted] end');
  });
});

describe('redact: structure and limits', () => {
  it('handles arrays, nesting, circular references and depth', () => {
    const loop: Record<string, unknown> = { ok: 1 };
    loop.self = loop;
    expect(redact({ list: [{ email: 'a@b.com' }, 2], loop })).toEqual({
      list: [{ email: '[redacted]' }, 2],
      loop: { ok: 1, self: '[circular]' },
    });
    let deep: Record<string, unknown> = { end: 1 };
    for (let i = 0; i < 10; i++) deep = { deep };
    expect(JSON.stringify(redact(deep))).toContain('[too deep]');
  });

  it('truncates long strings before scanning, and caps arrays and keys', () => {
    const long = redactText('x'.repeat(100_000));
    expect(long.length).toBeLessThan(2100);
    expect(long).toContain('[truncated]');
    const list = redact(Array.from({ length: 500 }, (_, i) => i)) as unknown[];
    expect(list).toHaveLength(51);
    const many = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(redact(many) as object)).toHaveLength(101);
  });

  it('replaces buffers and typed arrays instead of expanding them', () => {
    expect(redact({ a: Buffer.from('secret bytes'), b: new Uint8Array(100_000) })).toEqual({
      a: '[binary]',
      b: '[binary]',
    });
  });

  it('survives getters that throw and null-prototype objects', () => {
    const bad = {
      good: 'fine',
      get broken(): string {
        throw new Error('x');
      },
    };
    expect(redact(bad)).toEqual({ good: 'fine', broken: '[unreadable]' });
    const bare = Object.create(null) as Record<string, unknown>;
    bare.n = 1;
    expect(redact(bare)).toEqual({ n: 1 });
  });
});
