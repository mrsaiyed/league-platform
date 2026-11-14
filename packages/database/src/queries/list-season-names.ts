// The names a fixtures file may use for a season of the scope's league (step 2.10's reader):
// the season's teams not in the bin, and the league's venues not in the bin with their courts
// not in the bin.
import type { SeasonNames } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listSeasonNames(scope: LeagueScope, seasonId: string): Promise<SeasonNames> {
  const trx = transactionOf(scope);
  const teams = await trx
    .selectFrom('teams')
    .select(['id', 'name'])
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('deleted_at', 'is', null)
    .orderBy('name')
    .orderBy('id')
    .execute();
  const venues = await trx
    .selectFrom('venues')
    .select(['id', 'name'])
    .where('league_id', '=', scope.leagueId)
    .where('deleted_at', 'is', null)
    .orderBy('name')
    .orderBy('id')
    .execute();
  const courts = await trx
    .selectFrom('courts')
    .select(['venue_id', 'name'])
    .where('league_id', '=', scope.leagueId)
    .where('deleted_at', 'is', null)
    .orderBy('sort')
    .orderBy('name')
    .execute();
  return {
    teams: teams.map((t) => ({ id: t.id, name: t.name })),
    venues: venues.map((v) => ({
      id: v.id,
      name: v.name,
      courts: courts.filter((c) => c.venue_id === v.id).map((c) => c.name),
    })),
  };
}
