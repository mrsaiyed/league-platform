// Edits a venue's name, address or map link; null clears an address or link. The save
// names the version it started from and is refused if someone else saved since (T-46).
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangeSchedule } from '../policy.ts';
import type { SchedulingTx, VenueChange } from '../ports.ts';
import { venueAddress, venueMapLink, venueName } from '../venue-fields.ts';

export type UpdateVenueError = {
  readonly code: 'venue-not-found' | 'venue-name-taken' | 'changed-since-read';
};

export const updateVenue = defineCommand({
  name: 'scheduling.update_venue',
  permission: 'venues.manage',
  input: z
    .object({
      venueId: z.uuid(),
      version: z.number().int().positive(),
      name: venueName.optional(),
      address: venueAddress.nullable().optional(),
      mapLink: venueMapLink.nullable().optional(),
    })
    .refine((v) => v.name !== undefined || v.address !== undefined || v.mapLink !== undefined, {
      path: ['name'],
    }),
  allowed: (context, _input, tx: SchedulingTx) => mayChangeSchedule(context, tx, 'venues.manage'),
  run: async ({ context, input, tx }): Promise<Result<{ version: number }, UpdateVenueError>> => {
    const venue = await tx.scheduling.findVenue(input.venueId);
    if (venue === undefined || venue.binned) return fail({ code: 'venue-not-found' });
    if (venue.version !== input.version) return fail({ code: 'changed-since-read' });
    const change: VenueChange = {
      ...(input.name !== undefined && input.name !== venue.name ? { name: input.name } : {}),
      ...(input.address !== undefined && input.address !== venue.address
        ? { address: input.address }
        : {}),
      ...(input.mapLink !== undefined && input.mapLink !== venue.mapLink
        ? { mapLink: input.mapLink }
        : {}),
    };
    if (Object.keys(change).length === 0) return ok({ version: venue.version });
    const updated = await tx.scheduling.updateVenue(venue.id, change, input.version);
    if (updated === 'name-taken') return fail({ code: 'venue-name-taken' });
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'scheduling.update_venue',
      target: { type: 'venue', id: venue.id },
    });
    return ok({ version: updated });
  },
});
