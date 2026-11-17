// Brings a venue back from the bin (A-5). Another venue may have taken its name since:
// then this says `venue-name-taken` and the admin renames one of them. Restoring a
// venue that is not in the bin changes nothing.
// Whoever may remove it may bring it back (A-5): `venues.manage`, so a scheduler who
// removed it by mistake puts it back (step 2.49; the audit of each league's data, D-L6).
// Admins and the owner, who hold `bin.restore`, hold this too.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangeSchedule } from '../policy.ts';
import type { SchedulingTx } from '../ports.ts';

export type RestoreVenueError = { readonly code: 'venue-not-found' | 'venue-name-taken' };

export const restoreVenue = defineCommand({
  name: 'scheduling.restore_venue',
  permission: 'venues.manage',
  input: z.object({ venueId: z.uuid() }),
  allowed: (context, _input, tx: SchedulingTx) => mayChangeSchedule(context, tx, 'venues.manage'),
  run: async ({ context, input, tx }): Promise<Result<{ venueId: string }, RestoreVenueError>> => {
    const venue = await tx.scheduling.findVenue(input.venueId);
    if (venue === undefined) return fail({ code: 'venue-not-found' });
    if (!venue.binned) return ok({ venueId: venue.id });
    if ((await tx.scheduling.setVenueBinned(venue.id, false)) === 'name-taken') {
      return fail({ code: 'venue-name-taken' });
    }
    await recordActivity(tx, context, {
      action: 'scheduling.restore_venue',
      target: { type: 'venue', id: venue.id },
    });
    return ok({ venueId: venue.id });
  },
});
