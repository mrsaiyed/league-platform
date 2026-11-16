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
  venueUuid,
  type MemoryScheduling,
} from '../memory-scheduling.test-helper.ts';
import type { DraftChange, ScheduleGame } from '../rules/schedule-types.ts';
import { getScheduleDraft } from './get-schedule-draft.ts';
import { previewSchedulePublish } from './preview-schedule-publish.ts';
import { publishSchedule } from './publish-schedule.ts';
import { removeDraftRound } from './remove-draft-round.ts';

const game = (n: number, over: Partial<ScheduleGame> = {}): ScheduleGame => ({
  id: gameUuid(n),
  roundId: roundUuid(1),
  date: '2026-10-04',
  time: '18:00',
  venueId: venueUuid(1),
  court: null,
  homeTeamId: teamUuid(1),
  awayTeamId: teamUuid(2),
  status: 'scheduled',
  recording: 'final-score',
  ...over,
});

/** Published: Week 1 with one game, Week 2 and Week 3 with none. Revision 1. */
const world = (changes: DraftChange[] = [], state: Partial<MemoryScheduling> = {}) =>
  memoryScheduling({
    venues: [venue(1)],
    teamIds: [teamUuid(1), teamUuid(2)],
    grants: [schedulerGrant],
    latestRevision: 1,
    schedule: {
      rounds: [
        { id: roundUuid(1), number: 1, label: 'Week 1', date: '2026-10-04' },
        { id: roundUuid(2), number: 2, label: 'Week 2', date: '2026-10-11' },
        { id: roundUuid(3), number: 3, label: 'Week 3', date: '2026-10-18' },
      ],
      games: [game(1)],
    },
    draft: {
      id: draftUuid(1),
      seasonId,
      changes: { version: 1, changes } satisfies DraftDocument,
      basedOnRevision: 1,
      version: 1,
    },
    ...state,
  });

const basis = { seasonId, basedOnRevision: 1, version: 1, draftId: draftUuid(1) };
const publish = { seasonId, basedOnRevision: 1, draftId: draftUuid(1), version: 2 };

describe('removing a round from the schedule draft (step 2.160)', () => {
  it('removes a round with no games in the draft, and publishing removes it', async () => {
    const { db, deps, as } = world();
    const removed = await removeDraftRound(as(ownerId), { ...basis, roundId: roundUuid(2) }, deps);
    expect(removed).toMatchObject({ ok: true, value: { version: 2 } });
    // Only the draft holds it: the published schedule keeps the round until publishing (A-9).
    expect(db.state.schedule.rounds).toHaveLength(3);
    const preview = await previewSchedulePublish(as(ownerId), { seasonId }, deps);
    expect(preview).toMatchObject({
      ok: true,
      value: { canPublish: true, summary: { roundsRemoved: [roundUuid(2)], roundsAdded: [] } },
    });
    expect(await publishSchedule(as(ownerId), publish, deps)).toMatchObject({ ok: true });
    expect(db.state.roundsRemoved).toEqual([roundUuid(2)]);
    expect(db.state.revisions[0]?.summary).toMatchObject({ roundsAdded: 0, roundsRemoved: 1 });
    expect(db.state.activity.map((a) => a.action)).toEqual([
      'scheduling.remove_draft_round',
      'scheduling.publish_schedule',
    ]);
  });

  it('refuses a round a game of the draft is in, and saves nothing', async () => {
    const { db, deps, as } = world();
    const result = await removeDraftRound(as(ownerId), { ...basis, roundId: roundUuid(1) }, deps);
    expect(result).toEqual({
      ok: false,
      error: { code: 'change-refused', reason: { code: 'round-has-games', roundId: roundUuid(1) } },
    });
    expect(db.state.draft?.version).toBe(1);
  });

  it('removes a round once the draft has moved its games out, and publishes the move first', async () => {
    const moveOut: DraftChange = {
      kind: 'move-game',
      gameId: gameUuid(1),
      to: {
        roundId: roundUuid(2),
        date: '2026-10-11',
        time: '18:00',
        venueId: venueUuid(1),
        court: null,
      },
    };
    const { db, deps, as } = world([moveOut]);
    const removed = await removeDraftRound(as(ownerId), { ...basis, roundId: roundUuid(1) }, deps);
    expect(removed.ok).toBe(true);
    expect(await publishSchedule(as(ownerId), publish, deps)).toMatchObject({ ok: true });
    expect(db.state.updated.map((u) => u.change.slot?.roundId)).toEqual([roundUuid(2)]);
    expect(db.state.roundsRemoved).toEqual([roundUuid(1)]);
  });

  it('refuses a round a game with no date yet is in, and the draft view shows that game in it (step 2.181)', async () => {
    const undated = { id: gameUuid(8), roundId: roundUuid(2) };
    const { db, deps, as } = world([], { gamesInOtherRounds: [undated] });
    expect(await removeDraftRound(as(ownerId), { ...basis, roundId: roundUuid(2) }, deps)).toEqual({
      ok: false,
      error: { code: 'round-in-use' },
    });
    expect(db.state.draft?.version).toBe(1);
    // The grid reads the round's games with no date from the draft view: the same game.
    expect(await getScheduleDraft(as(ownerId), { seasonId }, deps)).toMatchObject({
      ok: true,
      value: { undated: [undated] },
    });
  });

  it('removes a round whose only games are in the bin; publishing removes it and they lose their round (S-60)', async () => {
    const { db, deps, as } = world([], {
      binnedInRounds: [
        { id: gameUuid(8), roundId: roundUuid(2) },
        { id: gameUuid(9), roundId: roundUuid(2) },
      ],
    });
    // Nothing in the bin is shown as in the round.
    expect(await getScheduleDraft(as(ownerId), { seasonId }, deps)).toMatchObject({
      ok: true,
      value: { undated: [] },
    });
    const removed = await removeDraftRound(as(ownerId), { ...basis, roundId: roundUuid(2) }, deps);
    expect(removed).toMatchObject({ ok: true, value: { version: 2 } });
    expect(await publishSchedule(as(ownerId), publish, deps)).toMatchObject({ ok: true });
    expect(db.state.roundsRemoved).toEqual([roundUuid(2)]);
    expect(db.state.roundsCleared).toEqual([gameUuid(8), gameUuid(9)]);
  });

  it('removes a round whose games the same draft removes: publishing bins them, then removes the round', async () => {
    const { db, deps, as } = world([{ kind: 'remove-game', gameId: gameUuid(1) }]);
    const removed = await removeDraftRound(as(ownerId), { ...basis, roundId: roundUuid(1) }, deps);
    expect(removed).toMatchObject({ ok: true, value: { version: 2 } });
    const preview = await previewSchedulePublish(as(ownerId), { seasonId }, deps);
    expect(preview).toMatchObject({
      ok: true,
      value: {
        canPublish: true,
        summary: { gamesRemoved: [gameUuid(1)], roundsRemoved: [roundUuid(1)] },
      },
    });
    expect(await publishSchedule(as(ownerId), publish, deps)).toMatchObject({ ok: true });
    expect(db.state.binned).toEqual([gameUuid(1)]);
    expect(db.state.roundsRemoved).toEqual([roundUuid(1)]);
    expect(db.state.roundsCleared).toEqual([gameUuid(1)]);
  });

  it('blocks publishing a draft that removes a round a game came into since', async () => {
    const { deps, as } = world([{ kind: 'remove-round', roundId: roundUuid(3) }], {
      gamesInOtherRounds: [{ id: gameUuid(9), roundId: roundUuid(3) }],
    });
    const preview = await previewSchedulePublish(as(ownerId), { seasonId }, deps);
    expect(preview).toMatchObject({
      ok: true,
      value: { canPublish: false, blockers: [{ code: 'round-in-use', roundId: roundUuid(3) }] },
    });
    expect(await publishSchedule(as(ownerId), { ...publish, version: 1 }, deps)).toEqual({
      ok: false,
      error: { code: 'round-in-use', roundId: roundUuid(3) },
    });
  });

  it('is refused to someone who may not edit the schedule', async () => {
    const { db, deps, as } = world();
    const result = await removeDraftRound(
      as('01900000-0000-7000-8000-0000000000a9'),
      { ...basis, roundId: roundUuid(2) },
      deps,
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
    expect(db.state.draft?.version).toBe(1);
  });
});
