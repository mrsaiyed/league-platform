// The league's display policy, read from its three declared privacy settings (T-81):
// how every player's name shows (R-24, R-29: full names, first name and last initial,
// or hidden), whether the admin has confirmed the parents' agreement to children's full
// names (R-14, a setting of its own, record 065), and whether an adult may ask to appear
// as initials (R-15, R-25). Every public page, live message and statistic gets its
// policy from here and hands it to the one name function (showName). Not a command: it
// changes nothing, and a public page reads it with no permission. The settings are set
// for the whole league only, so only the league's own value or our default is read.
//
// Every league starts on full names with the confirmation not given: adults in full,
// children by first name and last initial, as before step 2.162. A "full names" stored
// before step 2.162 was saved with the confirmation, but nothing records that apart from
// the activity log, so it reads as not confirmed: less, never more (record 065; such
// values exist only in made-up data).
import {
  childrenInFullConfirmed,
  lookupSetting,
  playersMayAskForInitials,
  publicNames,
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

export async function readNamePolicy(settings: NamePolicySettings): Promise<NamePolicy> {
  const leagueValue = async <Value>(setting: Setting<Value>): Promise<Value> => {
    const rows = await settings.settingRows(setting.key, {});
    return lookupSetting(
      setting,
      rows.filter((row) => row.level === 'league'),
    ).value;
  };
  return {
    names: formOf[await leagueValue(publicNames)],
    childrenInFull: (await leagueValue(childrenInFullConfirmed)) === true,
    playersMayAskForInitials: await leagueValue(playersMayAskForInitials),
  };
}
