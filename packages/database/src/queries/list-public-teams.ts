// A season's teams for the public teams list (P2 §4, U-5): name, color, division and
// whether this viewer sees the team's player lines or only its totals (S-22). Teams in
// the bin and seasons still being set up are not there.
import { publicTeam, type PublicDisplay, type PublicTeam } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listPublicTeams(
  scope: LeagueScope,
  seasonId: string,
  display: PublicDisplay,
): Promise<PublicTeam[]> {
  const rows = await transactionOf(scope)
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
    .where('teams.deleted_at', 'is', null)
    .where('seasons.deleted_at', 'is', null)
    .where('seasons.status', 'in', ['active', 'completed'])
    .orderBy('divisions.sort')
    .orderBy('teams.name')
    .orderBy('teams.id')
    .execute();
  return rows.map((row) =>
    publicTeam(
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
    ),
  );
}
