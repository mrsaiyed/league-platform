// Writes a setting value at one place of the scope's league: a new row when the
// admin saw none (`version` null), or the row at the version they read (T-46, A-8).
// The new version, or undefined when the row moved, appeared or vanished meanwhile.
// Nothing here aborts the transaction on a clash: the insert does nothing and says so.
import type { JsonObject } from '../db/schema-types.ts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export type SettingPlaceRow =
  | { level: 'league' }
  | { level: 'program'; programId: string }
  | { level: 'season'; seasonId: string };

export async function writeSettingValue(
  scope: LeagueScope,
  place: SettingPlaceRow,
  key: string,
  document: JsonObject,
  version: number | null,
): Promise<number | undefined> {
  const trx = transactionOf(scope);
  const programId = place.level === 'program' ? place.programId : null;
  const seasonId = place.level === 'season' ? place.seasonId : null;
  if (version === null) {
    const row = await trx
      .insertInto('setting_values')
      .values({
        league_id: scope.leagueId,
        level: place.level,
        program_id: programId,
        season_id: seasonId,
        key,
        value: document,
      })
      .onConflict((conflict) => conflict.doNothing())
      .returning('version')
      .executeTakeFirst();
    return row?.version;
  }
  const row = await trx
    .updateTable('setting_values')
    .set({ value: document })
    .where('league_id', '=', scope.leagueId)
    .where('level', '=', place.level)
    .where('program_id', programId === null ? 'is' : '=', programId)
    .where('season_id', seasonId === null ? 'is' : '=', seasonId)
    .where('key', '=', key)
    .where('version', '=', version)
    .returning('version')
    .executeTakeFirst();
  return row?.version;
}
