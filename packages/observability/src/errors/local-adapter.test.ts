import { describe, expect, it } from 'vitest';
import { createLogger, memorySink } from '../logging/logger.ts';
import { loggerErrorReporter, memoryErrorReporter } from './local-adapter.ts';

const makeError = () => {
  const err = new Error('failed for sam@example.com with Bearer abcdefgh12345678');
  err.stack = 'Error: failed for sam@example.com\n    at run (file.ts:1:1)';
  return err;
};
const context = { requestId: 'req-1', leagueId: 'l1', tags: { email: 'sam@example.com' } };

describe('local adapters', () => {
  it('memory adapter scrubs before keeping the report', () => {
    const { reporter, reports } = memoryErrorReporter();
    reporter.capture(makeError(), context);
    const text = JSON.stringify(reports);
    expect(text).not.toContain('sam@example.com');
    expect(text).not.toContain('abcdefgh12345678');
    expect(reports[0]).toMatchObject({ name: 'Error', context: { requestId: 'req-1' } });
  });

  it('accepts things that are not errors', () => {
    const { reporter, reports } = memoryErrorReporter();
    reporter.capture('plain text for sam@example.com');
    expect(reports[0]?.message).toBe('plain text for [redacted]');
  });

  it('logger adapter keeps the scrubbed message and the ids, with no personal content', () => {
    const { sink, lines } = memorySink();
    loggerErrorReporter(createLogger({ sink })).capture(makeError(), context);
    const line = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(lines[0]).not.toContain('sam@example.com');
    expect(line).toMatchObject({ level: 'error', requestId: 'req-1', leagueId: 'l1' });
    expect(line.errorMessage).toBe('failed for [redacted] with [redacted]');
    expect(line.errorName).toBe('Error');
  });
});
