// A team of the scope's league by id, in the bin or not (the commands decide what a
// binned one means). Undefined if it is not in the scope's league.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { teamSummary, teamSummaryColumns, type TeamSummary } from './team-summary.ts';

export async function findTeam(
  scope: LeagueScope,
  teamId: string,
): Promise<TeamSummary | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('teams')
    .select(teamSummaryColumns)
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', teamId)
    .executeTakeFirst();
  return row === undefined ? undefined : teamSummary(row);
}
