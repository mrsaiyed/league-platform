// The games of a season of the scope's league that are in any of these rounds, whatever
// they are: in the bin, with no date, scored or not (step 2.160). A round any of them is
// in cannot be removed.
import type { GameInRound } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listGamesInRounds(
  scope: LeagueScope,
  seasonId: string,
  roundIds: readonly string[],
): Promise<readonly GameInRound[]> {
  if (roundIds.length === 0) return [];
  const rows = await transactionOf(scope)
    .selectFrom('games')
    .select(['id', 'round_id'])
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('round_id', 'in', [...roundIds])
    .orderBy('id')
    .execute();
  return rows.flatMap((row) =>
    row.round_id === null ? [] : [{ id: row.id, roundId: row.round_id }],
  );
}
