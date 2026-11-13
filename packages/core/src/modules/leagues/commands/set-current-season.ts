// Makes one season the current one of its program (T3 §12: at most one per
// program). The one that was current stops being; nothing else changes. Like
// leagues.update_season it names the season version it started from and is refused if
// another admin saved since (A-8, T-46), and it moves the version on.
import { z } from 'zod';
import { leagueScope, recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayEditLeague, programScope } from '../policy.ts';
import type { LeaguesTx } from '../ports.ts';

export type SetCurrentSeasonError = {
  readonly code: 'season-not-found' | 'changed-since-read';
};

export const setCurrentSeason = defineCommand({
  name: 'leagues.set_current_season',
  permission: 'season.settings',
  input: z.object({ seasonId: z.uuid(), version: z.number().int().positive() }),
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
  }): Promise<Result<{ seasonId: string; version: number }, SetCurrentSeasonError>> => {
    const season = await tx.leagues.findSeason(input.seasonId);
    if (season === undefined) return fail({ code: 'season-not-found' });
    if (season.version !== input.version) return fail({ code: 'changed-since-read' });
    if (season.isCurrent) return ok({ seasonId: season.id, version: season.version });
    const updated = await tx.leagues.updateSeason(season.id, { isCurrent: true }, input.version);
    if (typeof updated !== 'number') return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'leagues.set_current_season',
      target: { type: 'season', id: season.id },
    });
    return ok({ seasonId: season.id, version: updated });
  },
});
