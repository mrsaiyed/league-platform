// Who is signed in on this device (step 2.38, T-327): a small mark, an account id and no
// secret, in the device's own database, so the worker that keeps the tracker and the
// tracker itself can tell, with no signal, whose kept pages and games may be shown.
//
// - Every signed-in page load that reaches the network writes it (DeviceAccountMark on
//   the account button and the staff menu; the tracker page once the server answers its
//   opening), and so does signing in, which lands on such a page.
// - Signing out deletes it (sign-out-form.tsx).
// - When another person's id replaces the mark, the earlier person's kept pages and kept
//   games are forgotten (`markSignedInHere`); their plays still waiting stay on the device,
//   hidden, and are sent only when they sign in here again (queue-storage.ts, `madeBy`).
import { deviceAccountOf } from './tracker-worker-rules.ts';

export const deviceAccountDatabaseName = 'srleagues-device-account';
export const deviceAccountStoreName = 'mark';
const markKey = 'signed-in';

/** Whether a mark that was `previous` and is now `next` is another person's (T-327). */
export function anotherPerson(previous: string | null, next: string): boolean {
  return previous !== null && previous.toLowerCase() !== next.toLowerCase();
}

function openMarks(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const asking = factory.open(deviceAccountDatabaseName, 1);
    asking.onupgradeneeded = () => {
      if (!asking.result.objectStoreNames.contains(deviceAccountStoreName))
        asking.result.createObjectStore(deviceAccountStoreName);
    };
    asking.onsuccess = () => resolve(asking.result);
    asking.onerror = () => reject(asking.error ?? new Error('The device mark cannot be opened.'));
    asking.onblocked = () => reject(new Error('The device mark is blocked.'));
  });
}

async function withMarks<T>(
  factory: IDBFactory,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest | null,
  read: (request: IDBRequest | null) => T,
): Promise<T> {
  const db = await openMarks(factory);
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(deviceAccountStoreName, mode);
      const request = work(tx.objectStore(deviceAccountStoreName));
      tx.oncomplete = () => resolve(read(request));
      tx.onerror = () => reject(tx.error ?? new Error('The device mark cannot be written.'));
      tx.onabort = () => reject(tx.error ?? new Error('The device mark cannot be written.'));
    });
  } finally {
    db.close();
  }
}

const browserFactory = (): IDBFactory | null =>
  typeof indexedDB === 'undefined' ? null : indexedDB;

/** Who the device says is signed in here, or null (none, or it cannot be read). */
export async function readDeviceAccount(
  factory: IDBFactory | null = browserFactory(),
): Promise<string | null> {
  if (factory === null) return null;
  try {
    return await withMarks(
      factory,
      'readonly',
      (store) => store.getAll(),
      (request) => deviceAccountOf(Array.isArray(request?.result) ? request.result : null),
    );
  } catch {
    return null;
  }
}

/** Writes `accountId` as the one signed in here; answers who was marked before. */
export async function writeDeviceAccount(
  accountId: string,
  factory: IDBFactory | null = browserFactory(),
): Promise<string | null> {
  if (factory === null) return null;
  const before = await readDeviceAccount(factory);
  try {
    await withMarks(
      factory,
      'readwrite',
      (store) => store.put({ accountId }, markKey),
      () => undefined,
    );
  } catch {
    // Not marked: with no signal the kept pages are then not shown, the safe side.
  }
  return before;
}

/** Deletes the mark (signing out). Never fails. */
export async function clearDeviceAccount(
  factory: IDBFactory | null = browserFactory(),
): Promise<void> {
  if (factory === null) return;
  try {
    await withMarks(
      factory,
      'readwrite',
      (store) => store.clear(),
      () => undefined,
    );
  } catch {
    // Nothing more to do: a kept page is never shown to nobody.
  }
}

/**
 * Marks `accountId` as signed in here; when the mark was another person's, their kept
 * pages and kept games are forgotten first (`forget`: the worker's forget path and the
 * opened games' store), never their plays waiting to be sent.
 */
export async function markSignedInHere(
  accountId: string,
  forget: () => Promise<void>,
  factory: IDBFactory | null = browserFactory(),
): Promise<void> {
  const before = await readDeviceAccount(factory);
  if (anotherPerson(before, accountId)) await forget().catch(() => undefined);
  await writeDeviceAccount(accountId, factory);
}
