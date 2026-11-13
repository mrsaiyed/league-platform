import type { CommandBatch, CommandReply } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { tap } from './queue-storage-contract.test-helper.ts';
import { createFetchCommandTransport } from './fetch-command-transport.ts';

const leagueId = '00000000-0000-4000-8000-0000000000f1';
const gameId = '00000000-0000-4000-8000-0000000000a1';
const batch: CommandBatch = {
  protocolVersion: 1,
  sessionId: '00000000-0000-4000-8000-0000000000c1',
  commands: [tap(1)],
};
const reply: CommandReply = {
  protocolVersion: 1,
  sequence: 3,
  results: [{ commandId: tap(1).commandId, status: 'accepted' }],
};

function transportAnswering(answer: () => Promise<Response>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return answer();
  }) as typeof globalThis.fetch;
  return { calls, transport: createFetchCommandTransport({ leagueId, gameId, fetch }) };
}

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );

describe('fetch command transport', () => {
  it("posts the batch to the game's commands endpoint, named by the league's id (T-229)", async () => {
    const { calls, transport } = transportAnswering(() => json(200, reply));
    const signal = new AbortController().signal;
    expect(await transport.send(batch, signal)).toEqual({ kind: 'reply', reply });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`/api/v1/leagues/${leagueId}/games/${gameId}/commands`);
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.signal).toBe(signal);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(batch);
  });

  it('counts no network, a server error, a timeout and a page that is not our answer as unanswered', async () => {
    const signal = new AbortController().signal;
    const answers = [
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => json(503, { error: 'down' }),
      () => json(429, {}),
      () => json(408, {}),
      () => Promise.resolve(new Response('<html>Sign in to the Wi-Fi</html>', { status: 200 })),
      () => json(200, { protocolVersion: 1, sequence: 1, results: [] }),
    ];
    for (const answer of answers) {
      const { transport } = transportAnswering(answer);
      expect(await transport.send(batch, signal)).toEqual({ kind: 'unanswered' });
    }
  });

  it('passes on a version refusal, whatever its status (T-127)', async () => {
    const refusal = { error: 'unsupported-protocol-version', accepted: [2, 3] };
    const { transport } = transportAnswering(() => json(400, refusal));
    expect(await transport.send(batch, new AbortController().signal)).toEqual({
      kind: 'version-refused',
      refusal,
    });
  });

  it('reports a request turned away whole (signed out, not allowed, no such game) with its status', async () => {
    for (const status of [401, 403, 404]) {
      const { transport } = transportAnswering(() => json(status, { error: 'no' }));
      expect(await transport.send(batch, new AbortController().signal)).toEqual({
        kind: 'rejected',
        httpStatus: status,
      });
    }
  });

  it('reports a batch the server could not take as sent, so the queue can find the bad tap', async () => {
    for (const status of [400, 413, 422, 409]) {
      const { transport } = transportAnswering(() => json(status, { error: 'bad' }));
      expect(await transport.send(batch, new AbortController().signal)).toEqual({
        kind: 'batch-refused',
        httpStatus: status,
      });
    }
  });

  it('refuses to build an address from a league id that is not one', () => {
    expect(() => createFetchCommandTransport({ leagueId: 'not-an-id', gameId })).toThrow(TypeError);
  });
});
