// Sets who sees a team's players' numbers (S-22): everyone, or only the team's staff
// and the league's admins. Whether teams may choose for themselves is the league's
// setting (S-24, yes unless switched off). When it is off, only the league's owner and
// admins (`teams.manage` across the whole league) change a team's level; an admin
// limited to one program does not. A coach's own tools for it come with stage 4, so
// for now only `teams.manage` holders run this. The save names the version it started
// from (T-46).
import { z } from 'zod';
import { hasPermission, leagueScope, recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangeTeams, teamScope } from '../policy.ts';
import { teamsMayChooseLevel } from '../stats-level-settings.ts';
import type { TeamsTx } from '../ports.ts';
import { teamStatsVisibility } from '../team-fields.ts';

export type SetTeamStatsVisibilityError = {
  readonly code: 'team-not-found' | 'changed-since-read' | 'teams-may-not-choose';
};

export const setTeamStatsVisibility = defineCommand({
  name: 'teams.set_stats_visibility',
  permission: 'teams.manage',
  input: z.object({
    teamId: z.uuid(),
    version: z.number().int().positive(),
    statsVisibility: teamStatsVisibility,
  }),
  allowed: async (context, input, tx: TeamsTx) =>
    mayChangeTeams(context, tx, await teamScope(tx, input.teamId)),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ version: number }, SetTeamStatsVisibilityError>> => {
    const team = await tx.teams.find(input.teamId);
    if (team === undefined || team.binned) return fail({ code: 'team-not-found' });
    if (team.version !== input.version) return fail({ code: 'changed-since-read' });
    if (
      !(await teamsMayChooseLevel(tx)) &&
      !(await hasPermission(context, tx, 'teams.manage', leagueScope))
    ) {
      return fail({ code: 'teams-may-not-choose' });
    }
    if (team.statsVisibility === input.statsVisibility) return ok({ version: team.version });
    const updated = await tx.teams.update(
      team.id,
      { statsVisibility: input.statsVisibility },
      input.version,
    );
    if (typeof updated !== 'number') return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'teams.set_stats_visibility',
      target: { type: 'team', id: team.id },
      details: { statsVisibility: input.statsVisibility },
    });
    return ok({ version: updated });
  },
});
