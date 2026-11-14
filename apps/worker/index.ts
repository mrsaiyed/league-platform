// apps/worker: takes jobs from the queue and carries them out (T7 §1). The program
// itself is src/main.ts (`npm run start:worker`).
export { wireWorker, type WiredWorker, type WorkerSettings } from './src/wire-worker.ts';
export {
  startWorker,
  WorkerStartError,
  type RunningWorker,
  type StartWorkerDeps,
} from './src/start-worker.ts';
export {
  loadWorkerConfig,
  WorkerConfigError,
  workerFields,
  type WorkerConfig,
} from './src/config-schema.ts';
export {
  createHeartbeat,
  startHealthServer,
  type Heartbeat,
  type HeartbeatOptions,
  type WorkerHealth,
} from './src/health.ts';
export { jobHandlers, type JobHandlerDeps } from './src/jobs/job-handlers.ts';
export { runImport, BadImportJobError, type ImportJobDeps } from './src/jobs/import-job.ts';
