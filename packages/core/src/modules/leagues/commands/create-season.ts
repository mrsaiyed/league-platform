// Adds a season (a running of a program, T3 §4), in the state draft. With no program
// named it goes in the league's default program, which is all a single-program
// league ever sees (U-3). A season is not current until setCurrentSeason says so.
import { z } from 'zod';
import { leagueScope, recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayEditLeague, programScope } from '../policy.ts';
import type { LeaguesTx } from '../ports.ts';

export type CreateSeasonError = { readonly code: 'program-not-found' | 'season-slug-taken' };

const day = z.iso.date();

export const createSeason = defineCommand({
  name: 'leagues.create_season',
  permission: 'season.settings',
  // The same limits as the seasons table (0003).
  input: z
    .object({
      programId: z.uuid().optional(),
      slug: z
        .string()
        .max(60)
        .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
      name: z.string().trim().min(1).max(120),
      startsOn: day.optional(),
      endsOn: day.optional(),
    })
    .refine((s) => s.startsOn === undefined || s.endsOn === undefined || s.endsOn >= s.startsOn, {
      path: ['endsOn'],
    }),
  // Checked at the season's program (P4 §4). A program that is not there is checked
  // league-wide, so only those who may add to any program learn it is missing.
  allowed: async (context, input, tx: LeaguesTx) => {
    const program = await tx.leagues.findProgram(input.programId);
    const scope = program === undefined ? leagueScope : programScope(program.id);
    return mayEditLeague(context, tx, 'season.settings', scope);
  },
  run: async ({ context, input, tx }): Promise<Result<{ seasonId: string }, CreateSeasonError>> => {
    const program = await tx.leagues.findProgram(input.programId);
    if (program === undefined) return fail({ code: 'program-not-found' });
    const created = await tx.leagues.createSeason({
      programId: program.id,
      slug: input.slug,
      name: input.name,
      startsOn: input.startsOn ?? null,
      endsOn: input.endsOn ?? null,
    });
    if (created === 'slug-taken') return fail({ code: 'season-slug-taken' });
    await recordActivity(tx, context, {
      action: 'leagues.create_season',
      target: { type: 'season', id: created },
    });
    return ok({ seasonId: created });
  },
});
