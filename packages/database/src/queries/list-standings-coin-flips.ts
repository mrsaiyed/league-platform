// A season's coin flips (S-89, T-314) in the scope's league, not in the bin, in the order
// recorded: what the calculation uses for teams level after every tiebreaker.
import type { CoinFlipMethod, SeasonCoinFlip } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

const methodOf = (method: string): CoinFlipMethod => (method === 'drawn' ? 'drawn' : 'by-hand');

export async function listStandingsCoinFlips(
  scope: LeagueScope,
  seasonId: string,
): Promise<readonly SeasonCoinFlip[]> {
  const rows = await transactionOf(scope)
    .selectFrom('standings_coin_flips')
    .select(['id', 'team_ids', 'method', 'note', 'account_id', 'created_at'])
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('deleted_at', 'is', null)
    .orderBy('id')
    .execute();
  return rows.map((row) => ({
    id: row.id,
    teamIds: row.team_ids.filter((teamId): teamId is string => teamId !== null),
    method: methodOf(row.method),
    note: row.note,
    accountId: row.account_id,
    recordedAt: new Date(row.created_at).toISOString(),
  }));
}
