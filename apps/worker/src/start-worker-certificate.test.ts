// Step 2.203: the database's certificate (PLATFORM_DATABASE_CA) reaches both of the
// worker's connections, and a failed connection is told in one of three fixed
// sentences, by the driver's code, with no value in it. Made-up values only; nothing
// here opens a connection (the login check is a stand-in that fails as a driver would).
import { readFileSync } from 'node:fs';
import type { DatabaseSource } from '@srleagues/database';
import { createLogger, memorySink } from '@srleagues/observability';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadWorkerConfig } from './config-schema.ts';
import { startWorker, WorkerStartError, workerDatabaseRefusal } from './start-worker.ts';

const opened = vi.hoisted(() => ({ database: [] as unknown[], pgBoss: [] as unknown[] }));
vi.mock('@srleagues/database', async (original) => {
  const real = await original<typeof import('@srleagues/database')>();
  return {
    ...real,
    createDatabase: (source: DatabaseSource) => {
      opened.database.push(source);
      return real.createDatabase(source);
    },
    createPgBoss: (source: DatabaseSource) => {
      opened.pgBoss.push(source);
      return real.createPgBoss(source);
    },
  };
});

afterEach(() => {
  opened.database.length = 0;
  opened.pgBoss.length = 0;
});

const madeUpCa = readFileSync(
  new URL(
    '../../../packages/providers/src/platform-database/fixtures/made-up-database-ca.pem',
    import.meta.url,
  ),
  'utf8',
);
const password = 'hunter2-made-up';
const staging = {
  APP_ENV: 'staging',
  PUBLIC_BASE_URL: 'https://leagues.example.test',
  EMAIL_FROM: 'hello@example.test',
  PLATFORM_DATABASE_URL: `postgres://worker:${password}@db.example.test:5432/league`,
  WORKER_HEALTH_PORT: '3999',
};

/** A driver's failure as pg gives it: a code, and words that may hold anything. */
const driverError = (code: string) =>
  Object.assign(new Error(`made-up failure for worker:${password} with ${madeUpCa}`), { code });

const certificate =
  'The worker cannot start: the database’s certificate was not accepted: set PLATFORM_DATABASE_CA to the database’s own certificate (its PEM text, or the path of a file holding it; for Supabase, the one on the project’s database settings page), then start the worker again.';
const login =
  'The worker cannot start: the database refused the login: check the worker’s own login and its password in PLATFORM_DATABASE_URL, then start the worker again.';
const notReached =
  'The worker cannot start: the database could not be reached: check the address and port in PLATFORM_DATABASE_URL and that the database is running, then start the worker again.';

async function startFailing(env: Record<string, string>, error: unknown) {
  const { sink, lines } = memorySink();
  const logger = createLogger({ sink, level: 'debug', base: { app: 'worker' } });
  const failure = await startWorker(loadWorkerConfig(env), {
    logger,
    checkLoginRole: async () => {
      throw error;
    },
  }).catch((e: unknown) => e);
  expect(failure).toBeInstanceOf(WorkerStartError);
  return { said: String((failure as Error).message), logged: lines.join('\n') };
}

describe('the worker and the database’s certificate', () => {
  it('hands PLATFORM_DATABASE_CA to both connections, the database’s and pg-boss’s', async () => {
    await startFailing({ ...staging, PLATFORM_DATABASE_CA: madeUpCa }, driverError('28P01'));
    expect(opened.database).toEqual([expect.objectContaining({ ca: `${madeUpCa.trim()}\n` })]);
    expect(opened.pgBoss).toEqual([expect.objectContaining({ ca: `${madeUpCa.trim()}\n` })]);
  });

  it('left out, uses the computer’s own authorities, as before', async () => {
    await startFailing(staging, driverError('28P01'));
    expect(opened.database).toEqual([expect.not.objectContaining({ ca: expect.anything() })]);
    expect(opened.pgBoss).toEqual([expect.not.objectContaining({ ca: expect.anything() })]);
  });

  it('says which of three things it is, by the code alone, and prints no value', async () => {
    const cases: [string, string][] = [
      ['SELF_SIGNED_CERT_IN_CHAIN', certificate],
      ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', certificate],
      ['ERR_TLS_CERT_ALTNAME_INVALID', certificate],
      ['28P01', login],
      ['ECONNREFUSED', notReached],
      ['ENOTFOUND', notReached],
    ];
    for (const [code, sentence] of cases) {
      const { said, logged } = await startFailing(
        { ...staging, PLATFORM_DATABASE_CA: madeUpCa },
        driverError(code),
      );
      expect(said).toBe(sentence);
      for (const text of [said, logged]) {
        expect(text).not.toContain(password);
        expect(text).not.toContain(madeUpCa.split('\n')[1]);
        expect(text).not.toContain('made-up failure');
      }
    }
    expect(workerDatabaseRefusal(new Error('certificate words, but no code'))).toBe(
      notReached.replace('The worker cannot start: ', ''),
    );
  });
});
