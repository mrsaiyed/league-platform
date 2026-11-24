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
  type MemoryScheduling,
} from '../memory-scheduling.test-helper.ts';
import type { ScheduleGame } from '../rules/schedule-types.ts';
import { publishChangeCount } from '../rules/summarize-publish.ts';
import { addDraftGame } from './add-draft-game.ts';
import { changeDraftRoundDate } from './change-draft-round-date.ts';
import { discardScheduleDraft } from './discard-schedule-draft.ts';
import { getScheduleDraft } from './get-schedule-draft.ts';
import { moveDraftGame } from './move-draft-game.ts';
import { previewSchedulePublish } from './preview-schedule-publish.ts';
import { publishSchedule } from './publish-schedule.ts';
import { putBackDraftGame } from './put-back-draft-game.ts';
import { removeDraftGame } from './remove-draft-game.ts';
import { renameDraftRound } from './rename-draft-round.ts';
import { setDraftRecording } from './set-draft-recording.ts';
import { swapDraftGames } from './swap-draft-games.ts';

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

const world = (state: Partial<MemoryScheduling> = {}) =>
  memoryScheduling({
    venues: [venue(1)],
    courts: [court(1, 1), court(2, 1)],
    teamIds: [1, 2, 3, 4].map(teamUuid),
    grants: [schedulerGrant],
    schedule: {
      rounds: [
        { id: roundUuid(1), number: 1, label: 'Week 1', date: '2026-10-04' },
        { id: roundUuid(2), number: 2, label: 'Week 2', date: '2026-10-11' },
      ],
      games: [
        game(1),
        game(2, { homeTeamId: teamUuid(3), awayTeamId: teamUuid(4), court: 'Court 2' }),
      ],
    },
    ...state,
  });

const basis = (version: number | null = null, basedOnRevision: number | null = null) => ({
  seasonId,
  basedOnRevision,
  version,
  draftId: version === null ? null : draftUuid(1),
});

const slot = {
  roundId: roundUuid(2),
  date: '2026-10-11',
  time: '18:00',
  venueId: venueUuid(1),
  court: 'Court 1',
};

describe('schedule draft commands', () => {
  it('starts a draft with the first edit and builds on it with the next', async () => {
    const { db, deps, as } = world();
    const first = await moveDraftGame(
      as(ownerId),
      { ...basis(), gameId: gameUuid(1), ...slot },
      deps,
    );
    expect(first).toEqual({
      ok: true,
      value: { draftId: draftUuid(1), version: 1, basedOnRevision: null, clashes: [] },
    });
    const second = await renameDraftRound(
      as(ownerId),
      { ...basis(1), roundId: roundUuid(1), label: 'Opening night' },
      deps,
    );
    expect(second).toMatchObject({ ok: true, value: { version: 2 } });
    expect(db.state.draft?.version).toBe(2);
    expect(db.state.activity.map((a) => a.action)).toEqual([
      'scheduling.move_draft_game',
      'scheduling.rename_draft_round',
    ]);
    // The published schedule is never touched (A-9).
    expect(db.state.schedule.games[0]?.date).toBe('2026-10-04');
  });

  it('flags a clash instead of refusing the edit', async () => {
    const { deps, as } = world();
    const result = await moveDraftGame(
      as(ownerId),
      { ...basis(), gameId: gameUuid(2), ...slot, roundId: roundUuid(1), date: '2026-10-04' },
      deps,
    );
    expect(result).toMatchObject({ ok: true });
    const view = await getScheduleDraft(as(ownerId), { seasonId }, deps);
    expect(view).toMatchObject({
      ok: true,
      value: { clashes: [{ kind: 'court-booked-twice' }] },
    });
  });

  it('adds, swaps, removes, changes a round date and sets a recording mode', async () => {
    const { deps, as } = world();
    const added = await addDraftGame(
      as(ownerId),
      {
        ...basis(),
        gameId: gameUuid(9),
        homeTeamId: teamUuid(1),
        awayTeamId: teamUuid(3),
        ...slot,
        recording: 'live',
      },
      deps,
    );
    expect(added).toMatchObject({ ok: true, value: { version: 1 } });
    expect(
      await swapDraftGames(
        as(ownerId),
        { ...basis(1), gameId: gameUuid(1), otherGameId: gameUuid(2) },
        deps,
      ),
    ).toMatchObject({ ok: true, value: { version: 2 } });
    expect(
      await setDraftRecording(
        as(ownerId),
        { ...basis(2), gameId: gameUuid(2), recording: 'box-score' },
        deps,
      ),
    ).toMatchObject({ ok: true, value: { version: 3 } });
    expect(
      await changeDraftRoundDate(
        as(ownerId),
        { ...basis(3), roundId: roundUuid(2), date: '2026-10-12' },
        deps,
      ),
    ).toMatchObject({ ok: true, value: { version: 4 } });
    expect(
      await removeDraftGame(as(ownerId), { ...basis(4), gameId: gameUuid(1) }, deps),
    ).toMatchObject({ ok: true, value: { version: 5 } });

    const view = await getScheduleDraft(as(ownerId), { seasonId }, deps);
    if (!view.ok) throw new Error('refused');
    expect(view.value.draft).toMatchObject({ version: 5, savedEdits: 5, outOfDate: false });
    expect(view.value.result.games.map((g) => g.id).sort()).toEqual(
      [gameUuid(2), gameUuid(9)].sort(),
    );
    expect(view.value.result.games.find((g) => g.id === gameUuid(9))?.date).toBe('2026-10-12');
    expect(view.value.summary.gamesAdded).toEqual([gameUuid(9)]);
    expect(view.value.summary.gamesRemoved).toEqual([gameUuid(1)]);
  });

  it('refuses an edit based on an old revision, and a draft left from one', async () => {
    const { deps, as } = world({ latestRevision: 2 });
    // The admin looked at revision 1; revision 2 is out.
    const old = await moveDraftGame(
      as(ownerId),
      { ...basis(null, 1), gameId: gameUuid(1), ...slot },
      deps,
    );
    expect(old).toMatchObject({ ok: false, error: { code: 'revision-out-of-date' } });

    const stale = world({
      latestRevision: 2,
      draft: {
        id: draftUuid(1),
        seasonId,
        changes: { version: 1, changes: [] },
        basedOnRevision: 1,
        version: 3,
      },
    });
    const left = await moveDraftGame(
      stale.as(ownerId),
      { ...basis(3, 2), gameId: gameUuid(1), ...slot },
      stale.deps,
    );
    expect(left).toMatchObject({ ok: false, error: { code: 'revision-out-of-date' } });
    expect(stale.db.state.draft?.version).toBe(3);
  });

  it('refuses a second admin who read an older version of the draft (A-8)', async () => {
    const { db, deps, as } = world();
    await moveDraftGame(as(ownerId), { ...basis(), gameId: gameUuid(1), ...slot }, deps);
    const late = await renameDraftRound(
      as(ownerId),
      { ...basis(null), roundId: roundUuid(1), label: 'Mine' },
      deps,
    );
    expect(late).toMatchObject({ ok: false, error: { code: 'changed-since-read' } });
    await renameDraftRound(
      as(ownerId),
      { ...basis(1), roundId: roundUuid(1), label: 'First' },
      deps,
    );
    const behind = await renameDraftRound(
      as(ownerId),
      { ...basis(1), roundId: roundUuid(1), label: 'Second' },
      deps,
    );
    expect(behind).toMatchObject({ ok: false, error: { code: 'changed-since-read' } });
    expect(db.state.draft?.version).toBe(2);
  });

  it('refuses what the rules refuse, and what names things that are not there', async () => {
    const { deps, as } = world();
    const code = async (result: Promise<{ ok: boolean; error?: unknown }>) => {
      const r = await result;
      return r.ok ? 'ok' : JSON.stringify(r.error);
    };
    expect(
      await code(moveDraftGame(as(ownerId), { ...basis(), gameId: gameUuid(7), ...slot }, deps)),
    ).toContain('unknown-game');
    expect(
      await code(
        moveDraftGame(
          as(ownerId),
          { ...basis(), gameId: gameUuid(1), ...slot, date: '2026-13-40' },
          deps,
        ),
      ),
    ).toContain('invalid-date');
    expect(
      await code(
        moveDraftGame(
          as(ownerId),
          { ...basis(), gameId: gameUuid(1), ...slot, court: 'Court 9' },
          deps,
        ),
      ),
    ).toContain('unknown-court');
    expect(
      await code(
        moveDraftGame(
          as(ownerId),
          { ...basis(), gameId: gameUuid(1), ...slot, venueId: venueUuid(5) },
          deps,
        ),
      ),
    ).toContain('unknown-venue');
    expect(
      await code(
        addDraftGame(
          as(ownerId),
          {
            ...basis(),
            gameId: gameUuid(9),
            homeTeamId: teamUuid(1),
            awayTeamId: teamUuid(8),
            ...slot,
          },
          deps,
        ),
      ),
    ).toContain('unknown-team');
    expect(
      await code(
        renameDraftRound(as(ownerId), { ...basis(), roundId: roundUuid(1), label: '  ' }, deps),
      ),
    ).toContain('invalid-input');
  });

  it('makes no new game for a team that has left the league, and keeps its games (S-87)', async () => {
    const { db, deps, as } = world();
    db.state.leftTeamIds = [teamUuid(2)];
    const game = (gameId: string, homeTeamId: string, awayTeamId: string) =>
      addDraftGame(as(ownerId), { ...basis(), gameId, homeTeamId, awayTeamId, ...slot }, deps);
    expect(await game(gameUuid(9), teamUuid(1), teamUuid(2))).toMatchObject({
      ok: false,
      error: { code: 'team-left' },
    });
    expect(await game(gameUuid(9), teamUuid(2), teamUuid(3))).toMatchObject({
      ok: false,
      error: { code: 'team-left' },
    });
    expect(db.state.draft).toBeUndefined();
    // A team still playing is offered as before; the mark taken off, so is the team.
    expect(await game(gameUuid(9), teamUuid(1), teamUuid(3))).toMatchObject({ ok: true });
    db.state.leftTeamIds = [];
    const back = await addDraftGame(
      as(ownerId),
      {
        ...basis(1),
        gameId: gameUuid(10),
        homeTeamId: teamUuid(2),
        awayTeamId: teamUuid(4),
        ...slot,
      },
      deps,
    );
    expect(back).toMatchObject({ ok: true });

    // Marked as left while a game of it is in the draft, not yet published: publishing is
    // refused naming the game, and that game, once removed, cannot be put back.
    db.state.leftTeamIds = [teamUuid(2)];
    const preview = await previewSchedulePublish(as(ownerId), { seasonId }, deps);
    expect(preview.ok && preview.value.blockers).toContainEqual({
      code: 'team-left',
      gameId: gameUuid(10),
    });
    expect(
      await publishSchedule(
        as(ownerId),
        { seasonId, basedOnRevision: null, draftId: draftUuid(1), version: 2 },
        deps,
      ),
    ).toMatchObject({ ok: false, error: { code: 'team-left', gameId: gameUuid(10) } });
    expect(
      await removeDraftGame(as(ownerId), { ...basis(2), gameId: gameUuid(10) }, deps),
    ).toMatchObject({ ok: true });
    expect(
      await putBackDraftGame(as(ownerId), { ...basis(3), gameId: gameUuid(10) }, deps),
    ).toMatchObject({ ok: false, error: { code: 'team-left', teamIds: [teamUuid(2)] } });
  });

  it('discards the draft, only the version that was seen', async () => {
    const { db, deps, as } = world();
    expect(
      await discardScheduleDraft(
        as(ownerId),
        { seasonId, draftId: draftUuid(1), version: 1 },
        deps,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'draft-not-found' },
    });
    await moveDraftGame(as(ownerId), { ...basis(), gameId: gameUuid(1), ...slot }, deps);
    expect(
      await discardScheduleDraft(
        as(ownerId),
        { seasonId, draftId: draftUuid(1), version: 5 },
        deps,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'changed-since-read' },
    });
    expect(
      await discardScheduleDraft(
        as(ownerId),
        { seasonId, draftId: draftUuid(1), version: 1 },
        deps,
      ),
    ).toEqual({
      ok: true,
      value: {},
    });
    expect(db.state.draft).toBeUndefined();
    expect(db.state.activity.at(-1)?.action).toBe('scheduling.discard_schedule_draft');
  });

  it('refuses a reader of a draft that was discarded and started again (A-8)', async () => {
    const { db, deps, as } = world();
    await moveDraftGame(as(ownerId), { ...basis(), gameId: gameUuid(1), ...slot }, deps);
    // A read the draft at version 1; B discards it and starts a new one, also at version 1.
    expect(
      await discardScheduleDraft(
        as(ownerId),
        { seasonId, draftId: draftUuid(1), version: 1 },
        deps,
      ),
    ).toMatchObject({ ok: true });
    const again = await renameDraftRound(
      as(ownerId),
      { ...basis(), roundId: roundUuid(1), label: 'Bs draft' },
      deps,
    );
    expect(again).toMatchObject({ ok: true, value: { draftId: draftUuid(2), version: 1 } });

    const edit = await renameDraftRound(
      as(ownerId),
      { ...basis(1), roundId: roundUuid(1), label: 'As edit' },
      deps,
    );
    expect(edit).toMatchObject({ ok: false, error: { code: 'changed-since-read' } });
    const discard = await discardScheduleDraft(
      as(ownerId),
      { seasonId, draftId: draftUuid(1), version: 1 },
      deps,
    );
    expect(discard).toMatchObject({ ok: false, error: { code: 'changed-since-read' } });
    expect(db.state.draft?.id).toBe(draftUuid(2));
  });

  it('trims a round label and refuses a draft that grows too large', async () => {
    const { db, deps, as } = world();
    await renameDraftRound(
      as(ownerId),
      { ...basis(), roundId: roundUuid(1), label: '  Opening night  ' },
      deps,
    );
    expect(db.state.draft?.changes).toMatchObject({
      changes: [{ kind: 'rename-round', label: 'Opening night' }],
    });
    const huge = Array.from({ length: 9000 }, (_, k) => ({
      kind: 'rename-round' as const,
      roundId: roundUuid(1),
      label: `Label number ${k} `.repeat(4),
    }));
    const big = world({
      draft: {
        id: draftUuid(1),
        seasonId,
        changes: { version: 1, changes: huge },
        basedOnRevision: null,
        version: 1,
      },
    });
    expect(
      await renameDraftRound(
        big.as(ownerId),
        { ...basis(1), roundId: roundUuid(1), label: 'One more' },
        big.deps,
      ),
    ).toMatchObject({ ok: false, error: { code: 'draft-too-large' } });
  });

  it('reads an unreadable draft as such, and shows none when there is none', async () => {
    const { deps, as } = world();
    expect(await getScheduleDraft(as(ownerId), { seasonId }, deps)).toMatchObject({
      ok: true,
      value: { draft: null, latestRevision: null, clashes: [] },
    });
    const broken = world({
      draft: {
        id: draftUuid(1),
        seasonId,
        changes: { version: 7 },
        basedOnRevision: null,
        version: 1,
      },
    });
    expect(await getScheduleDraft(broken.as(ownerId), { seasonId }, broken.deps)).toMatchObject({
      ok: false,
      error: { code: 'draft-unreadable' },
    });
  });

  it('lets a scheduler edit, a signed-out or role-less person nothing, and nobody edit an archived league', async () => {
    const { schedulerId } = await import('../memory-scheduling.test-helper.ts');
    const ok = world();
    expect(
      await moveDraftGame(
        ok.as(schedulerId),
        { ...basis(), gameId: gameUuid(1), ...slot },
        ok.deps,
      ),
    ).toMatchObject({ ok: true });
    expect(
      await moveDraftGame(ok.as(null), { ...basis(), gameId: gameUuid(1), ...slot }, ok.deps),
    ).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
    const archived = world({ status: 'archived' });
    expect(
      await moveDraftGame(
        archived.as(ownerId),
        { ...basis(), gameId: gameUuid(1), ...slot },
        archived.deps,
      ),
    ).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
    // Reading still works there.
    expect(await getScheduleDraft(archived.as(ownerId), { seasonId }, archived.deps)).toMatchObject(
      { ok: true },
    );
  });

  it('reports a season that is not there', async () => {
    const { deps, as } = world();
    const other = '01900000-0000-7000-8000-0000000d0099';
    expect(await getScheduleDraft(as(ownerId), { seasonId: other }, deps)).toMatchObject({
      ok: false,
      error: { code: 'season-not-found' },
    });
  });
});

describe('taking back a drafted new date (step 2.53 fix round)', () => {
  it('puts a postponed game back as published, and refuses a game that is played', async () => {
    const w = world({
      schedule: {
        rounds: [{ id: roundUuid(1), number: 1, label: 'Week 1', date: '2026-10-04' }],
        games: [game(1, { status: 'postponed' }), game(2, { status: 'final', court: 'Court 2' })],
      },
    });
    const moved = await moveDraftGame(
      w.as(ownerId),
      { ...basis(), gameId: gameUuid(1), ...slot, roundId: roundUuid(1) },
      w.deps,
    );
    expect(moved).toMatchObject({ ok: true });
    const back = await moveDraftGame(
      w.as(ownerId),
      { ...basis(1), gameId: gameUuid(1), ...slot, roundId: null, takeBack: true },
      w.deps,
    );
    expect(back).toMatchObject({ ok: true, value: { version: 2 } });
    const view = await getScheduleDraft(w.as(ownerId), { seasonId }, w.deps);
    if (!view.ok) throw new Error('refused');
    expect(view.value.toPublish).toBe(0);
    expect(view.value.result.games.find((g) => g.id === gameUuid(1))).toMatchObject({
      status: 'postponed',
      date: '2026-10-04',
      roundId: roundUuid(1),
    });
    const played = await moveDraftGame(
      w.as(ownerId),
      { ...basis(2), gameId: gameUuid(2), ...slot, takeBack: true },
      w.deps,
    );
    expect(played).toMatchObject({ ok: false, error: { code: 'change-refused' } });
  });
});

describe("the draft's count of what publishing would change (step 2.185)", () => {
  /** The draft view's count and the publish preview's, read as the grid reads them. */
  const counts = async (w: ReturnType<typeof world>) => {
    const view = await getScheduleDraft(w.as(ownerId), { seasonId }, w.deps);
    const preview = await previewSchedulePublish(w.as(ownerId), { seasonId }, w.deps);
    if (!view.ok) throw new Error('refused');
    return {
      view: view.value.toPublish,
      preview: preview.ok ? preview.value.toPublish : undefined,
      summary: publishChangeCount(view.value.summary),
    };
  };

  it('is zero after a remove and a put back, and the same as the publish summary at every step', async () => {
    const w = world();
    expect(await counts(w)).toEqual({ view: 0, preview: undefined, summary: 0 });
    expect(
      await removeDraftGame(w.as(ownerId), { ...basis(), gameId: gameUuid(1) }, w.deps),
    ).toMatchObject({ ok: true });
    expect(await counts(w)).toEqual({ view: 1, preview: 1, summary: 1 });
    // Two other games moved: three changes, wherever they are counted.
    expect(
      await moveDraftGame(w.as(ownerId), { ...basis(1), gameId: gameUuid(2), ...slot }, w.deps),
    ).toMatchObject({ ok: true });
    expect(await counts(w)).toEqual({ view: 2, preview: 2, summary: 2 });
    // "Put it back": the game as the draft last held it, with its own id.
    expect(
      await putBackDraftGame(w.as(ownerId), { ...basis(2), gameId: gameUuid(1) }, w.deps),
    ).toMatchObject({ ok: true });
    expect(await counts(w)).toEqual({ view: 1, preview: 1, summary: 1 });
    // The move undone by hand: the draft holds four edits and changes nothing.
    expect(
      await moveDraftGame(
        w.as(ownerId),
        {
          ...basis(3),
          gameId: gameUuid(2),
          roundId: roundUuid(1),
          date: '2026-10-04',
          time: '18:00',
          venueId: venueUuid(1),
          court: 'Court 2',
        },
        w.deps,
      ),
    ).toMatchObject({ ok: true });
    expect(await counts(w)).toEqual({ view: 0, preview: 0, summary: 0 });
    const view = await getScheduleDraft(w.as(ownerId), { seasonId }, w.deps);
    expect(view).toMatchObject({ ok: true, value: { draft: { savedEdits: 4 }, toPublish: 0 } });
  });
});
