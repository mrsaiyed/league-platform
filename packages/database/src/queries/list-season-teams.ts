// A season's teams that are not in the bin, by name, for the public standings and
// statistics reads. Built field by field (T-29).
import type { SeasonTeamRow } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listSeasonTeams(
  scope: LeagueScope,
  seasonId: string,
): Promise<SeasonTeamRow[]> {
  const rows = await transactionOf(scope)
    .selectFrom('teams')
    .select(['id', 'name', 'slug', 'color', 'division_id', 'stats_visibility'])
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('deleted_at', 'is', null)
    .orderBy('name')
    .orderBy('id')
    .execute();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    color: row.color,
    divisionId: row.division_id,
    statsVisibility: row.stats_visibility,
  }));
}
