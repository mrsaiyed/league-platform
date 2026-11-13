// Works a season's standings and player totals out again from scratch (T3 §9): the
// same calculation every result runs, so it gives the identical rows. For when
// something the results do not announce has changed (a team moved division, say), or
// to check. Needs `standings.adjust` at the season's program, and not while the
// league is archived or suspended (U-9). Logged (A-6).
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import {
  hasPermission,
  leagueScope,
  readOnlyLeagueStatuses,
  recordActivity,
} from '../../access/index.ts';
import type { StandingsTx } from '../ports.ts';
import { rebuildSeason, type SeasonRebuilt } from '../rebuild-season.ts';

export type RebuildStandingsError = { readonly code: 'season-not-found' };

export const rebuildStandings = defineCommand({
  name: 'standings.rebuild_season',
  permission: 'standings.adjust',
  input: z.object({ seasonId: z.uuid() }),
  allowed: async (context, input, tx: StandingsTx) => {
    // A season that is not here is checked league-wide, so only those who may act on
    // every program's standings learn it is missing.
    const season = await tx.games.findSeason(input.seasonId);
    const scope =
      season === undefined ? leagueScope : { type: 'program' as const, id: season.programId };
    if (!(await hasPermission(context, tx, 'standings.adjust', scope))) return false;
    const status = await tx.access.leagueStatus();
    return status !== undefined && !readOnlyLeagueStatuses.includes(status);
  },
  run: async ({ context, input, tx }): Promise<Result<SeasonRebuilt, RebuildStandingsError>> => {
    if ((await tx.games.findSeason(input.seasonId)) === undefined) {
      return fail({ code: 'season-not-found' });
    }
    const rebuilt = await rebuildSeason(tx, input.seasonId);
    await recordActivity(tx, context, {
      action: 'standings.rebuild_season',
      target: { type: 'season', id: input.seasonId },
    });
    return ok(rebuilt);
  },
});
