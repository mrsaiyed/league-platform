// Moves a court to the bin (A-5): its row stays, with `deleted_at` set.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangeSchedule } from '../policy.ts';
import type { SchedulingTx } from '../ports.ts';

export type RemoveCourtError = { readonly code: 'court-not-found' };

export const removeCourt = defineCommand({
  name: 'scheduling.remove_court',
  permission: 'venues.manage',
  input: z.object({ courtId: z.uuid() }),
  allowed: (context, _input, tx: SchedulingTx) => mayChangeSchedule(context, tx, 'venues.manage'),
  run: async ({ context, input, tx }): Promise<Result<{ courtId: string }, RemoveCourtError>> => {
    const court = await tx.scheduling.findCourt(input.courtId);
    if (court === undefined || court.binned) return fail({ code: 'court-not-found' });
    await tx.scheduling.setCourtBinned(court.id, true);
    await recordActivity(tx, context, {
      action: 'scheduling.remove_court',
      target: { type: 'court', id: court.id },
    });
    return ok({ courtId: court.id });
  },
});
