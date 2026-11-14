// T-114, T6 §2: the tracker's queue in the browser's database storage (IndexedDB),
// which is larger and sturdier than the simple storage the Al-Hadi tracker used.
// Each write waits for the browser to say the change is on disk ("strict"), so a tap
// the screen has confirmed survives the tab closing or the battery dying.
//
// One store, `commands`. Its key is a number the browser counts up, which keeps every
// tap in the order it was made; one index finds a game's taps, another finds a tap
// by its command ID (and stops the same ID being held twice).
//
// The connection is let go when another tab opens a newer version (versionchange) or
// the browser closes it (close), and opened again on the next use (record 024).
//
// The stored shape is QueuedCommand. Its `sessionId` and the `not-saved` state came
// later; rows stored before them are read as they are, with no step, and an older build
// sends only `waiting` rows, so it never sends a `not-saved` one. If a later release changes
// the shape in a way older rows do not fit, add a step to
// `upgradeSteps`, converting the old rows through the upgrade's transaction: a queue
// left on a device before the release must still be read (T-127). A device may skip
// releases, so every step from the stored version on runs in turn. An older build
// opening a database a newer one has upgraded gets `storage-newer-version`.
import {
  QueueError,
  type QueueErrorCode,
  type QueueSettlement,
  type QueueStorage,
  type QueuedCommand,
} from './queue-storage.ts';

export const queueDatabaseName = 'srleagues-tracker-queue';
const store = 'commands';
const byGame = 'by-game';
const byCommand = 'by-command';

type Row = QueuedCommand & { position?: number };

/** Step i brings the database from version i to version i + 1. */
const upgradeSteps: readonly ((db: IDBDatabase, transaction: IDBTransaction) => void)[] = [
  (db) => {
    const commands = db.createObjectStore(store, { keyPath: 'position', autoIncrement: true });
    commands.createIndex(byGame, 'gameId');
    commands.createIndex(byCommand, 'command.commandId', { unique: true });
  },
];
const databaseVersion = upgradeSteps.length;

/**
 * Opens the queue's database. Rejects where the browser gives no database storage
 * (some private windows): the tracker must then say plainly that taps are not kept.
 */
export async function openIndexedDbQueueStorage(
  factory: IDBFactory = indexedDB,
  name: string = queueDatabaseName,
): Promise<QueueStorage> {
  let db: IDBDatabase | null = null;
  let opening: Promise<IDBDatabase> | null = null;

  const connection = (): Promise<IDBDatabase> => {
    if (db !== null) return Promise.resolve(db);
    opening ??= opened(factory, name)
      .then((fresh) => {
        // Another tab opening a newer version of the tracker asks this one to let go.
        fresh.onversionchange = () => {
          fresh.close();
          if (db === fresh) db = null;
        };
        // The browser closed it (storage cleared, the disk went away).
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

  /** A transaction on a live connection: one closed without notice is opened again once. */
  const transaction = async (mode: IDBTransactionMode): Promise<IDBTransaction> => {
    for (let attempt = 0; ; attempt += 1) {
      const current = await connection();
      try {
        return current.transaction(store, mode, { durability: 'strict' });
      } catch (error) {
        if (db === current) db = null;
        if (attempt > 0) {
          const code = mode === 'readonly' ? 'storage-read-failed' : 'storage-write-failed';
          throw new QueueError(code, { cause: error });
        }
      }
    }
  };

  const write = async <T>(
    initial: T,
    run: (commands: IDBObjectStore, outcome: Outcome<T>, tx: IDBTransaction) => void,
  ): Promise<T> => {
    const tx = await transaction('readwrite');
    const outcome: Outcome<T> = { value: initial, refusal: null };
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(outcome.value);
      tx.onabort = () =>
        reject(outcome.refusal ?? new QueueError('storage-write-failed', { cause: tx.error }));
      try {
        run(tx.objectStore(store), outcome, tx);
      } catch (error) {
        reject(new QueueError('storage-write-failed', { cause: error }));
      }
    });
  };

  await connection();

  return {
    add(gameId, { protocolVersion, command, sessionId }) {
      return write<'added' | 'held'>('added', (commands, outcome, tx) => {
        const known = commands.index(byCommand).get(command.commandId);
        known.onsuccess = () => {
          const row = known.result as Row | undefined;
          if (row === undefined) {
            const madeUnder = sessionId === undefined ? {} : { sessionId };
            const fresh: Row = { gameId, protocolVersion, command, ...madeUnder, state: 'waiting' };
            commands.add(fresh);
          } else if (row.gameId === gameId) {
            outcome.value = 'held';
          } else {
            outcome.refusal = new QueueError('command-id-in-other-game');
            tx.abort();
          }
        };
      });
    },

    async list(gameId) {
      const tx = await transaction('readonly');
      return new Promise((resolve, reject) => {
        const failed = (cause: unknown) => reject(new QueueError('storage-read-failed', { cause }));
        tx.onabort = () => failed(tx.error);
        let request: IDBRequest;
        try {
          request = tx.objectStore(store).index(byGame).getAll(gameId);
        } catch (error) {
          failed(error);
          return;
        }
        // Within one game, rows come back in the order of their key: the order tapped.
        request.onsuccess = () => {
          const rows = request.result as Row[];
          resolve(rows.map(({ position: _position, ...entry }) => entry));
        };
        request.onerror = () => failed(request.error);
      });
    },

    async settle(gameId, { remove = [], refuse = [], notSaved = [] }: QueueSettlement) {
      const dropped = new Set(remove);
      const refusals = new Map(refuse.map((r) => [r.commandId, r.refusal]));
      const setAside = new Set(notSaved);
      if (dropped.size === 0 && refusals.size === 0 && setAside.size === 0) return;
      await write(undefined, (commands) => {
        const walk = commands.index(byGame).openCursor(gameId);
        walk.onsuccess = () => {
          const cursor = walk.result;
          if (cursor === null) return;
          const row = cursor.value as Row;
          const id = row.command.commandId;
          const refusal = refusals.get(id);
          if (dropped.has(id)) cursor.delete();
          else if (refusal !== undefined) cursor.update({ ...row, state: 'refused', refusal });
          else if (setAside.has(id)) {
            const { refusal: _refusal, ...kept } = row as Row & { refusal?: unknown };
            cursor.update({ ...kept, state: 'not-saved' });
          }
          cursor.continue();
        };
      });
    },
  };
}

type Outcome<T> = { value: T; refusal: QueueError | null };

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
      const upgrade = request.transaction;
      if (upgrade === null) return;
      for (let version = event.oldVersion; version < databaseVersion; version += 1) {
        upgradeSteps[version]?.(request.result, upgrade);
      }
    };
    request.onsuccess = () => {
      // Opened after it was given up as blocked: nobody holds it, so let it go.
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
    // A tab of an older version still holds the database and will not let go. The
    // tracker says so; the next use tries again.
    request.onblocked = () => fail('storage-blocked');
  });
}
