// Moves a game of the schedule draft to another round, day, time, venue or court (P7 §4.3).
// The slot is given whole: what it leaves out is cleared.
import { z } from 'zod';
import { defineCommand, type Result } from '../../../command/index.ts';
import {
  checkSlotPlace,
  draftBasis,
  editDraft,
  type DraftEditError,
  type DraftEditValue,
} from '../draft-edit.ts';
import { mayEditSchedule } from '../policy.ts';
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
  }),
  allowed: (context, input, tx: SchedulingTx) => mayEditSchedule(context, tx, input.seasonId),
  run: async ({ context, input, tx }): Promise<Result<DraftEditValue, MoveDraftGameError>> =>
    editDraft({
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
    }),
});
