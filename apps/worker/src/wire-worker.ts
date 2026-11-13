// The worker's wiring (T2 §2: job startup and dispatch, no rules). Given settings,
// it opens the database handle and picks the queue and the email sender for the
// environment (record 012, T-140):
//
//   local, test     the table queue (jobs run straight from the jobs table), and
//                   captured email
//   staging         the pg-boss queue, as in production, and captured email
//   production      the pg-boss queue, and Resend
//
// What it does not do yet: read the environment (the worker's config file,
// apps/worker/src/config.ts, does not exist yet), check the login role
// (checkLoginRole), start the queue, or give it handlers. No job type has a
// handler until the invitation email (step 1.19 part 2); the caller passes them to
// `queue.start`.
import { errorCodeOf, type EmailSender, type WorkQueue } from '@srleagues/core';
import {
  createDatabase,
  createPgBoss,
  pgBossQueue,
  tableQueue,
  type DatabaseHandle,
  type DatabaseSource,
  type QueueOptions,
} from '@srleagues/database';
import { emailSenderFor } from '@srleagues/providers';

export type WorkerSettings = {
  readonly appEnv: 'local' | 'test' | 'staging' | 'production';
  readonly database: DatabaseSource;
  readonly resendApiKey?: string | undefined;
  /** Where captured emails are written, outside production. */
  readonly captureDirectory?: string | undefined;
  readonly queue?: QueueOptions;
};

export type WiredWorker = {
  readonly db: DatabaseHandle;
  readonly queue: WorkQueue;
  readonly email: EmailSender;
  readonly emailKind: 'resend' | 'capture';
  /** Stops the queue, then closes the database. */
  readonly close: () => Promise<void>;
};

/**
 * Until the logging library exists (step 1.20), a queue fault (the database or
 * pg-boss unreachable) is written to stderr as one JSON line with the error's kind
 * and a fixed code only, never its message (T-86).
 */
export function reportQueueError(error: unknown): void {
  const kind = error instanceof Error ? error.name : typeof error;
  process.stderr.write(
    `${JSON.stringify({ event: 'worker.queue_error', kind, code: errorCodeOf(error) })}\n`,
  );
}

export function wireWorker(settings: WorkerSettings): WiredWorker {
  // First, so a missing production key throws before anything is opened.
  const email = emailSenderFor(settings);
  const db = createDatabase(settings.database);
  const options: QueueOptions = { onError: reportQueueError, ...settings.queue };
  const queue =
    settings.appEnv === 'local' || settings.appEnv === 'test'
      ? tableQueue(db, options)
      : pgBossQueue(db, createPgBoss(settings.database), options);
  return {
    db,
    queue,
    email: email.sender,
    emailKind: email.kind,
    close: async () => {
      await queue.stop();
      await db.close();
    },
  };
}
