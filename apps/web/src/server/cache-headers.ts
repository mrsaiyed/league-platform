// What the web app tells the cache in front of the site (T5 §4, T-66, T-119, step 2.26,
// record 106). Two answers only:
//
// - `sharedFor`: the same for everyone, kept by the shared cache for a few seconds and
//   labeled with what it shows (the `Cache-Tag` header, which Cloudflare reads and strips),
//   so a result clears it at once (the worker's `cache.clear`). Only an answer read as a
//   visitor, of a live or archived league, to a request with no sign-in cookie, may be one:
//   today that is the game snapshot alone (2 seconds, T-119).
// - `notKept`: everything else, above all every page, which is drawn per request for the
//   person asking (the account button, the refusal screen's "signed in as", a staff
//   member's pencil): `private, no-store`, never kept where another visitor could be
//   served it. Where it is unclear, an answer is not kept (T-66).
//
// The labels are the providers' helpers (leagueLabel and the like), so the worker clears
// exactly what was labeled.

/** Never kept by a shared cache, nor by the browser. */
export const notKept = { 'Cache-Control': 'private, no-store' } as const;

/** The most seconds a shared answer is kept: a result reaches everyone within this. */
export const longestSharedSeconds = 2;

/**
 * Kept by the shared cache for `seconds` (at most longestSharedSeconds), never by the
 * browser, under `labels`. Each label must start `league:` (T-66).
 */
export function sharedFor(
  seconds: number,
  labels: readonly string[],
): { readonly 'Cache-Control': string; readonly 'Cache-Tag': string } {
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > longestSharedSeconds) {
    throw new RangeError('A shared answer is kept for 1 or 2 seconds.');
  }
  if (labels.length === 0 || !labels.every((label) => /^league:[0-9a-z:-]+$/.test(label))) {
    throw new RangeError('A shared answer is labeled by its league.');
  }
  return {
    'Cache-Control': `public, max-age=0, s-maxage=${seconds}`,
    'Cache-Tag': labels.join(','),
  };
}
