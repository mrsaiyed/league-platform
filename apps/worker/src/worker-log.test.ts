// The worker's log lines hold ids, fixed words and codes, never an error's message (T-86).
import { createLogger, memorySink } from '@srleagues/observability';
import { describe, expect, it } from 'vitest';
import { jobLogger, queueErrorLogger } from './worker-log.ts';

function logged() {
  const { sink, lines } = memorySink();
  const logger = createLogger({ sink, now: () => 0, base: { app: 'worker' } });
  return { logger, lines: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>) };
}

describe('queueErrorLogger', () => {
  it('writes the kind and a fixed code, never the message', () => {
    const { logger, lines } = logged();
    queueErrorLogger(logger)(new TypeError('could not reach someone@example.test'));
    expect(lines()).toEqual([
      {
        time: '1970-01-01T00:00:00.000Z',
        level: 'error',
        msg: 'worker.queue_error',
        kind: 'TypeError',
        errorCode: 'unexpected',
        app: 'worker',
      },
    ]);
    expect(JSON.stringify(lines())).not.toContain('example.test');
  });
});

describe('jobLogger', () => {
  const line = {
    jobId: '01900000-0000-7000-8000-0000000000f1',
    type: 'email.send',
    leagueId: '01900000-0000-7000-8000-000000000001',
    attempt: 1,
  } as const;

  it('writes each outcome at its level, with ids and the code only', () => {
    const { logger, lines } = logged();
    const log = jobLogger(logger);
    log({ ...line, outcome: 'done' });
    log({ ...line, attempt: 2, outcome: 'retry', errorCode: 'email_unavailable' });
    log({ ...line, attempt: 5, outcome: 'failed', errorCode: 'email_rejected' });
    expect(
      lines().map(({ level, msg, outcome, errorCode }) => ({ level, msg, outcome, errorCode })),
    ).toEqual([
      { level: 'info', msg: 'worker.job', outcome: 'done', errorCode: undefined },
      { level: 'warn', msg: 'worker.job', outcome: 'retry', errorCode: 'email_unavailable' },
      { level: 'error', msg: 'worker.job', outcome: 'failed', errorCode: 'email_rejected' },
    ]);
    expect(lines()[0]).toMatchObject(line);
  });
});
