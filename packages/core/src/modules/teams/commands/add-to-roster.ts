// Puts a person on a team's roster (P7 §2) with a jersey number (or none yet) and a
// role: player, captain or coach. The role is a label; giving a coach a sign-in role
// is a separate invitation. The person must be in the league's list, not in the bin
// and not merged into another record, and the team must not be in the bin. They go
// to the end of the roster. A person is on a team once at a time (after leaving they
// may join again), and where the season asks for unique numbers the database refuses
// a number someone on the team wears (0008).
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangeRosters, teamScope } from '../policy.ts';
import type { TeamsTx } from '../ports.ts';
import { jerseyNumber, rosterDate, rosterRole } from '../roster-fields.ts';

export type AddToRosterError = {
  readonly code: 'team-not-found' | 'person-not-found' | 'already-on-team' | 'jersey-taken';
};

export const addToRoster = defineCommand({
  name: 'teams.add_to_roster',
  permission: 'rosters.manage',
  input: z.object({
    teamId: z.uuid(),
    personId: z.uuid(),
    jerseyNumber: jerseyNumber.optional(),
    role: rosterRole.default('player'),
    joinedOn: rosterDate.optional(),
  }),
  allowed: async (context, input, tx: TeamsTx) =>
    mayChangeRosters(context, tx, await teamScope(tx, input.teamId)),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ rosterEntryId: string }, AddToRosterError>> => {
    const team = await tx.teams.find(input.teamId);
    if (team === undefined || team.binned) return fail({ code: 'team-not-found' });
    // A person in the bin, or merged away, is as good as not there: a roster never
    // holds someone who is not in the league's list.
    const person = await tx.teams.findPerson(input.personId);
    if (person === undefined || person.binned) return fail({ code: 'person-not-found' });
    const added = await tx.teams.addRosterEntry({
      teamId: team.id,
      personId: person.id,
      jerseyNumber: input.jerseyNumber ?? null,
      role: input.role,
      joinedOn: input.joinedOn ?? null,
    });
    if (added === 'already-on-team') return fail({ code: 'already-on-team' });
    if (added === 'jersey-taken') return fail({ code: 'jersey-taken' });
    await recordActivity(tx, context, {
      action: 'teams.add_to_roster',
      target: { type: 'team', id: team.id },
      details: { personId: person.id, role: input.role },
    });
    return ok({ rosterEntryId: added });
  },
});
