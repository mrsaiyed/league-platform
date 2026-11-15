// The reopen's shapes (step 2.120): what the tracker sends, and which answers it takes as
// the server's own word. A refusal at another status, or a page that only looks like
// one, is no answer.
import { describe, expect, it } from 'vitest';
import {
  ownReopenOffer,
  ownReopenReply,
  ReopenRequest,
  reopenNotOfferedCodes,
  reopenRefusalCodes,
  reopenRefusalStatus,
} from './reopen-game.ts';

const requestId = '01900000-0000-7000-8000-00000000a001';

describe('ReopenRequest', () => {
  it('takes a request id and a reason, with the sequence when the device has one', () => {
    expect(ReopenRequest.parse({ requestId, reason: ' Tapped by mistake ' })).toEqual({
      requestId,
      reason: 'Tapped by mistake',
    });
    expect(ReopenRequest.parse({ requestId, reason: 'x', sequence: 7 }).sequence).toBe(7);
  });

  it('refuses no id, no reason, a long reason, a bad sequence and anything else', () => {
    for (const body of [
      { reason: 'x' },
      { requestId: 'not-an-id', reason: 'x' },
      { requestId, reason: '   ' },
      { requestId, reason: 'x'.repeat(1001) },
      { requestId, reason: 'x', sequence: 0 },
      { requestId, reason: 'x', gameId: requestId },
    ]) {
      expect(ReopenRequest.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });
});

describe('ownReopenReply', () => {
  it('takes "reopened" only at 200', () => {
    const body = { status: 'reopened', sequence: 8, sentAt: 1 };
    expect(ownReopenReply(200, body)).toEqual(body);
    expect(ownReopenReply(409, body)).toBeNull();
  });

  it('takes each refusal only at its own status, and has a status for every code', () => {
    for (const code of reopenRefusalCodes) {
      const status = reopenRefusalStatus[code];
      expect(status, code).toBeGreaterThanOrEqual(400);
      const body = { status: 'refused', code, endedBy: null, sentAt: 1 };
      expect(ownReopenReply(status, body), code).toEqual(body);
      expect(ownReopenReply(status === 403 ? 409 : 403, body), code).toBeNull();
      expect(ownReopenReply(200, body), code).toBeNull();
    }
    // Every reason Reopen is not offered is also a refusal.
    for (const code of reopenNotOfferedCodes) expect(reopenRefusalCodes).toContain(code);
  });

  it('names who ended the game, and takes nothing that only looks like a reply', () => {
    const named = {
      status: 'refused',
      code: 'not-ended-by-you',
      endedBy: { displayName: 'Dana Ruiz' },
      sentAt: 1,
    };
    expect(ownReopenReply(403, named)).toEqual(named);
    for (const body of [
      undefined,
      '<html>Sign in to the Wi-Fi</html>',
      { error: 'not-allowed' },
      { status: 'refused', code: 'not-allowed', sentAt: 1 },
      { status: 'refused', code: 'something-else', endedBy: null, sentAt: 1 },
      { status: 'reopened', sequence: 8, sentAt: 1, extra: true },
    ]) {
      expect(ownReopenReply(403, body)).toBeNull();
      expect(ownReopenReply(200, body)).toBeNull();
    }
  });
});

describe('ownReopenOffer', () => {
  it('takes the three answers at 200 only', () => {
    const offers = [
      { reopen: { when: 'always' }, endedBy: { displayName: 'Dana Ruiz' }, sentAt: 1 },
      { reopen: { when: 'until', until: 1_800_000 }, endedBy: null, sentAt: 1 },
      { reopen: { when: 'no', code: 'reopen-time-over' }, endedBy: null, sentAt: 1 },
    ];
    for (const offer of offers) {
      expect(ownReopenOffer(200, offer)).toEqual(offer);
      expect(ownReopenOffer(403, offer)).toBeNull();
    }
    expect(
      ownReopenOffer(200, {
        reopen: { when: 'no', code: 'not-allowed' },
        endedBy: null,
        sentAt: 1,
      }),
    ).toBeNull();
    expect(ownReopenOffer(200, '<html></html>')).toBeNull();
  });
});
