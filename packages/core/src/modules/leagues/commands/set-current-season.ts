// Makes one season the current one of its program (T3 §12: at most one per
// program). The one that was current stops being; nothing else changes.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayEditLeague } from '../policy.ts';
import type { LeaguesTx } from '../ports.ts';

export type SetCurrentSeasonError = { readonly code: 'season-not-found' };

export const setCurrentSeason = defineCommand({
  name: 'leagues.set_current_season',
  input: z.object({ seasonId: z.uuid() }),
  allowed: (context, _input, tx: LeaguesTx) => mayEditLeague(context, tx),
  run: async ({ input, tx }): Promise<Result<{ seasonId: string }, SetCurrentSeasonError>> => {
    if (!(await tx.leagues.setCurrentSeason(input.seasonId))) {
      return fail({ code: 'season-not-found' });
    }
    return ok({ seasonId: input.seasonId });
  },
});
