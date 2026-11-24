// The text of the worker that keeps the tracker on the device (step 2.38, T-115, T-127),
// served at the league's tracker-worker address (app/[league]/score/tracker-worker.js).
// Its rules are the functions of tracker-worker-rules.ts, written in as their own text,
// so what the tests prove is what the browser runs; the rest is the browser's plumbing.
//
// How it behaves:
// - it reaches only the league's tracker pages (its scope), and keeps only what
//   keptAddressOf allows: those pages and the built code and styles they load;
// - a page: while a game is open on the device, the kept copy if there is one, once the
//   network has said the same account is still signed in or has not answered within a
//   few seconds; otherwise the network, and the kept copy when the network does not
//   answer. A kept page is the account's that made it (T-321): when the network says
//   another account or nobody is signed in, the kept pages are deleted, never shown;
// - code: kept by address (each built file's address names its content), so it is
//   answered from the device first;
// - with no signal, a kept page is shown only to the account the device's mark says is
//   signed in here (device-account.ts, T-323): someone may have signed in elsewhere;
// - a new worker (a release that changed the code) takes over, and the code kept for
//   earlier releases is let go, only when no tracker page with a game in progress is
//   open now (T-127, T-323, gamesHoldingBack): a page open in a window whose game, in the
//   tracker's store of opened games (indexeddb-opened-game-storage.ts), is not final, or
//   has plays waiting in the queue (indexeddb-queue-storage.ts), or is not stored yet.
//   Stored data alone holds nothing back. The worker never creates either store;
// - "Reload" on "update needed" sends the release message: every kept page and file of
//   the scope goes, a waiting worker takes over, and the reload opens the new release.
// Signing out deletes everything kept here (forgetTrackerPagesOnDevice).
import { openedGamesDatabaseName, openedGamesStoreName } from './indexeddb-opened-game-storage.ts';
import { queueDatabaseName, queueStoreName } from './indexeddb-queue-storage.ts';
import { deviceAccountDatabaseName, deviceAccountStoreName } from './device-account.ts';
import {
  accountMarkOfPage,
  codeMarkOf,
  deviceAccountOf,
  gamesHoldingBack,
  keptAddressOf,
  mayKeepAnswer,
  mayReplaceStored,
  mayServeKeptPage,
  pageAnswerPlan,
  signedInFrom,
  trackerAccountMetaName,
  trackerKeptPrefix,
  trackerNetworkWaitMs,
  trackerWorkerForgetMessage,
  trackerWorkerKeepMessage,
  trackerWorkerReleaseMessage,
  trackerWorkerUpdateMessage,
} from './tracker-worker-rules.ts';

const glue = `
const scope = self.registration.scope;
const mark = new URL(self.location.href).searchParams.get('code') || 'none';
const prefix = names.kept + scope + ' ';
const current = prefix + mark;

// Every record of a store, or [] when it was never made (never made here: the upgrade is
// aborted), or null when it cannot be read.
function readAll(database, store) {
  return new Promise((resolve) => {
    let asking;
    try {
      asking = indexedDB.open(database);
    } catch (error) {
      resolve(null);
      return;
    }
    asking.onupgradeneeded = () => asking.transaction.abort();
    asking.onerror = () => resolve(asking.error && asking.error.name === 'AbortError' ? [] : null);
    asking.onblocked = () => resolve(null);
    asking.onsuccess = () => {
      const db = asking.result;
      db.onversionchange = () => db.close();
      if (!db.objectStoreNames.contains(store)) {
        db.close();
        resolve([]);
        return;
      }
      try {
        const reading = db.transaction(store, 'readonly').objectStore(store).getAll();
        reading.onsuccess = () => {
          db.close();
          resolve(reading.result);
        };
        reading.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch (error) {
        db.close();
        resolve(null);
      }
    };
  });
}

// How many tracker pages open now hold a release back (gamesHoldingBack): their game is
// not final, has plays waiting, or is not stored yet. No page open: nothing holds it.
async function gamesOpen() {
  let windows;
  try {
    windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  } catch (error) {
    return null;
  }
  const open = [];
  for (const client of windows) {
    const what = keptAddressOf({ url: client.url, method: 'GET', mode: 'navigate' }, scope);
    if (what !== null && what.kind === 'page') open.push(what.key.slice(what.key.lastIndexOf('/') + 1));
  }
  if (open.length === 0) return 0;
  const games = await readAll(names.database, names.games);
  const queued = games === null ? null : await readAll(names.queueDatabase, names.queue);
  return gamesHoldingBack(open, games, queued);
}

// Who the device says is signed in here (T-323), or null.
async function deviceAccount() {
  return deviceAccountOf(await readAll(names.accountDatabase, names.accountStore));
}

async function letGoOfEarlier() {
  if (!mayReplaceStored(await gamesOpen())) return;
  const all = await caches.keys();
  await Promise.all(
    all.filter((name) => name.startsWith(prefix) && name !== current).map((name) => caches.delete(name)),
  );
}

// Signing out (T-115): once told, the worker keeps nothing more. Copies are written one
// after another, so the forgetting waits for the one under way and none lands after it.
let forgotten = false;
let writing = Promise.resolve();
function keep(key, answer) {
  const write = writing.then(async () => {
    if (forgotten) return;
    const box = await caches.open(current);
    await box.put(key, answer);
  });
  writing = write.catch(() => undefined);
  return write;
}

async function forgetEverything() {
  forgotten = true;
  await writing;
  const all = await caches.keys();
  await Promise.all(all.filter((name) => name.startsWith(names.kept)).map((name) => caches.delete(name)));
}

// "Reload" on "update needed" (T-323): this scope's kept pages and files go once the copy
// under way has landed, so the reload opens the new release; keeping goes on after.
async function letGoForRelease() {
  await writing;
  const all = await caches.keys();
  await Promise.all(all.filter((name) => name.startsWith(prefix)).map((name) => caches.delete(name)));
  await self.skipWaiting();
}

function keptIn(key) {
  return caches.keys().then(async (all) => {
    // The newest kept copy of this scope first.
    for (const name of all.filter((n) => n.startsWith(prefix)).reverse()) {
      const found = await (await caches.open(name)).match(key);
      if (found) return found;
    }
    return undefined;
  });
}

async function accountOf(answer) {
  if (!answer || answer.type !== 'basic') return null;
  try {
    return accountMarkOfPage(await answer.clone().text(), names.accountMeta);
  } catch (error) {
    return null;
  }
}

// Kept pages belong to the account that made them (T-321): once the network says who is
// signed in, every kept page of another account (or of nobody) is deleted.
async function forgetPagesNotOf(signedIn) {
  const all = await caches.keys();
  for (const name of all.filter((n) => n.startsWith(prefix))) {
    const box = await caches.open(name);
    for (const asked of await box.keys()) {
      const what = keptAddressOf({ url: asked.url, method: 'GET', mode: 'navigate' }, scope);
      if (what === null || what.kind !== 'page') continue;
      if (!mayServeKeptPage(await accountOf(await box.match(asked)), signedIn, null)) await box.delete(asked);
    }
  }
}

async function answerPage(request, key, event) {
  const open = await gamesOpen();
  let kept = await keptIn(key);
  const asking = fetch(request);
  // With a page kept, the network has a few seconds to say who is signed in; with none,
  // the network's answer (or its failure) is the only one there is.
  const answer = kept
    ? await Promise.race([
        asking.catch(() => null),
        new Promise((done) => setTimeout(() => done(null), names.networkWaitMs)),
      ])
    : await asking;
  const signedIn = signedInFrom(
    answer && { status: answer.status, type: answer.type, redirected: answer.redirected },
    await accountOf(answer),
  );
  if (signedIn !== undefined) await forgetPagesNotOf(signedIn);
  // The network answered too late to choose: if it then names another account (or
  // nobody), the kept pages go and the page shown is opened again from the network.
  if (answer === null && kept) {
    const shownMark = await accountOf(kept);
    event.waitUntil(
      asking
        .then(async (late) => {
          const now = signedInFrom(
            { status: late.status, type: late.type, redirected: late.redirected },
            await accountOf(late),
          );
          if (now === undefined || mayServeKeptPage(shownMark, now, null)) return;
          await forgetPagesNotOf(now);
          const client = await self.clients.get(event.resultingClientId);
          if (client) await client.navigate(client.url);
        })
        .catch(() => undefined),
    );
  }
  if (kept && !mayServeKeptPage(await accountOf(kept), signedIn, await deviceAccount())) kept = undefined;
  const plan = pageAnswerPlan(open, kept !== undefined);
  if (plan.first === 'kept' && kept) return kept;
  if (!answer) return kept || Response.error();
  if (plan.keepNetworkAnswer && mayKeepAnswer(answer)) {
    await keep(key, answer.clone());
    if (mayReplaceStored(open)) await letGoOfEarlier();
  }
  return answer;
}

async function answerCode(request, key) {
  const kept = await keptIn(key);
  if (kept) return kept;
  const answer = await fetch(request);
  if (mayKeepAnswer(answer)) await keep(key, answer.clone());
  return answer;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    gamesOpen().then((open) => (mayReplaceStored(open) ? self.skipWaiting() : undefined)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(letGoOfEarlier().then(() => self.clients.claim()));
});

// The page's first visit came before the worker: keep it and its files now, when they
// are not kept yet (nothing kept is replaced here, T-127).
async function keepThisPage(data) {
  const code = Array.isArray(data.code) ? data.code.map(String) : [];
  for (const href of code) {
    const what = keptAddressOf({ url: href, method: 'GET', mode: 'no-cors' }, scope);
    if (what === null || what.kind !== 'code' || (await keptIn(what.key))) continue;
    try {
      const answer = await fetch(href);
      if (mayKeepAnswer(answer)) await keep(what.key, answer);
    } catch (error) {
      // Not kept this time: the next visit keeps it.
    }
  }
  const page = keptAddressOf({ url: String(data.page), method: 'GET', mode: 'navigate' }, scope);
  if (page === null || page.kind !== 'page' || (await keptIn(page.key))) return;
  try {
    const answer = await fetch(page.key, { credentials: 'same-origin' });
    if (mayKeepAnswer(answer)) await keep(page.key, answer);
  } catch (error) {
    // Not kept this time: the next visit keeps it.
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === names.keepMessage) {
    event.waitUntil(keepThisPage(event.data));
    return;
  }
  if (event.data && event.data.type === names.forgetMessage) {
    const port = event.ports && event.ports[0];
    event.waitUntil(
      forgetEverything()
        .catch(() => undefined)
        .then(() => port && port.postMessage(names.forgetMessage)),
    );
    return;
  }
  if (event.data && event.data.type === names.releaseMessage) {
    const port = event.ports && event.ports[0];
    event.waitUntil(
      letGoForRelease()
        .catch(() => undefined)
        .then(() => port && port.postMessage(names.releaseMessage)),
    );
    return;
  }
  if (!event.data || event.data.type !== names.updateMessage) return;
  event.waitUntil(
    gamesOpen().then((open) => (mayReplaceStored(open) ? self.skipWaiting() : undefined)),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const kept = keptAddressOf({ url: request.url, method: request.method, mode: request.mode }, scope);
  if (kept === null) return;
  event.respondWith(kept.kind === 'page' ? answerPage(request, kept.key, event) : answerCode(request, kept.key));
});
`;

/** The worker's whole script. */
export function trackerWorkerScript(): string {
  const names = {
    kept: trackerKeptPrefix,
    database: openedGamesDatabaseName,
    games: openedGamesStoreName,
    queueDatabase: queueDatabaseName,
    queue: queueStoreName,
    updateMessage: trackerWorkerUpdateMessage,
    keepMessage: trackerWorkerKeepMessage,
    forgetMessage: trackerWorkerForgetMessage,
    releaseMessage: trackerWorkerReleaseMessage,
    accountDatabase: deviceAccountDatabaseName,
    accountStore: deviceAccountStoreName,
    accountMeta: trackerAccountMetaName,
    networkWaitMs: trackerNetworkWaitMs,
  };
  const rules = {
    accountMarkOfPage,
    codeMarkOf,
    deviceAccountOf,
    gamesHoldingBack,
    keptAddressOf,
    mayKeepAnswer,
    mayReplaceStored,
    mayServeKeptPage,
    pageAnswerPlan,
    signedInFrom,
  };
  return [
    "'use strict';",
    `const names = ${JSON.stringify(names)};`,
    ...Object.entries(rules).map(([name, rule]) => `const ${name} = (${String(rule)});`),
    glue,
  ].join('\n');
}
