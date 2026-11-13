// Sets who sees a team's players' numbers (S-22): everyone, or only the team's staff
// and the league's admins. An admin can always set it. Whether teams may choose for
// themselves is the league's setting (step 2.14), and a coach's own tools for it come
// with stage 4; neither is declared yet (its starting level is the founder's call), so
// for now only `teams.manage` holders run this. The save names the version it started
// from (T-46).
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangeTeams, teamScope } from '../policy.ts';
import type { TeamsTx } from '../ports.ts';
import { teamStatsVisibility } from '../team-fields.ts';

export type SetTeamStatsVisibilityError = {
  readonly code: 'team-not-found' | 'changed-since-read';
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
