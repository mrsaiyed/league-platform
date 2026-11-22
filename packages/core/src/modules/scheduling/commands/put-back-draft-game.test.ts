// "Put it back" (step 2.185): dropping the draft's removal of a game is always allowed,
// whatever has happened to the game since, and gives the draft the game as it last held it.
import { describe, expect, it } from 'vitest';
import {
  court,
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
import type { DraftChange, ScheduleGame } from '../rules/schedule-types.ts';
import { addDraftGame } from './add-draft-game.ts';
import { getScheduleDraft } from './get-schedule-draft.ts';
import { previewSchedulePublish } from './preview-schedule-publish.ts';
import { putBackDraftGame } from './put-back-draft-game.ts';

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

/** A season at revision 1 with two games, and a draft holding `changes`. */
const world = (changes: DraftChange[], games: ScheduleGame[] = [game(1), game(2)]) =>
  memoryScheduling({
    venues: [venue(1)],
    courts: [court(1, 1), court(2, 1)],
    teamIds: [1, 2, 3, 4].map(teamUuid),
    grants: [schedulerGrant],
    latestRevision: 1,
    schedule: {
      rounds: [
        { id: roundUuid(1), number: 1, label: 'Week 1', date: '2026-10-04' },
        { id: roundUuid(2), number: 2, label: 'Week 2', date: '2026-10-11' },
      ],
      games,
    },
    draft: {
      id: draftUuid(1),
      seasonId,
      changes: { version: 1, changes },
      basedOnRevision: 1,
      version: changes.length,
    },
  });
const basis = (version: number) => ({
  seasonId,
  basedOnRevision: 1,
  version,
  draftId: draftUuid(1),
});

describe('putting a removed game back in the draft (step 2.185)', () => {
  it('gives the draft the game as it last held it, and counts nothing for it', async () => {
    const w = world([
      {
        kind: 'move-game',
        gameId: gameUuid(1),
        to: {
          roundId: roundUuid(2),
          date: '2026-10-11',
          time: '18:00',
          venueId: venueUuid(1),
          court: 'Court 1',
        },
      },
      { kind: 'remove-game', gameId: gameUuid(1) },
    ]);
    expect(
      await putBackDraftGame(w.as(ownerId), { ...basis(2), gameId: gameUuid(1) }, w.deps),
    ).toMatchObject({ ok: true, value: { version: 3 } });
    const view = await getScheduleDraft(w.as(ownerId), { seasonId }, w.deps);
    if (!view.ok) throw new Error('refused');
    // Back where the draft had moved it: the move is still the one change.
    expect(view.value.result.games.find((g) => g.id === gameUuid(1))).toMatchObject({
      roundId: roundUuid(2),
      date: '2026-10-11',
    });
    expect(view.value.removed).toEqual([]);
    expect(view.value.toPublish).toBe(1);
    expect(view.value.summary.gamesMoved).toEqual([gameUuid(1)]);
  });

  it('always works on a game played since it was removed, and the draft can publish again', async () => {
    // The game was removed while scheduled; it has been played since (the published
    // schedule now says final), so the removal is a blocker that names it.
    const played = [game(1, { status: 'final' }), game(2)];
    const w = world([{ kind: 'remove-game', gameId: gameUuid(1) }], played);
    const before = await previewSchedulePublish(w.as(ownerId), { seasonId }, w.deps);
    expect(before).toMatchObject({
      ok: true,
      value: {
        canPublish: false,
        blockers: [{ code: 'game-already-started', gameId: gameUuid(1) }],
      },
    });
    const view = await getScheduleDraft(w.as(ownerId), { seasonId }, w.deps);
    // The draft's record of it says what it is now: final.
    expect(view).toMatchObject({ ok: true, value: { removed: [{ status: 'final' }] } });

    expect(
      await putBackDraftGame(w.as(ownerId), { ...basis(1), gameId: gameUuid(1) }, w.deps),
    ).toMatchObject({ ok: true });
    const after = await getScheduleDraft(w.as(ownerId), { seasonId }, w.deps);
    // Back as it is: final, never "scheduled" again, and no change to publish.
    expect(after).toMatchObject({
      ok: true,
      value: { toPublish: 0, removed: [] },
    });
    if (!after.ok) throw new Error('refused');
    expect(after.value.result.games.find((g) => g.id === gameUuid(1))?.status).toBe('final');
  });

  it('brings a game back with no round when the draft has removed its round since (S-60)', async () => {
    const w = world([
      { kind: 'remove-game', gameId: gameUuid(1) },
      { kind: 'remove-game', gameId: gameUuid(2) },
      { kind: 'remove-round', roundId: roundUuid(1) },
    ]);
    expect(
      await putBackDraftGame(w.as(ownerId), { ...basis(3), gameId: gameUuid(1) }, w.deps),
    ).toMatchObject({ ok: true });
    const view = await getScheduleDraft(w.as(ownerId), { seasonId }, w.deps);
    if (!view.ok) throw new Error('refused');
    expect(view.value.result.games.find((g) => g.id === gameUuid(1))?.roundId).toBeNull();
    expect(view.value.removed.map((g) => g.id)).toEqual([gameUuid(2)]);
  });

  it('refuses, changing nothing, a game the draft does not remove or holds already', async () => {
    const w = world([{ kind: 'remove-game', gameId: gameUuid(1) }]);
    expect(
      await putBackDraftGame(w.as(ownerId), { ...basis(1), gameId: gameUuid(2) }, w.deps),
    ).toEqual({
      ok: false,
      error: { code: 'change-refused', reason: { code: 'game-exists', gameId: gameUuid(2) } },
    });
    expect(
      await putBackDraftGame(w.as(ownerId), { ...basis(1), gameId: gameUuid(7) }, w.deps),
    ).toEqual({
      ok: false,
      error: { code: 'change-refused', reason: { code: 'unknown-game', gameId: gameUuid(7) } },
    });
    expect(w.db.state.draft?.version).toBe(1);
  });

  it("refuses a crafted add-game under a published game's id, so the count never lies (A1)", async () => {
    // Removed, then "added" again with other teams: publishing would only ever move it,
    // never change its teams, so the draft may not hold it.
    const w = world([{ kind: 'remove-game', gameId: gameUuid(1) }]);
    expect(
      await addDraftGame(
        w.as(ownerId),
        {
          ...basis(1),
          gameId: gameUuid(1),
          homeTeamId: teamUuid(3),
          awayTeamId: teamUuid(4),
          roundId: roundUuid(1),
          date: '2026-10-04',
          time: '18:00',
          venueId: venueUuid(1),
          court: 'Court 1',
        },
        w.deps,
      ),
    ).toEqual({
      ok: false,
      error: { code: 'change-refused', reason: { code: 'game-exists', gameId: gameUuid(1) } },
    });
    expect(w.db.state.draft?.version).toBe(1);
  });

  it('is for those who may edit the schedule', async () => {
    const w = world([{ kind: 'remove-game', gameId: gameUuid(1) }]);
    const someone = '01900000-0000-7000-8000-0000000000f9';
    expect(
      await putBackDraftGame(w.as(someone), { ...basis(1), gameId: gameUuid(1) }, w.deps),
    ).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
  });
});
