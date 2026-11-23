// A decided or reopened game records one `cache.clear` job for its own season and game, in
// the result's transaction (T-130, step 2.26): none when the result is refused, none for
// another season.
import { describe, expect, it } from 'vitest';
import { eventHandlers } from '../../event-handlers.ts';
import { recordFinalScore, reopenGame } from '../games/index.ts';
import type { Job } from '../../command/index.ts';
import {
  clearLeagueOnSettingChanged,
  clearLeagueOnStatusChanged,
  clearPagesOnGameFinalized,
  clearPagesOnGameReopened,
  pageCacheClearJob,
} from './clear-page-cache.ts';
import {
  fourTeams,
  game,
  gameId,
  leagueId,
  memoryStandings,
  otherSeasonId,
  ownerId,
  seasonId,
  teamId,
} from './memory-standings.test-helper.ts';

const clears = (jobs: readonly { type: string }[]) =>
  jobs.filter((job) => job.type === pageCacheClearJob);

describe('a result clears its season’s page labels (T5 §4, step 2.26)', () => {
  it('a final score records one job for its season and game, after the result', async () => {
    const { db, deps, as } = memoryStandings({
      games: [game(1, 1, 2, { captureMode: 'live' }), game(2, 9, 8, { seasonId: otherSeasonId })],
      teams: [
        ...fourTeams,
        { teamId: teamId(9), divisionId: null, seasonId: otherSeasonId },
        { teamId: teamId(8), divisionId: null, seasonId: otherSeasonId },
      ],
    });
    const result = await recordFinalScore(
      as(ownerId),
      { gameId: gameId(1), version: 1, homeScore: 60, awayScore: 50 },
      deps,
    );
    expect(result).toMatchObject({ ok: true });
    expect(clears(db.jobs)).toEqual([
      { type: 'cache.clear', leagueId, ids: { seasonId, gameId: gameId(1) } },
    ]);
  });

  it('a refused result records nothing', async () => {
    const { db, deps, as } = memoryStandings({ games: [game(1, 1, 2)] });
    const result = await recordFinalScore(
      as(ownerId),
      { gameId: gameId(1), version: 7, homeScore: 60, awayScore: 50 },
      deps,
    );
    expect(result).toMatchObject({ ok: false });
    expect(clears(db.jobs)).toEqual([]);
  });

  it('reopening a decided game clears again', async () => {
    const { db, deps, as } = memoryStandings({ games: [game(1, 1, 2)] });
    await recordFinalScore(
      as(ownerId),
      { gameId: gameId(1), version: 1, homeScore: 60, awayScore: 50 },
      deps,
    );
    const reopened = await reopenGame(
      as(ownerId),
      { gameId: gameId(1), version: 2, reason: 'Wrong score entered' },
      deps,
    );
    expect(reopened).toMatchObject({ ok: true });
    expect(clears(db.jobs)).toHaveLength(2);
  });

  it('is in core’s list of handlers, for both events', () => {
    expect(eventHandlers).toContain(clearPagesOnGameFinalized);
    expect(eventHandlers).toContain(clearPagesOnGameReopened);
    expect(eventHandlers).toContain(clearLeagueOnStatusChanged);
    expect(eventHandlers).toContain(clearLeagueOnSettingChanged);
  });

  it('a league-wide change records a job with no ids; another setting records none', async () => {
    const jobs: Job[] = [];
    const tx = { jobs: { enqueue: async (job: Job) => void jobs.push(job) } };
    await clearLeagueOnStatusChanged.handle({ type: 'leagues.status_changed', leagueId }, tx);
    const setting = (key: string) => ({ type: 'leagues.setting_changed', leagueId, key });
    await clearLeagueOnSettingChanged.handle(setting('privacy.publicNames'), tx);
    await clearLeagueOnSettingChanged.handle(setting('notifications.reminderLeadHours'), tx);
    expect(jobs).toEqual([
      { type: 'cache.clear', leagueId, ids: {} },
      { type: 'cache.clear', leagueId, ids: {} },
    ]);
  });
});
