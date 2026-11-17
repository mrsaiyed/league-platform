// Whether one person of the scope's league counts as a child (R-28), worked out in SQL
// (minor-by-age-sql.ts) on the league's own today by the database's clock: true, false or
// null where the league does not know. Never the birth date (record 080): the people
// commands that must know ask this (setNameRequest, R-25). Undefined if the person is not
// in the scope's league, or was merged into another.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { isMinorSql } from './minor-by-age-sql.ts';

export async function findPersonIsMinor(
  scope: LeagueScope,
  personId: string,
): Promise<{ readonly isMinor: boolean | null } | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('people')
    .select(isMinorSql().as('is_minor'))
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', personId)
    .where('merged_into_id', 'is', null)
    .executeTakeFirst();
  return row === undefined ? undefined : { isMinor: row.is_minor };
}
