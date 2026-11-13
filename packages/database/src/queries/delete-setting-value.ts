// Removes a setting value at one place of the scope's league if it is still at the
// version the admin read, so the lookup falls back to the next level (record 019).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import type { SettingPlaceRow } from './write-setting-value.ts';

export async function deleteSettingValue(
  scope: LeagueScope,
  place: SettingPlaceRow,
  key: string,
  version: number,
): Promise<boolean> {
  const programId = place.level === 'program' ? place.programId : null;
  const seasonId = place.level === 'season' ? place.seasonId : null;
  const row = await transactionOf(scope)
    .deleteFrom('setting_values')
    .where('league_id', '=', scope.leagueId)
    .where('level', '=', place.level)
    .where('program_id', programId === null ? 'is' : '=', programId)
    .where('season_id', seasonId === null ? 'is' : '=', seasonId)
    .where('key', '=', key)
    .where('version', '=', version)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}
