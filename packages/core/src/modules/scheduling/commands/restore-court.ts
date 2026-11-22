// Brings a court back from the bin (A-5). It stays in the bin while its venue is
// (`court-venue-in-bin`: restore the venue first), and another court of the venue may
// have taken its name since (`court-name-taken`: rename one of them). Restoring a
// court that is not in the bin changes nothing.
// Whoever may remove it may bring it back (A-5): `venues.manage`, so a scheduler who
// removed it by mistake puts it back (step 2.49; the audit of each league's data, D-L6).
// Admins and the owner, who hold `bin.restore`, hold this too.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangeSchedule } from '../policy.ts';
import type { SchedulingTx } from '../ports.ts';

export type RestoreCourtError = {
  readonly code: 'court-not-found' | 'court-venue-in-bin' | 'court-name-taken';
};

export const restoreCourt = defineCommand({
  name: 'scheduling.restore_court',
  permission: 'venues.manage',
  input: z.object({ courtId: z.uuid() }),
  allowed: (context, _input, tx: SchedulingTx) => mayChangeSchedule(context, tx, 'venues.manage'),
  run: async ({ context, input, tx }): Promise<Result<{ courtId: string }, RestoreCourtError>> => {
    const court = await tx.scheduling.findCourt(input.courtId);
    if (court === undefined) return fail({ code: 'court-not-found' });
    if (!court.binned) return ok({ courtId: court.id });
    const venue = await tx.scheduling.findVenue(court.venueId);
    if (venue === undefined || venue.binned) return fail({ code: 'court-venue-in-bin' });
    if ((await tx.scheduling.setCourtBinned(court.id, false)) === 'name-taken') {
      return fail({ code: 'court-name-taken' });
    }
    await recordActivity(tx, context, {
      action: 'scheduling.restore_court',
      target: { type: 'court', id: court.id },
    });
    return ok({ courtId: court.id });
  },
});
