// The IndexedDB storage on fake-indexeddb, a stand-in database for tests only
// (record 024, T-236): each test gets a fresh, empty one.
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { openIndexedDbQueueStorage, queueDatabaseName } from './indexeddb-queue-storage.ts';
import { commandId, queueStorageContract, tap } from './queue-storage-contract.test-helper.ts';

const game = '00000000-0000-4000-8000-0000000000a1';

queueStorageContract('IndexedDB storage', () => openIndexedDbQueueStorage(new IDBFactory()));

const openRaw = (factory: IDBFactory, version: number): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = factory.open(queueDatabaseName, version);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

describe('IndexedDB storage: the connection', () => {
  it('keeps what it holds for the next tab on the same device', async () => {
    const factory = new IDBFactory();
    const first = await openIndexedDbQueueStorage(factory);
    await first.add(game, { protocolVersion: 1, command: tap(1) });
    const second = await openIndexedDbQueueStorage(factory);
    expect((await second.list(game)).map((e) => e.command.commandId)).toEqual([commandId(1)]);
  });

  it('lets go when another tab needs the database, and opens it again on the next use', async () => {
    const factory = new IDBFactory();
    const storage = await openIndexedDbQueueStorage(factory);
    await storage.add(game, { protocolVersion: 1, command: tap(1) });
    // Deleting asks every open connection to let go, as a newer version would; a
    // connection that held on would block it for ever.
    await new Promise<void>((resolve, reject) => {
      const request = factory.deleteDatabase(queueDatabaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('blocked'));
    });
    expect(await storage.add(game, { protocolVersion: 1, command: tap(2) })).toBe('added');
    expect((await storage.list(game)).map((e) => e.command.commandId)).toEqual([commandId(2)]);
  });

  it('says an older build cannot open a database a newer one upgraded', async () => {
    const factory = new IDBFactory();
    const storage = await openIndexedDbQueueStorage(factory);
    const newer = await openRaw(factory, 2);
    newer.close();
    await expect(storage.list(game)).rejects.toThrow('storage-newer-version');
    await expect(openIndexedDbQueueStorage(factory)).rejects.toThrow('storage-newer-version');
  });
});
