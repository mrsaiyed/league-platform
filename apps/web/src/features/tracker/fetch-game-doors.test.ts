import type { NotStartedReply, ReopenOffer, ReopenReply } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { createFetchGameDoors } from './fetch-game-doors.ts';

const leagueId = '00000000-0000-4000-8000-0000000000f1';
const gameId = '00000000-0000-4000-8000-0000000000a1';
const requestId = '00000000-0000-4000-8000-0000000000b1';

function doorsAnswering(answer: () => Promise<Response>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return answer();
  }) as typeof globalThis.fetch;
  return { calls, doors: createFetchGameDoors({ leagueId, gameId, fetch }) };
}

const json = (status: number, body: unknown) => () =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
const page = (status: number) => () =>
  Promise.resolve(
    new Response('<html>Sign in to the gym Wi-Fi</html>', {
      status,
      headers: { 'content-type': 'text/html' },
    }),
  );
const signal = new AbortController().signal;

describe('fetch game doors: Reopen', () => {
  it("reads the offer from the game's reopen address, named by the league's id (T-229)", async () => {
    const offer: ReopenOffer = {
      reopen: { when: 'until', until: 9_000 },
      endedBy: { displayName: 'Sam Scorekeeper' },
      sentAt: 5,
    };
    const { calls, doors } = doorsAnswering(json(200, offer));
    expect(await doors.reopenOffer(signal)).toEqual({ kind: 'answer', value: offer });
    expect(calls[0]?.url).toBe(`/api/v1/leagues/${leagueId}/games/${gameId}/reopen`);
    expect(calls[0]?.init?.method).toBe('GET');
  });

  it('posts the reopen, and a refusal at its own status is an answer', async () => {
    const reopened: ReopenReply = { status: 'reopened', sequence: 7, sentAt: 5 };
    const taken = doorsAnswering(json(200, reopened));
    const request = { requestId, reason: 'End game tapped by mistake', sequence: 6 };
    expect(await taken.doors.reopen(request, signal)).toEqual({ kind: 'answer', value: reopened });
    expect(taken.calls[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(taken.calls[0]?.init?.body))).toEqual(request);

    const late: ReopenReply = {
      status: 'refused',
      code: 'reopen-time-over',
      endedBy: null,
      sentAt: 5,
    };
    expect(await doorsAnswering(json(403, late)).doors.reopen(request, signal)).toEqual({
      kind: 'answer',
      value: late,
    });
    // The same body at another status is not the server's word.
    expect(await doorsAnswering(json(200, late)).doors.reopen(request, signal)).toEqual({
      kind: 'unanswered',
    });
  });

  it('signed out is the server’s own refusal; a page in between or no network is no answer', async () => {
    const request = { requestId, reason: 'x' };
    expect(
      await doorsAnswering(json(401, { error: 'signed-out' })).doors.reopen(request, signal),
    ).toEqual({ kind: 'rejected', httpStatus: 401, error: 'signed-out' });
    expect(await doorsAnswering(page(403)).doors.reopen(request, signal)).toEqual({
      kind: 'unanswered',
    });
    expect(await doorsAnswering(page(200)).doors.reopenOffer(signal)).toEqual({
      kind: 'unanswered',
    });
    const down = doorsAnswering(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await down.doors.reopenOffer(signal)).toEqual({ kind: 'unanswered' });
  });
});

describe('fetch game doors: Mark not started', () => {
  it("posts to the game's not-started address and reads the reply at its own status", async () => {
    const done: NotStartedReply = { status: 'not-started', sequence: 4, sentAt: 5 };
    const { calls, doors } = doorsAnswering(json(200, done));
    expect(await doors.markNotStarted({ sequence: 3 }, signal)).toEqual({
      kind: 'answer',
      value: done,
    });
    expect(calls[0]?.url).toBe(`/api/v1/leagues/${leagueId}/games/${gameId}/not-started`);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ sequence: 3 });

    const refused: NotStartedReply = { status: 'refused', code: 'plays-recorded', sentAt: 5 };
    expect(
      await doorsAnswering(json(409, refused)).doors.markNotStarted({ sequence: 3 }, signal),
    ).toEqual({ kind: 'answer', value: refused });
    expect(
      await doorsAnswering(json(403, refused)).doors.markNotStarted({ sequence: 3 }, signal),
    ).toEqual({ kind: 'unanswered' });
  });
});
