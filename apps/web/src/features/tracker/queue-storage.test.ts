import { describe, expect, it } from 'vitest';
import { createMemoryQueueStorage } from './memory-queue-storage.ts';
import { inLeague, madeBy } from './queue-storage.ts';

const game = '00000000-0000-4000-8000-00000000a001';
const player = '00000000-0000-4000-8000-0000000000b1';
const tap = (n: number) => ({
  commandId: `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`,
  at: n,
  input: { type: 'score' as const, side: 'home' as const, playerId: player, points: 2 as const },
});

describe('the taps of one account (T-321)', () => {
  it('counts a tap as the account’s own only when it made it; one kept with no maker is nobody’s (T-327)', () => {
    expect(madeBy({ accountId: 'account-1' }, 'account-1')).toBe(true);
    expect(madeBy({ accountId: 'account-1' }, 'account-2')).toBe(false);
    expect(madeBy({ accountId: 'account-1' }, null)).toBe(false);
    // Stored before this release: never sent, listed to nobody.
    expect(madeBy({}, 'account-2')).toBe(false);
    expect(madeBy({}, null)).toBe(false);
  });

  it('keeps league and account with each tap, and lists a game’s queue for its account only', async () => {
    const device = createMemoryQueueStorage();
    const first = inLeague(device, 'league-1', 'account-1');
    const second = inLeague(device, 'league-1', 'account-2');
    await first.add(game, { protocolVersion: 1, command: tap(1) });
    await second.add(game, { protocolVersion: 1, command: tap(2) });
    // The second account's tracker never sees, so never sends, the first one's tap.
    expect((await second.list(game)).map((e) => e.command.commandId)).toEqual([tap(2).commandId]);
    expect((await first.list(game)).map((e) => [e.leagueId, e.accountId])).toEqual([
      ['league-1', 'account-1'],
    ]);
    // Both stay on the device, each for its own account.
    expect(device.all().map((e) => e.accountId)).toEqual(['account-1', 'account-2']);
  });

  // T-373: a taken tap the device no longer held, stored at the end, is still the maker's
  // after a reload, so "Send these plays" still names it as the device's own.
  it('keeps league and account with a taken tap stored anew, and lists it to its maker only', async () => {
    const device = createMemoryQueueStorage();
    const first = inLeague(device, 'league-1', 'account-1');
    await first.settle(game, { taken: [{ protocolVersion: 2, command: tap(3), sessionId: 's' }] });
    expect((await first.list(game)).map((e) => [e.state, e.leagueId, e.accountId])).toEqual([
      ['taken', 'league-1', 'account-1'],
    ]);
    expect(await inLeague(device, 'league-1', 'account-2').list(game)).toEqual([]);
  });
});
