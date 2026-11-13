import { describe, expect, it } from 'vitest';
import { webHealth } from './health.ts';

const now = () => Date.UTC(2026, 10, 13, 12, 0, 0);

describe('webHealth', () => {
  it('answers 200 and ok once the app has started', async () => {
    const answer = await webHealth({ started: async () => ({}), now });
    expect(answer).toEqual({
      httpStatus: 200,
      body: {
        status: 'ok',
        app: 'web',
        checks: { startup: 'ok' },
        time: '2026-11-13T12:00:00.000Z',
      },
    });
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
    expect(answer.body.checks.startup).toBe('failed');
    expect(JSON.stringify(answer)).not.toContain('secret-password');
  });
});
