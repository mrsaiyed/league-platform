// Adds a court to a venue that is not in the bin (T3 §4). It goes last among the
// venue's courts unless a place is given. Its name must differ from the venue's other
// courts' not in the bin, whatever the capitals.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangeSchedule } from '../policy.ts';
import type { SchedulingTx } from '../ports.ts';
import { courtSort, venueName } from '../venue-fields.ts';

export type CreateCourtError = { readonly code: 'venue-not-found' | 'court-name-taken' };

export const createCourt = defineCommand({
  name: 'scheduling.create_court',
  permission: 'venues.manage',
  input: z.object({ venueId: z.uuid(), name: venueName, sort: courtSort.optional() }),
  allowed: (context, _input, tx: SchedulingTx) => mayChangeSchedule(context, tx, 'venues.manage'),
  run: async ({ context, input, tx }): Promise<Result<{ courtId: string }, CreateCourtError>> => {
    const venue = await tx.scheduling.findVenue(input.venueId);
    if (venue === undefined || venue.binned) return fail({ code: 'venue-not-found' });
    let sort = input.sort;
    if (sort === undefined) {
      const listed = (await tx.scheduling.listVenues()).find((v) => v.id === venue.id);
      sort = Math.min(
        (listed?.courts ?? []).reduce((next, c) => Math.max(next, c.sort + 1), 0),
        100000,
      );
    }
    const created = await tx.scheduling.createCourt({
      venueId: venue.id,
      name: input.name,
      sort,
    });
    if (created === 'name-taken') return fail({ code: 'court-name-taken' });
    await recordActivity(tx, context, {
      action: 'scheduling.create_court',
      target: { type: 'court', id: created },
    });
    return ok({ courtId: created });
  },
});
