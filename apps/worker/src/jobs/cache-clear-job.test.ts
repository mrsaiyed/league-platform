// The done test of step 2.26 (T5 §4): finalizing a game clears exactly its season's labels
// and its game's; another season's and another league's stay. Core's own handler of
// "game finalized" records the job (its command test, clear-page-cache.test.ts, shows a final
// score raises it), the job is handed to the worker's handler, and the local page cache
// says what was cleared.
import {
  clearPagesOnGameFinalized,
  gameFinalized,
  pageCacheClearJob,
  type Job,
  type QueuedJob,
} from '@srleagues/core';
import {
  createLocalPageCache,
  gamePageLabel,
  labelsForGameResult,
  PageCacheClearError,
  seasonPageKinds,
  seasonPageLabel,
} from '@srleagues/providers';
import { describe, expect, it } from 'vitest';
import { jobHandlers } from './job-handlers.ts';
import { runCacheClear } from './cache-clear-job.ts';

const leagueId = '01900000-0000-7000-8000-000000000001';
const seasonId = '01900000-0000-7000-8000-0000000000c1';
const otherSeasonId = '01900000-0000-7000-8000-0000000000c2';
const gameId = (n: number) => `01900000-0000-7000-8000-0000000000f${n}`;
const otherLeagueId = '01900000-0000-7000-8000-000000000002';

const queued = (job: {
  type: string;
  leagueId: string;
  ids: Record<string, string>;
}): QueuedJob => ({
  id: '01900000-0000-7000-8000-0000000000aa',
  attempt: 1,
  ...job,
});

describe('cache.clear (step 2.26)', () => {
  it('finalizing a game clears exactly its season’s labels and its game’s', async () => {
    const jobs: Job[] = [];
    const tx = { jobs: { enqueue: async (job: Job) => void jobs.push(job) } };
    // The event as the games module raises it on a final score.
    const finalized = { type: gameFinalized, leagueId, seasonId, gameId: gameId(1) };
    await clearPagesOnGameFinalized.handle(finalized, tx);
    expect(jobs).toHaveLength(1);
    const pageCache = createLocalPageCache();
    const run = runCacheClear({ pageCache });
    for (const job of jobs.filter((j) => j.type === pageCacheClearJob)) await run(queued(job));

    const cleared = pageCache.cleared();
    expect(cleared).toEqual(labelsForGameResult({ leagueId, seasonId, gameId: gameId(1) }));
    for (const kind of seasonPageKinds) {
      expect(cleared).toContain(seasonPageLabel(leagueId, seasonId, kind));
      expect(cleared).not.toContain(seasonPageLabel(leagueId, otherSeasonId, kind));
      expect(cleared).not.toContain(seasonPageLabel(otherLeagueId, seasonId, kind));
    }
    expect(cleared).not.toContain(gamePageLabel(leagueId, gameId(2)));
    expect(cleared.every((label) => label.startsWith(`league:${leagueId}:`))).toBe(true);
  });

  it('a job without a season and a game fails at once, clearing nothing', async () => {
    const pageCache = createLocalPageCache();
    const run = runCacheClear({ pageCache });
    await expect(run(queued({ type: 'cache.clear', leagueId, ids: {} }))).rejects.toMatchObject({
      code: 'bad_job_data',
      retryable: false,
    });
    expect(pageCache.cleared()).toEqual([]);
  });

  it('a failure of the cache is thrown, so the job is tried again', async () => {
    const run = runCacheClear({
      pageCache: {
        kind: 'cloudflare',
        clear: async () => {
          throw new PageCacheClearError('unavailable');
        },
      },
    });
    await expect(
      run(queued({ type: 'cache.clear', leagueId, ids: { seasonId, gameId: gameId(1) } })),
    ).rejects.toMatchObject({ code: 'unavailable', retryable: true });
  });

  it('the worker always carries it out', () => {
    const handlers = jobHandlers({
      transaction: (async () => undefined) as never,
      email: { send: async () => undefined } as never,
      siteOrigin: 'https://leagues.example.test',
      sendingAddress: 'leagues@mail.example.test',
      pageCache: createLocalPageCache(),
    });
    expect(handlers[pageCacheClearJob]).toBeTypeOf('function');
  });
});
