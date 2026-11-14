'use server';
// The "make this my team" and "stop" buttons of a team page (U-5, R-10). They work with no
// account: the choice is a cookie on this device that holds a team's short name. Next.js
// refuses an action posted from another site, and the league and team are looked up here,
// not trusted (a value that is not a team of the league is not remembered).
import { leagueUrl } from '@srleagues/core';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getConfig } from '../../server/config.ts';
import { webPorts } from '../../server/container.ts';
import { cookieOptions, longestCookieSeconds } from '../../server/sign-in/cookies.ts';
import { myTeamCookieName, myTeamSlugOf } from '../../server/my-team-cookie.ts';

async function leagueAndTeam(form: FormData) {
  const leagueName = form.get('league');
  const teamName = myTeamSlugOf(
    typeof form.get('team') === 'string' ? String(form.get('team')) : undefined,
  );
  if (typeof leagueName !== 'string' || teamName === undefined) return undefined;
  const ports = await webPorts();
  const found = await ports.findLeague(leagueName);
  if (found === undefined || found.inBin || found.forwarded) return undefined;
  return { league: found, team: teamName, ports };
}

export async function chooseMyTeamAction(form: FormData): Promise<never> {
  const given = await leagueAndTeam(form);
  if (given === undefined) return redirect('/');
  const { league, team, ports } = given;
  const seasons = await ports.publicStats.seasonsOf(league.leagueId);
  const known = (
    await Promise.all(
      seasons.map((s) => ports.publicStats.readStoreOf(league.leagueId).teams(s.id)),
    )
  ).some((teams) => teams.some((t) => t.slug === team));
  if (known) {
    const secure = new URL(getConfig().PUBLIC_BASE_URL).protocol === 'https:';
    (await cookies()).set(
      myTeamCookieName(league.leagueId),
      team,
      cookieOptions(secure, longestCookieSeconds),
    );
  }
  return redirect(leagueUrl({ slug: league.slug }, 'team', { team }));
}

export async function clearMyTeamAction(form: FormData): Promise<never> {
  const given = await leagueAndTeam(form);
  if (given === undefined) return redirect('/');
  const { league, team } = given;
  (await cookies()).delete(myTeamCookieName(league.leagueId));
  return redirect(leagueUrl({ slug: league.slug }, 'team', { team }));
}
