// A season's teams in the scope's league, not in the bin, with the division whose
// standings table each sits in, in id order.
import type { TableTeam } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listTableTeams(
  scope: LeagueScope,
  seasonId: string,
): Promise<readonly TableTeam[]> {
  const rows = await transactionOf(scope)
    .selectFrom('teams')
    .select(['id', 'division_id'])
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('deleted_at', 'is', null)
    .orderBy('id')
    .execute();
  return rows.map((row) => ({ teamId: row.id, divisionId: row.division_id }));
}
