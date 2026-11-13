// Changes the name or place of a court of the scope's league that is not in the bin, and
// only if it is still at `version` when one is given (T-46). A name another court of the
// venue has comes back as 'name-taken', and the transaction is then unusable.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';

export type CourtChangeRow = { name?: string; sort?: number };

/** The new version, 'name-taken', or undefined if it is not there, is in the bin or moved on. */
export async function updateCourt(
  scope: LeagueScope,
  courtId: string,
  change: CourtChangeRow,
  version?: number,
): Promise<number | 'name-taken' | undefined> {
  let query = transactionOf(scope)
    .updateTable('courts')
    .set({
      ...(change.name === undefined ? {} : { name: change.name }),
      ...(change.sort === undefined ? {} : { sort: change.sort }),
    })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', courtId)
    .where('deleted_at', 'is', null);
  if (version !== undefined) query = query.where('version', '=', version);
  try {
    const row = await query.returning('version').executeTakeFirst();
    return row?.version;
  } catch (error) {
    if (constraintOf(error)?.constraint === 'courts_name_key') return 'name-taken';
    throw error;
  }
}
