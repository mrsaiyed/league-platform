// The `cache.clear` job (T5 §4, T6 §7, step 2.26): a game was decided or reopened, and its
// season's standings, results and statistics pages and the game's own page and snapshot
// are cleared from the cache in front of the site. The job was recorded in the result's
// transaction (core's clearPagesOnGameFinalized), so it runs only after the result is
// saved. It carries the season's and the game's ids (T-131); the labels are built here by
// the same helpers the web app labels its answers with, always inside the job's own league
// (T-66). A job with no ids at all is league-wide (the league's status or how players'
// names show changed) and clears the league's own label, `league:{id}`, which every answer
// of its pages carries. Run twice it does no harm (T-137). A failure is the page cache's
// fixed code.
import type { JobHandler, QueuedJob } from '@srleagues/core';
import { labelsForGameResult, leagueLabel, type PageCache } from '@srleagues/providers';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A job whose ids are neither none nor a season and a game: trying again cannot help. */
class BadCacheClearJob extends Error {
  readonly code = 'bad_job_data';
  readonly retryable = false;
}

export function runCacheClear(deps: { readonly pageCache: PageCache }): JobHandler {
  return async (job: QueuedJob) => {
    if (Object.keys(job.ids).length === 0) {
      await deps.pageCache.clear([leagueLabel(job.leagueId)]);
      return;
    }
    const { seasonId, gameId } = job.ids;
    if (
      Object.keys(job.ids).length !== 2 ||
      seasonId === undefined ||
      gameId === undefined ||
      !uuid.test(seasonId) ||
      !uuid.test(gameId)
    ) {
      throw new BadCacheClearJob('A cache.clear job that is neither league-wide nor a game.');
    }
    await deps.pageCache.clear(labelsForGameResult({ leagueId: job.leagueId, seasonId, gameId }));
  };
}
