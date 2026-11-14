import type { SessionReply } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { createFetchTrackerServer } from './fetch-tracker-server.ts';

const leagueId = '00000000-0000-4000-8000-0000000000f1';
const gameId = '00000000-0000-4000-8000-0000000000a1';
const sessionId = '00000000-0000-4000-8000-0000000000c1';

function serverAnswering(answer: () => Promise<Response>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return answer();
  }) as typeof globalThis.fetch;
  return { calls, server: createFetchTrackerServer({ leagueId, gameId, fetch }) };
}

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
const signal = new AbortController().signal;

describe('fetch tracker server: the session', () => {
  it("posts the request to the game's session endpoint, named by the league's id (T-229)", async () => {
    const reply: SessionReply = { status: 'held-by-you', sessionId, expiresAt: 9, sentAt: 5 };
    const { calls, server } = serverAnswering(() => json(200, reply));
    const request = { type: 'open', deviceId: 'tablet' } as const;
    expect(await server.session(request, signal)).toEqual({ kind: 'answer', value: reply });
    expect(calls[0]?.url).toBe(`/api/v1/leagues/${leagueId}/games/${gameId}/session`);
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.signal).toBe(signal);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(request);
  });

  it('is sent even as the page goes away, so leaving the page releases the session', async () => {
    const reply: SessionReply = { status: 'ended', reason: 'released', sentAt: 5 };
    const { calls, server } = serverAnswering(() => json(200, reply));
    await server.session({ type: 'release', sessionId }, signal);
    expect(calls[0]?.init?.keepalive).toBe(true);
  });

  it('reads a refusal from its body, whatever the status', async () => {
    const reply: SessionReply = { status: 'refused', code: 'game-not-live', sentAt: 5 };
    const { server } = serverAnswering(() => json(409, reply));
    expect(await server.session({ type: 'renew', sessionId }, signal)).toEqual({
      kind: 'answer',
      value: reply,
    });
  });

  it('is turned away when signed out, and unanswered with no network or a page not ours', async () => {
    const answers: [() => Promise<Response>, string][] = [
      [() => json(401, { error: 'signed-out' }), 'rejected'],
      [() => Promise.reject(new TypeError('Failed to fetch')), 'unanswered'],
      [() => json(503, {}), 'unanswered'],
      [() => Promise.resolve(new Response('<html>Wi-Fi</html>', { status: 200 })), 'unanswered'],
    ];
    for (const [answer, kind] of answers) {
      const { server } = serverAnswering(answer);
      expect((await server.session({ type: 'renew', sessionId }, signal)).kind).toBe(kind);
    }
  });
});

describe('fetch tracker server: the state', () => {
  it("reads the game's state endpoint as the engine's state", async () => {
    const state = basketball.newGame();
    const { calls, server } = serverAnswering(() => json(200, { sequence: 4, state }));
    expect(await server.loadState(signal)).toEqual({
      kind: 'answer',
      value: { sequence: 4, state },
    });
    expect(calls[0]?.url).toBe(`/api/v1/leagues/${leagueId}/games/${gameId}/state`);
    expect(calls[0]?.init?.method).toBe('GET');
    expect(calls[0]?.init?.cache).toBe('no-store');
  });

  it('is turned away for 401, 403 and 404, and unanswered otherwise', async () => {
    for (const status of [401, 403, 404]) {
      const { server } = serverAnswering(() => json(status, { error: 'x' }));
      expect(await server.loadState(signal)).toEqual({ kind: 'rejected', httpStatus: status });
    }
    const notState = serverAnswering(() => json(200, { sequence: 1, state: { version: 2 } }));
    expect(await notState.server.loadState(signal)).toEqual({ kind: 'unanswered' });
    const down = serverAnswering(() => Promise.reject(new TypeError('offline')));
    expect(await down.server.loadState(signal)).toEqual({ kind: 'unanswered' });
  });
});
