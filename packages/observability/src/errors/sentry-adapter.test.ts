import { describe, expect, it } from 'vitest';
import { sentryErrorReporter, type SentryLikeClient } from './sentry-adapter.ts';

type Call = Parameters<SentryLikeClient['captureException']>;

const errorAt = (message: string, frame: string) => {
  const err = new Error(message);
  err.stack = `Error: ${message}\n    at ${frame}`;
  return err;
};
const context = { requestId: 'req-1', leagueId: 'l1', tags: { email: 'sam@example.com' } };

const setup = () => {
  const calls: Call[] = [];
  const reporter = sentryErrorReporter({ captureException: (...args) => void calls.push(args) });
  return { calls, reporter };
};

describe('Sentry adapter (unverified, injected client)', () => {
  it('passes only scrubbed data to the client', () => {
    const { calls, reporter } = setup();
    reporter.capture(errorAt('failed for sam@example.com', 'run (file.ts:1:1)'), context);
    expect(calls).toHaveLength(1);
    const [error, hint] = calls[0] as Call;
    expect(JSON.stringify(hint)).not.toContain('sam@example.com');
    expect(error.message).not.toContain('sam@example.com');
    expect(error.stack).not.toContain('sam@example.com');
  });

  it('carries the request and league ids as tags and extra data', () => {
    const { calls, reporter } = setup();
    reporter.capture(errorAt('x', 'run (file.ts:1:1)'), context);
    const hint = (calls[0] as Call)[1];
    expect(hint.tags).toMatchObject({ requestId: 'req-1', leagueId: 'l1' });
    expect(hint.extra).toMatchObject({ requestId: 'req-1', leagueId: 'l1' });
  });

  it('groups by name and first frame, not by message or line number', () => {
    const { calls, reporter } = setup();
    reporter.capture(errorAt('one', 'run (file.ts:1:1)'));
    reporter.capture(errorAt('two', 'run (file.ts:99:7)'));
    reporter.capture(errorAt('one', 'other (file.ts:1:1)'));
    const prints = calls.map((c) => c[1].fingerprint);
    expect(prints[0]).toEqual(prints[1]);
    expect(prints[0]).not.toEqual(prints[2]);
    expect(prints[0]?.[0]).toBe('Error');
  });

  it('falls back to the name when there is no stack', () => {
    const { calls, reporter } = setup();
    reporter.capture('just text');
    expect((calls[0] as Call)[1].fingerprint).toEqual(['Error']);
  });

  it('survives a throwing client', () => {
    const reporter = sentryErrorReporter({
      captureException: () => {
        throw new Error('offline');
      },
    });
    expect(() => reporter.capture(new Error('x'))).not.toThrow();
  });
});
