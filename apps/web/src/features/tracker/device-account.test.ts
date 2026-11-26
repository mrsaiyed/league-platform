import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  anotherPerson,
  clearDeviceAccount,
  markSignedInHere,
  readDeviceAccount,
  writeDeviceAccount,
} from './device-account.ts';
import {
  forgetOpenedGamesOnDevice,
  openIndexedDbOpenedGameStorage,
} from './indexeddb-opened-game-storage.ts';
import { openIndexedDbQueueStorage } from './indexeddb-queue-storage.ts';
import { madeUpRosters } from './opened-game-storage-contract.test-helper.ts';
import { inLeague } from './queue-storage.ts';
import { takeNewRelease } from './tracker-worker-registration.ts';

const game = '00000000-0000-4000-8000-00000000a001';
const player = '00000000-0000-4000-8000-0000000000b1';
const tap = {
  commandId: '00000000-0000-4000-8000-000000000001',
  at: 1,
  input: { type: 'score' as const, side: 'home' as const, playerId: player, points: 2 as const },
};

describe('who is signed in on this device (T-327)', () => {
  it('keeps one id, written by a signed-in page and deleted by signing out', async () => {
    const factory = new IDBFactory();
    expect(await readDeviceAccount(factory)).toBeNull();
    expect(await writeDeviceAccount('account-1', factory)).toBeNull();
    expect(await readDeviceAccount(factory)).toBe('account-1');
    expect(await writeDeviceAccount('account-2', factory)).toBe('account-1');
    await clearDeviceAccount(factory);
    expect(await readDeviceAccount(factory)).toBeNull();
    expect(await readDeviceAccount(null)).toBeNull();
  });

  it('forgets the kept pages and games only when another person signs in here', async () => {
    expect(anotherPerson(null, 'account-1')).toBe(false);
    expect(anotherPerson('account-1', 'ACCOUNT-1')).toBe(false);
    expect(anotherPerson('account-1', 'account-2')).toBe(true);
    const factory = new IDBFactory();
    let forgotten = 0;
    const forget = async () => {
      forgotten += 1;
    };
    await markSignedInHere('account-1', forget, factory);
    await markSignedInHere('account-1', forget, factory);
    expect(forgotten).toBe(0);
    await markSignedInHere('account-2', forget, factory);
    expect(forgotten).toBe(1);
    expect(await readDeviceAccount(factory)).toBe('account-2');
  });
});

describe('a game’s stored roster when another account signs in (step 2.226, M4)', () => {
  it('is dropped for another account, kept for the same one', async () => {
    const factory = new IDBFactory();
    const name = 'opened-games-2226';
    const games = await openIndexedDbOpenedGameStorage(factory, name);
    const owner = { gameId: game, leagueId: game, accountId: 'account-1' };
    await games.saveRosters(owner, madeUpRosters, 1);
    // As the tracker's pages wire it (sign-out-form.tsx): the opened games' store.
    const forget = () => forgetOpenedGamesOnDevice(factory, name);
    await markSignedInHere('account-1', forget, factory);
    await markSignedInHere('ACCOUNT-1', forget, factory);
    expect((await games.find(game))?.rosters).toEqual(madeUpRosters);
    await markSignedInHere('account-2', forget, factory);
    expect(await games.find(game)).toBeUndefined();
  });
});

describe('"Reload" on "update needed" (T-328, review M2)', () => {
  it('lets each worker go of what it kept, and the plays waiting stay for the new release to send', async () => {
    const factory = new IDBFactory();
    const before = inLeague(await openIndexedDbQueueStorage(factory), 'league-1', 'account-1');
    await before.add(game, { protocolVersion: 2, command: tap });
    const asked: string[] = [];
    const worker = (name: string) => ({ name }) as unknown as ServiceWorker;
    const registration = {
      active: worker('active'),
      waiting: worker('waiting'),
      installing: null,
    } as unknown as ServiceWorkerRegistration;
    const deleted: string[] = [];
    await takeNewRelease({
      registrations: async () => [registration],
      ask: async (w, type) => {
        asked.push(`${(w as unknown as { name: string }).name} ${type}`);
      },
      cacheNames: async () => ['srleagues-tracker https://site.test/north/score/ abc', 'other'],
      deleteCache: async (name) => deleted.push(name),
    });
    expect(asked).toEqual([
      'active srleagues-tracker-release',
      'waiting srleagues-tracker-release',
    ]);
    expect(deleted).toEqual(['srleagues-tracker https://site.test/north/score/ abc']);
    // The new release opens the same storage and finds the play, as it was kept.
    const after = inLeague(await openIndexedDbQueueStorage(factory), 'league-1', 'account-1');
    expect((await after.list(game)).map((e) => [e.command.commandId, e.state])).toEqual([
      [tap.commandId, 'waiting'],
    ]);
  });
});
