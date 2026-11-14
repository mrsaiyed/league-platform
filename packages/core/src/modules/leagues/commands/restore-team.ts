// Brings a team back from the bin (A-5) with its roster and games, which were never
// touched. A short name or name in the bin does not hold its place, so another team
// may have taken it since: then this says so and the admin renames one of them. A team
// whose division is still in the bin stays there until the division is back. Restoring
// a team that is not in the bin changes nothing. Whoever may remove a team may restore
// it (A-5): `teams.manage` at its season's program, as `teams.remove_team` needs.
import { z } from 'zod';
import { leagueScope, recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { binSeasonScope, mayRestore } from '../bin-policy.ts';
import type { BinTx } from '../bin.ts';

export type RestoreTeamError = {
  readonly code:
    | 'team-not-found'
    | 'team-division-in-bin'
    | 'team-short-name-taken'
    | 'team-name-taken';
};

export const restoreTeam = defineCommand({
  name: 'leagues.restore_team',
  permission: 'teams.manage',
  input: z.object({ teamId: z.uuid() }),
  allowed: async (context, input, tx: BinTx) => {
    const team = await tx.bin.findTeam(input.teamId);
    return mayRestore(
      context,
      tx,
      'teams.manage',
      team === undefined ? leagueScope : await binSeasonScope(tx, team.seasonId),
    );
  },
  run: async ({ context, input, tx }): Promise<Result<{ teamId: string }, RestoreTeamError>> => {
    const team = await tx.bin.findTeam(input.teamId);
    if (team === undefined) return fail({ code: 'team-not-found' });
    if (!team.binned) return ok({ teamId: input.teamId });
    if (team.divisionInBin) return fail({ code: 'team-division-in-bin' });
    const restored = await tx.bin.restoreTeam(input.teamId);
    if (restored === 'short-name-taken') return fail({ code: 'team-short-name-taken' });
    if (restored === 'name-taken') return fail({ code: 'team-name-taken' });
    if (restored === false) return fail({ code: 'team-not-found' });
    await recordActivity(tx, context, {
      action: 'leagues.restore_team',
      target: { type: 'team', id: input.teamId },
    });
    return ok({ teamId: input.teamId });
  },
});
