// Moves a court to the bin (A-5): its row stays, with `deleted_at` set. Its games keep its
// name, so the games played there still say where they were played. A court with games
// still to come (scheduled, postponed or being played now, published or in a draft) is
// not removed (step 2.49): the public would be sent to a court the league has removed,
// and a draft naming it could not be published. The admin moves those games first.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangeSchedule } from '../policy.ts';
import { gamesAtPlace } from '../place-games.ts';
import type { SchedulingTx } from '../ports.ts';

export type RemoveCourtError = {
  readonly code: 'court-not-found' | 'court-has-games-to-come';
};

export const removeCourt = defineCommand({
  name: 'scheduling.remove_court',
  permission: 'venues.manage',
  input: z.object({ courtId: z.uuid() }),
  allowed: (context, _input, tx: SchedulingTx) => mayChangeSchedule(context, tx, 'venues.manage'),
  run: async ({ context, input, tx }): Promise<Result<{ courtId: string }, RemoveCourtError>> => {
    const court = await tx.scheduling.findCourt(input.courtId);
    if (court === undefined || court.binned) return fail({ code: 'court-not-found' });
    if ((await gamesAtPlace(tx, court.venueId, court.id)).toCome > 0) {
      return fail({ code: 'court-has-games-to-come' });
    }
    await tx.scheduling.setCourtBinned(court.id, true);
    await recordActivity(tx, context, {
      action: 'scheduling.remove_court',
      target: { type: 'court', id: court.id },
    });
    return ok({ courtId: court.id });
  },
});
