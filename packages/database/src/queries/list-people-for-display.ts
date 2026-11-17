// What the one name function (T-81) needs about some people, and nothing more: their
// names, whether they are a child and their own request. Never a birth date, contact
// field, address or account (R-16): whether they are a child is worked out in SQL from
// the birth date and the tick (R-28, minor-by-age-sql.ts), so the
// date never leaves the database. People in the bin are not read.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { isMinorSql } from './minor-by-age-sql.ts';

export type PersonForDisplayRow = {
  id: string;
  firstName: string;
  lastName: string;
  isMinor: boolean | null;
  visibility: string;
};

export async function listPeopleForDisplay(
  scope: LeagueScope,
  personIds: readonly string[],
): Promise<PersonForDisplayRow[]> {
  if (personIds.length === 0) return [];
  const rows = await transactionOf(scope)
    .selectFrom('people')
    .select(['id', 'first_name', 'last_name', isMinorSql().as('is_minor'), 'visibility'])
    .where('league_id', '=', scope.leagueId)
    .where('id', 'in', [...personIds])
    .where('deleted_at', 'is', null)
    .orderBy('id')
    .execute();
  return rows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    isMinor: row.is_minor,
    visibility: row.visibility,
  }));
}
