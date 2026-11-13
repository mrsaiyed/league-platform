// Moves a division to the bin (A-5): its row stays, with `deleted_at` set, and it can
// be restored for 30 days. Binning a division does not carry its sub-divisions with
// it, so it is refused while any are not in the bin: the admin removes or moves them
// first, and nothing goes that they did not choose (record 019).
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { divisionScope, mayEditLeague } from '../policy.ts';
import type { LeaguesTx } from '../ports.ts';

export type RemoveDivisionError = {
  readonly code: 'division-not-found' | 'division-has-subdivisions';
};

export const removeDivision = defineCommand({
  name: 'leagues.remove_division',
  permission: 'divisions.manage',
  input: z.object({ divisionId: z.uuid() }),
  allowed: async (context, input, tx: LeaguesTx) =>
    mayEditLeague(context, tx, 'divisions.manage', await divisionScope(tx, input.divisionId)),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ divisionId: string }, RemoveDivisionError>> => {
    const division = await tx.divisions.find(input.divisionId);
    if (division === undefined || division.binned) return fail({ code: 'division-not-found' });
    if (await tx.divisions.hasLiveSubdivisions(division.id)) {
      return fail({ code: 'division-has-subdivisions' });
    }
    await tx.divisions.setBinned(division.id, true);
    await recordActivity(tx, context, {
      action: 'leagues.remove_division',
      target: { type: 'division', id: division.id },
    });
    return ok({ divisionId: division.id });
  },
});
