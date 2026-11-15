// T-115, T6 §4: the opened games in the browser's database storage (IndexedDB), with
// this device's own id (T-116). A database of its own, apart from the queue's
// (indexeddb-queue-storage.ts), so adding it changed nothing a tracker already open
// holds, and a release that changes one never has to upgrade the other (T-127).
//
// Two stores: `games`, keyed by the game's id, and `device`, which holds the one id.
// Each change is read and written in one transaction ("strict": on disk before it is
// done), so storing the state never loses rosters stored a moment before, nor the
// reverse.
//
// The rows hold players' names, so they do not stay for good: opening a game deletes
// the rows `stillKept` lets go of (opened-game-storage.ts), and signing out on the
// device clears the store (`forgetOpenedGamesOnDevice`).
//
// The stored shape is OpenedGame. If a later release changes it in a way older rows do
// not fit, add a step to `upgradeSteps`, converting the old rows: a device may skip
// releases, so every step from the stored version on runs in turn. An older build
// opening a database a newer one has upgraded gets `storage-newer-version`.
import { QueueError, type QueueErrorCode } from './queue-storage.ts';
import { stillKept, type OpenedGame, type OpenedGameStorage } from './opened-game-storage.ts';

export const openedGamesDatabaseName = 'srleagues-tracker-games';
const gamesStore = 'games';
const deviceStore = 'device';
const deviceKey = 'device-id';

/** Step i brings the database from version i to version i + 1. */
const upgradeSteps: readonly ((db: IDBDatabase) => void)[] = [
  (db) => {
    db.createObjectStore(gamesStore, { keyPath: 'gameId' });
    db.createObjectStore(deviceStore);
  },
];
const databaseVersion = upgradeSteps.length;

type StoreName = typeof gamesStore | typeof deviceStore;

/**
 * Opens the opened games' database. Rejects where the browser gives no database
 * storage (some private windows): the tracker then says the game cannot be kept here.
 */
export async function openIndexedDbOpenedGameStorage(
  factory: IDBFactory = indexedDB,
  name: string = openedGamesDatabaseName,
): Promise<OpenedGameStorage> {
  let db: IDBDatabase | null = null;
  let opening: Promise<IDBDatabase> | null = null;

  const connection = (): Promise<IDBDatabase> => {
    if (db !== null) return Promise.resolve(db);
    opening ??= opened(factory, name)
      .then((fresh) => {
        fresh.onversionchange = () => {
          fresh.close();
          if (db === fresh) db = null;
        };
        fresh.onclose = () => {
          if (db === fresh) db = null;
        };
        db = fresh;
        return fresh;
      })
      .finally(() => {
        opening = null;
      });
    return opening;
  };

  /** Runs `work` in one transaction and resolves with what it set once that is done. */
  const run = async <T>(
    storeName: StoreName,
    mode: IDBTransactionMode,
    initial: T,
    work: (store: IDBObjectStore, set: (value: T) => void) => void,
  ): Promise<T> => {
    const code: QueueErrorCode =
      mode === 'readonly' ? 'storage-read-failed' : 'storage-write-failed';
    let tx: IDBTransaction | null = null;
    // A connection closed without notice is opened again once.
    for (let attempt = 0; tx === null; attempt += 1) {
      const current = await connection();
      try {
        tx = current.transaction(storeName, mode, { durability: 'strict' });
      } catch (error) {
        if (db === current) db = null;
        if (attempt > 0) throw new QueueError(code, { cause: error });
      }
    }
    const started = tx;
    let value = initial;
    return new Promise<T>((resolve, reject) => {
      started.oncomplete = () => resolve(value);
      started.onabort = () => reject(new QueueError(code, { cause: started.error }));
      try {
        work(started.objectStore(storeName), (next) => {
          value = next;
        });
      } catch (error) {
        reject(new QueueError(code, { cause: error }));
      }
    });
  };

  /** Reads the game and, if it is there, writes what `edit` makes of it, in one go. */
  const change = (gameId: string, edit: (game: OpenedGame) => OpenedGame) =>
    run(gamesStore, 'readwrite', undefined, (store) => {
      const read = store.get(gameId);
      read.onsuccess = () => {
        const found = read.result as OpenedGame | undefined;
        if (found !== undefined) store.put(edit(found));
      };
    });

  await connection();

  return {
    find(gameId) {
      return run<OpenedGame | undefined>(gamesStore, 'readonly', undefined, (store, set) => {
        const read = store.get(gameId);
        read.onsuccess = () => set(read.result as OpenedGame | undefined);
      });
    },
    saveRosters(owner, rosters, savedAt) {
      const { gameId, leagueId, accountId } = owner;
      return run(gamesStore, 'readwrite', undefined, (store) => {
        const read = store.get(gameId);
        read.onsuccess = () => {
          const found = read.result as OpenedGame | undefined;
          const game: OpenedGame = {
            gameId,
            leagueId,
            accountId,
            rosters,
            rostersSavedAt: savedAt,
            state: found?.state ?? null,
            confirmedFormat: found?.confirmedFormat ?? null,
          };
          store.put(game);
        };
      });
    },
    forgetOthers(owner, olderThan) {
      return run(gamesStore, 'readwrite', undefined, (store) => {
        const walk = store.openCursor();
        walk.onsuccess = () => {
          const cursor = walk.result;
          if (cursor === null) return;
          if (!stillKept(cursor.value as OpenedGame, owner, olderThan)) cursor.delete();
          cursor.continue();
        };
      });
    },
    forgetAll() {
      return run(gamesStore, 'readwrite', undefined, (store) => {
        store.clear();
      });
    },
    saveState(gameId, state) {
      return change(gameId, (game) => ({ ...game, state }));
    },
    confirmFormat(gameId, format) {
      return change(gameId, (game) => ({ ...game, confirmedFormat: format }));
    },
    deviceId(make) {
      return run(deviceStore, 'readwrite', '', (store, set) => {
        const read = store.get(deviceKey);
        read.onsuccess = () => {
          const kept: unknown = read.result;
          if (typeof kept === 'string' && kept !== '') {
            set(kept);
            return;
          }
          const fresh = make();
          store.put(fresh, deviceKey);
          set(fresh);
        };
      });
    },
  };
}

/**
 * Signing out on this device: clears every opened game kept here, so the next person
 * to use the device finds no players' names. Never throws: with no database storage
 * there is nothing kept to clear, and signing out goes ahead either way.
 */
export async function forgetOpenedGamesOnDevice(
  factory: IDBFactory = indexedDB,
  name: string = openedGamesDatabaseName,
): Promise<void> {
  try {
    await (await openIndexedDbOpenedGameStorage(factory, name)).forgetAll();
  } catch {
    // Nothing more to do here; the next opening lets go of another account's games.
  }
}

function opened(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (code: QueueErrorCode, cause?: unknown) => {
      if (settled) return;
      settled = true;
      reject(new QueueError(code, { cause }));
    };
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(name, databaseVersion);
    } catch (error) {
      fail('storage-unavailable', error);
      return;
    }
    request.onupgradeneeded = (event) => {
      for (let version = event.oldVersion; version < databaseVersion; version += 1) {
        upgradeSteps[version]?.(request.result);
      }
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      resolve(request.result);
    };
    request.onerror = () =>
      fail(
        request.error?.name === 'VersionError' ? 'storage-newer-version' : 'storage-unavailable',
        request.error,
      );
    request.onblocked = () => fail('storage-blocked');
  });
}
