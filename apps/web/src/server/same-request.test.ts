import { describe, expect, it } from 'vitest';
import { requestKeyOf, requestTokenField, sameRequests, sameRequestsHere } from './same-request.ts';

const token = '0b6f7c1e-2a34-4d5e-8f90-1a2b3c4d5e6f';
const account = '01900000-0000-7000-8000-0000000000a1';
const leagueId = '01900000-0000-7000-8000-000000000001';
const me = { leagueId, accountId: account };

describe('a save sent twice is the same request (T-271)', () => {
  it('knows a post by who sent it, its token and exactly what it held', () => {
    const form = { [requestTokenField]: token, gameId: 'g', homeScore: '51' };
    const key = requestKeyOf(me, form);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    // The same form again, its fields in another order and the framework's own fields
    // aside, is the same request.
    const reordered = Object.fromEntries(Object.entries(form).reverse());
    expect(requestKeyOf(me, { $ACTION_KEY: 'k1', ...reordered })).toBe(key);
    // Something changed, someone else, or no token: not the same.
    expect(requestKeyOf(me, { ...form, homeScore: '52' })).not.toBe(key);
    expect(
      requestKeyOf({ ...me, accountId: '01900000-0000-7000-8000-0000000000a9' }, form),
    ).not.toBe(key);
    // The same form posted in another league (the session's, not the form's) is not the same.
    expect(
      requestKeyOf({ ...me, leagueId: '01900000-0000-7000-8000-000000000002' }, form),
    ).not.toBe(key);
    expect(requestKeyOf(me, { gameId: 'g' })).toBeUndefined();
    expect(requestKeyOf(me, { [requestTokenField]: '<b>' })).toBeUndefined();
  });

  it('answers a second post as the first, even while the first is still running', async () => {
    const requests = sameRequests<string>({ keepMs: 60_000, most: 10 });
    let runs = 0;
    let finish: (value: string) => void = () => {};
    const slow = () =>
      new Promise<string>((resolve) => {
        runs += 1;
        finish = resolve;
      });
    const first = requests.once('k', slow);
    const second = requests.once('k', slow);
    finish('saved');
    expect(await first).toBe('saved');
    expect(await second).toBe('saved');
    expect(await requests.once('k', async () => 'again')).toBe('saved');
    expect(runs).toBe(1);
  });

  it('keeps nothing for a post with no key, or one that failed outright', async () => {
    const requests = sameRequests<string>({ keepMs: 60_000, most: 10 });
    let runs = 0;
    const run = async () => `run ${(runs += 1)}`;
    expect(await requests.once(undefined, run)).toBe('run 1');
    expect(await requests.once(undefined, run)).toBe('run 2');
    await expect(
      requests.once('k', async () => {
        throw new Error('the database did not answer');
      }),
    ).rejects.toThrow();
    expect(await requests.once('k', run)).toBe('run 3');
  });

  it('forgets an answer after its time, and the oldest when it holds the most', async () => {
    let clock = 0;
    const requests = sameRequests<string>({ keepMs: 1000, most: 2, now: () => clock });
    await requests.once('a', async () => 'a1');
    clock = 1500;
    expect(await requests.once('a', async () => 'a2')).toBe('a2');
    await requests.once('b', async () => 'b1');
    await requests.once('c', async () => 'c1');
    expect(await requests.once('a', async () => 'a3')).toBe('a3');
    expect(await requests.once('c', async () => 'c2')).toBe('c1');
  });

  it('is one store for the whole server', async () => {
    const key = requestKeyOf(me, { [requestTokenField]: token, form: 'one store' });
    expect(await sameRequestsHere<string>().once(key, async () => 'first')).toBe('first');
    expect(await sameRequestsHere<string>().once(key, async () => 'second')).toBe('first');
  });

  it('never drops a request still running to make room, even past its time', async () => {
    let clock = 0;
    const requests = sameRequests<string>({ keepMs: 1000, most: 2, now: () => clock });
    let finish: (value: string) => void = () => {};
    const running = requests.once(
      'slow',
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    await requests.once('a', async () => 'a1');
    await requests.once('b', async () => 'b1');
    clock = 5000;
    await requests.once('c', async () => 'c1');
    // The slow one is still running: its repeat waits for it and runs nothing.
    const again = requests.once('slow', async () => 'ran twice');
    finish('slow answer');
    expect(await running).toBe('slow answer');
    expect(await again).toBe('slow answer');
    // The settled ones made way.
    expect(await requests.once('a', async () => 'a2')).toBe('a2');
  });

  it('forgets a request that failed outright, and only that one', async () => {
    const requests = sameRequests<string>({ keepMs: 60_000, most: 10 });
    await requests.once('ok', async () => 'kept');
    await expect(
      requests.once('broken', async () => {
        throw new Error('no answer');
      }),
    ).rejects.toThrow();
    expect(await requests.once('broken', async () => 'second try')).toBe('second try');
    expect(await requests.once('ok', async () => 'not run')).toBe('kept');
  });

  it('gives a kept answer only while it holds, else runs again (a stale "Bring it back")', async () => {
    let at = 0;
    const store = sameRequests<string>({ keepMs: 1000, most: 10, now: () => at });
    let runs = 0;
    const run = async () => `back ${++runs}`;
    let inBin = false;
    const holds = async () => !inBin;
    expect(await store.once('k', run, holds)).toBe('back 1');
    at = 10;
    // Still out of the bin: the second post is the first, nothing runs again.
    expect(await store.once('k', run, holds)).toBe('back 1');
    expect(runs).toBe(1);
    // Binned again meanwhile: the old page's post brings it back again, and says so.
    inBin = true;
    const [one, two] = await Promise.all([
      store.once('k', run, holds),
      store.once('k', run, holds),
    ]);
    expect([one, two]).toEqual(['back 2', 'back 2']);
    expect(runs).toBe(2);
    // With no `holds`, a kept answer is given as before.
    expect(await store.once('k', run)).toBe('back 2');
  });
});
