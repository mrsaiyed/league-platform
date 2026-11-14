import { describe, expect, it } from 'vitest';
import { ConfigError, fields, loadConfig, type ConfigName } from './config-schema.ts';

const longValue = (name: string) => `value-of-${name.toLowerCase()}-0123456789-abcdefghij`;
const valid: Record<ConfigName, string> = {
  APP_ENV: 'test',
  PUBLIC_BASE_URL: 'http://localhost:3000',
  LOG_LEVEL: 'debug',
  TRUSTED_PROXY: 'one',
  PLATFORM_DATABASE_URL: 'postgres://app:hunter2-made-up@localhost:5432/x',
  LOCAL_DATA: 'stand-in',
  SESSION_SECRET: longValue('SESSION_SECRET'),
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SECRET_KEY: longValue('SUPABASE_SECRET_KEY'),
  RESEND_API_KEY: longValue('RESEND_API_KEY'),
  EMAIL_FROM: 'hello@example.test',
  STRIPE_SECRET_KEY: longValue('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: longValue('STRIPE_WEBHOOK_SECRET'),
};
const names = Object.keys(fields) as ConfigName[];
/** Every setting, for staging and production: LOCAL_DATA is for local work and tests only. */
const hosted = { ...valid, LOCAL_DATA: undefined };
/** Required in every environment. */
const required: readonly ConfigName[] = ['APP_ENV', 'PUBLIC_BASE_URL', 'EMAIL_FROM'];
/** Where something uses it (R8): only those environments require it. */
const requiredWhereUsed: Readonly<Partial<Record<ConfigName, readonly string[]>>> = {
  PLATFORM_DATABASE_URL: ['staging', 'production'],
  SUPABASE_URL: ['staging', 'production'],
  SUPABASE_SECRET_KEY: ['staging', 'production'],
  RESEND_API_KEY: ['production'],
};
/** What local work needs: no database, no sign-in service, no keys. */
const localOnly = {
  APP_ENV: 'local',
  PUBLIC_BASE_URL: 'http://localhost:3000',
  EMAIL_FROM: 'hello@example.test',
};
/** What production needs at the least. */
const production = {
  ...localOnly,
  APP_ENV: 'production',
  PUBLIC_BASE_URL: 'https://leagues.example.test',
  TRUSTED_PROXY: 'one',
  PLATFORM_DATABASE_URL: valid.PLATFORM_DATABASE_URL,
  SUPABASE_URL: 'https://made-up-project.supabase.example.test',
  SUPABASE_SECRET_KEY: valid.SUPABASE_SECRET_KEY,
  RESEND_API_KEY: valid.RESEND_API_KEY,
};

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
        const error = failure({ ...hosted, APP_ENV: appEnv, TRUSTED_PROXY: blank });
        expect(error.missing).toEqual([]);
        expect(error.invalid).toEqual([
          `TRUSTED_PROXY: missing, must be set explicitly when APP_ENV is ${appEnv}`,
        ]);
      }
      for (const set of ['none', 'one'] as const) {
        expect(loadConfig({ ...hosted, APP_ENV: appEnv, TRUSTED_PROXY: set }).TRUSTED_PROXY).toBe(
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
      LOCAL_DATA: undefined,
      EMAIL_FROM: undefined,
    });
    expect(error.missing).toEqual(['EMAIL_FROM']);
    expect(error.invalid.join()).toContain('TRUSTED_PROXY');
  });

  it('needs no database, sign-in service or key in local work and tests (R8)', () => {
    for (const appEnv of ['local', 'test']) {
      const config = loadConfig({ ...localOnly, APP_ENV: appEnv });
      expect(config.PLATFORM_DATABASE_URL).toBeUndefined();
      expect(config.SESSION_SECRET).toBeUndefined();
      expect(config.STRIPE_SECRET_KEY).toBeUndefined();
      expect(config.LOCAL_DATA).toBe('stand-in');
    }
  });

  it('needs each setting only where something uses it (R8)', () => {
    expect(loadConfig(production).APP_ENV).toBe('production');
    const staging = { ...production, APP_ENV: 'staging', RESEND_API_KEY: undefined };
    expect(loadConfig(staging).APP_ENV).toBe('staging');
    for (const [name, environments] of Object.entries(requiredWhereUsed)) {
      for (const appEnv of environments) {
        const error = failure({ ...production, APP_ENV: appEnv, [name]: '  ' });
        expect(error.missing).toEqual([]);
        expect(error.invalid).toEqual([`${name}: missing, must be set when APP_ENV is ${appEnv}`]);
      }
    }
  });

  it('never needs the settings nothing uses yet, but still checks them when given (R8)', () => {
    const config = loadConfig(production);
    expect(config.SESSION_SECRET).toBeUndefined();
    expect(config.STRIPE_SECRET_KEY).toBeUndefined();
    expect(config.STRIPE_WEBHOOK_SECRET).toBeUndefined();
    const error = failure({ ...production, SESSION_SECRET: 'short-secret' });
    expect(error.invalid).toEqual(['SESSION_SECRET: invalid, must be at least 32 characters']);
    expect(error.message).not.toContain('short-secret');
  });

  it('takes its database only from PLATFORM_DATABASE_URL, never the tracker setting (R8)', () => {
    const tracker = 'postgres://postgres:tracker-made-up@tracker.example.test:5432/postgres';
    const error = failure({
      ...production,
      PLATFORM_DATABASE_URL: undefined,
      DATABASE_URL: tracker,
    });
    expect(error.invalid).toEqual([
      'PLATFORM_DATABASE_URL: missing, must be set when APP_ENV is production',
    ]);
    expect(error.message).not.toContain('tracker-made-up');
    expect(Object.values(loadConfig({ ...valid, DATABASE_URL: tracker }))).not.toContain(tracker);
  });

  it('takes LOCAL_DATA in local work and tests only (record 055)', () => {
    expect(loadConfig({ ...localOnly, LOCAL_DATA: 'made-up-database' }).LOCAL_DATA).toBe(
      'made-up-database',
    );
    expect(failure({ ...localOnly, LOCAL_DATA: 'everything' }).invalid.join()).toContain(
      'LOCAL_DATA',
    );
    for (const appEnv of ['staging', 'production']) {
      expect(failure({ ...production, APP_ENV: appEnv, LOCAL_DATA: 'stand-in' }).invalid).toEqual([
        'LOCAL_DATA: invalid, may be set only when APP_ENV is local or test',
      ]);
    }
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
      PLATFORM_DATABASE_URL: 'mysql://user:topsecretpw@host/db',
      SESSION_SECRET: 'short-secret',
    });
    expect(error.invalid.map((line) => line.split(':')[0]).sort()).toEqual([
      'APP_ENV',
      'PLATFORM_DATABASE_URL',
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
  it('names exactly the schema fields in its web app part, and its active lines load', async () => {
    const { readFileSync } = await import('node:fs');
    const text = readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8');
    const webPart = text.slice(text.indexOf('# --- Web app'), text.indexOf('# --- Worker'));
    const named = new Set<string>();
    const env: Record<string, string> = {};
    for (const line of webPart.split(/\r?\n/)) {
      const m = /^(# ?)?([A-Z_]+)=(.*)$/.exec(line);
      if (m?.[2] === undefined) continue;
      named.add(m[2]);
      if (m[1] === undefined) env[m[2]] = m[3] ?? '';
    }
    expect([...named].sort()).toEqual([...names].sort());
    // What local work needs, and nothing else: no database address, key or secret.
    expect(Object.keys(env).sort()).toEqual(
      ['APP_ENV', 'EMAIL_FROM', 'LOG_LEVEL', 'PUBLIC_BASE_URL', 'TRUSTED_PROXY'].sort(),
    );
    expect(() => loadConfig(env)).not.toThrow();
    // The tracker's setting is never one of the web app's (R8).
    expect(named.has('DATABASE_URL')).toBe(false);
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
