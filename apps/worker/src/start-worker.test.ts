// The worker starts and takes a job (step 2.94, R2). On the made-up database in
// memory, used as a login fit for the app (T-60): the settings are checked, the login
// role is checked, the health check answers once the queue has looked at the jobs
// table, and an invitation recorded by the real invite command is taken, sent
// (captured, T-140) and marked done. Nothing here opens an address.
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { invite, type AccessTx, type CommandDeps } from '@srleagues/core';
import {
  accessStore,
  activityLogStore,
  commandTransaction,
  jobsStore,
  leaguesStore,
  madeUpDatabase,
  type MadeUpDatabase,
} from '@srleagues/database';
import { createLogger, memorySink } from '@srleagues/observability';
import { afterEach, describe, expect, it } from 'vitest';
import { loadWorkerConfig } from './config-schema.ts';
import { startWorker, WorkerStartError, type RunningWorker } from './start-worker.ts';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
});

function logged() {
  const { sink, lines } = memorySink();
  const logger = createLogger({ sink, level: 'debug', base: { app: 'worker' } });
  const parsed = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { logger, parsed };
}

async function eventually(check: () => Promise<boolean> | boolean, ms = 20_000) {
  const until = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > until) throw new Error('waited too long');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** A made-up database the test keeps hold of, and whether the worker closed it. */
async function trackedDatabase() {
  const made = await madeUpDatabase();
  let closed = false;
  const tracked: MadeUpDatabase = {
    ...made,
    close: async () => {
      closed = true;
      await made.close();
    },
  };
  cleanup.push(async () => {
    if (!closed) await made.close();
  });
  return { made: tracked, closed: () => closed };
}

const settings = (more: Record<string, string> = {}) =>
  loadWorkerConfig({
    APP_ENV: 'test',
    PUBLIC_BASE_URL: 'https://leagues.example.test',
    EMAIL_FROM: 'leagues@mail.example.test',
    WORKER_HEALTH_PORT: '0',
    ...more,
  });

/** Invites someone as the league's owner, through the real command and database. */
async function inviteSomeone(running: RunningWorker, made: MadeUpDatabase) {
  const [league] = made.leagues;
  if (league === undefined) throw new Error('no seed league');
  const deps: CommandDeps<AccessTx> = {
    transaction: commandTransaction(running.db, (scope) => ({
      jobs: jobsStore(scope),
      leagues: leaguesStore(scope),
      access: accessStore(scope),
      activity: activityLogStore(scope),
    })),
    events: [],
    log: () => {},
    now: () => Date.now(),
  };
  const result = await invite(
    { leagueId: league.leagueId, accountId: league.ownerAccountId, requestId: 'made-up-request' },
    { email: 'new.helper@example.test', role: 'editor' },
    deps,
  );
  if (!result.ok) throw new Error(`not invited: ${JSON.stringify(result.error)}`);
  return league.leagueId;
}

describe('startWorker', () => {
  it('starts, answers its health check, and takes a job', async () => {
    const { made, closed } = await trackedDatabase();
    const captured = await mkdtemp(path.join(os.tmpdir(), 'worker-email-'));
    cleanup.push(() => rm(captured, { recursive: true, force: true }));
    const { logger, parsed } = logged();

    const running = await startWorker(settings({ EMAIL_CAPTURE_DIR: captured }), {
      logger,
      madeUpDatabase: async () => made,
      pollMs: 20,
    });
    cleanup.push(() => running.stop());
    expect({ queue: running.queue, email: running.email }).toEqual({
      queue: 'table',
      email: 'capture',
    });
    expect(parsed()).toContainEqual(
      expect.objectContaining({
        msg: 'worker.started',
        appEnv: 'test',
        queue: 'table',
        sender: 'capture',
      }),
    );

    const health = `http://127.0.0.1:${running.healthPort}/health`;
    await eventually(async () => (await fetch(health)).status === 200);
    expect(await (await fetch(health)).json()).toMatchObject({
      status: 'ok',
      app: 'worker',
      queue: 'table',
    });

    const leagueId = await inviteSomeone(running, made);
    await eventually(() =>
      parsed().some((line) => line['msg'] === 'worker.job' && line['outcome'] === 'done'),
    );
    expect(parsed().find((line) => line['msg'] === 'worker.job')).toMatchObject({
      level: 'info',
      type: 'email.send',
      leagueId,
      attempt: 1,
      outcome: 'done',
    });
    const files = await readdir(captured);
    expect(files.filter((name) => name.endsWith('.json'))).toHaveLength(1);
    // Log lines hold ids and fixed words, never the person's address (T-86).
    expect(JSON.stringify(parsed())).not.toContain('new.helper@example.test');

    await running.stop();
    expect(closed()).toBe(true);
    expect(parsed().at(-1)).toMatchObject({ msg: 'worker.stopped' });
    await expect(fetch(health)).rejects.toThrow();
  }, 60_000);

  it('refuses to start, naming the setting, when its health port is taken, and closes everything', async () => {
    const { made, closed } = await trackedDatabase();
    const taken: Server = createServer();
    await new Promise<void>((done) => taken.listen(0, done));
    cleanup.push(() => new Promise<void>((done) => taken.close(() => done())));
    const port = (taken.address() as AddressInfo).port;
    const { logger } = logged();

    const start = startWorker(settings({ WORKER_HEALTH_PORT: String(port) }), {
      logger,
      madeUpDatabase: async () => made,
    });
    await expect(start).rejects.toThrow(WorkerStartError);
    await expect(start).rejects.toThrow('WORKER_HEALTH_PORT');
    expect(closed()).toBe(true);
  }, 60_000);

  it('refuses a login unfit for the app (T-60), and closes everything', async () => {
    const { made, closed } = await trackedDatabase();
    // Back to the superuser that built it, the login a hosted database must never use.
    // (PGlite ignores `reset session authorization`, so the superuser is named.)
    if (made.source.kind !== 'pglite') throw new Error('a made-up database is PGlite');
    await made.source.pglite.exec('set session authorization postgres');
    const { logger, parsed } = logged();

    const start = startWorker(settings(), { logger, madeUpDatabase: async () => made });
    await expect(start).rejects.toThrow(WorkerStartError);
    await expect(start).rejects.toThrow('not fit for the worker');
    await expect(start).rejects.toThrow('it is a superuser');
    expect(closed()).toBe(true);
    expect(parsed().some((line) => line['msg'] === 'worker.started')).toBe(false);
  }, 60_000);

  it('stops when the database cannot be reached, never repeating the driver message', async () => {
    const { made, closed } = await trackedDatabase();
    // A database that is gone: every query fails in the driver.
    await made.close();
    const { logger, parsed } = logged();

    const start = startWorker(settings(), { logger, madeUpDatabase: async () => made });
    await expect(start).rejects.toThrow(WorkerStartError);
    await expect(start).rejects.toThrow('could not be reached');
    expect(closed()).toBe(true);
    const unreachable = parsed().filter((line) => line['msg'] === 'worker.database_unreachable');
    expect(unreachable).toHaveLength(1);
    // Only its kind: the driver's own words are not passed on.
    expect(unreachable[0]).toMatchObject({ level: 'error', kind: expect.any(String) });
    expect(Object.keys(unreachable[0] ?? {})).not.toContain('message');
    expect(Object.keys(unreachable[0] ?? {})).not.toContain('error');
  }, 60_000);
});

describe('startWorker on a hosted database (staging and production)', () => {
  // A made-up address nothing listens on. The checks are replaced, so it is never
  // reached: nothing here connects (T-201).
  const address = 'postgres://worker:made-up-password@db.example.test:5432/league';
  const hosted = (appEnv: 'staging' | 'production') =>
    loadWorkerConfig({
      APP_ENV: appEnv,
      PUBLIC_BASE_URL: 'https://leagues.example.test',
      EMAIL_FROM: 'leagues@mail.example.test',
      DATABASE_URL: address,
      RESEND_API_KEY: 're_made_up_key',
      WORKER_HEALTH_PORT: '3001',
    });

  it('checks pg-boss schema after the login role, and refuses with its words', async () => {
    for (const appEnv of ['staging', 'production'] as const) {
      const asked: string[] = [];
      const { logger, parsed } = logged();
      const start = startWorker(hosted(appEnv), {
        logger,
        checkLoginRole: async () => {
          asked.push('login role');
          return [];
        },
        checkQueueSchema: async () => {
          asked.push('queue schema');
          return ['the pgboss schema does not exist (the release makes it, record 053)'];
        },
      });
      await expect(start).rejects.toThrow(WorkerStartError);
      await expect(start).rejects.toThrow('the pgboss schema does not exist');
      expect(asked).toEqual(['login role', 'queue schema']);
      expect(parsed().some((line) => line['msg'] === 'worker.started')).toBe(false);
    }
  });

  it('does not check pg-boss schema when the login role is already unfit', async () => {
    const asked: string[] = [];
    const start = startWorker(hosted('staging'), {
      logger: logged().logger,
      checkLoginRole: async () => ['the login role is a superuser'],
      checkQueueSchema: async () => {
        asked.push('queue schema');
        return [];
      },
    });
    await expect(start).rejects.toThrow('the login role is a superuser');
    expect(asked).toEqual([]);
  });

  it('stops when the schema check fails in the driver, never repeating the address', async () => {
    const { logger, parsed } = logged();
    const start = startWorker(hosted('production'), {
      logger,
      checkLoginRole: async () => [],
      checkQueueSchema: async () => {
        throw new Error(`connect ECONNREFUSED ${address}`);
      },
    });
    await expect(start).rejects.toThrow('could not be reached');
    await start.catch((error: unknown) => {
      expect(String(error)).not.toContain('made-up-password');
      expect(String(error)).not.toContain('db.example.test');
    });
    expect(parsed()).toContainEqual(
      expect.objectContaining({ msg: 'worker.database_unreachable', kind: 'Error' }),
    );
    expect(JSON.stringify(parsed())).not.toContain('db.example.test');
  });

  it('runs no pg-boss schema check on the table queue (local work and tests)', async () => {
    const { made } = await trackedDatabase();
    const asked: string[] = [];
    const running = await startWorker(settings(), {
      logger: logged().logger,
      madeUpDatabase: async () => made,
      checkQueueSchema: async () => {
        asked.push('queue schema');
        return ['should not be asked'];
      },
    });
    cleanup.push(() => running.stop());
    expect(running.queue).toBe('table');
    expect(asked).toEqual([]);
  }, 60_000);
});
