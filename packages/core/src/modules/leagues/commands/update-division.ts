// Renames a division and sets or clears its color (P7 §1). The save names the version
// it started from and is refused if someone else saved since (T-46).
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { divisionColor, divisionName } from '../division-fields.ts';
import { divisionScope, mayEditLeague } from '../policy.ts';
import type { LeaguesTx } from '../ports.ts';

export type UpdateDivisionError = {
  readonly code: 'division-not-found' | 'division-name-taken' | 'changed-since-read';
};

export const updateDivision = defineCommand({
  name: 'leagues.update_division',
  permission: 'divisions.manage',
  input: z
    .object({
      divisionId: z.uuid(),
      version: z.number().int().positive(),
      name: divisionName.optional(),
      /** null puts the league's own colors back. */
      color: divisionColor.nullable().optional(),
    })
    .refine((d) => d.name !== undefined || d.color !== undefined, { path: ['name'] }),
  allowed: async (context, input, tx: LeaguesTx) =>
    mayEditLeague(context, tx, 'divisions.manage', await divisionScope(tx, input.divisionId)),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ version: number }, UpdateDivisionError>> => {
    const division = await tx.divisions.find(input.divisionId);
    if (division === undefined || division.binned) return fail({ code: 'division-not-found' });
    if (division.version !== input.version) return fail({ code: 'changed-since-read' });
    const name = input.name !== undefined && input.name !== division.name ? input.name : undefined;
    const color =
      input.color !== undefined && input.color !== division.color ? input.color : undefined;
    if (name === undefined && color === undefined) return ok({ version: division.version });
    const updated = await tx.divisions.update(
      division.id,
      {
        ...(name === undefined ? {} : { name }),
        ...(color === undefined ? {} : { color }),
      },
      input.version,
    );
    if (updated === 'name-taken') return fail({ code: 'division-name-taken' });
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'leagues.update_division',
      target: { type: 'division', id: division.id },
    });
    return ok({ version: updated });
  },
});
