// Swaps the places of two games of the schedule draft; each keeps its teams (P7 §4.3).
import { z } from 'zod';
import { defineCommand, type Result } from '../../../command/index.ts';
import { draftBasis, editDraft, type DraftEditError, type DraftEditValue } from '../draft-edit.ts';
import { mayEditSchedule } from '../policy.ts';
import type { SchedulingTx } from '../ports.ts';

export type SwapDraftGamesError = DraftEditError;

export const swapDraftGames = defineCommand({
  name: 'scheduling.swap_draft_games',
  permission: 'schedule.edit',
  input: z.object({ ...draftBasis, gameId: z.uuid(), otherGameId: z.uuid() }),
  allowed: (context, input, tx: SchedulingTx) => mayEditSchedule(context, tx, input.seasonId),
  run: async ({ context, input, tx }): Promise<Result<DraftEditValue, SwapDraftGamesError>> =>
    editDraft({
      context,
      tx,
      action: 'scheduling.swap_draft_games',
      input,
      change: { kind: 'swap-games', gameId: input.gameId, otherGameId: input.otherGameId },
    }),
});
