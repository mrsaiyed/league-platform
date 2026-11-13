// Gives a round of the schedule draft a new label, "Week 5 - Rivalry Week" (P7 §4.3).
import { z } from 'zod';
import { defineCommand, type Result } from '../../../command/index.ts';
import { draftBasis, editDraft, type DraftEditError, type DraftEditValue } from '../draft-edit.ts';
import { mayEditSchedule } from '../policy.ts';
import type { SchedulingTx } from '../ports.ts';

export type RenameDraftRoundError = DraftEditError;

export const renameDraftRound = defineCommand({
  name: 'scheduling.rename_draft_round',
  permission: 'schedule.edit',
  input: z.object({ ...draftBasis, roundId: z.uuid(), label: z.string().trim().min(1).max(120) }),
  allowed: (context, input, tx: SchedulingTx) => mayEditSchedule(context, tx, input.seasonId),
  run: async ({ context, input, tx }): Promise<Result<DraftEditValue, RenameDraftRoundError>> =>
    editDraft({
      context,
      tx,
      action: 'scheduling.rename_draft_round',
      input,
      change: { kind: 'rename-round', roundId: input.roundId, label: input.label },
    }),
});
