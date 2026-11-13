// Adds a team to a season (P7 §2, T3 §7): a name, a short name its address is built
// from (T-34), a color, a division of the same season, and who sees its players'
// numbers (S-22). The caller states that last: it has no default here, because the
// league setting that would give one waits for the founder's answer. The team gets a
// lineage of its own, so later seasons can be tied to it. The short name and the name
// must each differ from every other team's in the season, not in the bin.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangeTeams, seasonScope } from '../policy.ts';
import type { TeamsTx } from '../ports.ts';
import { teamColor, teamName, teamSlug, teamStatsVisibility } from '../team-fields.ts';

export type CreateTeamError = {
  readonly code:
    | 'season-not-found'
    | 'division-not-found'
    | 'team-short-name-taken'
    | 'team-name-taken';
};

export const createTeam = defineCommand({
  name: 'teams.create_team',
  permission: 'teams.manage',
  input: z.object({
    seasonId: z.uuid(),
    name: teamName,
    shortName: teamSlug,
    color: teamColor.optional(),
    divisionId: z.uuid().optional(),
    statsVisibility: teamStatsVisibility,
  }),
  allowed: async (context, input, tx: TeamsTx) =>
    mayChangeTeams(context, tx, await seasonScope(tx, input.seasonId)),
  run: async ({ context, input, tx }): Promise<Result<{ teamId: string }, CreateTeamError>> => {
    if ((await tx.teams.seasonProgramId(input.seasonId)) === undefined) {
      return fail({ code: 'season-not-found' });
    }
    if (input.divisionId !== undefined) {
      const division = await tx.teams.findDivision(input.divisionId);
      // A division in the bin or in another season is as good as not there.
      if (division === undefined || division.binned || division.seasonId !== input.seasonId) {
        return fail({ code: 'division-not-found' });
      }
    }
    const created = await tx.teams.create({
      seasonId: input.seasonId,
      divisionId: input.divisionId ?? null,
      slug: input.shortName,
      name: input.name,
      color: input.color ?? null,
      statsVisibility: input.statsVisibility,
    });
    if (created === 'slug-taken') return fail({ code: 'team-short-name-taken' });
    if (created === 'name-taken') return fail({ code: 'team-name-taken' });
    await recordActivity(tx, context, {
      action: 'teams.create_team',
      target: { type: 'team', id: created },
      details: { seasonId: input.seasonId },
    });
    return ok({ teamId: created });
  },
});
