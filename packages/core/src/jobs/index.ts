// The worker's side of the queue (T7 §1 and §5, record 012).
export {
  jobErrorCodes,
  type JobErrorCode,
  afterFailure,
  errorCodeOf,
  jobRetryWaitSeconds,
  maxJobAttempts,
  type AfterFailure,
} from './job-failures.ts';
export type { JobHandler, JobHandlers, JobRunLine, QueuedJob, WorkQueue } from './ports.ts';
