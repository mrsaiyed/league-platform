// Puts divisions in the order given (P7 §1): the first gets place 0, the next 1, and
// so on. They must be divisions of one season, not in the bin, under one parent
// (or all at the top). The last order saved wins; it is a display order, so there is
// no version to go stale.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayEditLeague, seasonScope } from '../policy.ts';
import type { LeaguesTx } from '../ports.ts';

export type ReorderDivisionsError = { readonly code: 'division-not-found' };

export const reorderDivisions = defineCommand({
  name: 'leagues.reorder_divisions',
  permission: 'divisions.manage',
  input: z.object({
    seasonId: z.uuid(),
    parentDivisionId: z.uuid().optional(),
    divisionIds: z
      .array(z.uuid())
      .min(1)
      .max(200)
      .refine((ids) => new Set(ids).size === ids.length),
  }),
  allowed: async (context, input, tx: LeaguesTx) =>
    mayEditLeague(context, tx, 'divisions.manage', await seasonScope(tx, input.seasonId)),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ count: number }, ReorderDivisionsError>> => {
    const parentId = input.parentDivisionId ?? null;
    for (const id of input.divisionIds) {
      const division = await tx.divisions.find(id);
      if (
        division === undefined ||
        division.binned ||
        division.seasonId !== input.seasonId ||
        division.parentDivisionId !== parentId
      ) {
        return fail({ code: 'division-not-found' });
      }
    }
    for (const [place, id] of input.divisionIds.entries()) {
      if ((await tx.divisions.update(id, { sort: place })) === undefined) {
        throw new Error('leagues.reorder_divisions: a division checked a moment ago is gone.');
      }
    }
    await recordActivity(tx, context, {
      action: 'leagues.reorder_divisions',
      target: { type: 'season', id: input.seasonId },
    });
    return ok({ count: input.divisionIds.length });
  },
});
