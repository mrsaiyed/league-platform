// Takes a game out of the schedule draft: a game added in the draft disappears from it, and
// a published game is removed when the draft is published (P7 §4.3, §4.4).
import { z } from 'zod';
import { defineCommand, type Result } from '../../../command/index.ts';
import { draftBasis, editDraft, type DraftEditError, type DraftEditValue } from '../draft-edit.ts';
import { mayEditSchedule } from '../policy.ts';
import type { SchedulingTx } from '../ports.ts';

export type RemoveDraftGameError = DraftEditError;

export const removeDraftGame = defineCommand({
  name: 'scheduling.remove_draft_game',
  permission: 'schedule.edit',
  input: z.object({ ...draftBasis, gameId: z.uuid() }),
  allowed: (context, input, tx: SchedulingTx) => mayEditSchedule(context, tx, input.seasonId),
  run: async ({ context, input, tx }): Promise<Result<DraftEditValue, RemoveDraftGameError>> =>
    editDraft({
      context,
      tx,
      action: 'scheduling.remove_draft_game',
      input,
      change: { kind: 'remove-game', gameId: input.gameId },
    }),
});
