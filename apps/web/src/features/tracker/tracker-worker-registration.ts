// The page's side of the worker that keeps the tracker on the device (step 2.38, T-115,
// T-127): the tracker page registers it, and signing out deletes all it kept.
import {
  codeMarkOf,
  trackerKeptPrefix,
  trackerScopeOf,
  trackerWorkerForgetGameMessage,
  trackerWorkerForgetMessage,
  trackerWorkerRenewGameMessage,
  trackerWorkerKeepMessage,
  trackerWorkerReleaseMessage,
  trackerWorkerUpdateMessage,
} from './tracker-worker-rules.ts';

/** The longest a worker is given to answer that it forgot (one of an earlier release never does). */
const forgetAnswerMs = 1000;

/** Tells `worker` to keep nothing more and delete what it kept; settles on its answer. */
function askWorker(worker: ServiceWorker, type: string): Promise<void> {
  return new Promise<void>((done) => {
    const channel = new MessageChannel();
    const timer = setTimeout(done, forgetAnswerMs);
    channel.port1.onmessage = () => {
      clearTimeout(timer);
      done();
    };
    try {
      worker.postMessage({ type }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      done();
    }
  });
}

/**
 * Registers the league's tracker worker (`workerHref`, built by the one address helper)
 * for the league's tracker pages. A worker of an earlier release that is waiting is asked
 * to take over; it does only if no game is open on the device (T-127). Never fails: the
 * tracker works without it, only not with no signal after a reload.
 */
export async function registerTrackerWorker(workerHref: string): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const mark = codeMarkOf(Array.from(document.scripts, (script) => script.src));
    const registration = await navigator.serviceWorker.register(
      `${workerHref}?code=${encodeURIComponent(mark)}`,
      { scope: trackerScopeOf(workerHref), updateViaCache: 'none' },
    );
    registration.waiting?.postMessage({ type: trackerWorkerUpdateMessage });
    // The page and files of this first visit came before the worker: it keeps them now.
    const ready = await navigator.serviceWorker.ready;
    const sheets = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
      (link) => link.href,
    );
    ready.active?.postMessage({
      type: trackerWorkerKeepMessage,
      page: window.location.href,
      code: [...Array.from(document.scripts, (script) => script.src), ...sheets],
    });
  } catch {
    // No worker (a private window, a browser without them): the tracker still scores.
  }
}

/**
 * Deletes every tracker page and file the device kept, and the workers themselves
 * (signing out, T-115): nothing of a signed-out person stays. Never fails.
 */
export async function forgetTrackerPagesOnDevice(): Promise<void> {
  try {
    // First each worker keeps nothing more and lets its copy being written land (T-115).
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .flatMap((r) => [r.active, r.waiting, r.installing])
          .map((worker) =>
            worker === null ? Promise.resolve() : askWorker(worker, trackerWorkerForgetMessage),
          ),
      );
    }
    if (typeof caches !== 'undefined') {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(trackerKeptPrefix))
          .map((name) => caches.delete(name)),
      );
    }
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    // Nothing more to do here: a page kept by a worker is never kept for someone signed out.
  }
}

/** The part of the browser that "Reload" on "update needed" uses (T-328). */
export type ReleaseBrowser = {
  readonly registrations: () => Promise<readonly ServiceWorkerRegistration[]>;
  readonly ask: (worker: ServiceWorker, type: string) => Promise<void>;
  readonly cacheNames: () => Promise<readonly string[]>;
  readonly deleteCache: (name: string) => Promise<unknown>;
};

const thisBrowser = (): ReleaseBrowser | null =>
  typeof navigator === 'undefined' || !('serviceWorker' in navigator)
    ? null
    : {
        registrations: () => navigator.serviceWorker.getRegistrations(),
        ask: askWorker,
        cacheNames: () => (typeof caches === 'undefined' ? Promise.resolve([]) : caches.keys()),
        deleteCache: (name) => caches.delete(name),
      };

/**
 * "Reload" when the server says this tracker is too old (T-328): each worker lets go of
 * every page and file it kept (a waiting one takes over), so the reload that follows
 * opens the new release from the network and nobody is held on a refused version. Only
 * the kept pages and files go: the plays waiting on the device live in its own storage,
 * which the new release reads and sends. Never fails; never waits more than a second a
 * worker.
 */
export async function takeNewRelease(
  browser: ReleaseBrowser | null = thisBrowser(),
): Promise<void> {
  if (browser === null) return;
  try {
    const registrations = await browser.registrations();
    await Promise.all(
      registrations
        .flatMap((r) => [r.active, r.waiting, r.installing])
        .map((worker) =>
          worker === null ? Promise.resolve() : browser.ask(worker, trackerWorkerReleaseMessage),
        ),
    );
    const names = await browser.cacheNames();
    await Promise.all(
      names.filter((name) => name.startsWith(trackerKeptPrefix)).map(browser.deleteCache),
    );
  } catch {
    // The reload goes ahead: the worker keeps no page once the network answers with
    // another release's (no game open) or the scorer closes the game.
  }
}

/**
 * Asks the worker to drop its kept page of the game at `page` (T-488): the game was ended
 * and saved, and the device forgot its rosters. The worker keeps it while a tap of the
 * game waits or is set aside. Never fails.
 */
export async function forgetTrackerPageOfGame(page: string): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      registration.active?.postMessage({ type: trackerWorkerForgetGameMessage, page });
    }
  } catch {
    // No worker: no page of the game was kept by one.
  }
}

/**
 * Asks the worker to replace its kept page of the game at `page` with one fetched fresh
 * (T-489): the rosters fetched changed the names the device stores, or the network is
 * back. The worker replaces it only for the same account, and never keeps a page it had
 * not kept. Never fails, and asks nothing of the queue: no tap waits on it.
 */
export async function renewTrackerPageOfGame(page: string): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      registration.active?.postMessage({ type: trackerWorkerRenewGameMessage, page });
    }
  } catch {
    // No worker: no page of the game was kept by one.
  }
}
