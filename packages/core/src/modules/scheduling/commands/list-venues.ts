// The league's venues with their courts, for the schedule area (P7 §4). It changes
// nothing, but runs in the same shape as a command (record 014). Anyone who may read
// the schedule may read it, in a league that is archived or suspended too.
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { mayReadSchedule } from '../policy.ts';
import type { SchedulingTx, VenueWithCourts } from '../ports.ts';

export const listVenues = defineCommand({
  name: 'scheduling.list_venues',
  permission: 'schedule.read',
  input: z.object({}),
  allowed: (context, _input, tx: SchedulingTx) => mayReadSchedule(context, tx, 'schedule.read'),
  run: async ({ tx }): Promise<Result<readonly VenueWithCourts[], never>> =>
    ok(await tx.scheduling.listVenues()),
});
