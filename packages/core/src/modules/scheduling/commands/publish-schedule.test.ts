import { describe, expect, it } from 'vitest';
import type { DraftDocument } from '../draft-document.ts';
import {
  draftUuid,
  gameUuid,
  memoryScheduling,
  ownerId,
  roundUuid,
  schedulerGrant,
  seasonId,
  teamUuid,
  venue,
  court,
  venueUuid,
  type MemoryScheduling,
} from '../memory-scheduling.test-helper.ts';
import type { DraftChange, ScheduleGame } from '../rules/schedule-types.ts';
import { previewSchedulePublish } from './preview-schedule-publish.ts';
import { publishSchedule } from './publish-schedule.ts';

const game = (n: number, over: Partial<ScheduleGame> = {}): ScheduleGame => ({
  id: gameUuid(n),
  roundId: roundUuid(1),
  date: '2026-10-04',
  time: '18:00',
  venueId: venueUuid(1),
  court: 'Court 1',
  homeTeamId: teamUuid(1),
  awayTeamId: teamUuid(2),
  status: 'scheduled',
  recording: 'final-score',
  ...over,
});

const slot = {
  roundId: roundUuid(2),
  date: '2026-10-11',
  time: '19:00',
  venueId: venueUuid(1),
  court: 'Court 2',
};

const draftOf = (changes: DraftChange[], basedOnRevision: number | null = 1) => ({
  id: draftUuid(1),
  seasonId,
  changes: { version: 1, changes } satisfies DraftDocument,
  basedOnRevision,
  version: 3,
});

const world = (changes: DraftChange[], state: Partial<MemoryScheduling> = {}) =>
  memoryScheduling({
    venues: [venue(1)],
    courts: [court(1, 1), court(2, 1)],
    teamIds: [1, 2, 3, 4].map(teamUuid),
    grants: [schedulerGrant],
    latestRevision: 1,
    people: 38,
    schedule: {
      rounds: [
        { id: roundUuid(1), label: 'Week 1', date: '2026-10-04' },
        { id: roundUuid(2), label: 'Week 2', date: '2026-10-11' },
      ],
      games: [
        game(1),
        game(2, { homeTeamId: teamUuid(3), awayTeamId: teamUuid(4), court: 'Court 2' }),
      ],
    },
    draft: draftOf(changes),
    ...state,
  });

const input = { seasonId, basedOnRevision: 1, draftId: draftUuid(1), version: 3 };

const fullDraft: DraftChange[] = [
  { kind: 'move-game', gameId: gameUuid(1), to: slot },
  { kind: 'remove-game', gameId: gameUuid(2) },
  {
    kind: 'add-game',
    game: game(9, { homeTeamId: teamUuid(1), awayTeamId: teamUuid(3), recording: null }),
  },
  { kind: 'rename-round', roundId: roundUuid(2), label: 'Rivalry Week' },
  { kind: 'change-round-date', roundId: roundUuid(1), date: '2026-10-05' },
];

describe('publishing the schedule', () => {
  it('creates, moves and bins games, edits rounds and writes revision 2', async () => {
    const { db, deps, as } = world(fullDraft, {
      seasonRules: undefined,
    });
    const result = await publishSchedule(as(ownerId), input, deps);
    expect(result).toMatchObject({
      ok: true,
      value: { revision: 2, teamCount: 4, peopleCount: 38 },
    });
    expect(db.state.inserted.map((g) => [g.id, g.captureMode, g.time])).toEqual([
      [gameUuid(9), 'live', '18:00'],
    ]);
    expect(db.state.updated).toEqual([
      { gameId: gameUuid(1), change: { slot: expect.objectContaining({ date: '2026-10-11' }) } },
    ]);
    expect(db.state.binned).toEqual([gameUuid(2)]);
    expect(db.state.roundChanges).toEqual([
      { roundId: roundUuid(1), date: '2026-10-05' },
      { roundId: roundUuid(2), label: 'Rivalry Week' },
    ]);
    expect(db.state.draft).toBeUndefined();
    expect(db.state.latestRevision).toBe(2);
    expect(db.state.revisions[0]).toMatchObject({
      number: 2,
      publishedByAccountId: ownerId,
      summary: { version: 1, basedOnRevision: 1, gamesAdded: 1, gamesMoved: 1, gamesRemoved: 1 },
    });
    expect(db.state.activity.map((a) => a.action)).toEqual(['scheduling.publish_schedule']);
  });

  it('numbers the first publication 1', async () => {
    const { db, deps, as } = world([fullDraft[0] as DraftChange], {
      latestRevision: null,
      draft: draftOf([fullDraft[0] as DraftChange], null),
    });
    const result = await publishSchedule(as(ownerId), { ...input, basedOnRevision: null }, deps);
    expect(result).toMatchObject({ ok: true, value: { revision: 1 } });
    expect(db.state.revisions[0]?.number).toBe(1);
  });

  it('refuses a second publication from the same revision', async () => {
    const { db, deps, as } = world(fullDraft);
    expect((await publishSchedule(as(ownerId), input, deps)).ok).toBe(true);
    const again = await publishSchedule(as(ownerId), input, deps);
    expect(again).toEqual({ ok: false, error: { code: 'revision-out-of-date' } });
    expect(db.state.revisions).toHaveLength(1);
  });

  it('refuses a draft someone else changed since it was read', async () => {
    const { db, deps, as } = world(fullDraft);
    const result = await publishSchedule(as(ownerId), { ...input, version: 2 }, deps);
    expect(result).toEqual({ ok: false, error: { code: 'changed-since-read' } });
    expect(db.state.draft).toBeDefined();
    const other = await publishSchedule(as(ownerId), { ...input, draftId: draftUuid(7) }, deps);
    expect(other).toEqual({ ok: false, error: { code: 'changed-since-read' } });
  });

  it('refuses a draft started on an older revision', async () => {
    const { deps, as } = world(fullDraft, { draft: draftOf(fullDraft, null) });
    expect(await publishSchedule(as(ownerId), input, deps)).toEqual({
      ok: false,
      error: { code: 'revision-out-of-date' },
    });
  });

  it('refuses when there is no draft, or nothing to publish', async () => {
    const none = world([], { draft: undefined });
    expect(await publishSchedule(none.as(ownerId), input, none.deps)).toEqual({
      ok: false,
      error: { code: 'draft-not-found' },
    });
    const empty = world([]);
    expect(await publishSchedule(empty.as(ownerId), input, empty.deps)).toEqual({
      ok: false,
      error: { code: 'nothing-to-publish' },
    });
  });

  it('refuses to move or remove a game that is live or decided', async () => {
    for (const status of ['live', 'final', 'forfeit'] as const) {
      const { db, deps, as } = world([{ kind: 'move-game', gameId: gameUuid(1), to: slot }], {
        schedule: {
          rounds: [
            { id: roundUuid(1), label: 'Week 1', date: '2026-10-04' },
            { id: roundUuid(2), label: 'Week 2', date: '2026-10-11' },
          ],
          games: [game(1, { status })],
        },
      });
      expect(await publishSchedule(as(ownerId), input, deps)).toEqual({
        ok: false,
        error: { code: 'game-already-started', gameId: gameUuid(1) },
      });
      expect(db.state.revisions).toHaveLength(0);
    }
    const removal = world([{ kind: 'remove-game', gameId: gameUuid(1) }], {
      schedule: {
        rounds: [{ id: roundUuid(1), label: 'Week 1', date: '2026-10-04' }],
        games: [game(1, { status: 'final' })],
      },
    });
    expect(await publishSchedule(removal.as(ownerId), input, removal.deps)).toMatchObject({
      ok: false,
      error: { code: 'game-already-started' },
    });
  });

  it('refuses an added game whose id exists already, binned or undated', async () => {
    const { deps, as } = world([{ kind: 'add-game', game: game(9) }], {
      otherGames: [{ id: gameUuid(9), status: 'scheduled', binned: true, hasEvents: false }],
    });
    expect(await publishSchedule(as(ownerId), input, deps)).toEqual({
      ok: false,
      error: { code: 'game-id-taken', gameId: gameUuid(9) },
    });
  });

  it('refuses games with no time, a team, venue or court that is gone', async () => {
    const noTime = world([{ kind: 'add-game', game: game(9, { time: null }) }]);
    expect(await publishSchedule(noTime.as(ownerId), input, noTime.deps)).toMatchObject({
      error: { code: 'game-without-time', gameId: gameUuid(9) },
    });
    const noTeam = world([{ kind: 'add-game', game: game(9) }], {
      teamIds: [teamUuid(2), teamUuid(3)],
    });
    expect(await publishSchedule(noTeam.as(ownerId), input, noTeam.deps)).toMatchObject({
      error: { code: 'unknown-team' },
    });
    const noVenue = world([{ kind: 'add-game', game: game(9) }], {
      venues: [venue(1, { binned: true })],
    });
    expect(await publishSchedule(noVenue.as(ownerId), input, noVenue.deps)).toMatchObject({
      error: { code: 'unknown-venue' },
    });
    const noCourt = world([{ kind: 'add-game', game: game(9, { court: 'Court 9' }) }]);
    expect(await publishSchedule(noCourt.as(ownerId), input, noCourt.deps)).toMatchObject({
      error: { code: 'unknown-court' },
    });
  });

  it('refuses to publish while a change no longer fits', async () => {
    const { deps, as } = world([
      { kind: 'move-game', gameId: gameUuid(1), to: slot },
      { kind: 'remove-game', gameId: gameUuid(77) },
    ]);
    expect(await publishSchedule(as(ownerId), input, deps)).toEqual({
      ok: false,
      error: { code: 'change-no-longer-fits' },
    });
  });

  it('leaves everything as it was when it refuses', async () => {
    const { db, deps, as } = world(fullDraft, { otherGames: [] });
    const before = structuredClone(db.state.schedule);
    await publishSchedule(as(ownerId), { ...input, version: 9 }, deps);
    expect(db.state.schedule).toEqual(before);
    expect(db.state.activity).toHaveLength(0);
  });

  it('is for those who may publish, and not while the league is archived', async () => {
    const { deps, as } = world(fullDraft, { grants: [] });
    expect(await publishSchedule(as('01900000-0000-7000-8000-0000000000a9'), input, deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    const archived = world(fullDraft, { status: 'archived' });
    expect(await publishSchedule(archived.as(ownerId), input, archived.deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    const scheduler = world(fullDraft);
    expect(
      (await publishSchedule(scheduler.as(schedulerGrant.accountId), input, scheduler.deps)).ok,
    ).toBe(true);
  });
});

describe('previewing a publication', () => {
  it('shows what publishing then does, with the teams and people reached', async () => {
    const { deps, as, db } = world(fullDraft);
    const preview = await previewSchedulePublish(as(ownerId), { seasonId }, deps);
    expect(preview).toMatchObject({
      ok: true,
      value: {
        draftId: draftUuid(1),
        version: 3,
        basedOnRevision: 1,
        teamCount: 4,
        peopleCount: 38,
        blockers: [],
        canPublish: true,
      },
    });
    expect(db.state.revisions).toHaveLength(0);
    const published = await publishSchedule(as(ownerId), input, deps);
    if (!preview.ok || !published.ok) throw new Error('expected both to work');
    expect(published.value.summary).toEqual(preview.value.summary);
    expect(published.value.teamCount).toBe(preview.value.teamCount);
    expect(published.value.peopleCount).toBe(preview.value.peopleCount);
  });

  it('counts the round dates it will write, the same in the preview and the publication', async () => {
    const { deps, as, db } = world(fullDraft);
    const preview = await previewSchedulePublish(as(ownerId), { seasonId }, deps);
    const published = await publishSchedule(as(ownerId), input, deps);
    if (!preview.ok || !published.ok) throw new Error('expected both to work');
    const written = db.state.roundChanges.filter((c) => c.date !== undefined);
    expect(preview.value.summary.roundsDateChanged).toHaveLength(written.length);
    expect(published.value.summary.roundsDateChanged).toHaveLength(written.length);
  });

  it('lists every blocker, the first of which publishing refuses with', async () => {
    const changes: DraftChange[] = [
      { kind: 'add-game', game: game(9, { time: null }) },
      { kind: 'add-game', game: game(8, { court: 'Court 9' }) },
    ];
    const { deps, as } = world(changes);
    const preview = await previewSchedulePublish(as(ownerId), { seasonId }, deps);
    if (!preview.ok) throw new Error('expected a preview');
    expect(preview.value.canPublish).toBe(false);
    expect(preview.value.blockers.map((b) => b.code)).toEqual([
      'game-without-time',
      'unknown-court',
    ]);
    const refused = await publishSchedule(as(ownerId), input, deps);
    expect(refused).toMatchObject({ ok: false, error: preview.value.blockers[0] });
  });

  it('says so when there is no draft or no such season', async () => {
    const { deps, as } = world([], { draft: undefined });
    expect(await previewSchedulePublish(as(ownerId), { seasonId }, deps)).toEqual({
      ok: false,
      error: { code: 'draft-not-found' },
    });
    expect(
      await previewSchedulePublish(
        as(ownerId),
        { seasonId: '01900000-0000-7000-8000-0000000d0099' },
        deps,
      ),
    ).toEqual({ ok: false, error: { code: 'season-not-found' } });
  });

  it('leaves other leagues roles out', async () => {
    const { deps, as } = world(fullDraft, { grants: [] });
    expect(
      await previewSchedulePublish(as('01900000-0000-7000-8000-0000000000a9'), { seasonId }, deps),
    ).toEqual({ ok: false, error: { code: 'not-allowed' } });
  });
});
