// "Archive" a season (step 2.130; P3 §5 line 94, O-12). The season keeps its place under
// the public season picker (visitors see an archived season as a shown one,
// list-public-seasons.ts) and becomes read-only: every command that writes into it is
// refused with `season-archived`, except an admin's correction with a reason
// (games.reopen_game, S-7), after which the game's result is entered again (T-377).
// Archived is the state a season already had for "over and still shown", `completed`
// (T-376). Being the current season is a mark, not content: archiving leaves it as it is
// (S-99), and "Make this the current season" still works on an archived season. There is
// no way back to running in v1 (S-100). A hidden season is refused (`season-hidden`,
// T-388): archived is a shown state, so archiving one would show it to visitors, and an
// archived season can no longer be hidden; show it first, or leave it hidden. Names the
// version it started from (A-8, T-46).
import { z } from 'zod';
import { leagueScope, recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { archivedSeasonStatus, hiddenSeasonStatus } from '../league-values.ts';
import { mayEditLeague, programScope } from '../policy.ts';
import type { LeaguesTx } from '../ports.ts';

export type ArchiveSeasonError = {
  readonly code: 'season-not-found' | 'changed-since-read' | 'season-hidden';
};

export const archiveSeason = defineCommand({
  name: 'leagues.archive_season',
  permission: 'season.settings',
  input: z.object({ seasonId: z.uuid(), version: z.number().int().positive() }),
  // At the season's program (P4 §4); a season that is not there, league-wide.
  allowed: async (context, input, tx: LeaguesTx) => {
    const programId = await tx.leagues.seasonProgramId(input.seasonId);
    const scope = programId === undefined ? leagueScope : programScope(programId);
    return mayEditLeague(context, tx, 'season.settings', scope);
  },
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ seasonId: string; version: number }, ArchiveSeasonError>> => {
    const season = await tx.leagues.findSeason(input.seasonId);
    if (season === undefined) return fail({ code: 'season-not-found' });
    if (season.version !== input.version) return fail({ code: 'changed-since-read' });
    if (season.status === hiddenSeasonStatus) return fail({ code: 'season-hidden' });
    if (season.status === archivedSeasonStatus) {
      return ok({ seasonId: season.id, version: season.version });
    }
    const updated = await tx.leagues.updateSeason(
      season.id,
      { status: archivedSeasonStatus },
      input.version,
    );
    if (typeof updated !== 'number') return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'leagues.archive_season',
      target: { type: 'season', id: season.id },
    });
    return ok({ seasonId: season.id, version: updated });
  },
});
