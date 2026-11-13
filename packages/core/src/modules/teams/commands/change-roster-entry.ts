// Changes a roster entry (P7 §2): the jersey number (null takes it away) and the
// role label. Someone who has left is history and cannot be changed. The save names
// the version it started from and is refused if someone else saved since (T-46).
// Where the season asks for unique numbers, a number someone else on the team wears
// is refused by the database (0008).
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { entryScope, mayChangeRosters } from '../policy.ts';
import type { RosterEntryChange, TeamsTx } from '../ports.ts';
import { jerseyNumber, rosterRole } from '../roster-fields.ts';

export type ChangeRosterEntryError = {
  readonly code: 'roster-entry-not-found' | 'already-left' | 'jersey-taken' | 'changed-since-read';
};

export const changeRosterEntry = defineCommand({
  name: 'teams.change_roster_entry',
  permission: 'rosters.manage',
  input: z
    .object({
      rosterEntryId: z.uuid(),
      version: z.number().int().positive(),
      /** null takes the number away. */
      jerseyNumber: jerseyNumber.nullable().optional(),
      role: rosterRole.optional(),
    })
    .refine((e) => e.jerseyNumber !== undefined || e.role !== undefined, {
      path: ['jerseyNumber'],
    }),
  allowed: async (context, input, tx: TeamsTx) =>
    mayChangeRosters(context, tx, await entryScope(tx, input.rosterEntryId)),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ version: number }, ChangeRosterEntryError>> => {
    const entry = await tx.teams.findRosterEntry(input.rosterEntryId);
    if (entry === undefined) return fail({ code: 'roster-entry-not-found' });
    const team = await tx.teams.find(entry.teamId);
    if (team === undefined || team.binned) return fail({ code: 'roster-entry-not-found' });
    if (entry.leftOn !== null) return fail({ code: 'already-left' });
    if (entry.version !== input.version) return fail({ code: 'changed-since-read' });
    const change: RosterEntryChange = {};
    const changed: string[] = [];
    if (input.jerseyNumber !== undefined && input.jerseyNumber !== entry.jerseyNumber) {
      change.jerseyNumber = input.jerseyNumber;
      changed.push('jerseyNumber');
    }
    if (input.role !== undefined && input.role !== entry.role) {
      change.role = input.role;
      changed.push('role');
    }
    if (changed.length === 0) return ok({ version: entry.version });
    const updated = await tx.teams.updateRosterEntry(entry.id, change, input.version);
    if (updated === 'jersey-taken') return fail({ code: 'jersey-taken' });
    if (updated === 'already-on-team') {
      throw new Error('teams.change_roster_entry: an unexpected clash.');
    }
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'teams.change_roster_entry',
      target: { type: 'team', id: team.id },
      details: { personId: entry.personId, changed: changed.join(',') },
    });
    return ok({ version: updated });
  },
});
