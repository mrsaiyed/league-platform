// The shapes of marking a game not started (step 2.121).
import { describe, expect, it } from 'vitest';
import {
  NotStartedReply,
  NotStartedRequest,
  notStartedRefusals,
  notStartedStatus,
  ownNotStartedReply,
} from './not-started.ts';

describe('marking a game not started: the request', () => {
  it('takes the sequence seen and a reason, which may be left out', () => {
    expect(NotStartedRequest.parse({ sequence: 4 })).toEqual({ sequence: 4 });
    expect(NotStartedRequest.parse({ sequence: 0, reason: '  Wrong game  ' })).toEqual({
      sequence: 0,
      reason: 'Wrong game',
    });
  });

  it('refuses anything else: no sequence, a blank or long reason, other fields', () => {
    for (const body of [
      {},
      { sequence: -1 },
      { sequence: 1.5 },
      { sequence: 2, reason: '   ' },
      { sequence: 2, reason: 'x'.repeat(1001) },
      { sequence: 2, gameId: '01900000-0000-7000-8000-000000000001' },
    ]) {
      expect(NotStartedRequest.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });
});

describe('marking a game not started: the reply', () => {
  it('is sent at 200 when done, 403, 404, and 409 for every other refusal', () => {
    expect(notStartedStatus({ status: 'not-started', sequence: 5, sentAt: 1 })).toBe(200);
    const statuses = notStartedRefusals.map((code) =>
      notStartedStatus({ status: 'refused', code, sentAt: 1 }),
    );
    expect(statuses.filter((s) => s === 403)).toHaveLength(1);
    expect(statuses.filter((s) => s === 404)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(notStartedRefusals.length - 2);
  });

  it('is the server’s word only with its own body at its own status', () => {
    const refused = { status: 'refused', code: 'session-held', sentAt: 1 };
    expect(ownNotStartedReply(409, refused)).toEqual(refused);
    expect(ownNotStartedReply(403, refused)).toBeNull();
    expect(ownNotStartedReply(409, { error: 'conflict' })).toBeNull();
    expect(ownNotStartedReply(409, { ...refused, code: 'teapot' })).toBeNull();
    expect(NotStartedReply.safeParse({ ...refused, extra: true }).success).toBe(false);
  });
});
