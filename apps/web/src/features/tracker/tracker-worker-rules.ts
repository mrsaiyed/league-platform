// The rules of the worker that keeps the tracker on the device (step 2.38, T-115, T-127),
// as plain functions the tests run without a browser. The worker's own script
// (tracker-worker-script.ts) is made from these very functions, so each must stand alone:
// it uses only its arguments and what every browser has, never a name from this file or
// another (the script is the functions' own text).

/** What the worker keeps of an answer: a tracker page, the code and styles it runs on, or nothing. */
export type KeptKind = 'page' | 'code';

export type WorkerRequest = {
  /** The full address asked for. */
  readonly url: string;
  readonly method: string;
  /** `navigate` for a page the browser opens; anything else for what a page fetches. */
  readonly mode: string;
};

export type WorkerAnswer = {
  readonly status: number;
  /** `basic` for an answer from our own address. */
  readonly type: string;
  /** True when the server sent the browser elsewhere (to sign in, for one). */
  readonly redirected: boolean;
};

/**
 * Whether the worker keeps what `request` asks for, and under which address. `scope` is
 * the worker's reach: the league's tracker addresses, `/{league}/score/`, built by the
 * one address helper. Kept are only:
 *
 * - a tracker page: a game's address directly under the scope, opened by the browser,
 *   kept under its address without the query, so it reopens however it was opened;
 * - what such a page runs on: Next.js's built files (`/_next/static/`, named by their
 *   content, so an address never holds two texts) and the two shared stylesheets.
 *
 * Nothing else: no other page, no API answer, no live feed, no form's answer (only GET),
 * no other site's file. People's data reaches the device only in a tracker page, which
 * carries the game's rosters, the same the tracker already keeps on the device (T-258).
 */
export function keptAddressOf(
  request: WorkerRequest,
  scope: string,
): { readonly kind: KeptKind; readonly key: string } | null {
  if (request.method !== 'GET') return null;
  let asked: URL;
  let reach: URL;
  try {
    asked = new URL(request.url);
    reach = new URL(scope);
  } catch {
    return null;
  }
  if (asked.origin !== reach.origin) return null;
  const path = asked.pathname;
  const stylesheets = ['/display.css', '/standalone.css'];
  if (path.startsWith('/_next/static/') || stylesheets.includes(path)) {
    return request.mode === 'navigate' ? null : { kind: 'code', key: asked.href };
  }
  const base = reach.pathname.endsWith('/') ? reach.pathname : `${reach.pathname}/`;
  if (request.mode !== 'navigate' || !path.startsWith(base)) return null;
  const game = path.slice(base.length).replace(/\/+$/, '');
  // A game's id has no dot: the manifest and the worker beside the games are not pages.
  if (game === '' || game.includes('/') || game.includes('.')) return null;
  return { kind: 'page', key: `${asked.origin}${base}${game}` };
}

/**
 * Whether an answer may be kept: a whole answer from our own address, not one the server
 * sent elsewhere. So a refusal, an error, "not found" and the sign-in page a signed-out
 * person is sent to are never kept, and nothing of a signed-out person is.
 */
export function mayKeepAnswer(answer: WorkerAnswer): boolean {
  return answer.status === 200 && answer.type === 'basic' && !answer.redirected;
}

/**
 * The update rule (T-127): the stored tracker is replaced only when no game is open on
 * the device. `gamesOpen` is how many games the device keeps open (its opened games'
 * store, T-115), or null when the worker cannot tell, which counts as a game open: a
 * release must never interrupt a game.
 */
export function mayReplaceStored(gamesOpen: number | null): boolean {
  return gamesOpen === 0;
}

/**
 * How the worker answers a tracker page. While a game is open on the device and the page
 * is kept, the kept page, at once, with the code it was kept with: a reload in a gym with
 * no signal (or a weak one) scores on within seconds, and a release made meanwhile waits
 * until the game is closed. Otherwise the network first, the kept page only when the
 * network does not answer.
 */
export function pageAnswerPlan(
  gamesOpen: number | null,
  kept: boolean,
): { readonly first: 'kept' | 'network'; readonly keepNetworkAnswer: boolean } {
  const replace = gamesOpen === 0;
  return {
    first: !replace && kept ? 'kept' : 'network',
    // A page not kept yet is kept whatever is open: nothing stored is replaced.
    keepNetworkAnswer: replace || !kept,
  };
}

/**
 * The mark of the code a page runs: made from its built script files' addresses, which
 * change with every release that changes the code. The page registers the worker with it
 * (`?code=`), so the browser installs a new worker when the code changes, and the worker
 * names what it keeps by it.
 */
export function codeMarkOf(scriptAddresses: readonly string[]): string {
  const text = scriptAddresses
    .filter((address) => address.includes('/_next/static/'))
    .sort()
    .join('\n');
  let hash = 0x811c9dc5;
  for (let at = 0; at < text.length; at += 1) {
    hash ^= text.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** The start of the name of everything the worker keeps (one box per scope and code mark). */
export const trackerKeptPrefix = 'srleagues-tracker ';

/** What the page sends a waiting worker: take over now if no game is open. */
export const trackerWorkerUpdateMessage = 'srleagues-tracker-update';

/** The worker's reach: the folder of its own address (`/{league}/score/`). */
export function trackerScopeOf(workerHref: string): string {
  return workerHref.slice(0, workerHref.lastIndexOf('/') + 1);
}
