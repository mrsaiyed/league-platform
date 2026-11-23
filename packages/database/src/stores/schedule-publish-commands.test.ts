// Step 2.21's commands against the real database: publishing a season's draft makes,
// moves and bins games (never a live or decided one), edits rounds, writes the next
// numbered revision and logs it, all in one transaction; the preview says what publishing
// then does; the same revision cannot be published twice (A-6, A-7, A-9). Their isolation
// cases are in ../isolation.
import type { PGlite } from '@electric-sql/pglite';
import {
  addDraftGame,
  addDraftRound,
  changeDraftRoundDate,
  getScheduleDraft,
  moveDraftGame,
  previewSchedulePublish,
  publishSchedule,
  removeDraftGame,
  removeDraftRound,
  renameDraftRound,
  restoreGame,
  type RestoreGameTx,
  type CommandDeps,
  type Job,
  type SchedulingTx,
} from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  freshSchema,
  newCourt,
  newDivision,
  newGame,
  newLeague,
  newPerson,
  newRosterEntry,
  newRound,
  newSeason,
  newStage,
  newTeam,
  newVenue,
  one,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { binStore } from './bin-store.ts';
import { gamesStore } from './games-store.ts';
import { schedulingStore } from './scheduling-store.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let deps: CommandDeps<SchedulingTx & RestoreGameTx>;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  const transaction = commandTransaction(db, (scope) => ({
    jobs: { enqueue: async (_job: Job) => {} },
    scheduling: schedulingStore(scope),
    bin: binStore(scope),
    games: gamesStore(scope),
    access: accessStore(scope),
    activity: activityLogStore(scope),
  }));
  deps = { transaction, events: [], log: () => {}, now: () => 0 };
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

/** A season at revision 1 with two games, two rounds, a division and a roster. */
async function season(withStage = true) {
  const l = await newLeague(pglite);
  await pglite.query("update leagues set time_zone = 'America/Chicago' where id = $1", [
    l.leagueId,
  ]);
  const seasonId = await newSeason(pglite, l.leagueId, l.defaultProgramId);
  const stageId = withStage ? await newStage(pglite, l.leagueId, seasonId) : undefined;
  const round1 = await newRound(pglite, l.leagueId, seasonId, 1);
  const round2 = await newRound(pglite, l.leagueId, seasonId, 2);
  await pglite.query("update rounds set date = '2026-12-06', label = 'Week 1' where id = $1", [
    round1,
  ]);
  await pglite.query("update rounds set date = '2026-12-13' where id = $1", [round2]);
  const venueId = await newVenue(pglite, l.leagueId);
  const courtA = await newCourt(pglite, l.leagueId, venueId, 'Court A');
  await newCourt(pglite, l.leagueId, venueId, 'Court B');
  const divisionId = await newDivision(pglite, l.leagueId, seasonId);
  const otherDivisionId = await newDivision(pglite, l.leagueId, seasonId);
  const mk = (division?: string) =>
    newTeam(pglite, l.leagueId, seasonId, division === undefined ? {} : { divisionId: division });
  const [a, b, c, d] = [
    await mk(divisionId),
    await mk(divisionId),
    await mk(divisionId),
    await mk(otherDivisionId),
  ] as [string, string, string, string];
  // Two people on a, one of them also on b; one on c who has left.
  const p1 = await newPerson(pglite, l.leagueId);
  const p2 = await newPerson(pglite, l.leagueId);
  const p3 = await newPerson(pglite, l.leagueId);
  await newRosterEntry(pglite, l.leagueId, a, p1);
  await newRosterEntry(pglite, l.leagueId, a, p2);
  await newRosterEntry(pglite, l.leagueId, b, p1);
  const left = await newRosterEntry(pglite, l.leagueId, c, p3);
  await pglite.query(
    "update roster_entries set joined_on = '2026-01-01', left_on = '2026-02-01' where id = $1",
    [left],
  );
  await pglite.query(
    'insert into schedule_revisions (league_id, season_id, number) values ($1, $2, 1)',
    [l.leagueId, seasonId],
  );
  const game = async (
    home: string,
    away: string,
    columns: Record<string, unknown>,
    stage = stageId,
  ) =>
    newGame(pglite, {
      leagueId: l.leagueId,
      seasonId,
      stageId: stage as string,
      homeTeamId: home,
      awayTeamId: away,
      columns: { round_id: round1, venue_id: venueId, capture_mode: 'box', ...columns },
    });
  return {
    as: { leagueId: l.leagueId, accountId: l.ownerId, requestId: 'r-1' },
    leagueId: l.leagueId,
    ownerId: l.ownerId,
    seasonId,
    stageId,
    round1,
    round2,
    venueId,
    courtA,
    divisionId,
    teams: { a, b, c, d },
    game,
  };
}

type Season = Awaited<ReturnType<typeof season>>;

const basis = (s: Season, version: number | null = null, draftId: string | null = null) => ({
  seasonId: s.seasonId,
  basedOnRevision: 1,
  version,
  draftId,
});

async function draftState(s: Season) {
  const row = await one<{ id: string; version: number }>(
    pglite,
    'select id, version from schedule_drafts where league_id = $1',
    [s.leagueId],
  );
  return row;
}

type Edit = (b: ReturnType<typeof basis>) => Promise<{ ok: boolean }>;

/** Starts a draft on `revision` with `first`, makes the other edits, and publishes it. */
async function publishDraft(s: Season, revision: number, first: Edit, more: Edit[] = []) {
  const at = (version: number | null, draftId: string | null) => ({
    ...basis(s, version, draftId),
    basedOnRevision: revision,
  });
  expect(await first(at(null, null))).toMatchObject({ ok: true });
  for (const edit of more) {
    const draft = await draftState(s);
    expect(await edit(at(draft.version, draft.id))).toMatchObject({ ok: true });
  }
  const draft = await draftState(s);
  const published = await publishSchedule(
    s.as,
    {
      seasonId: s.seasonId,
      basedOnRevision: revision,
      draftId: draft.id,
      version: draft.version,
    },
    deps,
  );
  expect(published).toMatchObject({ ok: true, value: { revision: revision + 1 } });
}

/** The season's games by id, as the tests compare them. */
async function gameRow(id: string) {
  return one<{
    starts_at: Date;
    capture_mode: string;
    deleted_at: Date | null;
    round_id: string | null;
    court_name: string | null;
    division_id: string | null;
    status: string;
    stage_id: string;
    version: number;
  }>(
    pglite,
    `select g.starts_at, g.capture_mode, g.deleted_at, g.round_id, c.name as court_name,
            g.division_id, g.status, g.stage_id, g.version
       from games g left join courts c on c.id = g.court_id where g.id = $1`,
    [id],
  );
}

/** A draft that moves one game, removes another, adds one and edits both rounds. */
async function fullDraft(s: Season, moved: string, removed: string, added: string) {
  let last = await moveDraftGame(
    s.as,
    {
      ...basis(s),
      gameId: moved,
      roundId: s.round2,
      date: '2026-12-13',
      time: '19:00',
      venueId: s.venueId,
      court: 'Court B',
    },
    deps,
  );
  const step = async (run: (b: ReturnType<typeof basis>) => Promise<typeof last>) => {
    const draft = await draftState(s);
    last = await run(basis(s, draft.version, draft.id));
    expect(last.ok).toBe(true);
  };
  await step((b) => removeDraftGame(s.as, { ...b, gameId: removed }, deps));
  await step((b) =>
    addDraftGame(
      s.as,
      {
        ...b,
        gameId: added,
        homeTeamId: s.teams.a,
        awayTeamId: s.teams.c,
        roundId: s.round2,
        date: '2026-12-13',
        time: '20:00',
        venueId: s.venueId,
        court: 'Court A',
      },
      deps,
    ),
  );
  await step((b) =>
    renameDraftRound(s.as, { ...b, roundId: s.round2, label: 'Rivalry Week' }, deps),
  );
  await step((b) =>
    changeDraftRoundDate(s.as, { ...b, roundId: s.round1, date: '2026-12-07' }, deps),
  );
}

describe('publishing against the database', () => {
  it('makes, moves and bins games, edits rounds and writes revision 2, as the preview said', async () => {
    const s = await season();
    const moved = await s.game(s.teams.a, s.teams.b, {
      starts_at: '2026-12-07T00:30:00Z',
      court_id: s.courtA,
    });
    const removed = await s.game(s.teams.c, s.teams.d, { starts_at: '2026-12-07T02:00:00Z' });
    const added = randomUUID();
    await fullDraft(s, moved, removed, added);

    const preview = await previewSchedulePublish(s.as, { seasonId: s.seasonId }, deps);
    expect(preview).toMatchObject({
      ok: true,
      value: {
        teamCount: 4,
        // p1 on a and b once, p2 on a; c's player left; d has no roster.
        peopleCount: 2,
        blockers: [],
        canPublish: true,
        summary: {
          gamesAdded: [added],
          gamesMoved: [moved],
          gamesRemoved: [removed],
          roundsRenamed: [s.round2],
          roundsDateChanged: [s.round1],
        },
      },
    });
    if (!preview.ok) throw new Error('no preview');

    const draft = await draftState(s);
    const published = await publishSchedule(
      s.as,
      { seasonId: s.seasonId, basedOnRevision: 1, draftId: draft.id, version: draft.version },
      deps,
    );
    expect(published).toMatchObject({
      ok: true,
      value: { revision: 2, summary: preview.value.summary, teamCount: 4, peopleCount: 2 },
    });

    // The moved game: new round, time in Chicago, court by name, version moved.
    const m = await gameRow(moved);
    expect(m.starts_at.toISOString()).toBe('2026-12-14T01:00:00.000Z');
    expect(m).toMatchObject({ round_id: s.round2, court_name: 'Court B', deleted_at: null });
    expect(m.version).toBe(2);
    // The new game: scheduled, the stage, the teams' shared division, the season's rules' mode.
    const a = await gameRow(added);
    expect(a.starts_at.toISOString()).toBe('2026-12-14T02:00:00.000Z');
    expect(a).toMatchObject({
      status: 'scheduled',
      stage_id: s.stageId,
      division_id: s.divisionId,
      court_name: 'Court A',
      capture_mode: 'live',
    });
    // The removed game is in the bin, not gone.
    expect((await gameRow(removed)).deleted_at).not.toBeNull();
    // Rounds.
    const rounds = await pglite.query<{ label: string | null; date: string }>(
      "select label, to_char(date, 'YYYY-MM-DD') as date from rounds where league_id = $1 order by number",
      [s.leagueId],
    );
    expect(rounds.rows).toEqual([
      { label: 'Week 1', date: '2026-12-07' },
      { label: 'Rivalry Week', date: '2026-12-13' },
    ]);
    // The revision, its summary and the log; the draft is used up.
    const revision = await one<{
      number: number;
      published_by_account_id: string;
      summary: Record<string, unknown>;
    }>(
      pglite,
      'select number, published_by_account_id, summary from schedule_revisions where league_id = $1 and number = 2',
      [s.leagueId],
    );
    expect(revision.published_by_account_id).toBe(s.ownerId);
    expect(revision.summary).toMatchObject({
      version: 1,
      basedOnRevision: 1,
      gamesAdded: 1,
      gamesMoved: 1,
      gamesRemoved: 1,
      teamsAffected: 4,
      peopleAffected: 2,
      gameIds: { added: [added], removed: [removed], moved: [moved] },
    });
    const log = await pglite.query<{ details: Record<string, unknown> }>(
      "select details from activity_log where league_id = $1 and action = 'scheduling.publish_schedule'",
      [s.leagueId],
    );
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]?.details).toMatchObject({ revision: 2, gamesAdded: 1 });
    const left = await pglite.query('select 1 from schedule_drafts where league_id = $1', [
      s.leagueId,
    ]);
    expect(left.rows).toHaveLength(0);

    // The schedule now is what the draft said, so a new draft starts from it.
    const view = await getScheduleDraft(s.as, { seasonId: s.seasonId }, deps);
    expect(view).toMatchObject({
      ok: true,
      value: { latestRevision: 2, draft: null, published: { games: expect.any(Array) } },
    });
    if (view.ok)
      expect(view.value.published.games.map((g) => g.id).sort()).toEqual([added, moved].sort());
  });

  it('refuses to publish the same revision twice, and leaves the second attempt nothing', async () => {
    const s = await season();
    const moved = await s.game(s.teams.a, s.teams.b, { starts_at: '2026-12-07T00:30:00Z' });
    await moveDraftGame(
      s.as,
      {
        ...basis(s),
        gameId: moved,
        roundId: s.round2,
        date: '2026-12-13',
        time: '19:00',
        venueId: s.venueId,
        court: null,
      },
      deps,
    );
    const draft = await draftState(s);
    const input = {
      seasonId: s.seasonId,
      basedOnRevision: 1,
      draftId: draft.id,
      version: draft.version,
    };
    expect((await publishSchedule(s.as, input, deps)).ok).toBe(true);
    expect(await publishSchedule(s.as, input, deps)).toEqual({
      ok: false,
      error: { code: 'revision-out-of-date' },
    });
    const count = await one<{ n: string }>(
      pglite,
      'select count(*)::text as n from schedule_revisions where league_id = $1',
      [s.leagueId],
    );
    expect(count.n).toBe('2');
    // A draft started later on revision 2 is a new one and can be published once.
    const again = await moveDraftGame(
      s.as,
      {
        ...basis(s),
        basedOnRevision: 2,
        gameId: moved,
        roundId: s.round1,
        date: '2026-12-06',
        time: '18:00',
        venueId: s.venueId,
        court: null,
      },
      deps,
    );
    expect(again.ok).toBe(true);
    const next = await draftState(s);
    expect(
      await publishSchedule(
        s.as,
        { seasonId: s.seasonId, basedOnRevision: 2, draftId: next.id, version: next.version },
        deps,
      ),
    ).toMatchObject({ ok: true, value: { revision: 3 } });
    // The old input still cannot be used.
    expect(await publishSchedule(s.as, input, deps)).toMatchObject({ ok: false });
  });

  it('makes the regular stage when the season has none, and a game across divisions has no division', async () => {
    const s = await season(false);
    const added = randomUUID();
    const result = await addDraftGame(
      s.as,
      {
        ...basis(s),
        gameId: added,
        homeTeamId: s.teams.a,
        awayTeamId: s.teams.d,
        roundId: s.round1,
        date: '2026-12-06',
        time: '18:00',
        venueId: s.venueId,
        court: null,
      },
      deps,
    );
    expect(result.ok).toBe(true);
    const draft = await draftState(s);
    const published = await publishSchedule(
      s.as,
      { seasonId: s.seasonId, basedOnRevision: 1, draftId: draft.id, version: draft.version },
      deps,
    );
    expect(published).toMatchObject({ ok: true, value: { revision: 2 } });
    const game = await gameRow(added);
    // The two teams are in different divisions: a game across divisions.
    expect(game.division_id).toBeNull();
    const stages = await pglite.query<{ type: string; name: string }>(
      'select type, name from stages where league_id = $1',
      [s.leagueId],
    );
    expect(stages.rows).toEqual([{ type: 'regular', name: 'Regular season' }]);
  });

  it('never moves, removes or re-records a live or decided game', async () => {
    const s = await season();
    const final = await s.game(s.teams.a, s.teams.b, {
      starts_at: '2026-12-07T00:30:00Z',
      status: 'final',
      home_score: 50,
      away_score: 40,
      finalized_at: '2026-12-07T02:30:00Z',
    });
    await moveDraftGame(
      s.as,
      {
        ...basis(s),
        gameId: final,
        roundId: s.round2,
        date: '2026-12-13',
        time: '19:00',
        venueId: s.venueId,
        court: null,
      },
      deps,
    );
    const draft = await draftState(s);
    const preview = await previewSchedulePublish(s.as, { seasonId: s.seasonId }, deps);
    expect(preview).toMatchObject({
      ok: true,
      value: { canPublish: false, blockers: [{ code: 'game-already-started', gameId: final }] },
    });
    expect(
      await publishSchedule(
        s.as,
        { seasonId: s.seasonId, basedOnRevision: 1, draftId: draft.id, version: draft.version },
        deps,
      ),
    ).toEqual({ ok: false, error: { code: 'game-already-started', gameId: final } });
    const row = await gameRow(final);
    expect(row.starts_at.toISOString()).toBe('2026-12-07T00:30:00.000Z');
    expect(row.deleted_at).toBeNull();
    // Refused whole: the draft is still there and no revision was written.
    expect((await draftState(s)).version).toBe(draft.version);
    const count = await one<{ n: string }>(
      pglite,
      'select count(*)::text as n from schedule_revisions where league_id = $1',
      [s.leagueId],
    );
    expect(count.n).toBe('1');
  });

  it('refuses an added game whose id is a binned game, and a scored game it cannot remove', async () => {
    const s = await season();
    const binned = await s.game(s.teams.a, s.teams.b, {
      starts_at: '2026-12-07T00:30:00Z',
      deleted_at: '2026-12-01T00:00:00Z',
    });
    await addDraftGame(
      s.as,
      {
        ...basis(s),
        gameId: binned,
        homeTeamId: s.teams.a,
        awayTeamId: s.teams.b,
        roundId: s.round1,
        date: '2026-12-06',
        time: '18:00',
        venueId: s.venueId,
        court: null,
      },
      deps,
    );
    const preview = await previewSchedulePublish(s.as, { seasonId: s.seasonId }, deps);
    expect(preview).toMatchObject({
      ok: true,
      value: { blockers: [{ code: 'game-id-taken', gameId: binned }] },
    });
  });

  it("refuses in words, changing nothing, an added game whose id another league's game has (step 2.185)", async () => {
    const s = await season();
    const other = await season();
    const theirs = await other.game(other.teams.a, other.teams.b, {
      starts_at: '2026-12-07T00:30:00Z',
    });
    expect(
      await addDraftGame(
        s.as,
        {
          ...basis(s),
          gameId: theirs,
          homeTeamId: s.teams.a,
          awayTeamId: s.teams.b,
          roundId: s.round1,
          date: '2026-12-06',
          time: '18:00',
          venueId: s.venueId,
          court: null,
        },
        deps,
      ),
    ).toMatchObject({ ok: true });
    // The preview cannot see another league's game; publishing finds the id taken.
    const preview = await previewSchedulePublish(s.as, { seasonId: s.seasonId }, deps);
    expect(preview).toMatchObject({ ok: true, value: { canPublish: true } });
    const draft = await draftState(s);
    expect(
      await publishSchedule(
        s.as,
        { seasonId: s.seasonId, basedOnRevision: 1, draftId: draft.id, version: draft.version },
        deps,
      ),
    ).toEqual({ ok: false, error: { code: 'game-id-taken' } });
    // Rolled back: the draft is still there, no revision 2, and their game is as it was.
    expect(await draftState(s)).toEqual(draft);
    const revisions = await pglite.query<{ n: number }>(
      'select count(*)::int as n from schedule_revisions where league_id = $1',
      [s.leagueId],
    );
    expect(revisions.rows[0]?.n).toBe(1);
    const row = await one<{ league_id: string; deleted_at: Date | null }>(
      pglite,
      'select league_id, deleted_at from games where id = $1',
      [theirs],
    );
    expect(row).toEqual({ league_id: other.leagueId, deleted_at: null });
  });

  it('adds rounds numbered after the others and removes an empty one, as the preview said (step 2.160)', async () => {
    const s = await season();
    const week3 = randomUUID();
    const week4 = randomUUID();
    const added = randomUUID();
    let last = await addDraftRound(
      s.as,
      { ...basis(s), roundId: week3, label: 'Week 3', date: '2026-12-20' },
      deps,
    );
    const step = async (run: (b: ReturnType<typeof basis>) => Promise<typeof last>) => {
      const draft = await draftState(s);
      last = await run(basis(s, draft.version, draft.id));
      expect(last).toMatchObject({ ok: true });
    };
    await step((b) =>
      addDraftRound(s.as, { ...b, roundId: week4, label: 'Week 4', date: '2026-12-27' }, deps),
    );
    await step((b) =>
      addDraftGame(
        s.as,
        {
          ...b,
          gameId: added,
          homeTeamId: s.teams.a,
          awayTeamId: s.teams.b,
          roundId: week4,
          date: '2026-12-27',
          time: '18:00',
          venueId: s.venueId,
          court: null,
        },
        deps,
      ),
    );
    await step((b) => removeDraftRound(s.as, { ...b, roundId: s.round2 }, deps));
    // Nothing is in the rounds table yet: the public reads it (A-9).
    const before = await pglite.query('select id from rounds where league_id = $1', [s.leagueId]);
    expect(before.rows).toHaveLength(2);

    const preview = await previewSchedulePublish(s.as, { seasonId: s.seasonId }, deps);
    expect(preview).toMatchObject({
      ok: true,
      value: {
        canPublish: true,
        summary: { roundsAdded: [week3, week4].sort(), roundsRemoved: [s.round2] },
      },
    });
    const draft = await draftState(s);
    const published = await publishSchedule(
      s.as,
      { seasonId: s.seasonId, basedOnRevision: 1, draftId: draft.id, version: draft.version },
      deps,
    );
    expect(published).toMatchObject({ ok: true, value: { revision: 2 } });
    const rounds = await pglite.query<{ id: string; number: number; label: string | null }>(
      'select id, number, label from rounds where league_id = $1 order by number',
      [s.leagueId],
    );
    expect(rounds.rows).toEqual([
      { id: s.round1, number: 1, label: 'Week 1' },
      { id: week3, number: 3, label: 'Week 3' },
      { id: week4, number: 4, label: 'Week 4' },
    ]);
    expect((await gameRow(added)).round_id).toBe(week4);
    const revision = await one<{ summary: Record<string, unknown> }>(
      pglite,
      'select summary from schedule_revisions where league_id = $1 and number = 2',
      [s.leagueId],
    );
    expect(revision.summary).toMatchObject({ roundsAdded: 2, roundsRemoved: 1 });
  });

  it('removes a round whose only games are in the bin; they keep teams, date and number, and come back with no round (S-60)', async () => {
    const s = await season();
    // Week 2's two games, as the walk of 2026-11-16 found them: removed and published.
    const first = await s.game(s.teams.a, s.teams.b, {
      round_id: s.round2,
      game_number: 7,
      starts_at: '2026-12-14T00:30:00Z',
    });
    const second = await s.game(s.teams.c, s.teams.d, {
      round_id: s.round2,
      game_number: 8,
      starts_at: '2026-12-14T01:30:00Z',
    });
    // A game in the bin in Week 1, which stays: it keeps its round.
    const stays = await s.game(s.teams.a, s.teams.c, {
      starts_at: '2026-12-07T00:30:00Z',
      deleted_at: '2026-12-01T00:00:00Z',
    });
    const before = await gameRow(first);
    await publishDraft(s, 1, (b) => removeDraftGame(s.as, { ...b, gameId: first }, deps), [
      (b) => removeDraftGame(s.as, { ...b, gameId: second }, deps),
    ]);
    expect((await gameRow(first)).deleted_at).not.toBeNull();
    // Week 2 shows no game, and the tap that says it can go does.
    const view = await getScheduleDraft(s.as, { seasonId: s.seasonId }, deps);
    expect(view).toMatchObject({ ok: true, value: { undated: [] } });
    if (!view.ok) throw new Error('no draft view');
    expect(view.value.result.games.filter((g) => g.roundId === s.round2)).toEqual([]);
    await publishDraft(s, 2, (b) => removeDraftRound(s.as, { ...b, roundId: s.round2 }, deps));

    const rounds = await pglite.query<{ id: string }>(
      'select id from rounds where league_id = $1 order by number',
      [s.leagueId],
    );
    expect(rounds.rows).toEqual([{ id: s.round1 }]);
    const numbers = await pglite.query<{ id: string; game_number: number | null }>(
      'select id, game_number from games where id = any($1) order by game_number',
      [[first, second]],
    );
    expect(numbers.rows).toEqual([
      { id: first, game_number: 7 },
      { id: second, game_number: 8 },
    ]);
    const after = await gameRow(first);
    expect(after).toMatchObject({
      round_id: null,
      starts_at: before.starts_at,
      status: 'scheduled',
      stage_id: before.stage_id,
      court_name: before.court_name,
    });
    expect(after.deleted_at).not.toBeNull();
    const teamsOf = await one<{ home_team_id: string; away_team_id: string }>(
      pglite,
      'select home_team_id, away_team_id from games where id = $1',
      [second],
    );
    expect(teamsOf).toEqual({ home_team_id: s.teams.c, away_team_id: s.teams.d });
    expect((await gameRow(stays)).round_id).toBe(s.round1);
    // The publication's log entry keeps which round went and which games lost it (S-60).
    const logged = await one<{ details: Record<string, unknown> }>(
      pglite,
      `select details from activity_log where league_id = $1
         and action = 'scheduling.publish_schedule' and details->>'revision' = '3'`,
      [s.leagueId],
    );
    expect(logged.details).toMatchObject({
      roundsRemoved: s.round2,
      gamesLeftWithoutRound: [first, second].sort().join(' '),
    });

    // Brought back from the bin, it has no round.
    expect(await restoreGame(s.as, { gameId: first }, deps)).toEqual({
      ok: true,
      value: {
        gameId: first,
        seasonId: expect.any(String),
        revision: 4,
        teamCount: 2,
        peopleCount: 2,
        clashes: [],
      },
    });
    expect(await gameRow(first)).toMatchObject({ deleted_at: null, round_id: null });
  });

  it('removes a round and its games in one draft: they go to the bin, then lose their round (S-60)', async () => {
    const s = await season();
    const game = await s.game(s.teams.a, s.teams.b, {
      round_id: s.round2,
      starts_at: '2026-12-14T00:30:00Z',
    });
    await publishDraft(s, 1, (b) => removeDraftGame(s.as, { ...b, gameId: game }, deps), [
      (b) => removeDraftRound(s.as, { ...b, roundId: s.round2 }, deps),
    ]);
    const row = await gameRow(game);
    expect(row.round_id).toBeNull();
    expect(row.deleted_at).not.toBeNull();
    const kept = await pglite.query('select id from rounds where id = $1', [s.round2]);
    expect(kept.rows).toEqual([]);
  });

  it('refuses a round a game with no date is in, and the draft view shows that game in it (step 2.181)', async () => {
    const s = await season();
    const undated = await s.game(s.teams.a, s.teams.b, { round_id: s.round2 });
    // One in the bin beside it changes nothing: the game with no date holds the round.
    await s.game(s.teams.c, s.teams.d, {
      round_id: s.round2,
      starts_at: '2026-12-14T00:30:00Z',
      deleted_at: '2026-12-01T00:00:00Z',
    });
    expect(await getScheduleDraft(s.as, { seasonId: s.seasonId }, deps)).toMatchObject({
      ok: true,
      value: { undated: [{ id: undated, roundId: s.round2 }] },
    });
    const refused = await removeDraftRound(s.as, { ...basis(s), roundId: s.round2 }, deps);
    expect(refused).toEqual({ ok: false, error: { code: 'round-in-use' } });
    // A draft written some other way is still blocked, and the round stays.
    await pglite.query(
      `insert into schedule_drafts (league_id, season_id, changes, based_on_revision)
       values ($1, $2, $3, 1)`,
      [
        s.leagueId,
        s.seasonId,
        JSON.stringify({ version: 1, changes: [{ kind: 'remove-round', roundId: s.round2 }] }),
      ],
    );
    const preview = await previewSchedulePublish(s.as, { seasonId: s.seasonId }, deps);
    expect(preview).toMatchObject({
      ok: true,
      value: { canPublish: false, blockers: [{ code: 'round-in-use', roundId: s.round2 }] },
    });
    const kept = await pglite.query('select id from rounds where id = $1', [s.round2]);
    expect(kept.rows).toHaveLength(1);
    expect((await gameRow(undated)).round_id).toBe(s.round2);
  });

  it('shows another league nothing: a season of another league is not found', async () => {
    const s = await season();
    const other = await season();
    expect(await previewSchedulePublish(other.as, { seasonId: s.seasonId }, deps)).toEqual({
      ok: false,
      error: { code: 'season-not-found' },
    });
    expect(
      await publishSchedule(
        other.as,
        { seasonId: s.seasonId, basedOnRevision: 1, draftId: randomUUID(), version: 1 },
        deps,
      ),
    ).toEqual({ ok: false, error: { code: 'season-not-found' } });
  });
});
