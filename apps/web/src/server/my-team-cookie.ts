// The cookie that remembers a visitor's "my team" on this device (U-5, R-10). It holds a
// team's short name and nothing about the person, one cookie for each league, named by the
// league's id so a change of short name does not lose it.
export const myTeamCookieName = (leagueId: string): string => `srl_my_team_${leagueId}`;

const teamSlugShape = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** The team short name a cookie value holds; undefined for anything else. */
export function myTeamSlugOf(value: string | undefined): string | undefined {
  return value !== undefined && teamSlugShape.test(value) ? value : undefined;
}
