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
});
