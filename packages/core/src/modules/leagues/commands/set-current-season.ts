// Makes one season the current one of its program (T3 §12: at most one per
// program). The one that was current stops being; nothing else changes.
import { z } from 'zod';
import { leagueScope, recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayEditLeague, programScope } from '../policy.ts';
import type { LeaguesTx } from '../ports.ts';

export type SetCurrentSeasonError = { readonly code: 'season-not-found' };

export const setCurrentSeason = defineCommand({
  name: 'leagues.set_current_season',
  permission: 'season.settings',
  input: z.object({ seasonId: z.uuid() }),
  // Checked at the season's program (P4 §4); a season that is not there, league-wide.
  allowed: async (context, input, tx: LeaguesTx) => {
    const programId = await tx.leagues.seasonProgramId(input.seasonId);
    const scope = programId === undefined ? leagueScope : programScope(programId);
    return mayEditLeague(context, tx, 'season.settings', scope);
  },
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ seasonId: string }, SetCurrentSeasonError>> => {
    if (!(await tx.leagues.setCurrentSeason(input.seasonId))) {
      return fail({ code: 'season-not-found' });
    }
    await recordActivity(tx, context, {
      action: 'leagues.set_current_season',
      target: { type: 'season', id: input.seasonId },
    });
    return ok({ seasonId: input.seasonId });
  },
});
