// A person of the scope's league by id, in the bin or not (the commands decide what a
// binned one means), but never one merged into another, who counts as not there. The sensitive columns are selected only when `sensitive` (T-76).
// Undefined if the person is not in the scope's league.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import {
  allPersonColumns,
  personSummary,
  personSummaryWithSensitive,
  publicPersonColumns,
  type PersonSummary,
} from './person-summary.ts';

export async function findPerson(
  scope: LeagueScope,
  personId: string,
  sensitive: boolean,
): Promise<PersonSummary | undefined> {
  const base = transactionOf(scope)
    .selectFrom('people')
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', personId)
    .where('merged_into_id', 'is', null);
  if (sensitive) {
    const row = await base.select(allPersonColumns).executeTakeFirst();
    return row === undefined ? undefined : personSummaryWithSensitive(row);
  }
  const row = await base.select(publicPersonColumns).executeTakeFirst();
  return row === undefined ? undefined : personSummary(row);
}
