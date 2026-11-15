// Adds a round, its name and its date, to the season's schedule draft after the season's
// other rounds (P7 §4.3, step 2.160). The round's id is the caller's, so a retried request
// cannot add it twice. It is numbered in the draft, one more than the highest number the
// season's rounds hold (ScheduleRound.number); it is created when the draft is published,
// and until then nobody outside the admin sees it (A-9).
import { z } from 'zod';
import { defineCommand, type Result } from '../../../command/index.ts';
import { draftBasis, editDraft, type DraftEditError, type DraftEditValue } from '../draft-edit.ts';
import { mayEditSchedule } from '../policy.ts';
import type { SchedulingTx } from '../ports.ts';

export type AddDraftRoundError = DraftEditError;

export const addDraftRound = defineCommand({
  name: 'scheduling.add_draft_round',
  permission: 'schedule.edit',
  input: z.object({
    ...draftBasis,
    roundId: z.uuid(),
    label: z.string().trim().min(1).max(120),
    date: z.string().max(10),
  }),
  allowed: (context, input, tx: SchedulingTx) => mayEditSchedule(context, tx, input.seasonId),
  run: async ({ context, input, tx }): Promise<Result<DraftEditValue, AddDraftRoundError>> =>
    editDraft({
      context,
      tx,
      action: 'scheduling.add_draft_round',
      input,
      change: {
        kind: 'add-round',
        round: { id: input.roundId, label: input.label, date: input.date },
      },
    }),
});
