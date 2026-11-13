// The stored values of one key that a lookup reads (T5 §6): the league's, and the
// program's and the season's when they are given. At most one row per place
// (setting_values_once). Only the scope's league is visible (T-28).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export type SettingValueRow = {
  level: 'league' | 'program' | 'season';
  document: unknown;
  version: number;
};

export async function listSettingValues(
  scope: LeagueScope,
  key: string,
  places: { programId?: string; seasonId?: string },
): Promise<SettingValueRow[]> {
  const rows = await transactionOf(scope)
    .selectFrom('setting_values')
    .select(['level', 'value', 'version'])
    .where('league_id', '=', scope.leagueId)
    .where('key', '=', key)
    .where((eb) => {
      const matches = [eb('level', '=', 'league')];
      if (places.programId !== undefined) {
        matches.push(
          eb.and([eb('level', '=', 'program'), eb('program_id', '=', places.programId)]),
        );
      }
      if (places.seasonId !== undefined) {
        matches.push(eb.and([eb('level', '=', 'season'), eb('season_id', '=', places.seasonId)]));
      }
      return eb.or(matches);
    })
    .execute();
  return rows.map((row) => ({
    level: row.level as SettingValueRow['level'],
    document: row.value,
    version: row.version,
  }));
}
