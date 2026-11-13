import { describe, expect, it } from 'vitest';
import { ConfigError, fields, loadConfig, type ConfigName } from './config-schema.ts';

const longValue = (name: string) => `value-of-${name.toLowerCase()}-0123456789-abcdefghij`;
const valid: Record<ConfigName, string> = {
  APP_ENV: 'test',
  PUBLIC_BASE_URL: 'http://localhost:3000',
  LOG_LEVEL: 'debug',
  TRUSTED_PROXY: 'one',
  DATABASE_URL: 'postgres://app:hunter2-made-up@localhost:5432/x',
  SESSION_SECRET: longValue('SESSION_SECRET'),
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SECRET_KEY: longValue('SUPABASE_SECRET_KEY'),
  RESEND_API_KEY: longValue('RESEND_API_KEY'),
  EMAIL_FROM: 'hello@example.test',
  STRIPE_SECRET_KEY: longValue('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: longValue('STRIPE_WEBHOOK_SECRET'),
};
const names = Object.keys(fields) as ConfigName[];
const required = names.filter((name) => name !== 'LOG_LEVEL' && name !== 'TRUSTED_PROXY');

function failure(env: Record<string, string | undefined>): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('expected loadConfig to throw');
}

describe('loadConfig', () => {
  it('accepts a complete environment', () => {
    const config = loadConfig(valid);
    expect(config.APP_ENV).toBe('test');
    expect(config.PUBLIC_BASE_URL).toBe('http://localhost:3000');
  });

  it('defaults the optional log level', () => {
    const rest: Record<string, string | undefined> = { ...valid };
    delete rest['LOG_LEVEL'];
    expect(loadConfig(rest).LOG_LEVEL).toBe('info');
  });

  it('believes no forwarded address unless told (record 031)', () => {
    const rest: Record<string, string | undefined> = { ...valid };
    delete rest['TRUSTED_PROXY'];
    expect(loadConfig(rest).TRUSTED_PROXY).toBe('none');
    expect(failure({ ...valid, TRUSTED_PROXY: 'all' }).invalid.join()).toContain('TRUSTED_PROXY');
  });

  it('keeps the TRUSTED_PROXY default for local and test only (record 031)', () => {
    for (const appEnv of ['local', 'test']) {
      expect(
        loadConfig({ ...valid, APP_ENV: appEnv, TRUSTED_PROXY: undefined }).TRUSTED_PROXY,
      ).toBe('none');
    }
    for (const appEnv of ['staging', 'production']) {
      for (const blank of [undefined, '  ']) {
        const error = failure({ ...valid, APP_ENV: appEnv, TRUSTED_PROXY: blank });
        expect(error.missing).toEqual([]);
        expect(error.invalid).toEqual([
          `TRUSTED_PROXY: missing, must be set explicitly when APP_ENV is ${appEnv}`,
        ]);
      }
      for (const set of ['none', 'one'] as const) {
        expect(loadConfig({ ...valid, APP_ENV: appEnv, TRUSTED_PROXY: set }).TRUSTED_PROXY).toBe(
          set,
        );
      }
    }
  });

  it('names a missing TRUSTED_PROXY beside the other problems', () => {
    const error = failure({
      ...valid,
      APP_ENV: 'production',
      TRUSTED_PROXY: undefined,
      DATABASE_URL: undefined,
    });
    expect(error.missing).toEqual(['DATABASE_URL']);
    expect(error.invalid.join()).toContain('TRUSTED_PROXY');
  });

  it('ignores variables it does not know', () => {
    expect(loadConfig({ ...valid, PATH: '/bin' }).APP_ENV).toBe('test');
  });

  for (const name of required) {
    it(`names ${name} when it is missing or blank`, () => {
      expect(failure({ ...valid, [name]: undefined }).message).toContain(`${name}: missing`);
      expect(failure({ ...valid, [name]: '   ' }).missing).toEqual([name]);
    });
  }

  it('lists every missing variable in one error', () => {
    const error = failure({});
    expect([...error.missing].sort()).toEqual([...required].sort());
    for (const name of required) expect(error.message).toContain(name);
  });

  it('names invalid values without printing them', () => {
    const error = failure({
      ...valid,
      APP_ENV: 'nonsense-env',
      PUBLIC_BASE_URL: 'not a url',
      DATABASE_URL: 'mysql://user:topsecretpw@host/db',
      SESSION_SECRET: 'short-secret',
    });
    expect(error.invalid.map((line) => line.split(':')[0]).sort()).toEqual([
      'APP_ENV',
      'DATABASE_URL',
      'PUBLIC_BASE_URL',
      'SESSION_SECRET',
    ]);
    for (const value of ['nonsense-env', 'not a url', 'topsecretpw', 'short-secret']) {
      expect(error.message).not.toContain(value);
    }
  });

  it('never prints secret values that were given', () => {
    const error = failure({ ...valid, APP_ENV: undefined, SESSION_SECRET: 'tiny' });
    for (const name of names.filter((n) => fields[n].secret)) {
      expect(error.message).not.toContain(valid[name]);
    }
    expect(error.message).not.toContain('hunter2-made-up');
    expect(error.message).not.toContain('tiny');
  });
});

describe('.env.example', () => {
  it('lists exactly the schema fields and loads cleanly', async () => {
    const { readFileSync } = await import('node:fs');
    const text = readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8');
    const env: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line);
      if (m?.[1] !== undefined) env[m[1]] = m[2] ?? '';
    }
    expect(Object.keys(env).sort()).toEqual([...names].sort());
    expect(() => loadConfig(env)).not.toThrow();
  });
});

describe('web addresses', () => {
  it('accept only http or https', () => {
    for (const bad of ['javascript:alert(1)', 'ftp://example.test']) {
      expect(failure({ ...valid, PUBLIC_BASE_URL: bad }).invalid.join()).toContain(
        'PUBLIC_BASE_URL',
      );
    }
  });
  it('reports a bad optional value as invalid, not missing', () => {
    const error = failure({ ...valid, LOG_LEVEL: 'loud' });
    expect(error.missing).toEqual([]);
    expect(error.invalid.join()).toContain('LOG_LEVEL');
  });
});
