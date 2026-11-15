// Adds rounds to a season of the scope's league, as a publication creates them (step
// 2.160), each with the number the draft gave it. How many were added: a round whose id
// (here or in any league) or number in the season is taken is left out, and so is one
// whose number is past what a season holds (1 to 1000, migration 0009).
import { maxRounds, type NewRound } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function insertRounds(
  scope: LeagueScope,
  seasonId: string,
  rounds: readonly NewRound[],
): Promise<number> {
  const trx = transactionOf(scope);
  let added = 0;
  for (const round of rounds) {
    if (!Number.isInteger(round.number) || round.number < 1 || round.number > maxRounds) continue;
    const row = await trx
      .insertInto('rounds')
      .values({
        id: round.id,
        league_id: scope.leagueId,
        season_id: seasonId,
        number: round.number,
        label: round.label,
        date: round.date,
      })
      // Any unique key: the id (rounds_pkey) or the number in the season (rounds_number_key).
      .onConflict((conflict) => conflict.doNothing())
      .returning('id')
      .executeTakeFirst();
    if (row !== undefined) added += 1;
  }
  return added;
}
