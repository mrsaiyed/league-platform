// Reads a setting's value for a place: season, then program, then league, then our
// default (T5 §6). Not a command: it changes nothing, and a public page reads
// settings with no permission. A season names its program itself.
import type { LeaguesTx } from '../ports.ts';
import type { Setting } from './define-setting.ts';
import { lookupSetting, type SettingValue } from './lookup-setting.ts';

export async function getSetting<Value>(
  tx: LeaguesTx,
  setting: Setting<Value>,
  place: { readonly programId?: string; readonly seasonId?: string } = {},
): Promise<SettingValue<Value>> {
  const programId =
    place.seasonId === undefined
      ? place.programId
      : ((await tx.leagues.seasonProgramId(place.seasonId)) ?? place.programId);
  const rows = await tx.leagues.settingRows(setting.key, {
    ...(programId === undefined ? {} : { programId }),
    ...(place.seasonId === undefined ? {} : { seasonId: place.seasonId }),
  });
  return lookupSetting(setting, rows);
}
