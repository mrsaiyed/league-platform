// The league's display policy, read from its two declared privacy settings (T-81):
// how every player's name shows (R-24, R-29: full names, first name and last initial,
// or hidden), whether a child may be shown in full (R-14), and whether an adult may ask
// to appear as initials (R-15, R-25). Every public page, live message and statistic
// gets its policy from here and hands it to the one name function (showName). Not a
// command: it changes nothing, and a public page reads it with no permission. The
// settings are set for the whole league only, so only the league's own value or the
// league's start is read.
//
// Record 065: the start depends on who plays (an adult league starts on full names, any
// other on first name and last initial), so the audience is given. A stored "full names"
// is always a confirmed one (leagues.set_setting stores it only when confirmed, and
// otherwise puts the league back on its start), so only a stored one lets a child be
// shown in full; an adult league's starting full names never does.
import {
  lookupSetting,
  playersMayAskForInitials,
  publicNames,
  type Audience,
  type LeaguesStore,
  type Setting,
} from '../../leagues/index.ts';
import type { NameForm, NamePolicy } from '../rules/name-policy.ts';

/** What reading the policy needs: the league's stored setting values, bound to one league. */
export type NamePolicySettings = Pick<LeaguesStore, 'settingRows'>;

const formOf: Readonly<Record<(typeof publicNames)['default'], NameForm>> = {
  firstNameLastInitial: 'first_name_last_initial',
  fullName: 'full_name',
  hidden: 'hidden',
};

export async function readNamePolicy(
  settings: NamePolicySettings,
  /** Who plays in the league. A league whose audience is not known is read as youth. */
  audience: Audience,
): Promise<NamePolicy> {
  const leagueValue = async <Value>(setting: Setting<Value>) => {
    const rows = await settings.settingRows(setting.key, {});
    return lookupSetting(
      setting,
      rows.filter((row) => row.level === 'league'),
      audience,
    );
  };
  const names = await leagueValue(publicNames);
  return {
    names: formOf[names.value],
    childrenInFull: names.value === 'fullName' && names.source === 'league',
    playersMayAskForInitials: (await leagueValue(playersMayAskForInitials)).value,
  };
}
