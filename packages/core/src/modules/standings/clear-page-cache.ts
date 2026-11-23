// The public pages that show a season's results are cached at the edge and labeled by what
// they show (T5 §4, T-66, step 2.26, record 106). When a game is decided or reopened, its
// season's standings, results and statistics, and the game's own page and snapshot, are
// out of date: a `cache.clear` job is recorded in the result's own transaction (T-130), so
// it exists only once the result is saved and is carried out by the worker after commit.
// The job holds the season's and the game's ids only (T-131); the worker turns them into
// the labels to clear. Two changes put every page of the league out of date and matter for
// safety: the league's status (unpublished, suspended, published again) and how players'
// names show. They record a league-wide job with no ids, which clears `league:{id}`.
// Core names no cache and no vendor: the worker's page cache does.
import { onEvent, type CommandTx, type EventHandler } from '../../command/index.ts';
import {
  gameFinalized,
  gameReopened,
  type GameFinalized,
  type GameReopened,
} from '../../events/game-events.ts';
import {
  leagueSettingChanged,
  leagueStatusChanged,
  type LeagueSettingChanged,
  type LeagueStatusChanged,
} from '../../events/league-events.ts';
import { publicNames } from '../leagues/index.ts';

/** The job that clears a season's page labels, or a whole league's (T7 §2). */
export const pageCacheClearJob = 'cache.clear';

/**
 * What a `cache.clear` job carries (T-131: ids only): a decided or reopened game's season
 * and game, or nothing at all for the whole league.
 */
export type PageCacheClearIds =
  | { readonly seasonId: string; readonly gameId: string }
  | Readonly<Record<string, never>>;

// No dedupe key: a game finalized, reopened and finalized again must clear each time,
// and clearing twice does no harm (T-137).
const enqueueClear = (tx: CommandTx, leagueId: string, ids: PageCacheClearIds) =>
  tx.jobs.enqueue({ type: pageCacheClearJob, leagueId, ids });

const recordClear = async (event: GameFinalized | GameReopened, tx: CommandTx) => {
  await enqueueClear(tx, event.leagueId, { seasonId: event.seasonId, gameId: event.gameId });
};

export const clearPagesOnGameFinalized = onEvent<GameFinalized, CommandTx>(
  gameFinalized,
  recordClear,
);

export const clearPagesOnGameReopened = onEvent<GameReopened, CommandTx>(gameReopened, recordClear);

/** A league unpublished, suspended or published again: none of its pages may stay kept. */
export const clearLeagueOnStatusChanged = onEvent<LeagueStatusChanged, CommandTx>(
  leagueStatusChanged,
  async (event, tx) => {
    await enqueueClear(tx, event.leagueId, {});
  },
);

/**
 * The settings whose change alters every public page of the league. Read when an event is
 * handled, not while the modules load: leagues and standings import each other.
 */
const leagueWideSettings = (): readonly string[] => [publicNames.key];

/** How players' names show changed: a page kept with the old names must go. */
export const clearLeagueOnSettingChanged = onEvent<LeagueSettingChanged, CommandTx>(
  leagueSettingChanged,
  async (event, tx) => {
    if (leagueWideSettings().includes(event.key)) await enqueueClear(tx, event.leagueId, {});
  },
);
