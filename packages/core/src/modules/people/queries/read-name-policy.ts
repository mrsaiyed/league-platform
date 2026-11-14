// The league's display policy, read from its two declared privacy settings (T-81):
// how children's names show (R-14) and whether a player may ask to appear as initials
// (R-15). Every public page, live message and statistic gets its policy from here and
// hands it to the one name function (showName). Not a command: it changes nothing,
// and a public page reads it with no permission. The settings are set for the whole
// league only, so only the league's own value or our default is read.
import {
  lookupSetting,
  playersMayAskForInitials,
  publicNames,
  type LeaguesStore,
  type Setting,
} from '../../leagues/index.ts';
import type { ChildNameForm, NamePolicy } from '../rules/name-policy.ts';

/** What reading the policy needs: the league's stored setting values, bound to one league. */
export type NamePolicySettings = Pick<LeaguesStore, 'settingRows'>;

const childFormOf: Readonly<Record<(typeof publicNames)['default'], ChildNameForm>> = {
  firstNameLastInitial: 'first_name_last_initial',
  fullName: 'full_name',
};

export async function readNamePolicy(settings: NamePolicySettings): Promise<NamePolicy> {
  const leagueValue = async <Value>(setting: Setting<Value>): Promise<Value> => {
    const rows = await settings.settingRows(setting.key, {});
    return lookupSetting(
      setting,
      rows.filter((row) => row.level === 'league'),
    ).value;
  };
  return {
    children: childFormOf[await leagueValue(publicNames)],
    playersMayAskForInitials: await leagueValue(playersMayAskForInitials),
  };
}
