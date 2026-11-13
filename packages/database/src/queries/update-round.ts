// Changes a round's label or date in a season of the scope's league (P7 §4.4). False if the
// round is not in the season.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function updateRound(
  scope: LeagueScope,
  seasonId: string,
  roundId: string,
  change: { readonly label?: string; readonly date?: string },
): Promise<boolean> {
  const row = await transactionOf(scope)
    .updateTable('rounds')
    .set({
      ...(change.label === undefined ? {} : { label: change.label }),
      ...(change.date === undefined ? {} : { date: change.date }),
    })
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('id', '=', roundId)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}
