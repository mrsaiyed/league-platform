// Puts a player marked as left by mistake back on the roster (step 2.161; R-17, A-5): the
// same entry's leaving date is cleared, so no "left" line is left behind and every game
// they played and every number of theirs stays as it was (those never pointed at the
// leaving date). Allowed to exactly those who may mark a player as left, and refused in
// the same places: while the league is archived or suspended, on a team in the bin. It
// is refused for an entry of another team than the page's, for one that has no leaving
// date, for a person no longer in the league's list, and for a person on the team again
// by a later entry. Where the season asks for unique numbers and someone now wears theirs,
// they are put back with no number (R-32), and the result names the number they lost so
// the screen can say who wears it. A season does not limit a person to one team (adding
// to a roster checks only this team), so neither does this.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { entryScope, mayChangeRosters } from '../policy.ts';
import type { TeamsTx } from '../ports.ts';
import { teamInArchivedSeason } from '../archived-season.ts';

export type PutBackOnRosterError = {
  readonly code:
    | 'roster-entry-not-found'
    | 'not-left'
    | 'person-not-found'
    | 'already-on-team'
    /** Only if the database refuses even the entry with no number: kept as its own word. */
    | 'jersey-taken'
    | 'changed-since-read';
};

export type PutBackOnRosterValue = {
  readonly version: number;
  /** The number they wore, when someone else now wears it and they came back without it. */
  readonly numberDropped: string | null;
};

export const putBackOnRoster = defineCommand({
  name: 'teams.put_back_on_roster',
  permission: 'rosters.manage',
  refusedInArchivedSeason: teamInArchivedSeason,
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
  }): Promise<Result<PutBackOnRosterValue, PutBackOnRosterError>> => {
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
    const roster = await tx.teams.listRoster(team.id);
    if (roster.some((line) => line.personId === entry.personId && line.leftOn === null)) {
      return fail({ code: 'already-on-team' });
    }
    let numberDropped: string | null = null;
    let updated = await tx.teams.updateRosterEntry(entry.id, { leftOn: null }, input.version);
    if (updated === 'jersey-taken' && entry.jerseyNumber !== null) {
      // Their number is worn now, where it must be unique: back with no number (R-32).
      numberDropped = entry.jerseyNumber;
      updated = await tx.teams.updateRosterEntry(
        entry.id,
        { leftOn: null, jerseyNumber: null },
        input.version,
      );
    }
    if (updated === 'already-on-team') return fail({ code: 'already-on-team' });
    if (updated === 'jersey-taken') return fail({ code: 'jersey-taken' });
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'teams.put_back_on_roster',
      target: { type: 'team', id: team.id },
      details: { personId: entry.personId, numberDropped },
    });
    return ok({ version: updated, numberDropped });
  },
});
