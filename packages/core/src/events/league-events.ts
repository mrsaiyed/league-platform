// What the leagues module announces that other modules react to while they may still be
// loading (T-24, step 2.26: the public pages' cache). A leaf file that imports nothing, so
// the games, leagues and standings modules can all read it whatever order they load in.

export const leagueStatusChanged = 'leagues.status_changed';

export type LeagueStatusChanged = {
  readonly type: typeof leagueStatusChanged;
  readonly leagueId: string;
};

/** A setting was saved or cleared at some level of the league (its key only, T-131). */
export const leagueSettingChanged = 'leagues.setting_changed';

export type LeagueSettingChanged = {
  readonly type: typeof leagueSettingChanged;
  readonly leagueId: string;
  readonly key: string;
};
