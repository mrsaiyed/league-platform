// Brings a division back from the bin (A-5). A name in the bin does not hold its
// place, so a sibling may have taken it since: then this says so
// (`division-name-taken`) and the admin renames one of them. A division whose parent
// is still in the bin stays there until the parent is back (`division-parent-in-bin`).
// Restoring one that is not in the bin changes nothing.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { divisionScope, mayEditLeague } from '../policy.ts';
import type { LeaguesTx } from '../ports.ts';

export type RestoreDivisionError = {
  readonly code: 'division-not-found' | 'division-parent-in-bin' | 'division-name-taken';
};

export const restoreDivision = defineCommand({
  name: 'leagues.restore_division',
  permission: 'bin.restore',
  input: z.object({ divisionId: z.uuid() }),
  allowed: async (context, input, tx: LeaguesTx) =>
    mayEditLeague(context, tx, 'bin.restore', await divisionScope(tx, input.divisionId)),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ divisionId: string }, RestoreDivisionError>> => {
    const division = await tx.divisions.find(input.divisionId);
    if (division === undefined) return fail({ code: 'division-not-found' });
    if (!division.binned) return ok({ divisionId: division.id });
    if (division.parentDivisionId !== null) {
      const parent = await tx.divisions.find(division.parentDivisionId);
      if (parent === undefined || parent.binned) return fail({ code: 'division-parent-in-bin' });
    }
    const restored = await tx.divisions.setBinned(division.id, false);
    if (restored === 'name-taken') return fail({ code: 'division-name-taken' });
    await recordActivity(tx, context, {
      action: 'leagues.restore_division',
      target: { type: 'division', id: division.id },
    });
    return ok({ divisionId: division.id });
  },
});
