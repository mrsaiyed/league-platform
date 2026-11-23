// The cache in front of the site, as the apps see it (T5 §4, T-66, step 2.26, record 106).
// A public answer that a shared cache may keep is labeled with what it shows; when that
// changes, the worker clears exactly those labels, never the whole site. The web app labels
// its answers with the helpers here, the worker clears with them, so the two always agree.
//
// Every label starts with its league (T-66): one league's change never clears another's
// pages, and a label never names anything but ids. Adapters: the local stand-in, which
// records what was cleared (local-page-cache.ts), and Cloudflare's purge by cache tag
// (cloudflare-page-cache.ts, not verified against the live service).

/** What one public page shows, for its labels: one season's table, results or statistics. */
export type SeasonPageKind = 'standings' | 'results' | 'stats';

export const seasonPageKinds: readonly SeasonPageKind[] = ['standings', 'results', 'stats'];

/** Every answer a league's pages give is labeled with this, so a release can clear them all. */
export function leagueLabel(leagueId: string): string {
  return `league:${leagueId}`;
}

/** A season page's label: `league:{id}:season:{id}:standings` and the like. */
export function seasonPageLabel(leagueId: string, seasonId: string, kind: SeasonPageKind): string {
  return `${leagueLabel(leagueId)}:season:${seasonId}:${kind}`;
}

/** One game's page and its snapshot: `league:{id}:game:{id}`. */
export function gamePageLabel(leagueId: string, gameId: string): string {
  return `${leagueLabel(leagueId)}:game:${gameId}`;
}

/**
 * The labels a decided or reopened game makes out of date (T5 §4): its season's standings,
 * results and statistics, and the game itself. Nothing of another season or league.
 */
export function labelsForGameResult(ids: {
  readonly leagueId: string;
  readonly seasonId: string;
  readonly gameId: string;
}): readonly string[] {
  return [
    ...seasonPageKinds.map((kind) => seasonPageLabel(ids.leagueId, ids.seasonId, kind)),
    gamePageLabel(ids.leagueId, ids.gameId),
  ];
}

/**
 * Why a clear failed, as a code the job queue keeps (jobErrorCodes in core): the service
 * refused our key (`not-authorized`, not tried again), asked us to slow down
 * (`rate-limited`), could not be reached or failed itself (`unavailable`), or answered in a
 * way we do not understand (`unexpected-answer`). Never the service's own words or the key.
 */
export type PageCacheClearErrorCode =
  | 'not-authorized'
  | 'rate-limited'
  | 'unavailable'
  | 'unexpected-answer';

export class PageCacheClearError extends Error {
  readonly code: PageCacheClearErrorCode;
  readonly retryable: boolean;
  constructor(code: PageCacheClearErrorCode) {
    super(`The page cache could not be cleared (${code}).`);
    this.name = 'PageCacheClearError';
    this.code = code;
    this.retryable = code !== 'not-authorized';
  }
}

export type PageCache = {
  /** Which adapter it is, for the worker's start-up line. */
  readonly kind: 'cloudflare' | 'local' | 'none';
  /**
   * Clears every answer kept under any of `labels`. Resolves when the service has taken the
   * request; throws a PageCacheClearError otherwise, so the job is tried again (T7 §5).
   * Clearing a label twice, or one nothing is kept under, does no harm (T-137).
   */
  readonly clear: (labels: readonly string[]) => Promise<void>;
};
