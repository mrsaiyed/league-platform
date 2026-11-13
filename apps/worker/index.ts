// apps/worker: takes jobs from the queue and carries them out (T7 §1).
export { wireWorker, type WiredWorker, type WorkerSettings } from './src/wire-worker.ts';
export { jobHandlers, type JobHandlerDeps } from './src/jobs/job-handlers.ts';
