// What the leagues module announces (T-24). Other modules react without this one
// knowing they exist.

export const leagueNameChanged = 'leagues.name_changed';

export type LeagueNameChanged = {
  readonly type: typeof leagueNameChanged;
  readonly leagueId: string;
};
