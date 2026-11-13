// Changes a season of the scope's league that is not in the bin, only if it is still
// at `version` (T-46; the database adds one to the version itself, 0002). Making it
// current clears the mark from the program's other season first (one per program,
// T3 §12). Turning the unique-jersey rule on while a team has a number worn twice is
// refused by the database (0008): 'unique-jerseys-clash', and the transaction is then
// unusable, so the caller rolls it back.
import type { JsonObject } from '../db/schema-types.ts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';

export type SeasonChangeRow = {
  name?: string;
  startsOn?: string | null;
  endsOn?: string | null;
  status?: string;
  isCurrent?: boolean;
  rules?: JsonObject;
};

/** The new version, 'unique-jerseys-clash', or undefined if it is not there, is in the bin or moved on. */
export async function updateSeason(
  scope: LeagueScope,
  seasonId: string,
  change: SeasonChangeRow,
  version: number,
): Promise<number | 'unique-jerseys-clash' | undefined> {
  const trx = transactionOf(scope);
  const season = await trx
    .selectFrom('seasons')
    .select(['program_id', 'version'])
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', seasonId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (season === undefined || season.version !== version) return undefined;
  if (change.isCurrent === true) {
    await trx
      .updateTable('seasons')
      .set({ is_current: false })
      .where('league_id', '=', scope.leagueId)
      .where('program_id', '=', season.program_id)
      .where('is_current', '=', true)
      .where('id', '<>', seasonId)
      .execute();
  }
  try {
    const row = await trx
      .updateTable('seasons')
      .set({
        ...(change.name === undefined ? {} : { name: change.name }),
        ...(change.startsOn === undefined ? {} : { starts_on: change.startsOn }),
        ...(change.endsOn === undefined ? {} : { ends_on: change.endsOn }),
        ...(change.status === undefined ? {} : { status: change.status }),
        ...(change.isCurrent === undefined ? {} : { is_current: change.isCurrent }),
        ...(change.rules === undefined ? {} : { rules: change.rules }),
      })
      .where('league_id', '=', scope.leagueId)
      .where('id', '=', seasonId)
      .where('deleted_at', 'is', null)
      .where('version', '=', version)
      .returning('version')
      .executeTakeFirst();
    return row?.version;
  } catch (error) {
    if (constraintOf(error)?.constraint === 'seasons_unique_jerseys_clash') {
      return 'unique-jerseys-clash';
    }
    throw error;
  }
}
