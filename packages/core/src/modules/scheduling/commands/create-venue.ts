// Adds a venue to the league (P7 §4.1, T3 §4). Its name must differ from every other
// venue's not in the bin, whatever the capitals: the fixture import matches by name.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangeSchedule } from '../policy.ts';
import type { SchedulingTx } from '../ports.ts';
import { venueAddress, venueMapLink, venueName } from '../venue-fields.ts';

export type CreateVenueError = { readonly code: 'venue-name-taken' };

export const createVenue = defineCommand({
  name: 'scheduling.create_venue',
  permission: 'venues.manage',
  input: z.object({
    name: venueName,
    address: venueAddress.optional(),
    mapLink: venueMapLink.optional(),
  }),
  allowed: (context, _input, tx: SchedulingTx) => mayChangeSchedule(context, tx, 'venues.manage'),
  run: async ({ context, input, tx }): Promise<Result<{ venueId: string }, CreateVenueError>> => {
    const created = await tx.scheduling.createVenue({
      name: input.name,
      address: input.address ?? null,
      mapLink: input.mapLink ?? null,
    });
    if (created === 'name-taken') return fail({ code: 'venue-name-taken' });
    await recordActivity(tx, context, {
      action: 'scheduling.create_venue',
      target: { type: 'venue', id: created },
    });
    return ok({ venueId: created });
  },
});
