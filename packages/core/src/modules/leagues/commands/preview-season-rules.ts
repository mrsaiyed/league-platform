// Shows what saving a season's rules would move in its standings, and saves nothing
// (S-1). The admin sees it before confirming: the teams that change place, record or
// points difference, with each value now and after. Before the first game is decided
// nothing is listed, because the change simply saves. A read: it asks for the same
// permission as saving (`season.settings`) and writes no log entry.
import { SeasonRules } from '@srleagues/contracts';
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import {
  previewRulesChange,
  type RulesChangePreview,
  type StandingsTx,
} from '../../standings/index.ts';
import { mayEditLeague, seasonScope } from '../policy.ts';
import type { LeaguesTx } from '../ports.ts';

export type PreviewSeasonRulesError = { readonly code: 'season-not-found' };

export const previewSeasonRules = defineCommand({
  name: 'leagues.preview_season_rules',
  permission: 'season.settings',
  input: z.object({ seasonId: z.uuid(), rules: SeasonRules }),
  allowed: async (context, input, tx: LeaguesTx & StandingsTx) =>
    mayEditLeague(context, tx, 'season.settings', await seasonScope(tx, input.seasonId)),
  run: async ({ input, tx }): Promise<Result<RulesChangePreview, PreviewSeasonRulesError>> => {
    const preview = await previewRulesChange(tx, input.seasonId, input.rules);
    if (preview === undefined) return fail({ code: 'season-not-found' });
    return ok({
      gamesDecided: preview.gamesDecided,
      moves: preview.gamesDecided ? preview.moves : [],
    });
  },
});
