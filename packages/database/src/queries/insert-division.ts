// Adds a division to a season of the scope's league. Siblings differ by name, whatever
// the capitals, while not in the bin (0007): a repeat comes back as 'name-taken', and
// the transaction is then unusable: the caller rolls it back. The season and parent
// are checked by the command first; the database's foreign keys refuse the rest.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';

export type NewDivisionRow = {
  seasonId: string;
  parentDivisionId: string | null;
  name: string;
  color: string | null;
  sort: number;
};

/** The new division's id, or 'name-taken'. */
export async function insertDivision(
  scope: LeagueScope,
  division: NewDivisionRow,
): Promise<string | 'name-taken'> {
  try {
    const row = await transactionOf(scope)
      .insertInto('divisions')
      .values({
        league_id: scope.leagueId,
        season_id: division.seasonId,
        parent_division_id: division.parentDivisionId,
        name: division.name,
        color: division.color,
        sort: division.sort,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  } catch (error) {
    if (constraintOf(error)?.constraint === 'divisions_name_key') return 'name-taken';
    throw error;
  }
}
