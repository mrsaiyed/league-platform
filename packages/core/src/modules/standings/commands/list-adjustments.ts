// A season's standings adjustments (S-10) as Admin → Standings and stats lists them,
// each with its reason and its id, so one can be taken off (remove-adjustment.ts), and
// the season's teams an adjustment may be given to (step 2.56). Only for someone who may
// adjust the season's standings: the owner and admins at the season's program. Reads
// only; the reasons are private to the admin, as the public table shows them as
// footnotes only when they change it (read-standings.ts).
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayAdjustStandings } from '../policy.ts';
import type { SeasonAdjustment, StandingsTx, TableTeam } from '../ports.ts';

export type ListAdjustmentsError = { readonly code: 'season-not-found' };

export type SeasonAdjustments = {
  readonly adjustments: readonly SeasonAdjustment[];
  readonly teams: readonly TableTeam[];
};

export const listAdjustments = defineCommand({
  name: 'standings.list_adjustments',
  permission: 'standings.adjust',
  input: z.object({ seasonId: z.uuid() }),
  allowed: (context, input, tx: StandingsTx) => mayAdjustStandings(context, tx, input.seasonId),
  run: async ({ input, tx }): Promise<Result<SeasonAdjustments, ListAdjustmentsError>> => {
    if ((await tx.games.findSeason(input.seasonId)) === undefined) {
      return fail({ code: 'season-not-found' });
    }
    const [adjustments, teams] = await Promise.all([
      tx.standings.listAdjustments(input.seasonId),
      tx.standings.listTeams(input.seasonId),
    ]);
    return ok({ adjustments, teams });
  },
});
