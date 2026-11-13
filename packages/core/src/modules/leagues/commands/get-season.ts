// One season as the season settings screen shows it (P7 §1), with its rules in the
// current format. It changes nothing, but runs in the shape of a command (record 014).
// Reading is allowed in a league that is archived or suspended too.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangeLeagueSettings, seasonScope } from '../policy.ts';
import type { LeaguesTx } from '../ports.ts';
import { seasonView, type SeasonView } from './season-view.ts';

export type GetSeasonError = { readonly code: 'season-not-found' };

export const getSeason = defineCommand({
  name: 'leagues.get_season',
  permission: 'season.settings',
  input: z.object({ seasonId: z.uuid() }),
  allowed: async (context, input, tx: LeaguesTx) =>
    mayChangeLeagueSettings(context, tx, 'season.settings', await seasonScope(tx, input.seasonId)),
  run: async ({ input, tx }): Promise<Result<SeasonView, GetSeasonError>> => {
    const season = await tx.leagues.findSeason(input.seasonId);
    if (season === undefined) return fail({ code: 'season-not-found' });
    return ok(await seasonView(tx, season));
  },
});
