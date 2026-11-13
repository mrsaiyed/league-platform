// Changes a round's date in the schedule draft; the round's games that were on its old date
// move with it (P7 §4.3).
import { z } from 'zod';
import { defineCommand, type Result } from '../../../command/index.ts';
import { draftBasis, editDraft, type DraftEditError, type DraftEditValue } from '../draft-edit.ts';
import { mayEditSchedule } from '../policy.ts';
import type { SchedulingTx } from '../ports.ts';

export type ChangeDraftRoundDateError = DraftEditError;

export const changeDraftRoundDate = defineCommand({
  name: 'scheduling.change_draft_round_date',
  permission: 'schedule.edit',
  input: z.object({ ...draftBasis, roundId: z.uuid(), date: z.string().max(10) }),
  allowed: (context, input, tx: SchedulingTx) => mayEditSchedule(context, tx, input.seasonId),
  run: async ({ context, input, tx }): Promise<Result<DraftEditValue, ChangeDraftRoundDateError>> =>
    editDraft({
      context,
      tx,
      action: 'scheduling.change_draft_round_date',
      input,
      change: { kind: 'change-round-date', roundId: input.roundId, date: input.date },
    }),
});
