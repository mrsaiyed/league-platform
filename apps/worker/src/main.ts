// The worker program: `npm run start:worker`. Reads the settings once (config.ts),
// starts (start-worker.ts), and on SIGTERM or SIGINT, as a host sends when it stops
// or replaces the service, stops taking jobs and waits for the ones in hand (T7 §9).
// Any problem at start-up ends it with exit code 1 and plain words naming a setting,
// never its value.
//
// It never calls process.exit straight after a log line, which could cut the line
// off: it sets the exit code and lets the program end once nothing is left open.
// A last timer, which does not itself keep the program alive, ends it anyway a
// moment later if something does.
import { consoleSink, createLogger } from '@srleagues/observability';
import { getWorkerConfig } from './config.ts';
import { WorkerConfigError, type WorkerConfig } from './config-schema.ts';
import { startWorker, WorkerStartError, type RunningWorker } from './start-worker.ts';

/**
 * How long the jobs in hand get to finish after a stop signal. Under the time a host
 * usually waits before it kills the program (30 seconds on Render, not verified).
 */
const stopTimeoutMs = 25_000;

function endWith(code: number): void {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1_000).unref();
}

const kindOf = (error: unknown) => (error instanceof Error ? error.name : typeof error);

async function main(): Promise<void> {
  let config: WorkerConfig;
  try {
    config = getWorkerConfig();
  } catch (error) {
    // Before the logger exists: its level is one of these settings.
    console.error(error instanceof WorkerConfigError ? error.message : 'The worker cannot start.');
    endWith(1);
    return;
  }

  const logger = createLogger({
    sink: consoleSink,
    level: config.LOG_LEVEL,
    base: { app: 'worker' },
  });

  let running: RunningWorker;
  try {
    running = await startWorker(config, { logger });
  } catch (error) {
    // startWorker has already closed whatever it opened.
    logger.error('worker.start_failed', {
      kind: kindOf(error),
      reason: error instanceof WorkerStartError ? error.message : 'unexpected',
    });
    endWith(1);
    return;
  }

  let signalled = false;
  const stop = (signal: string) => {
    if (signalled) return;
    signalled = true;
    logger.info('worker.signal', { signal });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tooLong = new Promise<'too long'>((resolve) => {
      timer = setTimeout(() => resolve('too long'), stopTimeoutMs);
    });
    Promise.race([running.stop().then(() => 'stopped' as const), tooLong]).then(
      (outcome) => {
        clearTimeout(timer);
        if (outcome === 'too long') {
          logger.error('worker.stop_timeout', { afterMs: stopTimeoutMs });
          endWith(1);
        } else {
          endWith(0);
        }
      },
      (error: unknown) => {
        clearTimeout(timer);
        logger.error('worker.stop_failed', { kind: kindOf(error) });
        endWith(1);
      },
    );
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

await main();
