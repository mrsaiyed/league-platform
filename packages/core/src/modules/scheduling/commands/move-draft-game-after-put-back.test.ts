// The take-back that follows "Put it back on its date" (step 2.53 fix round, the lead's
// decision): whoever may put a game back takes back its drafted new date, schedule editor
// or not. No role today holds `games.results` without `schedule.edit`, so this file makes
// the scheduler such a person: the access module answers that they may not edit the
// schedule (and may still record results).
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleGame } from '../rules/schedule-types.ts';
import {
  draftUuid,
  gameUuid,
  memoryScheduling,
  ownerId,
  roundUuid,
  schedulerGrant,
  schedulerId,
  seasonId,
  teamUuid,
  venueUuid,
} from '../memory-scheduling.test-helper.ts';
import { getScheduleDraft } from './get-schedule-draft.ts';
import { moveDraftGame } from './move-draft-game.ts';

vi.mock('../../access/index.ts', async (original) => {
  const access = await original<typeof import('../../access/index.ts')>();
  return {
    ...access,
    hasPermission: (...args: Parameters<typeof access.hasPermission>) =>
      args[0].accountId === schedulerId && args[2] === 'schedule.edit'
        ? Promise.resolve(false)
        : access.hasPermission(...args),
  };
});

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

const world = (status: ScheduleGame['status']) =>
  memoryScheduling({
    teamIds: [1, 2].map(teamUuid),
    grants: [schedulerGrant],
    schedule: {
      rounds: [
        { id: roundUuid(1), number: 1, label: 'Week 1', date: '2026-10-04' },
        { id: roundUuid(2), number: 2, label: 'Week 2', date: '2026-10-11' },
      ],
      games: [game(1, { status })],
    },
  });

const moveLater = {
  seasonId,
  basedOnRevision: null,
  version: null,
  draftId: null,
  gameId: gameUuid(1),
  roundId: roundUuid(2),
  date: '2026-10-11',
  time: '18:00',
  venueId: null,
  court: null,
};
const afterPutBack = { ...moveLater, roundId: null, date: '', time: null, afterPutBack: true };

describe('taking back a drafted new date after "Put it back on its date"', () => {
  it('is done for a person who may put the game back but may not edit the schedule', async () => {
    // Published back on its date (the put-back ran), while the draft still moves it.
    const w = world('scheduled');
    expect(await moveDraftGame(w.as(ownerId), moveLater, w.deps)).toMatchObject({ ok: true });
    // That person may not edit the draft themselves...
    expect(
      await moveDraftGame(
        w.as(schedulerId),
        { ...moveLater, version: 1, draftId: draftUuid(1) },
        w.deps,
      ),
    ).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
    // ...but their put-back takes the drafted date back, without having read the draft.
    expect(await moveDraftGame(w.as(schedulerId), afterPutBack, w.deps)).toMatchObject({
      ok: true,
      value: { version: 2 },
    });
    const view = await getScheduleDraft(w.as(ownerId), { seasonId }, w.deps);
    if (!view.ok) throw new Error('refused');
    expect(view.value.toPublish).toBe(0);
    expect(view.value.result.games[0]).toMatchObject({
      status: 'scheduled',
      date: '2026-10-04',
      roundId: roundUuid(1),
    });
    // A second time there is nothing left to take back: refused, nothing saved.
    expect(await moveDraftGame(w.as(schedulerId), afterPutBack, w.deps)).toMatchObject({
      ok: false,
      error: { code: 'change-refused' },
    });
  });

  it('changes nothing for a game still postponed, with no draft, or for a person signed out', async () => {
    const waiting = world('postponed');
    expect(await moveDraftGame(waiting.as(ownerId), moveLater, waiting.deps)).toMatchObject({
      ok: true,
    });
    expect(await moveDraftGame(waiting.as(schedulerId), afterPutBack, waiting.deps)).toMatchObject({
      ok: false,
      error: { code: 'change-refused' },
    });
    const none = world('scheduled');
    expect(await moveDraftGame(none.as(schedulerId), afterPutBack, none.deps)).toMatchObject({
      ok: false,
      error: { code: 'change-refused' },
    });
    expect(await moveDraftGame(none.as(null), afterPutBack, none.deps)).toMatchObject({
      ok: false,
      error: { code: 'not-allowed' },
    });
  });
});
