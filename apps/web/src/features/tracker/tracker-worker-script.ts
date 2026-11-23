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
// - a new worker (a release that changed the code) takes over, and the code kept for
//   earlier releases is let go, only when no game is open on the device (T-127). Until
//   then the kept pages keep opening with the code they were kept with;
// - "open on the device" is read from the tracker's own store of opened games
//   (indexeddb-opened-game-storage.ts), which closing the game and signing out clear.
//   The worker never creates that store: if it is not there, no game is open.
// Signing out deletes everything kept here (forgetTrackerPagesOnDevice).
import { openedGamesDatabaseName, openedGamesStoreName } from './indexeddb-opened-game-storage.ts';
import {
  accountMarkOfPage,
  codeMarkOf,
  keptAddressOf,
  mayKeepAnswer,
  mayReplaceStored,
  mayServeKeptPage,
  pageAnswerPlan,
  signedInFrom,
  trackerAccountMetaName,
  trackerKeptPrefix,
  trackerNetworkWaitMs,
  trackerWorkerKeepMessage,
  trackerWorkerUpdateMessage,
} from './tracker-worker-rules.ts';

const glue = `
const scope = self.registration.scope;
const mark = new URL(self.location.href).searchParams.get('code') || 'none';
const prefix = names.kept + scope + ' ';
const current = prefix + mark;

function gamesOpen() {
  return new Promise((resolve) => {
    let asking;
    try {
      asking = indexedDB.open(names.database);
    } catch (error) {
      resolve(null);
      return;
    }
    // No such store yet: no game was ever opened here. Never create it (abort the upgrade).
    asking.onupgradeneeded = () => asking.transaction.abort();
    asking.onerror = () => resolve(asking.error && asking.error.name === 'AbortError' ? 0 : null);
    asking.onblocked = () => resolve(null);
    asking.onsuccess = () => {
      const db = asking.result;
      db.onversionchange = () => db.close();
      if (!db.objectStoreNames.contains(names.games)) {
        db.close();
        resolve(0);
        return;
      }
      try {
        const counting = db.transaction(names.games, 'readonly').objectStore(names.games).count();
        counting.onsuccess = () => {
          db.close();
          resolve(counting.result);
        };
        counting.onerror = () => {
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

async function letGoOfEarlier() {
  if (!mayReplaceStored(await gamesOpen())) return;
  const all = await caches.keys();
  await Promise.all(
    all.filter((name) => name.startsWith(prefix) && name !== current).map((name) => caches.delete(name)),
  );
}

async function keep(key, answer) {
  const box = await caches.open(current);
  await box.put(key, answer);
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
      if (!mayServeKeptPage(await accountOf(await box.match(asked)), signedIn)) await box.delete(asked);
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
          if (now === undefined || mayServeKeptPage(shownMark, now)) return;
          await forgetPagesNotOf(now);
          const client = await self.clients.get(event.resultingClientId);
          if (client) await client.navigate(client.url);
        })
        .catch(() => undefined),
    );
  }
  if (kept && !mayServeKeptPage(await accountOf(kept), signedIn)) kept = undefined;
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
    updateMessage: trackerWorkerUpdateMessage,
    keepMessage: trackerWorkerKeepMessage,
    accountMeta: trackerAccountMetaName,
    networkWaitMs: trackerNetworkWaitMs,
  };
  const rules = {
    accountMarkOfPage,
    codeMarkOf,
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
