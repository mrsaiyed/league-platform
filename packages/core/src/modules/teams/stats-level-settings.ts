// The league's two statistics-level settings (S-22), read inside a teams command's own
// transaction so a change a moment ago counts (T-75).
import { lookupSetting, startingStatsLevel, teamsMayChooseStatsLevel } from '../leagues/index.ts';
import type { TeamsTx } from './ports.ts';

/** The level a team starts at when the caller states none: the league's, else everyone (S-23). */
export async function leagueStartingStatsLevel(tx: TeamsTx): Promise<string> {
  return lookupSetting(startingStatsLevel, await tx.teams.leagueSettingRows(startingStatsLevel.key))
    .value;
}

/** Whether teams may choose their own level: the league's choice, else yes (S-24). */
export async function teamsMayChooseLevel(tx: TeamsTx): Promise<boolean> {
  return lookupSetting(
    teamsMayChooseStatsLevel,
    await tx.teams.leagueSettingRows(teamsMayChooseStatsLevel.key),
  ).value;
}
