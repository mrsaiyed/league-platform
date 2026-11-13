// Edits a team (P7 §2): its name, short name, color and division (null puts the
// league's own colors back, or takes it out of its division). Who sees its players'
// numbers has its own command. The save names the version it started from and is
// refused if someone else saved since (T-46). Changing the short name changes the
// team's address; nothing forwards the old one.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangeTeams, teamScope } from '../policy.ts';
import type { TeamChange, TeamsTx } from '../ports.ts';
import { teamColor, teamName, teamSlug } from '../team-fields.ts';

export type UpdateTeamError = {
  readonly code:
    | 'team-not-found'
    | 'division-not-found'
    | 'team-short-name-taken'
    | 'team-name-taken'
    | 'changed-since-read';
};

export const updateTeam = defineCommand({
  name: 'teams.update_team',
  permission: 'teams.manage',
  input: z
    .object({
      teamId: z.uuid(),
      version: z.number().int().positive(),
      name: teamName.optional(),
      shortName: teamSlug.optional(),
      /** null puts the league's own colors back. */
      color: teamColor.nullable().optional(),
      /** null takes the team out of its division. */
      divisionId: z.uuid().nullable().optional(),
    })
    .refine(
      (t) =>
        t.name !== undefined ||
        t.shortName !== undefined ||
        t.color !== undefined ||
        t.divisionId !== undefined,
      { path: ['name'] },
    ),
  allowed: async (context, input, tx: TeamsTx) =>
    mayChangeTeams(context, tx, await teamScope(tx, input.teamId)),
  run: async ({ context, input, tx }): Promise<Result<{ version: number }, UpdateTeamError>> => {
    const team = await tx.teams.find(input.teamId);
    if (team === undefined || team.binned) return fail({ code: 'team-not-found' });
    if (team.version !== input.version) return fail({ code: 'changed-since-read' });
    if (input.divisionId !== undefined && input.divisionId !== null) {
      const division = await tx.teams.findDivision(input.divisionId);
      if (division === undefined || division.binned || division.seasonId !== team.seasonId) {
        return fail({ code: 'division-not-found' });
      }
    }
    const change: TeamChange = {};
    const changed: string[] = [];
    if (input.name !== undefined && input.name !== team.name) {
      change.name = input.name;
      changed.push('name');
    }
    if (input.shortName !== undefined && input.shortName !== team.slug) {
      change.slug = input.shortName;
      changed.push('shortName');
    }
    if (input.color !== undefined && input.color !== team.color) {
      change.color = input.color;
      changed.push('color');
    }
    if (input.divisionId !== undefined && input.divisionId !== team.divisionId) {
      change.divisionId = input.divisionId;
      changed.push('division');
    }
    if (changed.length === 0) return ok({ version: team.version });
    const updated = await tx.teams.update(team.id, change, input.version);
    if (updated === 'slug-taken') return fail({ code: 'team-short-name-taken' });
    if (updated === 'name-taken') return fail({ code: 'team-name-taken' });
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'teams.update_team',
      target: { type: 'team', id: team.id },
      details: { changed: changed.join(',') },
    });
    return ok({ version: updated });
  },
});
