// One team of a season by the short name in its address (`/teams/{team}`), for the top
// of its public page; undefined when there is none (or it is in the bin, or its season
// is still being set up).
import { publicTeam, type PublicDisplay, type PublicTeam } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findPublicTeam(
  scope: LeagueScope,
  seasonId: string,
  teamSlug: string,
  display: PublicDisplay,
): Promise<PublicTeam | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('teams')
    .innerJoin('seasons', (join) =>
      join
        .onRef('seasons.league_id', '=', 'teams.league_id')
        .onRef('seasons.id', '=', 'teams.season_id'),
    )
    .leftJoin('divisions', (join) =>
      join
        .onRef('divisions.league_id', '=', 'teams.league_id')
        .onRef('divisions.id', '=', 'teams.division_id'),
    )
    .select([
      'teams.id as id',
      'teams.slug as slug',
      'teams.name as name',
      'teams.color as color',
      'teams.stats_visibility as stats_visibility',
      'divisions.id as division_id',
      'divisions.name as division_name',
      'divisions.color as division_color',
    ])
    .where('teams.league_id', '=', scope.leagueId)
    .where('teams.season_id', '=', seasonId)
    .where('teams.slug', '=', teamSlug)
    .where('teams.deleted_at', 'is', null)
    .where('seasons.deleted_at', 'is', null)
    .where('seasons.status', 'in', ['active', 'completed'])
    .executeTakeFirst();
  if (row === undefined) return undefined;
  return publicTeam(
    {
      leagueId: scope.leagueId,
      id: row.id,
      slug: row.slug,
      name: row.name,
      color: row.color,
      statsVisibility: row.stats_visibility,
      division:
        row.division_id === null || row.division_name === null
          ? null
          : { id: row.division_id, name: row.division_name, color: row.division_color },
    },
    display.viewer,
  );
}
