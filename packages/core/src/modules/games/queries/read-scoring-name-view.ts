// The league's settings the scoring screens' names follow (R-33, step 2.226): its display
// policy, read as every public page reads it (readNamePolicy, T-81), and "Scorekeepers see
// full names". Not a command: it changes nothing and is read inside the scoring reads,
// which check their own permission. The league's audience is the store's to add, as it
// is for a public roster. A stored value of the setting that cannot be read counts as off
// (the least it allows), a missing row as the default, off.
import {
  lookupSetting,
  scorekeepersSeeFullNames,
  type StoredSetting,
} from '../../leagues/index.ts';
import { readNamePolicy } from '../../people/index.ts';
import type { GamesTx } from '../ports.ts';
import type { ScoringNameSettings } from '../scoring-names.ts';

/** The league's own stored values of one setting (the league level), as a lookup reads them. */
export type LeagueSettingRows = (key: string) => Promise<readonly StoredSetting[]>;

export async function readScoringNameView(
  leagueSettingRows: LeagueSettingRows,
): Promise<ScoringNameSettings> {
  const rows = (await leagueSettingRows(scorekeepersSeeFullNames.key)).filter(
    (row) => row.level === 'league',
  );
  const found = lookupSetting(scorekeepersSeeFullNames, rows);
  const readable = rows.length === 0 || found.source !== 'default';
  return {
    // readNamePolicy reads values only: a row's own version is not asked, so none is given.
    policy: await readNamePolicy({
      settingRows: async (key) =>
        (await leagueSettingRows(key)).map((row) => ({ ...row, version: 0 })),
    }),
    scorekeepersSeeFullNames: readable && found.value === true,
  };
}

/** The same read from a games transaction, which keeps the league's own rows. */
export const scoringNameSettingsOf = (tx: Pick<GamesTx, 'games'>): Promise<ScoringNameSettings> =>
  readScoringNameView((key) => tx.games.leagueSettingRows(key));
