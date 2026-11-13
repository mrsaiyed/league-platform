// Edits a season's name, dates, state and whether it is the current one (P7 §1). The
// save names the version it started from and is refused if another admin saved since
// (A-8, T-46). Before the first game is final a change simply saves (S-1); the preview
// for later changes belongs to rules, which step 2.25 guards.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { seasonStatuses } from '../league-values.ts';
import { mayEditLeague, seasonScope } from '../policy.ts';
import type { LeaguesTx, SeasonChange } from '../ports.ts';

export type UpdateSeasonError = {
  readonly code: 'season-not-found' | 'season-dates-out-of-order' | 'changed-since-read';
};

const day = z.iso.date();

export const updateSeason = defineCommand({
  name: 'leagues.update_season',
  permission: 'season.settings',
  // The same limits as the seasons table (0003).
  input: z
    .object({
      seasonId: z.uuid(),
      version: z.number().int().positive(),
      name: z.string().trim().min(1).max(120).optional(),
      /** null clears the date. */
      startsOn: day.nullable().optional(),
      endsOn: day.nullable().optional(),
      status: z.enum(seasonStatuses).optional(),
      /** True makes it the current season of its program; false stops it being. */
      current: z.boolean().optional(),
    })
    .refine(
      (s) =>
        s.name !== undefined ||
        s.startsOn !== undefined ||
        s.endsOn !== undefined ||
        s.status !== undefined ||
        s.current !== undefined,
      { path: ['name'] },
    ),
  allowed: async (context, input, tx: LeaguesTx) =>
    mayEditLeague(context, tx, 'season.settings', await seasonScope(tx, input.seasonId)),
  run: async ({ context, input, tx }): Promise<Result<{ version: number }, UpdateSeasonError>> => {
    const season = await tx.leagues.findSeason(input.seasonId);
    if (season === undefined) return fail({ code: 'season-not-found' });
    if (season.version !== input.version) return fail({ code: 'changed-since-read' });
    const name = input.name !== undefined && input.name !== season.name ? input.name : undefined;
    const startsOn =
      input.startsOn !== undefined && input.startsOn !== season.startsOn
        ? input.startsOn
        : undefined;
    const endsOn =
      input.endsOn !== undefined && input.endsOn !== season.endsOn ? input.endsOn : undefined;
    const status =
      input.status !== undefined && input.status !== season.status ? input.status : undefined;
    const isCurrent =
      input.current !== undefined && input.current !== season.isCurrent ? input.current : undefined;
    const change: SeasonChange = {
      ...(name === undefined ? {} : { name }),
      ...(startsOn === undefined ? {} : { startsOn }),
      ...(endsOn === undefined ? {} : { endsOn }),
      ...(status === undefined ? {} : { status }),
      ...(isCurrent === undefined ? {} : { isCurrent }),
    };
    const fields = Object.keys(change);
    if (fields.length === 0) return ok({ version: season.version });
    const from = startsOn === undefined ? season.startsOn : startsOn;
    const to = endsOn === undefined ? season.endsOn : endsOn;
    if (from !== null && to !== null && to < from) {
      return fail({ code: 'season-dates-out-of-order' });
    }
    const updated = await tx.leagues.updateSeason(season.id, change, input.version);
    if (typeof updated !== 'number') return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'leagues.update_season',
      target: { type: 'season', id: season.id },
      details: { changed: fields.join(',') },
    });
    return ok({ version: updated });
  },
});
