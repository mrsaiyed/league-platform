// Throws away the season's schedule draft (A-9): its unpublished edits are gone and the
// published schedule is as it was. The admin names the draft and version they saw, so a draft someone
// else has added to, or started anew after a discard, is not thrown away unseen (A-8).
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayEditSchedule } from '../policy.ts';
import type { SchedulingTx } from '../ports.ts';

export type DiscardScheduleDraftError = {
  readonly code: 'season-not-found' | 'draft-not-found' | 'changed-since-read';
};

export const discardScheduleDraft = defineCommand({
  name: 'scheduling.discard_schedule_draft',
  permission: 'schedule.edit',
  input: z.object({
    seasonId: z.uuid(),
    draftId: z.uuid(),
    version: z.number().int().positive(),
  }),
  allowed: (context, input, tx: SchedulingTx) => mayEditSchedule(context, tx, input.seasonId),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<Record<string, never>, DiscardScheduleDraftError>> => {
    if ((await tx.scheduling.findSeason(input.seasonId)) === undefined) {
      return fail({ code: 'season-not-found' });
    }
    const draft = await tx.scheduling.findDraft(input.seasonId);
    if (draft === undefined) return fail({ code: 'draft-not-found' });
    if (draft.id !== input.draftId || draft.version !== input.version) {
      return fail({ code: 'changed-since-read' });
    }
    if (!(await tx.scheduling.deleteDraft(input.seasonId, draft.id, input.version))) {
      return fail({ code: 'changed-since-read' });
    }
    await recordActivity(tx, context, {
      action: 'scheduling.discard_schedule_draft',
      target: { type: 'season', id: input.seasonId },
    });
    return ok({});
  },
});
