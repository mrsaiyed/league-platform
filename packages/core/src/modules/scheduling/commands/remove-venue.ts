// Moves a venue to the bin (A-5): its row stays, with `deleted_at` set. Its courts do
// not go with it, so it is refused while any court is not in the bin: the admin
// removes the courts first, and nothing goes that they did not choose (record 019). A
// venue with games still to come there with no court is not removed either (step 2.49),
// as for a court (remove-court.ts); its games played keep its name.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangeSchedule } from '../policy.ts';
import { gamesAtPlace } from '../place-games.ts';
import type { SchedulingTx } from '../ports.ts';

export type RemoveVenueError = {
  readonly code: 'venue-not-found' | 'venue-has-courts' | 'venue-has-games-to-come';
};

export const removeVenue = defineCommand({
  name: 'scheduling.remove_venue',
  permission: 'venues.manage',
  input: z.object({ venueId: z.uuid() }),
  allowed: (context, _input, tx: SchedulingTx) => mayChangeSchedule(context, tx, 'venues.manage'),
  run: async ({ context, input, tx }): Promise<Result<{ venueId: string }, RemoveVenueError>> => {
    const venue = await tx.scheduling.findVenue(input.venueId);
    if (venue === undefined || venue.binned) return fail({ code: 'venue-not-found' });
    if (await tx.scheduling.hasLiveCourts(venue.id)) return fail({ code: 'venue-has-courts' });
    if ((await gamesAtPlace(tx, venue.id)).toCome > 0) {
      return fail({ code: 'venue-has-games-to-come' });
    }
    await tx.scheduling.setVenueBinned(venue.id, true);
    await recordActivity(tx, context, {
      action: 'scheduling.remove_venue',
      target: { type: 'venue', id: venue.id },
    });
    return ok({ venueId: venue.id });
  },
});
