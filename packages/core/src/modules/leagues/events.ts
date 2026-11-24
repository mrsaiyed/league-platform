// What the leagues module announces (T-24). Other modules react without this one
// knowing they exist.

export const leagueNameChanged = 'leagues.name_changed';
export const leagueCreated = 'leagues.created';
export const leagueShortNameChanged = 'leagues.short_name_changed';
/** League settings → Profile changed (step 2.125). */
export const leagueProfileChanged = 'leagues.profile_changed';
/** Who plays in the league changed (step 2.125). */
export const leagueAudienceChanged = 'leagues.audience_changed';
export {
  leagueSettingChanged,
  leagueStatusChanged,
  type LeagueSettingChanged,
  type LeagueStatusChanged,
} from '../../events/league-events.ts';

export type LeagueNameChanged = {
  readonly type: typeof leagueNameChanged;
  readonly leagueId: string;
};
export type LeagueCreated = { readonly type: typeof leagueCreated; readonly leagueId: string };
export type LeagueShortNameChanged = {
  readonly type: typeof leagueShortNameChanged;
  readonly leagueId: string;
};
