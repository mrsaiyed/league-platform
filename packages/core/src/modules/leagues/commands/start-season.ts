// "Start a new season" (step 2.130; P3 §5 line 88, P7 §1 and §2). A new season of a
// program, with a name, a short name and dates, copies what its program's current season
// was set up with: its rules and statistics, its season-level settings and its divisions
// (T-378). One choice says what else comes: nothing, the teams, or the teams with their
// rosters. A carried team is a new row of the new season with the old one's lineage, so
// it is the same team across seasons (T3 §7); a team in the bin or one that left (S-87)
// is not carried, nor a player who left or is in the bin. With no current season nothing
// is copied and the season starts from the presets. The new season is hidden until shown
// (A-18, step 2.182) and is not made current: "Make this the current season" does that.
import { z } from 'zod';
import { leagueScope, recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { seasonCarryChoices } from '../league-values.ts';
import { mayEditLeague, programScope } from '../policy.ts';
import type { LeaguesTx, SeasonSetupCopied } from '../ports.ts';

export type StartSeasonError = { readonly code: 'program-not-found' | 'season-slug-taken' };

export type StartSeasonValue = {
  readonly seasonId: string;
  /** The season it was copied from, or null when the program had no current season. */
  readonly copiedFromSeasonId: string | null;
  readonly copied: SeasonSetupCopied;
};

const day = z.iso.date();
const nothingCopied: SeasonSetupCopied = { divisions: 0, settings: 0, teams: 0, rosterEntries: 0 };

export const startSeason = defineCommand({
  name: 'leagues.start_season',
  permission: 'season.settings',
  // The same limits as leagues.create_season (the seasons table, 0003).
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
      carry: z.enum(seasonCarryChoices),
    })
    .refine((s) => s.startsOn === undefined || s.endsOn === undefined || s.endsOn >= s.startsOn, {
      path: ['endsOn'],
    }),
  // As leagues.create_season: at the season's program; a missing program league-wide.
  allowed: async (context, input, tx: LeaguesTx) => {
    const program = await tx.leagues.findProgram(input.programId);
    const scope = program === undefined ? leagueScope : programScope(program.id);
    return mayEditLeague(context, tx, 'season.settings', scope);
  },
  run: async ({ context, input, tx }): Promise<Result<StartSeasonValue, StartSeasonError>> => {
    const program = await tx.leagues.findProgram(input.programId);
    if (program === undefined) return fail({ code: 'program-not-found' });
    const fromSeasonId = (await tx.leagues.currentSeasonOf(program.id)) ?? null;
    const created = await tx.leagues.createSeason({
      programId: program.id,
      slug: input.slug,
      name: input.name,
      startsOn: input.startsOn ?? null,
      endsOn: input.endsOn ?? null,
    });
    if (created === 'slug-taken') return fail({ code: 'season-slug-taken' });
    const copied =
      fromSeasonId === null
        ? nothingCopied
        : await tx.leagues.copySeasonSetup({
            fromSeasonId,
            toSeasonId: created,
            teams: input.carry !== 'nothing',
            rosters: input.carry === 'teams-and-rosters',
          });
    await recordActivity(tx, context, {
      action: 'leagues.start_season',
      target: { type: 'season', id: created },
      details: { carry: input.carry, copiedFrom: fromSeasonId, teams: copied.teams },
    });
    return ok({ seasonId: created, copiedFromSeasonId: fromSeasonId, copied });
  },
});
