// The `imports.run` job (T7 §2, step 2.22): reads an uploaded fixtures file once and saves the
// report for the admin's preview. The job holds the import's id and nothing else (T-131); the
// file's text is in the import's row until this job replaces it with the report (T-80).
//
// A job run twice does no harm (T-137): the work is done only for an import still being
// read, so a second run finds it read and changes nothing. A failure is thrown and kept by
// the queue as a fixed code only (errorCodeOf), never a message.
import {
  discardUnreadImport,
  maxJobAttempts,
  readFixtureImport,
  type ImportsTx,
  type JobHandler,
  type QueuedJob,
  type TransactionRunner,
} from '@srleagues/core';

export type ImportJobDeps = {
  /** One transaction for the job's league with no account set; commits when its work returns. */
  readonly transaction: TransactionRunner<ImportsTx>;
};

/** A job whose ids cannot be this job's: trying again cannot help. */
export class BadImportJobError extends Error {
  readonly code = 'bad_job_data';
  readonly retryable = false;
  constructor() {
    super('The imports.run job has no importId.');
    this.name = 'BadImportJobError';
  }
}

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function runImport(deps: ImportJobDeps): JobHandler {
  return async (job: QueuedJob) => {
    const importId = job.ids['importId'];
    if (importId === undefined || !uuidShape.test(importId)) throw new BadImportJobError();
    // No account: the worker acts for nobody (T-226). The job's id ties its log lines together.
    const context = { leagueId: job.leagueId, accountId: null, requestId: job.id };
    const id = importId.toLowerCase();
    try {
      await deps.transaction(context, (tx) => readFixtureImport(tx, id));
    } catch (error) {
      // When the read can never succeed (the last attempt, or an error that is not retried),
      // the uploaded text must not stay in the import's row (T-80): replace it, then fail.
      const final =
        job.attempt >= maxJobAttempts ||
        (typeof error === 'object' &&
          error !== null &&
          'retryable' in error &&
          error.retryable === false);
      if (final) {
        try {
          await deps.transaction(context, (tx) => discardUnreadImport(tx, id));
        } catch {
          // The job still fails with its own error; the admin can discard the import.
        }
      }
      throw error;
    }
  };
}
