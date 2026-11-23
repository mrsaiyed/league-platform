// Takes a standings adjustment off the season (S-10): it goes to the bin, the
// season's standings are worked out again without it, and its footnote goes. Needs
// `standings.adjust`; logged (A-6). The admin's screen asks why (step 2.56): the reason
// for taking it off is kept in the activity log line, as the row itself goes to the bin.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { recordActivity } from '../../access/index.ts';
import { mayAdjustStandings } from '../policy.ts';
import type { StandingsTx } from '../ports.ts';
import { rebuildSeason } from '../rebuild-season.ts';

export type RemoveAdjustmentError = {
  readonly code: 'season-not-found' | 'adjustment-not-found';
};

export const removeAdjustment = defineCommand({
  name: 'standings.remove_adjustment',
  permission: 'standings.adjust',
  input: z.object({
    seasonId: z.uuid(),
    adjustmentId: z.uuid(),
    reason: z.string().trim().min(1).max(500).optional(),
  }),
  allowed: (context, input, tx: StandingsTx) => mayAdjustStandings(context, tx, input.seasonId),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<Record<string, never>, RemoveAdjustmentError>> => {
    if ((await tx.games.findSeason(input.seasonId)) === undefined) {
      return fail({ code: 'season-not-found' });
    }
    await tx.standings.lockSeason(input.seasonId);
    if (!(await tx.standings.binAdjustment(input.seasonId, input.adjustmentId))) {
      return fail({ code: 'adjustment-not-found' });
    }
    await rebuildSeason(tx, input.seasonId);
    await recordActivity(tx, context, {
      action: 'standings.remove_adjustment',
      target: { type: 'season', id: input.seasonId },
      details: {
        adjustment: input.adjustmentId,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      },
    });
    return ok({});
  },
});
