// Moves a game of the schedule draft to another round, day, time, venue or court (P7 §4.3).
// The slot is given whole: what it leaves out is cleared.
import { z } from 'zod';
import { defineCommand, fail, type Result } from '../../../command/index.ts';
import {
  checkSlotPlace,
  draftBasis,
  editDraft,
  type DraftEditError,
  type DraftEditValue,
} from '../draft-edit.ts';
import { mayEditSchedule, mayTakeBackPutBack } from '../policy.ts';
import type { SchedulingTx } from '../ports.ts';
import type { DraftChange, ScheduleState } from '../rules/schedule-types.ts';

export type MoveDraftGameError = DraftEditError;

/** A take-back: only of a published game that is scheduled or postponed (one not played). */
const takeBack =
  (gameId: string) =>
  (published: ScheduleState): DraftChange | DraftEditError => {
    const game = published.games.find((g) => g.id === gameId);
    if (game === undefined || (game.status !== 'scheduled' && game.status !== 'postponed')) {
      return { code: 'change-refused', reason: { code: 'unknown-game', gameId } };
    }
    const { roundId, date, time, venueId, court } = game;
    return {
      kind: 'take-back-date',
      gameId,
      to: { roundId, date, time, venueId, court },
      status: game.status,
    };
  };

/** The same slot and status: the draft does not move the game. */
const sameAs = (a: ScheduleState['games'][number], b: ScheduleState['games'][number]) =>
  a.roundId === b.roundId &&
  a.date === b.date &&
  a.time === b.time &&
  a.venueId === b.venueId &&
  a.court === b.court &&
  a.status === b.status;

/**
 * After "Put it back on its date" (step 2.53 fix round, the lead's decision): the draft's
 * new date for a game published on its date again means nothing, so it is taken back for
 * whoever put the game back. Refused (and nothing saved) when there is no draft, the game
 * is not published as scheduled, or the draft does not move it.
 */
const afterPutBackCheck =
  (gameId: string) =>
  (sofar: ScheduleState, published: ScheduleState): Promise<DraftEditError | undefined> => {
    const was = published.games.find((g) => g.id === gameId);
    const now = sofar.games.find((g) => g.id === gameId);
    const nothing = { code: 'change-refused', reason: { code: 'unknown-game', gameId } } as const;
    return Promise.resolve(
      was === undefined || now === undefined || was.status !== 'scheduled' || sameAs(was, now)
        ? nothing
        : undefined,
    );
  };

export const moveDraftGame = defineCommand({
  name: 'scheduling.move_draft_game',
  permission: 'schedule.edit',
  input: z.object({
    ...draftBasis,
    gameId: z.uuid(),
    roundId: z.uuid().nullable(),
    date: z.string().max(10),
    time: z.string().max(5).nullable(),
    venueId: z.uuid().nullable(),
    court: z.string().trim().min(1).max(100).nullable(),
    /**
     * Takes back the draft's new date instead (step 2.53): the game goes back to where and
     * how it is published; the slot sent is not used.
     */
    takeBack: z.boolean().optional(),
    /**
     * The take-back that follows "Put it back on its date" (step 2.53 fix round): for
     * whoever may put a game back (`games.results`), not only a schedule editor, on the
     * draft as it is now (the basis sent is not used: the person never read the draft).
     */
    afterPutBack: z.boolean().optional(),
  }),
  allowed: (context, input, tx: SchedulingTx) =>
    input.afterPutBack === true
      ? mayTakeBackPutBack(context, tx, input.seasonId)
      : mayEditSchedule(context, tx, input.seasonId),
  run: async ({ context, input, tx }): Promise<Result<DraftEditValue, MoveDraftGameError>> => {
    const afterPutBack = input.afterPutBack === true;
    if (afterPutBack) {
      const draft = await tx.scheduling.findDraft(input.seasonId);
      if (draft === undefined) {
        return fail({
          code: 'change-refused',
          reason: { code: 'unknown-game', gameId: input.gameId },
        });
      }
      return editDraft({
        context,
        tx,
        action: 'scheduling.move_draft_game',
        input: {
          seasonId: input.seasonId,
          basedOnRevision: await tx.scheduling.latestRevision(input.seasonId),
          version: draft.version,
          draftId: draft.id,
        },
        change: takeBack(input.gameId),
        check: afterPutBackCheck(input.gameId),
      });
    }
    return editDraft({
      context,
      tx,
      action: 'scheduling.move_draft_game',
      input,
      change:
        input.takeBack === true
          ? takeBack(input.gameId)
          : {
              kind: 'move-game',
              gameId: input.gameId,
              to: {
                roundId: input.roundId,
                date: input.date,
                time: input.time,
                venueId: input.venueId,
                court: input.court,
              },
            },
      check: () =>
        input.takeBack === true ? Promise.resolve(undefined) : checkSlotPlace(tx, input),
    });
  },
});
