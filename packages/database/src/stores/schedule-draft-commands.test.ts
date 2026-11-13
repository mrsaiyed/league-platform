// Step 2.20's commands against the real database: each call is one transaction
// (commandTransaction). Covers the published schedule as the rules read it (the league's
// own time zone, courts by name), one draft per season, a draft kept apart from the games
// until published (A-9), and an edit based on an old revision or an old draft version
// being refused (A-8). Their isolation cases are in ../isolation.
import type { PGlite } from '@electric-sql/pglite';
import {
  addDraftGame,
  discardScheduleDraft,
  getScheduleDraft,
  moveDraftGame,
  renameDraftRound,
  setDraftRecording,
  type CommandDeps,
  type Job,
  type SchedulingTx,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  freshSchema,
  newCourt,
  newGame,
  newLeague,
  newRound,
  newSeason,
  newStage,
  newTeam,
  newVenue,
  one,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { schedulingStore } from './scheduling-store.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let deps: CommandDeps<SchedulingTx>;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  const transaction = commandTransaction(db, (scope) => ({
    jobs: { enqueue: async (_job: Job) => {} },
    scheduling: schedulingStore(scope),
    access: accessStore(scope),
    activity: activityLogStore(scope),
  }));
  deps = { transaction, events: [], log: () => {}, now: () => 0 };
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

async function season() {
  const l = await newLeague(pglite);
  await pglite.query("update leagues set time_zone = 'America/Chicago' where id = $1", [
    l.leagueId,
  ]);
  const seasonId = await newSeason(pglite, l.leagueId, l.defaultProgramId);
  const stageId = await newStage(pglite, l.leagueId, seasonId);
  const roundId = await newRound(pglite, l.leagueId, seasonId, 1);
  await pglite.query("update rounds set date = '2026-12-06', label = 'Week 1' where id = $1", [
    roundId,
  ]);
  const venueId = await newVenue(pglite, l.leagueId);
  const courtId = await newCourt(pglite, l.leagueId, venueId, 'Court A');
  const [a, b, c] = [
    await newTeam(pglite, l.leagueId, seasonId),
    await newTeam(pglite, l.leagueId, seasonId),
    await newTeam(pglite, l.leagueId, seasonId),
  ] as [string, string, string];
  const gameId = await newGame(pglite, {
    leagueId: l.leagueId,
    seasonId,
    stageId,
    homeTeamId: a,
    awayTeamId: b,
    columns: {
      round_id: roundId,
      venue_id: venueId,
      court_id: courtId,
      // 00:30 UTC on the 7th is 18:30 on the 6th in Chicago.
      starts_at: '2026-12-07T00:30:00Z',
      capture_mode: 'box',
    },
  });
  return {
    as: { leagueId: l.leagueId, accountId: l.ownerId, requestId: 'r-1' },
    seasonId,
    stageId,
    roundId,
    venueId,
    gameId,
    teams: [a, b, c] as const,
    leagueId: l.leagueId,
  };
}

const basis = (seasonId: string, version: number | null = null, basedOnRevision = null) => ({
  seasonId,
  basedOnRevision: basedOnRevision as number | null,
  version,
});

describe('schedule draft commands against the database', () => {
  it('reads the published schedule in the league time zone, with court names and recording', async () => {
    const s = await season();
    const view = await getScheduleDraft(s.as, { seasonId: s.seasonId }, deps);
    expect(view).toMatchObject({
      ok: true,
      value: {
        latestRevision: null,
        draft: null,
        published: {
          rounds: [{ id: s.roundId, label: 'Week 1', date: '2026-12-06' }],
          games: [
            {
              id: s.gameId,
              date: '2026-12-06',
              time: '18:30',
              court: 'Court A',
              venueId: s.venueId,
              recording: 'box-score',
            },
          ],
        },
      },
    });
  });

  it('keeps edits in the draft and leaves the games as they were (A-9), then discards them', async () => {
    const s = await season();
    const moved = await moveDraftGame(
      s.as,
      {
        ...basis(s.seasonId),
        gameId: s.gameId,
        roundId: s.roundId,
        date: '2026-12-13',
        time: '19:00',
        venueId: s.venueId,
        court: 'Court A',
      },
      deps,
    );
    expect(moved).toMatchObject({ ok: true, value: { version: 1 } });
    expect(
      await setDraftRecording(
        s.as,
        { ...basis(s.seasonId, 1), gameId: s.gameId, recording: 'live' },
        deps,
      ),
    ).toMatchObject({ ok: true, value: { version: 2 } });
    const game = await one<{ starts_at: Date; capture_mode: string; version: number }>(
      pglite,
      'select starts_at, capture_mode, version from games where id = $1',
      [s.gameId],
    );
    expect(game.starts_at.toISOString()).toBe('2026-12-07T00:30:00.000Z');
    expect(game.capture_mode).toBe('box');

    const view = await getScheduleDraft(s.as, { seasonId: s.seasonId }, deps);
    expect(view).toMatchObject({
      ok: true,
      value: {
        draft: { version: 2, changeCount: 2, outOfDate: false },
        summary: { gamesMoved: [s.gameId] },
      },
    });
    expect(await discardScheduleDraft(s.as, { seasonId: s.seasonId, version: 2 }, deps)).toEqual({
      ok: true,
      value: {},
    });
    const left = await one<{ n: string }>(
      pglite,
      'select count(*)::text as n from schedule_drafts where league_id = $1',
      [s.leagueId],
    );
    expect(left.n).toBe('0');
  });

  it('refuses an edit based on an old revision, and one on an old version of the draft', async () => {
    const s = await season();
    await renameDraftRound(
      s.as,
      { ...basis(s.seasonId), roundId: s.roundId, label: 'Opening night' },
      deps,
    );
    // A second admin who still sees no draft.
    expect(
      await renameDraftRound(
        s.as,
        { ...basis(s.seasonId), roundId: s.roundId, label: 'Mine' },
        deps,
      ),
    ).toMatchObject({ ok: false, error: { code: 'changed-since-read' } });

    // A revision is published meanwhile.
    await pglite.query(
      'insert into schedule_revisions (league_id, season_id, number, summary) values ($1, $2, 1, \'{"version": 1}\')',
      [s.leagueId, s.seasonId],
    );
    expect(
      await renameDraftRound(
        s.as,
        { ...basis(s.seasonId, 1), roundId: s.roundId, label: 'Late' },
        deps,
      ),
    ).toMatchObject({ ok: false, error: { code: 'revision-out-of-date' } });
    // Even naming the new revision, the draft left from the old one cannot be built on.
    expect(
      await renameDraftRound(
        s.as,
        { ...basis(s.seasonId, 1, 1), roundId: s.roundId, label: 'Later' },
        deps,
      ),
    ).toMatchObject({ ok: false, error: { code: 'revision-out-of-date' } });
    const view = await getScheduleDraft(s.as, { seasonId: s.seasonId }, deps);
    expect(view).toMatchObject({ ok: true, value: { draft: { outOfDate: true } } });
    const draft = await one<{ version: number }>(
      pglite,
      'select version from schedule_drafts where league_id = $1',
      [s.leagueId],
    );
    expect(draft.version).toBe(1);
  });

  it('adds a game between teams of the season, and refuses a team of another season', async () => {
    const s = await season();
    const other = await newSeason(pglite, s.leagueId, await programOf(s));
    const stranger = await newTeam(pglite, s.leagueId, other);
    const input = {
      ...basis(s.seasonId),
      gameId: '01900000-0000-7000-8000-0000000a0002',
      homeTeamId: s.teams[0],
      awayTeamId: s.teams[2],
      roundId: s.roundId,
      date: '2026-12-13',
      time: '18:00',
      venueId: s.venueId,
      court: 'Court A',
    };
    expect(await addDraftGame(s.as, { ...input, awayTeamId: stranger }, deps)).toMatchObject({
      ok: false,
      error: { code: 'unknown-team' },
    });
    expect(await addDraftGame(s.as, input, deps)).toMatchObject({
      ok: true,
      value: { version: 1, clashes: [] },
    });
    const view = await getScheduleDraft(s.as, { seasonId: s.seasonId }, deps);
    expect(view).toMatchObject({
      ok: true,
      value: { summary: { gamesAdded: ['01900000-0000-7000-8000-0000000a0002'] } },
    });
  });
});

async function programOf(s: { seasonId: string }) {
  const row = await one<{ program_id: string }>(
    pglite,
    'select program_id from seasons where id = $1',
    [s.seasonId],
  );
  return row.program_id;
}
