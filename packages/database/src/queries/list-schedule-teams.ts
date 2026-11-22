// The names of a season's teams in the scope's league for Admin → Schedule's grid, those
// in the bin too, marked: a game of a team moved to the bin before A-17 held it there is
// still in the grid, and is named "Badgers (removed)", never by its id. By name.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export type ScheduleTeamRow = {
  readonly id: string;
  readonly name: string;
  /** In the bin: not offered for a new game, only named. */
  readonly removed: boolean;
};

export async function listScheduleTeams(
  scope: LeagueScope,
  seasonId: string,
): Promise<readonly ScheduleTeamRow[]> {
  const rows = await transactionOf(scope)
    .selectFrom('teams')
    .select(['id', 'name', 'deleted_at'])
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .orderBy('name')
    .orderBy('id')
    .execute();
  return rows.map((row) => ({ id: row.id, name: row.name, removed: row.deleted_at !== null }));
}
