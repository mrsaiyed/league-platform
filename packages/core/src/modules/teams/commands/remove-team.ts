// Moves a team to the bin (A-5): its row stays, with `deleted_at` set, and so does
// everything that points at it (its roster, its games), so bringing it back brings
// them back (step 2.76). Its name and short name are free for another team meanwhile.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangeTeams, teamScope } from '../policy.ts';
import type { TeamsTx } from '../ports.ts';

export type RemoveTeamError = { readonly code: 'team-not-found' };

export const removeTeam = defineCommand({
  name: 'teams.remove_team',
  permission: 'teams.manage',
  input: z.object({ teamId: z.uuid() }),
  allowed: async (context, input, tx: TeamsTx) =>
    mayChangeTeams(context, tx, await teamScope(tx, input.teamId)),
  run: async ({ context, input, tx }): Promise<Result<{ teamId: string }, RemoveTeamError>> => {
    const team = await tx.teams.find(input.teamId);
    if (team === undefined || team.binned) return fail({ code: 'team-not-found' });
    await tx.teams.setBinned(team.id, true);
    await recordActivity(tx, context, {
      action: 'teams.remove_team',
      target: { type: 'team', id: team.id },
    });
    return ok({ teamId: team.id });
  },
});
