// Retries and the failed list (T7 §5), and what is kept of an error (T-86).
import { describe, expect, it } from 'vitest';
import { EmailSendError, type EmailSendErrorCode } from '../email/index.ts';
import {
  afterFailure,
  errorCodeOf,
  jobRetryWaitSeconds,
  maxJobAttempts,
  type JobErrorCode,
} from './job-failures.ts';

describe('jobRetryWaitSeconds', () => {
  it('waits longer each time, about an hour over five attempts', () => {
    const waits = [1, 2, 3, 4].map(jobRetryWaitSeconds);
    expect(waits).toEqual([120, 300, 900, 2400]);
    const total = waits.reduce((sum, wait) => sum + wait, 0);
    expect(total).toBeGreaterThan(45 * 60);
    expect(total).toBeLessThan(75 * 60);
    expect(jobRetryWaitSeconds(9)).toBe(2400);
    expect(jobRetryWaitSeconds(0)).toBe(120);
  });
});

describe('errorCodeOf', () => {
  it('keeps a known code of the error, never its message', () => {
    // Every email failure code is one a job may keep (checked by the type checker).
    const emailCodesAreJobCodes: EmailSendErrorCode extends JobErrorCode ? true : false = true;
    expect(emailCodesAreJobCodes).toBe(true);
    expect(errorCodeOf(new EmailSendError('rate-limited', true))).toBe('rate-limited');
    expect(errorCodeOf(new TypeError('bad someone@example.test'))).toBe('unexpected');
    expect(errorCodeOf(Object.assign(new Error('x'), { code: 'john.smith' }))).toBe('unexpected');
    expect(errorCodeOf({ code: 'no_handler' })).toBe('no_handler');
    expect(errorCodeOf(new Error('Could not reach someone@example.test'))).toBe('unexpected');
    expect(errorCodeOf(Object.assign(new Error('x'), { code: 'has spaces in it' }))).toBe(
      'unexpected',
    );
    expect(errorCodeOf('a thrown string')).toBe('unexpected');
    expect(errorCodeOf(null)).toBe('unexpected');
  });
});

describe('afterFailure', () => {
  it('tries again until the last attempt, then fails', () => {
    const error = new Error('down');
    expect(afterFailure(error, 1, maxJobAttempts)).toEqual({
      outcome: 'retry',
      inSeconds: 120,
      errorCode: 'unexpected',
    });
    expect(afterFailure(error, 4, maxJobAttempts)).toMatchObject({
      outcome: 'retry',
      inSeconds: 2400,
    });
    expect(afterFailure(error, 5, maxJobAttempts)).toEqual({
      outcome: 'failed',
      errorCode: 'unexpected',
    });
  });

  it('fails at once an error that says it cannot succeed', () => {
    expect(afterFailure(new EmailSendError('rejected', false), 1, maxJobAttempts)).toEqual({
      outcome: 'failed',
      errorCode: 'rejected',
    });
  });
});
