'use server';
// The "make this my team" and "stop" buttons of a team page (U-5, R-10). They work with no
// account: the choice is a cookie on this device that holds a team's short name. Next.js
// refuses an action posted from another site, and the league and team are looked up here,
// not trusted (a value that is not a team of the league is not remembered).
//
// The league goes through the page's own gate first (loadLeaguePage, as the team page and
// the Teams area's actions do; step 2.168, from the audit of each league's data, finding
// D-H1): the league named in the form must be the league of the address the form was posted
// from, and one this person may not open (a draft or a suspended league, U-9) is answered
// exactly as a league that does not exist or is in the bin, "not found", with no cookie set
// or cleared. Before, a hidden league's name was believed, and the answer gave away that it
// existed, its id and its teams' names.
import { leagueUrl, type LeagueAddressee } from '@srleagues/core';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getConfig } from '../../server/config.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { myTeamCookieName, myTeamSlugOf } from '../../server/my-team-cookie.ts';
import { cookieOptions, longestCookieSeconds } from '../../server/sign-in/cookies.ts';

/** The form's text value of `name`, or the empty string. */
const textOf = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

/**
 * The league, through the gate (which answers "not found" itself for a league that is not
 * there, is in the bin, is hidden from this person, or is not the address's), and the team
 * and season the form names.
 */
async function leagueAndTeam(form: FormData) {
  const view = await loadLeaguePage(textOf(form, 'league'), 'site');
  const season = textOf(form, 'season');
  return {
    league: view.context.league,
    team: myTeamSlugOf(textOf(form, 'team')),
    season: season === '' ? undefined : season,
  };
}

/** Back to the team's page, in the season the button was pressed on (a past season too). */
function teamPageUrl(league: LeagueAddressee, team: string, season: string | undefined): string {
  return leagueUrl(league, 'team', season === undefined ? { team } : { team, season });
}

export async function chooseMyTeamAction(form: FormData): Promise<never> {
  const { league, team, season } = await leagueAndTeam(form);
  if (team === undefined) return redirect(leagueUrl(league, 'teams'));
  const ports = await webPorts();
  const seasons = await ports.publicStats.seasonsOf(league.id);
  const known = (
    await Promise.all(seasons.map((s) => ports.publicStats.readStoreOf(league.id).teams(s.id)))
  ).some((teams) => teams.some((t) => t.slug === team));
  if (known) {
    const secure = new URL(getConfig().PUBLIC_BASE_URL).protocol === 'https:';
    (await cookies()).set(
      myTeamCookieName(league.id),
      team,
      cookieOptions(secure, longestCookieSeconds),
    );
  }
  return redirect(teamPageUrl(league, team, season));
}

export async function clearMyTeamAction(form: FormData): Promise<never> {
  const { league, team, season } = await leagueAndTeam(form);
  (await cookies()).delete(myTeamCookieName(league.id));
  return redirect(
    team === undefined ? leagueUrl(league, 'teams') : teamPageUrl(league, team, season),
  );
}
