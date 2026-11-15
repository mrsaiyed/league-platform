import { describe, expect, it } from 'vitest';
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
} from '../memory-scheduling.test-helper.ts';
import { addDraftGame } from './add-draft-game.ts';
import { addDraftRound } from './add-draft-round.ts';
import { getScheduleDraft } from './get-schedule-draft.ts';
import { previewSchedulePublish } from './preview-schedule-publish.ts';
import { publishSchedule } from './publish-schedule.ts';

/** A new season: two teams, one venue, no rounds, nothing published yet. */
const newSeason = () =>
  memoryScheduling({
    venues: [venue(1)],
    teamIds: [teamUuid(1), teamUuid(2)],
    grants: [schedulerGrant],
  });

const basis = (version: number | null) => ({
  seasonId,
  basedOnRevision: null,
  version,
  draftId: version === null ? null : draftUuid(1),
});

const weeks = [
  { roundId: roundUuid(1), label: 'Week 1', date: '2026-11-15' },
  { roundId: roundUuid(2), label: 'Week 2', date: '2026-11-22' },
  { roundId: roundUuid(3), label: 'Week 3', date: '2026-11-29' },
];

describe('adding a round to the schedule draft (step 2.160)', () => {
  it('adds three rounds to a season with none, all in the draft and none published', async () => {
    const { db, deps, as } = newSeason();
    for (const [i, week] of weeks.entries()) {
      const added = await addDraftRound(
        as(ownerId),
        { ...basis(i === 0 ? null : i), ...week },
        deps,
      );
      expect(added).toEqual({
        ok: true,
        value: { draftId: draftUuid(1), version: i + 1, basedOnRevision: null, clashes: [] },
      });
    }
    const view = await getScheduleDraft(as(ownerId), { seasonId }, deps);
    if (!view.ok) throw new Error('could not read the draft');
    expect(view.value.result.rounds).toEqual(
      weeks.map((w) => ({ id: w.roundId, label: w.label, date: w.date })),
    );
    // Nothing published: the public schedule is the store's, and it has no rounds (A-9).
    expect(view.value.published.rounds).toEqual([]);
    expect(db.state.schedule.rounds).toEqual([]);
    expect(db.state.roundsAdded).toEqual([]);
    expect(view.value.summary.roundsAdded).toEqual(weeks.map((w) => w.roundId));
    expect(db.state.activity.map((a) => a.action)).toEqual([
      'scheduling.add_draft_round',
      'scheduling.add_draft_round',
      'scheduling.add_draft_round',
    ]);
  });

  it('refuses a round with no name or a date that is not one, and one already there', async () => {
    const { db, deps, as } = newSeason();
    const blank = await addDraftRound(
      as(ownerId),
      { ...basis(null), roundId: roundUuid(1), label: '   ', date: '2026-11-15' },
      deps,
    );
    expect(blank).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    const badDate = await addDraftRound(
      as(ownerId),
      { ...basis(null), roundId: roundUuid(1), label: 'Week 1', date: '2026-11-31' },
      deps,
    );
    expect(badDate).toEqual({
      ok: false,
      error: { code: 'change-refused', reason: { code: 'invalid-date', value: '2026-11-31' } },
    });
    expect(db.state.draft).toBeUndefined();
    expect((await addDraftRound(as(ownerId), { ...basis(null), ...weeks[0] }, deps)).ok).toBe(true);
    // The same request again (a retried tap) is refused, so the round is never there twice.
    const twice = await addDraftRound(as(ownerId), { ...basis(1), ...weeks[0] }, deps);
    expect(twice).toEqual({
      ok: false,
      error: { code: 'change-refused', reason: { code: 'round-exists', roundId: roundUuid(1) } },
    });
  });

  it('is refused to someone who may not edit the schedule', async () => {
    const { db, deps, as } = newSeason();
    const result = await addDraftRound(
      as('01900000-0000-7000-8000-0000000000a9'),
      { ...basis(null), ...weeks[0] },
      deps,
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
    expect(db.state.draft).toBeUndefined();
  });

  it('publishes the new rounds in order, before the games placed in them', async () => {
    const { db, deps, as } = newSeason();
    for (const [i, week] of weeks.entries()) {
      await addDraftRound(as(ownerId), { ...basis(i === 0 ? null : i), ...week }, deps);
    }
    const game = await addDraftGame(
      as(ownerId),
      {
        ...basis(3),
        gameId: gameUuid(1),
        homeTeamId: teamUuid(1),
        awayTeamId: teamUuid(2),
        roundId: roundUuid(3),
        date: '2026-11-29',
        time: '18:00',
        venueId: venueUuid(1),
        court: null,
      },
      deps,
    );
    expect(game.ok).toBe(true);
    const preview = await previewSchedulePublish(as(ownerId), { seasonId }, deps);
    expect(preview).toMatchObject({
      ok: true,
      value: {
        canPublish: true,
        summary: { roundsAdded: weeks.map((w) => w.roundId), roundsRemoved: [] },
      },
    });
    const published = await publishSchedule(
      as(ownerId),
      { seasonId, basedOnRevision: null, draftId: draftUuid(1), version: 4 },
      deps,
    );
    expect(published).toMatchObject({ ok: true, value: { revision: 1 } });
    expect(db.state.roundsAdded).toEqual(
      weeks.map((w) => ({ id: w.roundId, label: w.label, date: w.date })),
    );
    expect(db.state.inserted.map((g) => g.roundId)).toEqual([roundUuid(3)]);
    expect(db.state.revisions[0]?.summary).toMatchObject({ roundsAdded: 3, roundsRemoved: 0 });
  });

  it('refuses to publish, changing nothing, when a new round cannot be added', async () => {
    const { db, deps, as } = newSeason();
    await addDraftRound(as(ownerId), { ...basis(null), ...weeks[0] }, deps);
    // Another season took the id meanwhile: the store adds nothing.
    db.state.roundsAdded.push({ id: roundUuid(1), label: 'Elsewhere', date: null });
    const result = await publishSchedule(
      as(ownerId),
      { seasonId, basedOnRevision: null, draftId: draftUuid(1), version: 1 },
      deps,
    );
    expect(result).toEqual({ ok: false, error: { code: 'round-cannot-be-added' } });
    expect(db.state.revisions).toEqual([]);
  });
});
