// The worker's wiring (T2 §2: job startup and dispatch, no rules). Given settings,
// it opens the database handle and picks the queue and the email sender for the
// environment (record 012, T-140):
//
//   local, test     the table queue (jobs run straight from the jobs table), and
//                   captured email
//   staging         the pg-boss queue, as in production, and captured email
//   production      the pg-boss queue, and Resend
//
// It also makes the job handlers (jobs/job-handlers.ts), each job's transaction
// bound to the database's stores; the caller passes them to `queue.start`.
//
// What it does not do yet: read the environment (the worker's config file,
// apps/worker/src/config.ts, does not exist yet), check the login role
// (checkLoginRole), or start the queue.
import {
  errorCodeOf,
  type EmailSender,
  type ImportsTx,
  type JobHandlers,
  type WorkQueue,
} from '@srleagues/core';
import {
  accessStore,
  activityLogStore,
  commandTransaction,
  createDatabase,
  createPgBoss,
  importsStore,
  jobsStore,
  leaguesStore,
  pgBossQueue,
  schedulingStore,
  tableQueue,
  type DatabaseHandle,
  type DatabaseSource,
  type QueueOptions,
} from '@srleagues/database';
import { emailSenderFor } from '@srleagues/providers';
import {
  checkedInvitationEmailSettings,
  type InvitationEmailTx,
} from './jobs/invitation-email-job.ts';
import { jobHandlers } from './jobs/job-handlers.ts';

export type WorkerSettings = {
  readonly appEnv: 'local' | 'test' | 'staging' | 'production';
  readonly database: DatabaseSource;
  readonly resendApiKey?: string | undefined;
  /** Where captured emails are written, outside production. */
  readonly captureDirectory?: string | undefined;
  /** Our site's origin, such as `https://oursite.com`, for links in emails (T-34). */
  readonly siteOrigin: string;
  /** The address league mail is sent from (T7 §6, T-139). */
  readonly sendingAddress: string;
  readonly queue?: QueueOptions;
};

export type WiredWorker = {
  readonly db: DatabaseHandle;
  readonly queue: WorkQueue;
  readonly email: EmailSender;
  readonly emailKind: 'resend' | 'capture';
  /** The handler for each job type, for `queue.start`. */
  readonly handlers: JobHandlers;
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
  // First, so a missing production key or a setting the emails cannot use throws
  // before anything is opened or any job runs (record 023).
  const email = emailSenderFor(settings);
  checkedInvitationEmailSettings(settings);
  const db = createDatabase(settings.database);
  const options: QueueOptions = { onError: reportQueueError, ...settings.queue };
  const queue =
    settings.appEnv === 'local' || settings.appEnv === 'test'
      ? tableQueue(db, options)
      : pgBossQueue(db, createPgBoss(settings.database), options);
  // Each job's transaction: one league, the stores its handler needs (T-28).
  const transaction = commandTransaction<InvitationEmailTx>(db, (scope) => ({
    jobs: jobsStore(scope),
    leagues: leaguesStore(scope),
    access: accessStore(scope),
    activity: activityLogStore(scope),
  }));
  const importsTransaction = commandTransaction<ImportsTx>(db, (scope) => ({
    jobs: jobsStore(scope),
    imports: importsStore(scope),
    scheduling: schedulingStore(scope),
    access: accessStore(scope),
    activity: activityLogStore(scope),
  }));
  const handlers = jobHandlers({
    importsTransaction,
    transaction,
    email: email.sender,
    siteOrigin: settings.siteOrigin,
    sendingAddress: settings.sendingAddress,
  });
  return {
    db,
    queue,
    email: email.sender,
    emailKind: email.kind,
    handlers,
    close: async () => {
      await queue.stop();
      await db.close();
    },
  };
}
