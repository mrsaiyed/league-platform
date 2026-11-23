// Marks a team as having left the league mid-season (S-87). Its played results stay, so
// other teams' records add up; it stays in the standings and on Teams marked "Left the
// league", and no new game or schedule is offered it. Its games still to come are the
// admin's to forfeit or cancel, each, from Games. Who may: as for editing a team. The save
// names the version it started from (T-46). Marking a team that has left changes nothing.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangeTeams, teamScope } from '../policy.ts';
import type { TeamsTx } from '../ports.ts';

export type MarkTeamLeftError = {
  readonly code: 'team-not-found' | 'changed-since-read';
};

export const markTeamLeft = defineCommand({
  name: 'teams.mark_team_left',
  permission: 'teams.manage',
  input: z.object({ teamId: z.uuid(), version: z.number().int().positive() }),
  allowed: async (context, input, tx: TeamsTx) =>
    mayChangeTeams(context, tx, await teamScope(tx, input.teamId)),
  run: async ({ context, input, tx }): Promise<Result<{ version: number }, MarkTeamLeftError>> => {
    const team = await tx.teams.find(input.teamId);
    if (team === undefined || team.binned) return fail({ code: 'team-not-found' });
    if (team.version !== input.version) return fail({ code: 'changed-since-read' });
    if (team.left === true) return ok({ version: team.version });
    const updated = await tx.teams.update(team.id, { left: true }, input.version);
    if (typeof updated === 'string') throw new Error('teams.mark_team_left: an unexpected clash.');
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'teams.mark_team_left',
      target: { type: 'team', id: team.id },
    });
    return ok({ version: updated });
  },
});
