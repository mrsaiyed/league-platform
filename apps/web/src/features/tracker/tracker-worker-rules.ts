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
 * The update rule (T-127, T-323): the stored tracker is replaced only when no tracker
 * page with a game in progress is open now. `gamesOpen` is how many such pages there are
 * (`gamesHoldingBack`), or null when the worker cannot tell, which counts as one open: a
 * release must never interrupt a game being scored.
 */
export function mayReplaceStored(gamesOpen: number | null): boolean {
  return gamesOpen === 0;
}

/** A game the device keeps (its opened games' store, T-115), as the worker reads it. */
export type KeptGameRecord = {
  readonly gameId: string;
  readonly state?: { readonly state?: { readonly status?: string } } | null;
};

/** A play in the device's queue, as the worker reads it. */
export type QueuedPlayRecord = { readonly gameId: string; readonly state: string };

/**
 * How many tracker pages open now hold a release back (T-127, T-323). `openGames` are
 * the games of the tracker pages open in a window at this moment; stored data alone
 * holds nothing back, so a game kept for 14 days never keeps a scorer on an old release.
 * An open page holds it back while its game is in progress: not final, or with plays of
 * it still waiting on this device, or not stored yet (a page still opening). `games`
 * null: the store cannot be read, so every open page counts. `queued` null: the queue
 * cannot be read, so every open page of a kept game counts, final or not.
 */
export function gamesHoldingBack(
  openGames: readonly string[],
  games: readonly KeptGameRecord[] | null,
  queued: readonly QueuedPlayRecord[] | null,
): number {
  if (games === null) return openGames.length;
  const waiting =
    queued === null
      ? null
      : new Set(
          queued
            .filter((play) => play.state === 'waiting')
            .map((play) => play.gameId.toLowerCase()),
        );
  return openGames.filter((open) => {
    const id = open.toLowerCase();
    const game = games.find((kept) => kept.gameId.toLowerCase() === id);
    if (game === undefined) return true;
    return game.state?.state?.status !== 'final' || waiting === null || waiting.has(id);
  }).length;
}

/**
 * Who the device says is signed in here (T-323): the account id of the one record of the
 * device's mark (`device-account.ts`), or null when there is none. An id, never a secret.
 */
export function deviceAccountOf(records: readonly unknown[] | null): string | null {
  if (records === null) return null;
  for (const record of records) {
    if (typeof record !== 'object' || record === null) continue;
    const accountId = (record as { readonly accountId?: unknown }).accountId;
    if (typeof accountId === 'string' && accountId !== '') return accountId;
  }
  return null;
}

/**
 * How the worker answers a tracker page. While a game is open on the device and the page
 * is kept (and `mayServeKeptPage` allows it), the kept page, with the code it was kept
 * with: a reload in a gym with no signal (or a weak one) scores on within seconds, and a
 * release made meanwhile waits until the game is closed. Otherwise the network first,
 * the kept page only when the network does not answer.
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
 * The account a tracker page was made for (T-321), read from the page's own text: the
 * tracker page carries `<meta name="{metaName}" content="{account id}">` whenever someone
 * is signed in. Null when the page names no account.
 */
export function accountMarkOfPage(html: string, metaName: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!tag.includes(`name="${metaName}"`)) continue;
    const value = /\bcontent="([^"]*)"/.exec(tag)?.[1];
    return value === undefined || value === '' ? null : value;
  }
  return null;
}

/**
 * Who the network says is signed in (T-321), from its answer to a tracker page and the
 * account that page names (`accountMarkOfPage`): that account; null for nobody (sent to
 * sign in, refused as signed out, or a page that names no account); undefined when the
 * network did not say (no answer in time, an error, "not found").
 */
export function signedInFrom(
  answer: WorkerAnswer | null,
  pageMark: string | null,
): string | null | undefined {
  if (answer === null) return undefined;
  if (answer.redirected || answer.type === 'opaqueredirect') return null;
  if (answer.status === 401 || answer.status === 403) return null;
  if (answer.status !== 200 || answer.type !== 'basic') return undefined;
  return pageMark;
}

/**
 * Whether a kept tracker page may be shown (T-321, T-323): it belongs to the account that
 * made it. Never when it names no account; never when the network says another account,
 * or nobody, is signed in now. When the network did not say (no signal), only when the
 * device's own mark of who is signed in here (`deviceAccountOf`) names the same account:
 * someone else may have signed in on another page since, out of the worker's reach.
 */
export function mayServeKeptPage(
  keptMark: string | null,
  signedIn: string | null | undefined,
  deviceAccount: string | null,
): boolean {
  if (keptMark === null) return false;
  if (signedIn !== undefined) return signedIn === keptMark;
  return deviceAccount === keptMark;
}

/** The meta tag's name that says which account a tracker page was made for (T-321). */
export const trackerAccountMetaName = 'srleagues-account';

/**
 * How long a tracker page waits for the network to say who is signed in before it opens
 * the kept page (T-321): long enough for a working connection, short enough that a
 * reload in a gym with a weak signal still scores on within seconds.
 */
export const trackerNetworkWaitMs = 3_000;

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

/**
 * What the page sends the worker once it is active (T-321 lane, step 2.38): keep this
 * page and the files it runs on. The first visit's page and scripts were fetched before
 * the worker was there, so without this a reload with no signal right after the first
 * visit would find nothing kept.
 */
export const trackerWorkerKeepMessage = 'srleagues-tracker-keep';

/** What the page sends a waiting worker: take over now if no game is open. */
export const trackerWorkerUpdateMessage = 'srleagues-tracker-update';

/**
 * What "Reload" sends each worker when the server says the tracker is too old (T-323):
 * delete every kept page and file of this scope once a copy being written has landed, a
 * waiting worker takes over at once, then answer on the message's port. The reload that
 * follows then opens the new release from the network. The plays waiting on the device
 * are in its own storage, not here, so they stay and the new release sends them.
 */
export const trackerWorkerReleaseMessage = 'srleagues-tracker-release';

/**
 * What signing out sends each worker before it deletes the caches (T-115): keep nothing
 * more, and delete every kept copy once a copy being written has landed, then answer on
 * the message's port. Without it a copy still being written (the files of the page just
 * reloaded) landed after the clearing, and a page stayed for the next person.
 */
export const trackerWorkerForgetMessage = 'srleagues-tracker-forget';

/** The worker's reach: the folder of its own address (`/{league}/score/`). */
export function trackerScopeOf(workerHref: string): string {
  return workerHref.slice(0, workerHref.lastIndexOf('/') + 1);
}
