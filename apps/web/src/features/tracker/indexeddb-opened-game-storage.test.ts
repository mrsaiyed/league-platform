// The opened games' IndexedDB storage on fake-indexeddb, a stand-in database for tests
// only (record 024): each test gets a fresh, empty one.
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  openIndexedDbOpenedGameStorage,
  openedGamesDatabaseName,
} from './indexeddb-opened-game-storage.ts';
import { queueDatabaseName } from './indexeddb-queue-storage.ts';
import {
  madeUpRosters,
  openedGameStorageContract,
} from './opened-game-storage-contract.test-helper.ts';

const game = '00000000-0000-4000-8000-0000000000a1';
const league = '00000000-0000-4000-8000-0000000000c1';

openedGameStorageContract('IndexedDB storage', () =>
  openIndexedDbOpenedGameStorage(new IDBFactory()),
);

const openRaw = (factory: IDBFactory, version: number): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = factory.open(openedGamesDatabaseName, version);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

describe('IndexedDB opened games: the connection', () => {
  it('is a database of its own, apart from the queue’s', () => {
    expect(openedGamesDatabaseName).not.toBe(queueDatabaseName);
  });

  it('keeps what it holds for the next tab on the same device', async () => {
    const factory = new IDBFactory();
    const first = await openIndexedDbOpenedGameStorage(factory);
    await first.saveRosters(game, league, madeUpRosters, 10);
    const id = await first.deviceId(() => 'device-a');
    const second = await openIndexedDbOpenedGameStorage(factory);
    expect((await second.find(game))?.rosters).toEqual(madeUpRosters);
    expect(await second.deviceId(() => 'device-b')).toBe(id);
  });

  it('lets go when another tab needs the database, and opens it again on the next use', async () => {
    const factory = new IDBFactory();
    const storage = await openIndexedDbOpenedGameStorage(factory);
    await storage.saveRosters(game, league, madeUpRosters, 10);
    await new Promise<void>((resolve, reject) => {
      const request = factory.deleteDatabase(openedGamesDatabaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('blocked'));
    });
    expect(await storage.find(game)).toBeUndefined();
    await storage.saveRosters(game, league, madeUpRosters, 20);
    expect((await storage.find(game))?.rostersSavedAt).toBe(20);
  });

  it('says an older build cannot open a database a newer one upgraded', async () => {
    const factory = new IDBFactory();
    const storage = await openIndexedDbOpenedGameStorage(factory);
    const newer = await openRaw(factory, 2);
    newer.close();
    await expect(storage.find(game)).rejects.toThrow('storage-newer-version');
    await expect(openIndexedDbOpenedGameStorage(factory)).rejects.toThrow('storage-newer-version');
  });
});
