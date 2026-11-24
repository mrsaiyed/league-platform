// Takes off the mark of a team that has left the league (S-87), as easily as it was set:
// the team is offered for new games again. Who may: as for editing a team. The save names
// the version it started from (T-46). A team that has not left is left as it is.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangeTeams, teamScope } from '../policy.ts';
import type { TeamsTx } from '../ports.ts';
import { teamInArchivedSeason } from '../archived-season.ts';

export type UndoTeamLeftError = {
  readonly code: 'team-not-found' | 'changed-since-read';
};

export const undoTeamLeft = defineCommand({
  name: 'teams.undo_team_left',
  permission: 'teams.manage',
  refusedInArchivedSeason: teamInArchivedSeason,
  input: z.object({ teamId: z.uuid(), version: z.number().int().positive() }),
  allowed: async (context, input, tx: TeamsTx) =>
    mayChangeTeams(context, tx, await teamScope(tx, input.teamId)),
  run: async ({ context, input, tx }): Promise<Result<{ version: number }, UndoTeamLeftError>> => {
    const team = await tx.teams.find(input.teamId);
    if (team === undefined || team.binned) return fail({ code: 'team-not-found' });
    if (team.version !== input.version) return fail({ code: 'changed-since-read' });
    if (team.left === false) return ok({ version: team.version });
    const updated = await tx.teams.update(team.id, { left: false }, input.version);
    if (typeof updated === 'string') throw new Error('teams.undo_team_left: an unexpected clash.');
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'teams.undo_team_left',
      target: { type: 'team', id: team.id },
    });
    return ok({ version: updated });
  },
});
