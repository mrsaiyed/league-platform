import { describe, expect, it } from 'vitest';
import { webHealth } from './health.ts';

const now = () => Date.UTC(2026, 10, 13, 12, 0, 0);
/** A wait that never ends: the database's own answer decides. */
const never = () => new Promise<void>(() => {});

describe('webHealth', () => {
  it('answers 200 and ok once the app has started and its database answers', async () => {
    const answer = await webHealth({
      started: async () => ({ databaseCheck: async () => true }),
      now,
      wait: never,
    });
    expect(answer).toEqual({
      httpStatus: 200,
      body: {
        status: 'ok',
        app: 'web',
        checks: { startup: 'ok', database: 'ok' },
        time: '2026-11-13T12:00:00.000Z',
      },
    });
  });

  it('says there is no database on the made-up stand-in, and is ok', async () => {
    const answer = await webHealth({ started: async () => ({ databaseCheck: null }), now });
    expect(answer.httpStatus).toBe(200);
    expect(answer.body.checks).toEqual({ startup: 'ok', database: 'none' });
  });

  it('answers 503 and down when the database does not answer, fails, or takes too long', async () => {
    const answers = [
      webHealth({ started: async () => ({ databaseCheck: async () => false }), now, wait: never }),
      webHealth({
        started: async () => ({
          databaseCheck: async () => {
            throw new Error('postgres://app:secret-password@db.internal/league');
          },
        }),
        now,
        wait: never,
      }),
      // A database that hangs: the time limit answers.
      webHealth({
        started: async () => ({ databaseCheck: () => new Promise<boolean>(() => {}) }),
        now,
        wait: async () => {},
      }),
    ];
    for (const answer of await Promise.all(answers)) {
      expect(answer.httpStatus).toBe(503);
      expect(answer.body.status).toBe('down');
      expect(answer.body.checks).toEqual({ startup: 'ok', database: 'failed' });
      expect(JSON.stringify(answer)).not.toContain('secret-password');
    }
  });

  it('answers 503 and down when the app could not start, without the reason', async () => {
    const answer = await webHealth({
      started: async () => {
        throw new Error('postgres://app:secret-password@db.internal/league');
      },
      now,
    });
    expect(answer.httpStatus).toBe(503);
    expect(answer.body.status).toBe('down');
    expect(answer.body.checks).toEqual({ startup: 'failed', database: 'failed' });
    expect(JSON.stringify(answer)).not.toContain('secret-password');
  });

  it('answers 503 when started throws at once instead of rejecting', async () => {
    const answer = await webHealth({
      started: () => {
        throw new Error('a setting is missing');
      },
      now,
    });
    expect(answer.httpStatus).toBe(503);
    expect(answer.body.checks.startup).toBe('failed');
  });
});
