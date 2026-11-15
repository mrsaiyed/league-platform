// Puts a player marked as left by mistake back on the roster (step 2.161; R-17, A-5): the
// same entry's leaving date is cleared, so no "left" line is left behind and every game
// they played and every number of theirs stays as it was (those never pointed at the
// leaving date). Allowed to exactly those who may mark a player as left, and refused in
// the same places: while the league is archived or suspended, on a team in the bin. It
// is refused for an entry of another team than the page's, for one that has no leaving
// date, for a person no longer in the league's list, and where the database would refuse
// the entry open again: the person is on the team again by a later entry, or their number
// is now worn where the season asks for unique numbers. A season does not limit a person
// to one team (adding to a roster checks only this team), so neither does this.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { entryScope, mayChangeRosters } from '../policy.ts';
import type { TeamsTx } from '../ports.ts';

export type PutBackOnRosterError = {
  readonly code:
    | 'roster-entry-not-found'
    | 'not-left'
    | 'person-not-found'
    | 'already-on-team'
    | 'jersey-taken'
    | 'changed-since-read';
};

export const putBackOnRoster = defineCommand({
  name: 'teams.put_back_on_roster',
  permission: 'rosters.manage',
  input: z.object({
    teamId: z.uuid(),
    rosterEntryId: z.uuid(),
    version: z.number().int().positive(),
  }),
  allowed: async (context, input, tx: TeamsTx) =>
    mayChangeRosters(context, tx, await entryScope(tx, input.rosterEntryId)),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ version: number }, PutBackOnRosterError>> => {
    const entry = await tx.teams.findRosterEntry(input.rosterEntryId);
    if (entry === undefined || entry.teamId !== input.teamId) {
      return fail({ code: 'roster-entry-not-found' });
    }
    const team = await tx.teams.find(entry.teamId);
    if (team === undefined || team.binned) return fail({ code: 'roster-entry-not-found' });
    if (entry.leftOn === null) return fail({ code: 'not-left' });
    if (entry.version !== input.version) return fail({ code: 'changed-since-read' });
    // A roster never holds someone who is not in the league's list (add-to-roster.ts).
    const person = await tx.teams.findPerson(entry.personId);
    if (person === undefined || person.binned) return fail({ code: 'person-not-found' });
    // Said before the database's own refusal, which leaves the transaction unusable.
    const roster = await tx.teams.listRoster(team.id);
    if (roster.some((line) => line.personId === entry.personId && line.leftOn === null)) {
      return fail({ code: 'already-on-team' });
    }
    const updated = await tx.teams.updateRosterEntry(entry.id, { leftOn: null }, input.version);
    if (updated === 'already-on-team') return fail({ code: 'already-on-team' });
    if (updated === 'jersey-taken') return fail({ code: 'jersey-taken' });
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'teams.put_back_on_roster',
      target: { type: 'team', id: team.id },
      details: { personId: entry.personId },
    });
    return ok({ version: updated });
  },
});
