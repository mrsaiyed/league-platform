// Changes the name, color or place of a division of the scope's league that is not in
// the bin, and only if it is still at `version` when one is given (T-46; the database
// adds one to the version itself, 0002). A name a sibling has comes back as
// 'name-taken', and the transaction is then unusable: the caller rolls it back.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';

export type DivisionChangeRow = {
  name?: string;
  color?: string | null;
  sort?: number;
};

/** The new version, 'name-taken', or undefined if it is not there, is in the bin or moved on. */
export async function updateDivision(
  scope: LeagueScope,
  divisionId: string,
  change: DivisionChangeRow,
  version?: number,
): Promise<number | 'name-taken' | undefined> {
  let query = transactionOf(scope)
    .updateTable('divisions')
    .set({
      ...(change.name === undefined ? {} : { name: change.name }),
      ...(change.color === undefined ? {} : { color: change.color }),
      ...(change.sort === undefined ? {} : { sort: change.sort }),
    })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', divisionId)
    .where('deleted_at', 'is', null);
  if (version !== undefined) query = query.where('version', '=', version);
  try {
    const row = await query.returning('version').executeTakeFirst();
    return row?.version;
  } catch (error) {
    if (constraintOf(error)?.constraint === 'divisions_name_key') return 'name-taken';
    throw error;
  }
}
