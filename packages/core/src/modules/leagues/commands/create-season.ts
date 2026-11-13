// Adds a season (a running of a program, T3 §4), in the state draft. With no program
// named it goes in the league's default program, which is all a single-program
// league ever sees (U-3). A season is not current until setCurrentSeason says so.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayEditLeague } from '../policy.ts';
import type { LeaguesTx } from '../ports.ts';

export type CreateSeasonError = { readonly code: 'program-not-found' | 'season-slug-taken' };

const day = z.iso.date();

export const createSeason = defineCommand({
  name: 'leagues.create_season',
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
  allowed: (context, _input, tx: LeaguesTx) => mayEditLeague(context, tx),
  run: async ({ input, tx }): Promise<Result<{ seasonId: string }, CreateSeasonError>> => {
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
    return ok({ seasonId: created });
  },
});
