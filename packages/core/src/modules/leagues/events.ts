// What the leagues module announces (T-24). Other modules react without this one
// knowing they exist.

export const leagueNameChanged = 'leagues.name_changed';
export const leagueCreated = 'leagues.created';
export const leagueShortNameChanged = 'leagues.short_name_changed';
export const leagueStatusChanged = 'leagues.status_changed';

export type LeagueNameChanged = {
  readonly type: typeof leagueNameChanged;
  readonly leagueId: string;
};
export type LeagueCreated = { readonly type: typeof leagueCreated; readonly leagueId: string };
export type LeagueShortNameChanged = {
  readonly type: typeof leagueShortNameChanged;
  readonly leagueId: string;
};
export type LeagueStatusChanged = {
  readonly type: typeof leagueStatusChanged;
  readonly leagueId: string;
};
