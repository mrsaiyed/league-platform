// How many games a team has played and still has to play (A-17), for the admin's "Remove
// this team" panel, which says it before anything is confirmed. It changes nothing, but
// runs in the same shape as a command (record 014), and only for those who may remove the
// team (`teams.manage`), as the panel is theirs. It still answers in an archived league.
import { z } from 'zod';
import { hasPermission } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { teamScope } from '../policy.ts';
import type { TeamsTx } from '../ports.ts';
import { teamGamesOf, type TeamGames } from '../team-games.ts';

export type CountTeamGamesError = { readonly code: 'team-not-found' };

export const countTeamGames = defineCommand({
  name: 'teams.count_team_games',
  permission: 'teams.manage',
  input: z.object({ teamId: z.uuid() }),
  allowed: async (context, input, tx: TeamsTx) =>
    hasPermission(context, tx, 'teams.manage', await teamScope(tx, input.teamId)),
  run: async ({ input, tx }): Promise<Result<TeamGames, CountTeamGamesError>> => {
    const team = await tx.teams.find(input.teamId);
    if (team === undefined) return fail({ code: 'team-not-found' });
    return ok(await teamGamesOf(tx, team));
  },
});
