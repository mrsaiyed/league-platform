import { describe, expect, it } from 'vitest';
import { requestKeyOf, requestTokenField, sameRequests, sameRequestsHere } from './same-request.ts';

const token = '0b6f7c1e-2a34-4d5e-8f90-1a2b3c4d5e6f';
const account = '01900000-0000-7000-8000-0000000000a1';

describe('a save sent twice is the same request (T-271)', () => {
  it('knows a post by who sent it, its token and exactly what it held', () => {
    const form = { [requestTokenField]: token, gameId: 'g', homeScore: '51' };
    const key = requestKeyOf(account, form);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    // The same form again, its fields in another order and the framework's own fields
    // aside, is the same request.
    const reordered = Object.fromEntries(Object.entries(form).reverse());
    expect(requestKeyOf(account, { $ACTION_KEY: 'k1', ...reordered })).toBe(key);
    // Something changed, someone else, or no token: not the same.
    expect(requestKeyOf(account, { ...form, homeScore: '52' })).not.toBe(key);
    expect(requestKeyOf('01900000-0000-7000-8000-0000000000a9', form)).not.toBe(key);
    expect(requestKeyOf(account, { gameId: 'g' })).toBeUndefined();
    expect(requestKeyOf(account, { [requestTokenField]: '<b>' })).toBeUndefined();
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
    const key = requestKeyOf(account, { [requestTokenField]: token, form: 'one store' });
    expect(await sameRequestsHere<string>().once(key, async () => 'first')).toBe('first');
    expect(await sameRequestsHere<string>().once(key, async () => 'second')).toBe('first');
  });
});
