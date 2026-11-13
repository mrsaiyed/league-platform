// T-114, T6 §2: the tracker's queue in the browser's database storage (IndexedDB),
// which is larger and sturdier than the simple storage the Al-Hadi tracker used.
// Each write waits for the browser to say the change is on disk ("strict"), so a tap
// the screen has confirmed survives the tab closing or the battery dying.
//
// One store, `commands`. Its key is a number the browser counts up, which keeps every
// tap in the order it was made; one index finds a game's taps, another finds a tap
// by its command ID (and stops the same ID being held twice).
//
// The stored shape is QueuedCommand. If a later release changes it, raise
// `databaseVersion` and convert the old rows in `upgrade`: a queue left on a device
// before the release must still be read (T-127).
import type { QueueSettlement, QueueStorage, QueuedCommand } from './queue-storage.ts';

export const queueDatabaseName = 'srleagues-tracker-queue';
const databaseVersion = 1;
const store = 'commands';
const byGame = 'by-game';
const byCommand = 'by-command';

type Row = QueuedCommand & { position?: number };

/**
 * Opens the queue's database. Rejects where the browser gives no database storage
 * (some private windows): the tracker must then say plainly that taps are not kept.
 */
export async function openIndexedDbQueueStorage(
  factory: IDBFactory = indexedDB,
  name: string = queueDatabaseName,
): Promise<QueueStorage> {
  const db = await opened(factory, name);
  // Another tab opening a newer version of the tracker asks this one to let go.
  db.onversionchange = () => db.close();

  const write = (run: (commands: IDBObjectStore) => void): Promise<void> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite', { durability: 'strict' });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('The queue could not be saved.'));
      tx.onabort = () => reject(tx.error ?? new Error('Saving the queue was stopped.'));
      run(tx.objectStore(store));
    });

  return {
    add(gameId, { protocolVersion, command }) {
      return write((commands) => {
        const known = commands.index(byCommand).getKey(command.commandId);
        known.onsuccess = () => {
          if (known.result !== undefined) return;
          const row: Row = { gameId, protocolVersion, command, state: 'waiting' };
          commands.add(row);
        };
      });
    },

    list(gameId) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const request = tx.objectStore(store).index(byGame).getAll(gameId);
        // Within one game, rows come back in the order of their key: the order tapped.
        request.onsuccess = () => {
          const rows = request.result as Row[];
          resolve(rows.map(({ position: _position, ...entry }) => entry));
        };
        request.onerror = () => reject(request.error ?? new Error('The queue could not be read.'));
      });
    },

    settle(gameId, { remove = [], refuse = [] }: QueueSettlement) {
      const dropped = new Set(remove);
      const refusals = new Map(refuse.map((r) => [r.commandId, r.refusal]));
      if (dropped.size === 0 && refusals.size === 0) return Promise.resolve();
      return write((commands) => {
        const walk = commands.index(byGame).openCursor(gameId);
        walk.onsuccess = () => {
          const cursor = walk.result;
          if (cursor === null) return;
          const row = cursor.value as Row;
          const id = row.command.commandId;
          const refusal = refusals.get(id);
          if (dropped.has(id)) cursor.delete();
          else if (refusal !== undefined) cursor.update({ ...row, state: 'refused', refusal });
          cursor.continue();
        };
      });
    },
  };
}

function opened(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(name, databaseVersion);
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Database storage is not available.'));
      return;
    }
    request.onupgradeneeded = () => upgrade(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Database storage is not available.'));
  });
}

function upgrade(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(store)) {
    const commands = db.createObjectStore(store, { keyPath: 'position', autoIncrement: true });
    commands.createIndex(byGame, 'gameId');
    commands.createIndex(byCommand, 'command.commandId', { unique: true });
  }
}
