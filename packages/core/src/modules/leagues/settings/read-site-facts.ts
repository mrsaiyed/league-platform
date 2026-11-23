// What every public page of a league says about itself, beyond its name and design (step
// 2.60): the site notice the admin typed (F-10, P9 §3), and whether the page asks search
// engines not to index it (U-10). Not a command: it changes nothing, and a public page
// reads it with no permission. Both settings are set for the whole league only.
//
// The children's rule (U-18): a league whose players are or may be children (youth or
// mixed) is never indexed, whatever its setting says. Every public page can show a child's name (team, statistics, home and game pages,
// not only player pages), so the whole league's public site is marked, and no page can be
// missed. A league whose audience cannot be read is youth (LeaguesStore.leagueAudience).
import type { Audience } from '../league-values.ts';
import type { LeaguesStore } from '../ports.ts';
import type { Setting } from './define-setting.ts';
import { siteDoNotIndex, siteNotice } from './declarations.ts';
import { lookupSetting } from './lookup-setting.ts';

export type SiteFacts = {
  /** The admin's notice for the top of every public page, or '' for none. */
  readonly notice: string;
  /** Whether the league's public pages ask search engines not to index them. */
  readonly doNotIndex: boolean;
};

/** What reading the facts needs: the league's settings and who plays in it. */
export type SiteFactsStore = Pick<LeaguesStore, 'settingRows' | 'leagueAudience'>;

/** U-18: whether a league's public pages are kept out of search engines whatever it chose. */
export function childrenKeepOutOfSearch(audience: Audience): boolean {
  return audience !== 'adult';
}

export async function readSiteFacts(store: SiteFactsStore): Promise<SiteFacts> {
  const leagueValue = async <Value>(setting: Setting<Value>, damaged: Value): Promise<Value> => {
    const rows = (await store.settingRows(setting.key, {})).filter((row) => row.level === 'league');
    const found = lookupSetting(setting, rows);
    // A stored value that cannot be read is not "nothing saved": it reads as the careful
    // answer (no notice drawn from damaged text, and do not index).
    return rows.length > 0 && found.source === 'default' ? damaged : found.value;
  };
  const notice = (await leagueValue(siteNotice, '')).trim();
  const asked = await leagueValue(siteDoNotIndex, true);
  const doNotIndex = asked || childrenKeepOutOfSearch(await store.leagueAudience());
  return { notice, doNotIndex };
}
