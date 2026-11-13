// Puts a team's roster in the order given (P7 §2): the first gets place 0, the next 1,
// and so on. The list must be every entry of the team who has not left, so nobody is
// left out of the order; those who left follow, in the order they had. An entry whose
// place already matches is left alone. Every entry moved gets a new version (the
// database moves it on every change, T-46), so the result gives the new version of each
// entry touched: a screen holding an older version of one gets 'changed-since-read' on
// its next change, and takes the new one from here. The last order saved wins.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangeRosters, teamScope } from '../policy.ts';
import type { TeamsTx } from '../ports.ts';

export type ReorderRosterError = {
  readonly code: 'team-not-found' | 'roster-entry-not-found' | 'roster-incomplete';
};

export type ReorderRosterResult = {
  readonly count: number;
  /** The new version of every entry whose place changed; the others keep theirs. */
  readonly versions: readonly { readonly rosterEntryId: string; readonly version: number }[];
};

export const reorderRoster = defineCommand({
  name: 'teams.reorder_roster',
  permission: 'rosters.manage',
  input: z.object({
    teamId: z.uuid(),
    rosterEntryIds: z
      .array(z.uuid())
      .min(1)
      .max(200)
      .refine((ids) => new Set(ids).size === ids.length),
  }),
  allowed: async (context, input, tx: TeamsTx) =>
    mayChangeRosters(context, tx, await teamScope(tx, input.teamId)),
  run: async ({ context, input, tx }): Promise<Result<ReorderRosterResult, ReorderRosterError>> => {
    const team = await tx.teams.find(input.teamId);
    if (team === undefined || team.binned) return fail({ code: 'team-not-found' });
    const all = await tx.teams.listRoster(team.id);
    const known = new Set(all.map((e) => e.id));
    const open = new Set(all.filter((e) => e.leftOn === null).map((e) => e.id));
    if (input.rosterEntryIds.some((id) => !known.has(id))) {
      return fail({ code: 'roster-entry-not-found' });
    }
    if (
      input.rosterEntryIds.length !== open.size ||
      input.rosterEntryIds.some((id) => !open.has(id))
    ) {
      return fail({ code: 'roster-incomplete' });
    }
    const sorts = new Map(all.map((e) => [e.id, e.sort]));
    const order = [
      ...input.rosterEntryIds,
      ...all.filter((e) => e.leftOn !== null).map((e) => e.id),
    ];
    const versions: { rosterEntryId: string; version: number }[] = [];
    for (const [place, id] of order.entries()) {
      if (sorts.get(id) === place) continue;
      const version = await tx.teams.updateRosterEntry(id, { sort: place });
      if (typeof version !== 'number') {
        throw new Error('teams.reorder_roster: an entry checked a moment ago is gone.');
      }
      versions.push({ rosterEntryId: id, version });
    }
    await recordActivity(tx, context, {
      action: 'teams.reorder_roster',
      target: { type: 'team', id: team.id },
      details: { count: input.rosterEntryIds.length, moved: versions.length },
    });
    return ok({ count: input.rosterEntryIds.length, versions });
  },
});
