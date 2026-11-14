// The worker program: `npm run start:worker`. Reads the settings once (config.ts),
// starts (start-worker.ts), and on SIGTERM or SIGINT, as a host sends when it stops
// or replaces the service, stops taking jobs and waits for the ones in hand (T7 §9).
// Any problem at start-up ends it with exit code 1 and plain words naming a setting,
// never its value.
import { consoleSink, createLogger } from '@srleagues/observability';
import { getWorkerConfig } from './config.ts';
import { WorkerConfigError, type WorkerConfig } from './config-schema.ts';
import { startWorker, WorkerStartError } from './start-worker.ts';

let config: WorkerConfig;
try {
  config = getWorkerConfig();
} catch (error) {
  // Before the logger exists: its level is one of these settings.
  console.error(error instanceof WorkerConfigError ? error.message : 'The worker cannot start.');
  process.exit(1);
}

const logger = createLogger({
  sink: consoleSink,
  level: config.LOG_LEVEL,
  base: { app: 'worker' },
});

try {
  const running = await startWorker(config, { logger });
  let signalled = false;
  const stop = (signal: string) => {
    if (signalled) return;
    signalled = true;
    logger.info('worker.signal', { signal });
    running.stop().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
} catch (error) {
  logger.error('worker.start_failed', {
    kind: error instanceof Error ? error.name : typeof error,
    reason: error instanceof WorkerStartError ? error.message : 'unexpected',
  });
  process.exit(1);
}
