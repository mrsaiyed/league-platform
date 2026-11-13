// The teams of a game, by id, in the bin or not (a finished game keeps its teams), with
// who may see their players' numbers (S-22).
import type { GamePageTeam } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listGameTeams(
  scope: LeagueScope,
  teamIds: readonly string[],
): Promise<GamePageTeam[]> {
  if (teamIds.length === 0) return [];
  const rows = await transactionOf(scope)
    .selectFrom('teams')
    .select(['id', 'name', 'slug', 'color', 'stats_visibility'])
    .where('league_id', '=', scope.leagueId)
    .where('id', 'in', [...teamIds])
    .orderBy('id')
    .execute();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    color: row.color,
    statsVisibility: row.stats_visibility,
  }));
}
