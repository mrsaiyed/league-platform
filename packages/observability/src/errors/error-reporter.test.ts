import { describe, expect, it } from 'vitest';
import { createErrorReporter, type ErrorReport } from './error-reporter.ts';

const collect = () => {
  const reports: ErrorReport[] = [];
  return { reporter: createErrorReporter((r) => void reports.push(r)), reports };
};

describe('createErrorReporter', () => {
  it('describes any thrown value safely and never throws', () => {
    const { reporter, reports } = collect();
    const bare = Object.create(null) as object;
    const hostile = {
      get message(): string {
        throw new Error('no');
      },
    };
    for (const value of [null, undefined, 42, Symbol('s'), bare, hostile, { message: 'x@y.com' }]) {
      expect(() => reporter.capture(value)).not.toThrow();
    }
    expect(reports.length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(reports)).not.toContain('x@y.com');
  });

  it('handles a missing or non-string stack', () => {
    const { reporter, reports } = collect();
    const err = new Error('x');
    (err as { stack: unknown }).stack = { not: 'a string' };
    reporter.capture(err);
    expect(reports[0]?.stack).toBe('');
  });
});
