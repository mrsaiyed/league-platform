// T-30: the worker's settings are checked once at start-up; a problem names the
// setting and never its value. All values here are made up.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  defaultHealthPort,
  loadWorkerConfig,
  WorkerConfigError,
  workerFields,
} from './config-schema.ts';

const local = {
  APP_ENV: 'local',
  PUBLIC_BASE_URL: 'http://localhost:3000',
  EMAIL_FROM: 'hello@example.test',
};
const production = {
  ...local,
  APP_ENV: 'production',
  PUBLIC_BASE_URL: 'https://leagues.example.test',
  PLATFORM_DATABASE_URL: 'postgres://worker:hunter2-made-up@db.example.test:5432/league',
  RESEND_API_KEY: 're_made_up_key',
};

function failure(env: Record<string, string | undefined>): WorkerConfigError {
  try {
    loadWorkerConfig(env);
  } catch (error) {
    if (error instanceof WorkerConfigError) return error;
    throw error;
  }
  throw new Error('expected the settings to be refused');
}

describe('loadWorkerConfig', () => {
  it('needs no database address or email key in local work, and fills in defaults', () => {
    expect(loadWorkerConfig(local)).toEqual({
      ...local,
      LOG_LEVEL: 'info',
      WORKER_HEALTH_PORT: defaultHealthPort,
    });
  });

  it('accepts production with its address and key', () => {
    const config = loadWorkerConfig({ ...production, WORKER_HEALTH_PORT: '10000' });
    expect(config.WORKER_HEALTH_PORT).toBe(10000);
    expect(config.PLATFORM_DATABASE_URL).toBe(production.PLATFORM_DATABASE_URL);
  });

  it('needs the database address in staging and production, and the key in production', () => {
    expect(failure({ ...local, APP_ENV: 'staging' }).invalid).toEqual([
      'PLATFORM_DATABASE_URL: missing, must be set when APP_ENV is staging',
    ]);
    expect(failure({ ...production, RESEND_API_KEY: ' ' }).invalid).toEqual([
      'RESEND_API_KEY: missing, must be set when APP_ENV is production',
    ]);
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
    expect(Object.values(loadWorkerConfig({ ...local, DATABASE_URL: tracker }))).not.toContain(
      tracker,
    );
  });

  it('takes health port 0 (any free port) only in tests', () => {
    expect(loadWorkerConfig({ ...local, APP_ENV: 'test', WORKER_HEALTH_PORT: '0' })).toMatchObject({
      WORKER_HEALTH_PORT: 0,
    });
    for (const env of [local, production]) {
      expect(failure({ ...env, WORKER_HEALTH_PORT: '0' }).invalid).toEqual([
        'WORKER_HEALTH_PORT: invalid, may be 0 only when APP_ENV is test',
      ]);
    }
  });

  it('takes only a scheme and host as the site address, as the web app does', () => {
    expect(
      loadWorkerConfig({ ...production, PUBLIC_BASE_URL: 'https://leagues.example.test/' }),
    ).toBeTruthy();
    for (const bad of [
      'https://leagues.example.test/base',
      'https://leagues.example.test/?x=1',
      'https://someone:made-up@leagues.example.test',
    ]) {
      const error = failure({ ...production, PUBLIC_BASE_URL: bad });
      expect(error.invalid).toEqual([
        'PUBLIC_BASE_URL: invalid, must be only a scheme and host, like https://site',
      ]);
      expect(error.message).not.toContain('made-up');
    }
  });

  it('names every missing or invalid setting, and never a value', () => {
    const error = failure({
      APP_ENV: 'everywhere',
      PLATFORM_DATABASE_URL: 'mysql://worker:hunter2-made-up@db.example.test/league',
      RESEND_API_KEY: 'tiny',
      WORKER_HEALTH_PORT: '99999',
    });
    expect(error.missing).toEqual(['PUBLIC_BASE_URL', 'EMAIL_FROM']);
    expect(error.invalid).toEqual([
      'APP_ENV: invalid, not one of the allowed values',
      'PLATFORM_DATABASE_URL: invalid, must be a postgres:// address',
      'RESEND_API_KEY: invalid, must be at least 8 characters',
      'WORKER_HEALTH_PORT: invalid, must be a port from 0 to 65535',
    ]);
    for (const value of ['everywhere', 'hunter2-made-up', 'tiny', '99999']) {
      expect(error.message).not.toContain(value);
    }
  });
});

describe('.env.example', () => {
  it('names every worker setting, and its active lines load for the worker', () => {
    const text = readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8');
    const env: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line);
      if (m?.[1] !== undefined) env[m[1]] = m[2] ?? '';
    }
    for (const name of Object.keys(workerFields)) {
      expect(text).toMatch(new RegExp(`^#? ?${name}=`, 'm'));
    }
    expect(() => loadWorkerConfig(env)).not.toThrow();
  });
});
