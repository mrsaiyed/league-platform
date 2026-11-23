// Step 2.46: what a public page's script takes from the signed-in request for the numbers it
// leaves out, and where it asks. Anything but the server's own answer is "nothing more", so
// the page stays as everyone gets it; the address carries only what the page already shows.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffNumbersAddress } from './staff-numbers-address.ts';
import { browserReadStaffNumbers, staffNumbersReply } from './staff-numbers-reply.ts';

const league = { id: '01900000-0000-7000-8000-000000000001' };
const season = '01900000-0000-7000-8000-0000000000c1';
const notice = { title: 'Not public', text: 'Shown to staff.' };

afterEach(() => vi.unstubAllGlobals());

describe('the staff numbers address', () => {
  it("is the league's endpoint, built by the one helper, with the page's question", () => {
    expect(staffNumbersAddress(league, { page: 'stats', season, by: 'total' })).toBe(
      `/api/v1/leagues/${league.id}/staff-numbers?page=stats&season=${season}&by=total`,
    );
    expect(staffNumbersAddress(league, { page: 'game', game: season })).toBe(
      `/api/v1/leagues/${league.id}/staff-numbers?page=game&game=${season}`,
    );
  });
});

describe('the staff numbers reply', () => {
  it("takes nothing more, or a page's note and view of its own kind", () => {
    expect(staffNumbersReply.parse({ more: null })).toEqual({ more: null });
    const stats = { page: 'stats', notice, view: { kind: 'tables', players: {} } };
    expect(staffNumbersReply.parse({ more: stats }).more).toEqual(stats);
    for (const wrong of [
      {},
      { more: { page: 'stats', notice, view: { kind: 'empty' } } },
      { more: { page: 'team', notice, view: { kind: 'none' } } },
      { more: { page: 'stats', view: { kind: 'tables' } } },
      { more: { page: 'everything', notice, view: {} } },
    ]) {
      expect(staffNumbersReply.safeParse(wrong).success, JSON.stringify(wrong)).toBe(false);
    }
  });

  it('reads once with the sign-in of this device, kept by no cache, and fails to nothing more', async () => {
    const calls: { address: string; init: RequestInit | undefined }[] = [];
    const answers = [
      new Response(JSON.stringify({ more: { page: 'game', notice, view: {} } })),
      new Response(JSON.stringify({ more: null })),
      new Response('{"error":"not-found"}', { status: 404 }),
      new Response('not json'),
      new Response(JSON.stringify({ more: { page: 'stats', notice, view: { kind: 'x' } } })),
    ];
    vi.stubGlobal('fetch', async (address: string, init?: RequestInit) => {
      calls.push({ address, init });
      const next = answers.shift();
      if (next === undefined) throw new Error('offline');
      return next;
    });
    expect(await browserReadStaffNumbers('/a')).toEqual({ page: 'game', notice, view: {} });
    for (let i = 0; i < 5; i += 1) expect(await browserReadStaffNumbers('/a')).toBeNull();
    expect(calls[0]?.init).toMatchObject({ credentials: 'same-origin', cache: 'no-store' });
  });
});
