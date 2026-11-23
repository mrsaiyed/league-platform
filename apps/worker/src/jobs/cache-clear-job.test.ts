// The done test of step 2.26 (T5 §4): finalizing a game clears exactly its season's labels
// and its game's; another season's and another league's stay. Core's own handler of
// "game finalized" records the job (its command test, clear-page-cache.test.ts, shows a final
// score raises it), the job is handed to the worker's handler, and the local page cache
// says what was cleared.
import {
  clearLeagueOnStatusChanged,
  clearPagesOnGameFinalized,
  gameFinalized,
  leagueStatusChanged,
  pageCacheClearJob,
  type Job,
  type QueuedJob,
} from '@srleagues/core';
import { createLocalPageCache, PageCacheClearError } from '@srleagues/providers';
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

    // Exactly these four, written out: another season's, another league's and another
    // game's labels are not among them.
    expect(pageCache.cleared()).toEqual([
      `league:${leagueId}:season:${seasonId}:standings`,
      `league:${leagueId}:season:${seasonId}:results`,
      `league:${leagueId}:season:${seasonId}:stats`,
      `league:${leagueId}:game:${gameId(1)}`,
    ]);
    expect(pageCache.cleared().join(' ')).not.toContain(otherSeasonId);
    expect(pageCache.cleared().join(' ')).not.toContain(otherLeagueId);
  });

  it('a league’s status changing clears the whole league’s label, and only its own', async () => {
    const jobs: Job[] = [];
    const tx = { jobs: { enqueue: async (job: Job) => void jobs.push(job) } };
    await clearLeagueOnStatusChanged.handle({ type: leagueStatusChanged, leagueId }, tx);
    expect(jobs).toEqual([{ type: 'cache.clear', leagueId, ids: {} }]);
    const pageCache = createLocalPageCache();
    const run = runCacheClear({ pageCache });
    for (const job of jobs) await run(queued(job));
    expect(pageCache.cleared()).toEqual([`league:${leagueId}`]);
  });

  it('a job with only part of a game’s ids fails at once, clearing nothing', async () => {
    const pageCache = createLocalPageCache();
    const run = runCacheClear({ pageCache });
    for (const ids of [{ seasonId }, { gameId: gameId(1) }, { seasonId, gameId: 'not-an-id' }]) {
      await expect(run(queued({ type: 'cache.clear', leagueId, ids }))).rejects.toMatchObject({
        code: 'bad_job_data',
        retryable: false,
      });
    }
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
