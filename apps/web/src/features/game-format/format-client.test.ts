// The page's format client (step 2.119): the address, the body it sends, the server's own
// replies read, and anything else (no answer, another body) taken as not saved.
import { describe, expect, it } from 'vitest';
import { createGameFormatClient } from './format-client.ts';

const leagueId = '01900000-0000-7000-8000-000000000001';
const gameId = '01900000-0000-7000-8000-006a00000001';

function client(status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}) {
  const fetch = (async (url: string, init: RequestInit) => {
    seen.url = url;
    seen.init = init;
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof globalThis.fetch;
  return createGameFormatClient({ leagueId, gameId, fetch });
}

describe('the format client', () => {
  it('sends the version and the format (null for the season’s) to the game’s format address', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const refused = { status: 'refused', code: 'under-way', sentAt: 1 };
    expect(await client(409, refused, seen).change(4, null)).toEqual({
      kind: 'refused',
      code: 'under-way',
    });
    expect(seen.url).toContain(`/games/${gameId}/format`);
    expect(seen.init?.method).toBe('PUT');
    expect(JSON.parse(String(seen.init?.body))).toEqual({ version: 4, format: null });
  });

  it('takes a reply at the wrong status, or no answer, as not saved', async () => {
    expect(await client(200, { status: 'refused', code: 'under-way', sentAt: 1 }).read()).toEqual({
      kind: 'failed',
    });
    const offline = createGameFormatClient({
      leagueId,
      gameId,
      fetch: (async () => {
        throw new TypeError('offline');
      }) as unknown as typeof globalThis.fetch,
    });
    expect(await offline.read()).toEqual({ kind: 'failed' });
  });
});
