// Records a coin flip (S-89) for teams of a season of the scope's league and returns its
// id. The database refuses a team not of that season, a team named twice, and a note
// out of range (migration 0025).
import type { NewCoinFlip } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function insertStandingsCoinFlip(
  scope: LeagueScope,
  seasonId: string,
  flip: NewCoinFlip,
): Promise<string> {
  const row = await transactionOf(scope)
    .insertInto('standings_coin_flips')
    .values({
      league_id: scope.leagueId,
      season_id: seasonId,
      team_ids: [...flip.teamIds],
      method: flip.method,
      note: flip.note,
      account_id: flip.accountId,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}
