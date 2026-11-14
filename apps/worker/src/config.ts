// T-30: the only file in the worker that reads process.env: the settings, once, at
// start-up. Everything else is handed them; the structure check fails the build on a
// read of process.env anywhere else.
import { loadWorkerConfig, type WorkerConfig } from './config-schema.ts';

let cached: WorkerConfig | undefined;

/** Reads and checks the environment on first use; later calls return the same object. */
export function getWorkerConfig(): WorkerConfig {
  cached ??= loadWorkerConfig(process.env);
  return cached;
}
