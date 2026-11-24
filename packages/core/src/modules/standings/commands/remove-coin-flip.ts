// Takes a recorded coin flip off the season (S-89): it goes to the bin, the standings
// are worked out again without it, and the teams it ordered share their place again
// until another is recorded. The reason, when given, is kept in the activity log line.
// Needs `standings.adjust`; logged (A-6).
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { recordActivity } from '../../access/index.ts';
import { mayAdjustStandings } from '../policy.ts';
import type { StandingsTx } from '../ports.ts';
import { rebuildSeason } from '../rebuild-season.ts';
import { unexplainedInArchivedSeason } from '../archived-season.ts';

export type RemoveCoinFlipError = { readonly code: 'season-not-found' | 'flip-not-found' };

export const removeCoinFlip = defineCommand({
  name: 'standings.remove_coin_flip',
  permission: 'standings.adjust',
  input: z.object({
    seasonId: z.uuid(),
    flipId: z.uuid(),
    reason: z.string().trim().min(1).max(500).optional(),
  }),
  allowed: (context, input, tx: StandingsTx) => mayAdjustStandings(context, tx, input.seasonId),
  refusedInArchivedSeason: (input, tx) =>
    unexplainedInArchivedSeason(input.seasonId, input.reason, tx),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<Record<string, never>, RemoveCoinFlipError>> => {
    if ((await tx.games.findSeason(input.seasonId)) === undefined) {
      return fail({ code: 'season-not-found' });
    }
    await tx.standings.lockSeason(input.seasonId);
    if (!(await tx.standings.binCoinFlip(input.seasonId, input.flipId))) {
      return fail({ code: 'flip-not-found' });
    }
    await rebuildSeason(tx, input.seasonId);
    await recordActivity(tx, context, {
      action: 'standings.remove_coin_flip',
      target: { type: 'season', id: input.seasonId },
      details: {
        flip: input.flipId,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      },
    });
    return ok({});
  },
});
