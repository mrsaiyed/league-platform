// A season's divisions that are not in the bin, in order, for the public standings read.
import type { SeasonDivisionRow } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listSeasonDivisions(
  scope: LeagueScope,
  seasonId: string,
): Promise<SeasonDivisionRow[]> {
  const rows = await transactionOf(scope)
    .selectFrom('divisions')
    .select(['id', 'name', 'color', 'sort'])
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('deleted_at', 'is', null)
    .orderBy('sort')
    .orderBy('name')
    .orderBy('id')
    .execute();
  return rows.map((row) => ({ id: row.id, name: row.name, color: row.color, sort: row.sort }));
}
