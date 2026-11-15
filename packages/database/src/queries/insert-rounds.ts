// Adds rounds to a season of the scope's league, as a publication creates them (step
// 2.160): each is numbered after the season's highest, in the order given. How many were
// added: a round whose id is taken (here or in any league) is left out, and so is one for
// which no number is left (a season numbers its rounds 1 to 1000, migration 0009).
import { maxRounds, type NewRound } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function insertRounds(
  scope: LeagueScope,
  seasonId: string,
  rounds: readonly NewRound[],
): Promise<number> {
  const trx = transactionOf(scope);
  let added = 0;
  for (const round of rounds) {
    const top = await trx
      .selectFrom('rounds')
      .select(sql<number | null>`max(number)`.as('top'))
      .where('league_id', '=', scope.leagueId)
      .where('season_id', '=', seasonId)
      .executeTakeFirst();
    const number = (top?.top ?? 0) + 1;
    if (number > maxRounds) return added;
    const row = await trx
      .insertInto('rounds')
      .values({
        id: round.id,
        league_id: scope.leagueId,
        season_id: seasonId,
        number,
        label: round.label,
        date: round.date,
      })
      .onConflict((conflict) => conflict.column('id').doNothing())
      .returning('id')
      .executeTakeFirst();
    if (row !== undefined) added += 1;
  }
  return added;
}
