// Marks someone as having left a team on a date (R-17, T-52). The entry stays in the
// team's history with every game they played; only its leaving date is set, and the
// number they wore is free for others where numbers must be unique. They may join
// again later (a new entry). The date cannot be before the day they joined.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { entryScope, mayChangeRosters } from '../policy.ts';
import type { TeamsTx } from '../ports.ts';
import { rosterDate } from '../roster-fields.ts';

export type MarkLeftError = {
  readonly code:
    | 'roster-entry-not-found'
    | 'already-left'
    | 'left-before-joined'
    | 'changed-since-read';
};

export const markLeft = defineCommand({
  name: 'teams.mark_left',
  permission: 'rosters.manage',
  input: z.object({
    rosterEntryId: z.uuid(),
    version: z.number().int().positive(),
    leftOn: rosterDate,
  }),
  allowed: async (context, input, tx: TeamsTx) =>
    mayChangeRosters(context, tx, await entryScope(tx, input.rosterEntryId)),
  run: async ({ context, input, tx }): Promise<Result<{ version: number }, MarkLeftError>> => {
    const entry = await tx.teams.findRosterEntry(input.rosterEntryId);
    if (entry === undefined) return fail({ code: 'roster-entry-not-found' });
    const team = await tx.teams.find(entry.teamId);
    if (team === undefined || team.binned) return fail({ code: 'roster-entry-not-found' });
    if (entry.leftOn !== null) return fail({ code: 'already-left' });
    if (entry.version !== input.version) return fail({ code: 'changed-since-read' });
    if (entry.joinedOn !== null && input.leftOn < entry.joinedOn) {
      return fail({ code: 'left-before-joined' });
    }
    const updated = await tx.teams.updateRosterEntry(
      entry.id,
      { leftOn: input.leftOn },
      input.version,
    );
    if (typeof updated === 'string') throw new Error('teams.mark_left: an unexpected clash.');
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'teams.mark_left',
      target: { type: 'team', id: team.id },
      details: { personId: entry.personId, leftOn: input.leftOn },
    });
    return ok({ version: updated });
  },
});
