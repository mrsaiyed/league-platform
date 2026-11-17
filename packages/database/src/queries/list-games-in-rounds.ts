// The games of a season of the scope's league that are in any of these rounds and not in
// the bin, dated or not, scored or not (steps 2.160 and 2.181). A round any of them is in
// cannot be removed; a game in the bin does not hold its round (S-60).
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
    .where('deleted_at', 'is', null)
    .orderBy('id')
    .execute();
  return rows.flatMap((row) =>
    row.round_id === null ? [] : [{ id: row.id, roundId: row.round_id }],
  );
}
