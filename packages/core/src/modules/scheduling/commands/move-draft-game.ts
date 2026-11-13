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

export type MoveDraftGameError = DraftEditError;

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
  }),
  allowed: (context, input, tx: SchedulingTx) => mayEditSchedule(context, tx, input.seasonId),
  run: async ({ context, input, tx }): Promise<Result<DraftEditValue, MoveDraftGameError>> =>
    editDraft({
      context,
      tx,
      action: 'scheduling.move_draft_game',
      input,
      change: {
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
      check: () => checkSlotPlace(tx, input),
    }),
});
