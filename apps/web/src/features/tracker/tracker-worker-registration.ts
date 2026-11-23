// The page's side of the worker that keeps the tracker on the device (step 2.38, T-115,
// T-127): the tracker page registers it, and signing out deletes all it kept.
import {
  codeMarkOf,
  trackerKeptPrefix,
  trackerScopeOf,
  trackerWorkerUpdateMessage,
} from './tracker-worker-rules.ts';

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
