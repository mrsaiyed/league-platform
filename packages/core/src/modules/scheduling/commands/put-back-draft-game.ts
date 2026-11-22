// "Put it back" (P7 §4.3, step 2.185): drops the draft's removal of a game, so the draft
// holds it again as it last held it, whatever has happened to the game since (played,
// postponed, cancelled): it only gives the draft the game back. A game whose round the
// draft has removed since comes back with no round (S-60). Refused, changing nothing, when
// the draft does not remove the game.
import { z } from 'zod';
import { defineCommand, type Result } from '../../../command/index.ts';
import { draftBasis, editDraft, type DraftEditError, type DraftEditValue } from '../draft-edit.ts';
import { mayEditSchedule } from '../policy.ts';
import type { SchedulingTx } from '../ports.ts';

export type PutBackDraftGameError = DraftEditError;

export const putBackDraftGame = defineCommand({
  name: 'scheduling.put_back_draft_game',
  permission: 'schedule.edit',
  input: z.object({ ...draftBasis, gameId: z.uuid() }),
  allowed: (context, input, tx: SchedulingTx) => mayEditSchedule(context, tx, input.seasonId),
  run: async ({ context, input, tx }): Promise<Result<DraftEditValue, PutBackDraftGameError>> =>
    editDraft({
      context,
      tx,
      action: 'scheduling.put_back_draft_game',
      input,
      change: { kind: 'put-back-game', gameId: input.gameId },
    }),
});
