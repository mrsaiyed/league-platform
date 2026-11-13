// Sets a season's rules document (step 2.5, P7 §1, S-1). The whole document is
// checked against the written contract, so a rule that makes no sense (a double bonus
// before the bonus, a coin flip that is not last) is refused. The save names the
// version it started from and is refused if another admin saved since (A-8, T-46).
// The unique-jersey switch is part of the document (record 022): the database
// refuses turning it on while a team already has a number worn twice.
import { SeasonRules } from '@srleagues/contracts';
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayEditLeague, seasonScope } from '../policy.ts';
import type { LeaguesTx } from '../ports.ts';
import { readSeasonRules } from './season-view.ts';

export type SetSeasonRulesError = {
  readonly code: 'season-not-found' | 'changed-since-read' | 'unique-jerseys-clash';
};

/** The parts of the document that differ, by name, for the activity log. */
function changedParts(before: SeasonRules, after: SeasonRules): string[] {
  return (Object.keys(after) as (keyof SeasonRules)[]).filter(
    (part) => JSON.stringify(before[part]) !== JSON.stringify(after[part]),
  );
}

export const setSeasonRules = defineCommand({
  name: 'leagues.set_season_rules',
  permission: 'season.settings',
  input: z.object({ seasonId: z.uuid(), version: z.number().int().positive(), rules: SeasonRules }),
  allowed: async (context, input, tx: LeaguesTx) =>
    mayEditLeague(context, tx, 'season.settings', await seasonScope(tx, input.seasonId)),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ version: number }, SetSeasonRulesError>> => {
    const season = await tx.leagues.findSeason(input.seasonId);
    if (season === undefined) return fail({ code: 'season-not-found' });
    if (season.version !== input.version) return fail({ code: 'changed-since-read' });
    const before = readSeasonRules(season.rules);
    const changed = changedParts(before.rules, input.rules);
    if (before.saved && changed.length === 0) return ok({ version: season.version });
    const updated = await tx.leagues.updateSeason(season.id, { rules: input.rules }, input.version);
    if (updated === 'unique-jerseys-clash') return fail({ code: 'unique-jerseys-clash' });
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'leagues.set_season_rules',
      target: { type: 'season', id: season.id },
      details: { changed: before.saved ? changed.join(',') : 'all' },
    });
    return ok({ version: updated });
  },
});
