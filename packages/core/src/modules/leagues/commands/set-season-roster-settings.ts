// Sets a season's roster settings: the smallest and largest roster, the day rosters
// lock and the unique-jersey switch (P7 §1, record 022). They are the `rosters` part
// of the rules document, so this reads the saved rules (or the starting set if none
// are saved yet), changes that part and checks the whole document again. A field left
// out stays as it is; null clears a limit. Same version check as the rules (A-8).
import { SeasonRules } from '@srleagues/contracts';
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayEditLeague, seasonScope } from '../policy.ts';
import type { LeaguesTx } from '../ports.ts';
import { readSeasonRules } from './season-view.ts';

export type SetSeasonRosterSettingsError =
  | {
      readonly code: 'season-not-found' | 'changed-since-read' | 'unique-jerseys-clash';
    }
  /** What is wrong with the settings, in plain words. */
  | { readonly code: 'invalid-rules'; readonly message: string };

export const setSeasonRosterSettings = defineCommand({
  name: 'leagues.set_season_roster_settings',
  permission: 'season.settings',
  input: z
    .object({
      seasonId: z.uuid(),
      version: z.number().int().positive(),
      minSize: z.number().int().nullable().optional(),
      maxSize: z.number().int().nullable().optional(),
      locksOn: z.string().nullable().optional(),
      uniqueJerseys: z.boolean().optional(),
    })
    .refine(
      (s) =>
        s.minSize !== undefined ||
        s.maxSize !== undefined ||
        s.locksOn !== undefined ||
        s.uniqueJerseys !== undefined,
      { path: ['minSize'] },
    ),
  allowed: async (context, input, tx: LeaguesTx) =>
    mayEditLeague(context, tx, 'season.settings', await seasonScope(tx, input.seasonId)),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ version: number }, SetSeasonRosterSettingsError>> => {
    const season = await tx.leagues.findSeason(input.seasonId);
    if (season === undefined) return fail({ code: 'season-not-found' });
    if (season.version !== input.version) return fail({ code: 'changed-since-read' });
    const before = readSeasonRules(season.rules);
    const rosters = {
      minSize: input.minSize === undefined ? before.rules.rosters.minSize : input.minSize,
      maxSize: input.maxSize === undefined ? before.rules.rosters.maxSize : input.maxSize,
      locksOn: input.locksOn === undefined ? before.rules.rosters.locksOn : input.locksOn,
      uniqueJerseys:
        input.uniqueJerseys === undefined
          ? before.rules.rosters.uniqueJerseys
          : input.uniqueJerseys,
    };
    const checked = SeasonRules.safeParse({ ...before.rules, rosters });
    if (!checked.success) {
      return fail({
        code: 'invalid-rules',
        message: checked.error.issues[0]?.message ?? 'The roster settings are not valid.',
      });
    }
    if (before.saved && JSON.stringify(rosters) === JSON.stringify(before.rules.rosters)) {
      return ok({ version: season.version });
    }
    const updated = await tx.leagues.updateSeason(
      season.id,
      { rules: checked.data },
      input.version,
    );
    if (updated === 'unique-jerseys-clash') return fail({ code: 'unique-jerseys-clash' });
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'leagues.set_season_roster_settings',
      target: { type: 'season', id: season.id },
      details: { changed: 'rosters' },
    });
    return ok({ version: updated });
  },
});
