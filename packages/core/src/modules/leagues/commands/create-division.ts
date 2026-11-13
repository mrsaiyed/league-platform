// Adds a division to a season (P7 §1), at the top or under another division of the
// same season (U-12 leaves room for regions). It goes last among its siblings unless
// a place is given. Its name must differ from its siblings', whatever the capitals.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { divisionColor, divisionName, divisionSort } from '../division-fields.ts';
import { mayEditLeague, seasonScope } from '../policy.ts';
import type { LeaguesTx } from '../ports.ts';

export type CreateDivisionError = {
  readonly code: 'season-not-found' | 'parent-not-found' | 'division-name-taken';
};

export const createDivision = defineCommand({
  name: 'leagues.create_division',
  permission: 'divisions.manage',
  input: z.object({
    seasonId: z.uuid(),
    parentDivisionId: z.uuid().optional(),
    name: divisionName,
    color: divisionColor.optional(),
    sort: divisionSort.optional(),
  }),
  allowed: async (context, input, tx: LeaguesTx) =>
    mayEditLeague(context, tx, 'divisions.manage', await seasonScope(tx, input.seasonId)),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ divisionId: string }, CreateDivisionError>> => {
    if ((await tx.leagues.seasonProgramId(input.seasonId)) === undefined) {
      return fail({ code: 'season-not-found' });
    }
    const parentId = input.parentDivisionId ?? null;
    if (parentId !== null) {
      const parent = await tx.divisions.find(parentId);
      // A parent in the bin or in another season is as good as not there.
      if (parent === undefined || parent.binned || parent.seasonId !== input.seasonId) {
        return fail({ code: 'parent-not-found' });
      }
    }
    let sort = input.sort;
    if (sort === undefined) {
      const siblings = (await tx.divisions.list(input.seasonId)).filter(
        (d) => d.parentDivisionId === parentId,
      );
      sort = Math.min(
        siblings.reduce((next, d) => Math.max(next, d.sort + 1), 0),
        100000,
      );
    }
    const created = await tx.divisions.create({
      seasonId: input.seasonId,
      parentDivisionId: parentId,
      name: input.name,
      color: input.color ?? null,
      sort,
    });
    if (created === 'name-taken') return fail({ code: 'division-name-taken' });
    await recordActivity(tx, context, {
      action: 'leagues.create_division',
      target: { type: 'division', id: created },
    });
    return ok({ divisionId: created });
  },
});
