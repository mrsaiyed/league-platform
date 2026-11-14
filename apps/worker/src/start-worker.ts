// What happens once, when the worker starts (T7 §1, §9; T8 §7; T-30, T-60). Any
// problem stops the start, with plain words that name a setting, never its value,
// and closes whatever was opened.
//
// 1. The settings were read and checked before this is called (config.ts).
// 2. Local work and tests (APP_ENV local or test) run on a made-up database in
//    memory and never open an address (T-201); staging and production open
//    DATABASE_URL.
// 3. The login role is checked (checkLoginRole, T-60): a superuser, a role that
//    bypasses row-level security, or the tables' owner stops the start.
// 4. With pg-boss on a hosted database, its schema is checked (checkQueueSchema,
//    T-257): the release makes it, the worker never does (record 053).
// 5. The health check starts listening (WORKER_HEALTH_PORT). It answers 503 until
//    the queue has looked at the jobs table once, then 200 for as long as each look
//    keeps working (the heartbeat, T8 §7).
// 6. The queue starts with the job handlers.
//
// Not here yet: the jobs waiting and the age of the oldest (T-142) in the health
// answer. Counting them across leagues needs an owner-run function of its own, a
// migration (record 053).
import type { Server } from 'node:http';
import {
  checkLoginRole,
  checkQueueSchema,
  madeUpDatabase,
  type DatabaseHandle,
  type DatabaseSource,
  type MadeUpDatabase,
} from '@srleagues/database';
import type { Logger } from '@srleagues/observability';
import type { WorkerConfig } from './config-schema.ts';
import { createHeartbeat, startHealthServer } from './health.ts';
import { wireWorker, type WiredWorker } from './wire-worker.ts';

export class WorkerStartError extends Error {
  constructor(message: string) {
    super(`The worker cannot start: ${message}`);
    this.name = 'WorkerStartError';
  }
}

export type StartWorkerDeps = {
  readonly logger: Logger;
  /** Opens the made-up database for local work and tests. Default: a new one in memory. */
  readonly madeUpDatabase?: () => Promise<MadeUpDatabase>;
  /** How often the queue looks for due jobs, in ms. Default 1 second. */
  readonly pollMs?: number;
  /** A last look older than this makes the health check answer 503. Default 60 seconds. */
  readonly heartbeatMaxAgeMs?: number;
  /** The login role check (T-60), replaceable in tests. Default: checkLoginRole. */
  readonly checkLoginRole?: (db: DatabaseHandle) => Promise<string[]>;
  /** pg-boss's schema check (T-257), replaceable in tests. Default: checkQueueSchema. */
  readonly checkQueueSchema?: (db: DatabaseHandle) => Promise<string[]>;
};

export type RunningWorker = {
  readonly db: DatabaseHandle;
  readonly queue: 'table' | 'pg-boss';
  readonly email: 'resend' | 'capture';
  /** The port the health check listens on (useful when WORKER_HEALTH_PORT is 0). */
  readonly healthPort: number;
  /** Stops taking jobs, waits for the ones in hand (T7 §9), then closes everything. */
  readonly stop: () => Promise<void>;
};

const kindOf = (error: unknown) => (error instanceof Error ? error.name : typeof error);

export async function startWorker(
  config: WorkerConfig,
  deps: StartWorkerDeps,
): Promise<RunningWorker> {
  const local = config.APP_ENV === 'local' || config.APP_ENV === 'test';
  const queueKind = local ? 'table' : 'pg-boss';
  const closing: (() => Promise<void>)[] = [];
  const closeAll = async () => {
    for (const close of closing.splice(0).reverse()) {
      try {
        await close();
      } catch (error) {
        deps.logger.warn('worker.close_failed', { kind: kindOf(error) });
      }
    }
  };

  try {
    let source: DatabaseSource;
    if (local) {
      const made = await (deps.madeUpDatabase ?? madeUpDatabase)();
      closing.push(() => made.close());
      source = made.source;
    } else {
      if (config.DATABASE_URL === undefined) {
        throw new WorkerStartError(`DATABASE_URL is needed when APP_ENV is ${config.APP_ENV}.`);
      }
      source = { kind: 'postgres', url: config.DATABASE_URL };
    }

    const heartbeat = createHeartbeat({
      queue: queueKind,
      maxAgeMs: deps.heartbeatMaxAgeMs ?? 60_000,
    });
    let wired: WiredWorker;
    try {
      wired = wireWorker(
        {
          appEnv: config.APP_ENV,
          database: source,
          resendApiKey: config.RESEND_API_KEY,
          captureDirectory: config.EMAIL_CAPTURE_DIR,
          // Only a scheme and host (config-schema.ts): the web app has no base path.
          siteOrigin: config.PUBLIC_BASE_URL,
          sendingAddress: config.EMAIL_FROM,
          queue: {
            onPolled: heartbeat.beat,
            ...(deps.pollMs === undefined ? {} : { pollMs: deps.pollMs }),
          },
        },
        deps.logger,
      );
    } catch (error) {
      // wireWorker's own refusals are fixed words about a setting, never its value.
      throw new WorkerStartError(
        error instanceof Error ? error.message : 'its settings are unusable.',
      );
    }
    closing.push(() => wired.close());

    let problems: string[];
    try {
      problems = await (deps.checkLoginRole ?? checkLoginRole)(wired.db);
      if (problems.length === 0 && queueKind === 'pg-boss' && source.kind === 'postgres') {
        problems = await (deps.checkQueueSchema ?? checkQueueSchema)(wired.db);
      }
    } catch (error) {
      // The driver's message may hold the address; it is not repeated here.
      deps.logger.error('worker.database_unreachable', { kind: kindOf(error) });
      throw new WorkerStartError(
        'the database could not be reached to check its login role and queue schema.',
      );
    }
    if (problems.length > 0) {
      throw new WorkerStartError(
        `the database login role is not fit for the worker (T-60, T-257): ${problems.join('; ')}.`,
      );
    }

    let server: Server;
    try {
      server = await startHealthServer(heartbeat, config.WORKER_HEALTH_PORT);
    } catch (error) {
      deps.logger.error('worker.health_failed', { kind: kindOf(error) });
      throw new WorkerStartError('the health check could not listen on WORKER_HEALTH_PORT.');
    }
    closing.push(() => new Promise<void>((done) => server.close(() => done())));
    const address = server.address();
    const healthPort = typeof address === 'object' && address !== null ? address.port : 0;

    try {
      await wired.queue.start(wired.handlers);
    } catch (error) {
      deps.logger.error('worker.queue_failed', { kind: kindOf(error) });
      throw new WorkerStartError('the queue could not start.');
    }

    deps.logger.info('worker.started', {
      appEnv: config.APP_ENV,
      queue: wired.queue.kind,
      // Not `email`: the logger hides any key with that word in it (T-86).
      sender: wired.emailKind,
      healthPort,
    });
    let stopped: Promise<void> | undefined;
    return {
      db: wired.db,
      queue: wired.queue.kind,
      email: wired.emailKind,
      healthPort,
      stop: () => {
        stopped ??= (async () => {
          deps.logger.info('worker.stopping', {});
          await closeAll();
          deps.logger.info('worker.stopped', {});
        })();
        return stopped;
      },
    };
  } catch (error) {
    await closeAll();
    throw error;
  }
}
