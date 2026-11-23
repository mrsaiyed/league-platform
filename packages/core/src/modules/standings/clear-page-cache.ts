// The public pages that show a season's results are cached at the edge and labeled by what
// they show (T5 §4, T-66, step 2.26, record 106). When a game is decided or reopened, its
// season's standings, results and statistics, and the game's own page and snapshot, are
// out of date: a `cache.clear` job is recorded in the result's own transaction (T-130), so
// it exists only once the result is saved and is carried out by the worker after commit.
// The job holds the season's and the game's ids only (T-131); the worker turns them into
// the labels to clear. Core names no cache and no vendor: the worker's page cache does.
import { onEvent, type EventHandler } from '../../command/index.ts';
import type { CommandTx } from '../../command/ports.ts';
import {
  gameFinalized,
  gameReopened,
  type GameFinalized,
  type GameReopened,
} from '../../events/game-events.ts';

/** The job that clears a season's page labels (T7 §2). */
export const pageCacheClearJob = 'cache.clear';

/** What a `cache.clear` job for a decided or reopened game carries (T-131: ids only). */
export type PageCacheClearIds = { readonly seasonId: string; readonly gameId: string };

const recordClear = async (event: GameFinalized | GameReopened, tx: CommandTx) => {
  const ids: PageCacheClearIds = { seasonId: event.seasonId, gameId: event.gameId };
  // No dedupe key: a game finalized, reopened and finalized again must clear each time,
  // and clearing twice does no harm (T-137).
  await tx.jobs.enqueue({ type: pageCacheClearJob, leagueId: event.leagueId, ids });
};

export const clearPagesOnGameFinalized = onEvent<GameFinalized, CommandTx>(
  gameFinalized,
  recordClear,
);

export const clearPagesOnGameReopened = onEvent<GameReopened, CommandTx>(gameReopened, recordClear);
