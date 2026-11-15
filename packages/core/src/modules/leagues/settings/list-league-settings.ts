// The settings a league's admin can change at the league level, as the admin screen
// shows them: each declared setting that can be set there, with its field, its current
// value, where that value comes from and the version to save from (T5 §6, T-98, A-8).
// The default shown is this league's own start, which may depend on who plays in it
// (record 065).
// Not a command: it changes nothing. The screen itself is shown only to those who may
// change settings, and the command that saves checks the permission again.
import type { Audience } from '../league-values.ts';
import type { LeaguesTx } from '../ports.ts';
import { declaredSettings } from './declarations.ts';
import { confirmedValuesFor, startingValue, type SettingRegistry } from './define-setting.ts';
import { describeSetting, type SettingField } from './describe-setting.ts';
import { lookupSetting } from './lookup-setting.ts';
import { audienceFor } from './place.ts';

export type LeagueSettingRow = SettingField & {
  /** What is in force now: the league's own value, or the default. */
  readonly value: unknown;
  /** 'league' when the league has set it, otherwise 'default'. */
  readonly source: 'league' | 'default';
  /** The version of the league's stored value when read, or null when there is none (A-8). */
  readonly version: number | null;
  /**
   * Who plays in the league, given only for a setting whose start depends on it
   * (record 065), so the screen can say why the league starts where it does; null for
   * every other setting.
   */
  readonly audience: Audience | null;
};

export async function listLeagueSettings(
  tx: LeaguesTx,
  registry: SettingRegistry = declaredSettings,
): Promise<readonly LeagueSettingRow[]> {
  const rows: LeagueSettingRow[] = [];
  for (const setting of registry.all()) {
    if (!setting.levels.includes('league')) continue;
    const audience = await audienceFor(tx, setting);
    const stored = await tx.leagues.settingRows(setting.key, {});
    const own = stored.filter((r) => r.level === 'league');
    const found = lookupSetting(setting, own, audience);
    rows.push({
      ...describeSetting(setting),
      // This league's start, and the values it is asked to confirm: never its start.
      default: startingValue(setting, audience),
      confirm: confirmedValuesFor(setting, audience),
      audience: audience ?? null,
      value: found.value,
      source: found.source === 'league' ? 'league' : 'default',
      // A stored value that no longer passes its limits is not shown, but a save must still
      // start from its row's version, or the write would be refused.
      version: own[0]?.version ?? null,
    });
  }
  return rows;
}
