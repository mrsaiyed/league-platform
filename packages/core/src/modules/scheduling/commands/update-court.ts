// Renames a court or moves it in its venue's order (a court never moves to another
// venue). A rename names the version it started from and is refused if someone else
// saved since (T-46); a change of place alone carries no version, as ordering is a
// display order where the last save wins.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangeSchedule } from '../policy.ts';
import type { CourtChange, SchedulingTx } from '../ports.ts';
import { courtSort, venueName } from '../venue-fields.ts';

export type UpdateCourtError = {
  readonly code: 'court-not-found' | 'court-name-taken' | 'changed-since-read';
};

export const updateCourt = defineCommand({
  name: 'scheduling.update_court',
  permission: 'venues.manage',
  input: z
    .object({
      courtId: z.uuid(),
      /** Required with a new name. */
      version: z.number().int().positive().optional(),
      name: venueName.optional(),
      sort: courtSort.optional(),
    })
    .refine((c) => c.name !== undefined || c.sort !== undefined, { path: ['name'] })
    .refine((c) => c.name === undefined || c.version !== undefined, { path: ['version'] }),
  allowed: (context, _input, tx: SchedulingTx) => mayChangeSchedule(context, tx, 'venues.manage'),
  run: async ({ context, input, tx }): Promise<Result<{ version: number }, UpdateCourtError>> => {
    const court = await tx.scheduling.findCourt(input.courtId);
    if (court === undefined || court.binned) return fail({ code: 'court-not-found' });
    if (input.version !== undefined && court.version !== input.version) {
      return fail({ code: 'changed-since-read' });
    }
    const change: CourtChange = {
      ...(input.name !== undefined && input.name !== court.name ? { name: input.name } : {}),
      ...(input.sort !== undefined && input.sort !== court.sort ? { sort: input.sort } : {}),
    };
    if (Object.keys(change).length === 0) return ok({ version: court.version });
    const updated = await tx.scheduling.updateCourt(court.id, change, input.version);
    if (updated === 'name-taken') return fail({ code: 'court-name-taken' });
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'scheduling.update_court',
      target: { type: 'court', id: court.id },
      details: {
        changed: Object.keys(change).join(','),
        ...(change.sort === undefined ? {} : { sort: change.sort }),
      },
    });
    return ok({ version: updated });
  },
});
