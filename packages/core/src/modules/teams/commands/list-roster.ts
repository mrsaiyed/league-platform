// A team's roster for the admin screen (P4 §3): everyone who is or was on it, in
// roster order, with the leaving date of those who left (R-17, T-52). It changes
// nothing, but runs in the same shape as a command (record 014). A person's private
// fields (birth date, contact) are never part of it (R-16). A team in the bin can
// still be read, so what it held is visible before it is restored.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayReadRosters, teamScope } from '../policy.ts';
import type { RosterLine, TeamsTx } from '../ports.ts';

export type ListRosterError = { readonly code: 'team-not-found' };

export const listRoster = defineCommand({
  name: 'teams.list_roster',
  permission: 'rosters.manage',
  input: z.object({ teamId: z.uuid() }),
  allowed: async (context, input, tx: TeamsTx) =>
    mayReadRosters(context, tx, await teamScope(tx, input.teamId)),
  run: async ({ input, tx }): Promise<Result<readonly RosterLine[], ListRosterError>> => {
    const team = await tx.teams.find(input.teamId);
    if (team === undefined) return fail({ code: 'team-not-found' });
    return ok(await tx.teams.listRoster(team.id));
  },
});
