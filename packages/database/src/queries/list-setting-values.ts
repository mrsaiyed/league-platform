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
    .select(['level', 'program_id', 'season_id', 'value', 'version'])
    .where('league_id', '=', scope.leagueId)
    .where('key', '=', key)
    .execute();
  return rows
    .filter(
      (row) =>
        row.level === 'league' ||
        (row.level === 'program' && row.program_id === (places.programId ?? null)) ||
        (row.level === 'season' && row.season_id === (places.seasonId ?? null)),
    )
    .map((row) => ({
      level: row.level as SettingValueRow['level'],
      document: row.value,
      version: row.version,
    }));
}
