// A season's teams not in the bin, by name, whatever the season's state (being set up,
// running or finished), as the staff screens list them: Admin → Teams (step 2.93 part 5,
// apps/web's adminTeams.teams). Each as findTeam returns it (team-summary.ts), so the
// screen's forms carry its version. A season of another league, or one that is not
// there, has none. The public reads list only a season visitors may see
// (list-season-teams.ts); this one decides nothing about who asks: the screen is staff's
// (loadLeaguePage) and every change goes through the teams commands.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { teamSummary, teamSummaryColumns, type TeamSummary } from './team-summary.ts';

export async function listStaffSeasonTeams(
  scope: LeagueScope,
  seasonId: string,
): Promise<TeamSummary[]> {
  const rows = await transactionOf(scope)
    .selectFrom('teams')
    .select(teamSummaryColumns)
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('deleted_at', 'is', null)
    .orderBy('name')
    .orderBy('id')
    .execute();
  return rows.map(teamSummary);
}
