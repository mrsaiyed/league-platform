// Where the league home sends someone first (U-5), on the server: reads the league's
// setting, the signed-in account's teams and the device's remembered team
// (my-team-start.ts), and gives the team page's address, or nothing when the person
// stays on the league home.
import { leagueUrl } from '@srleagues/core';
import { cookies } from 'next/headers';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import type { LeagueView } from '../../server/league-gate.ts';
import { myTeamCookieName } from '../../server/my-team-cookie.ts';
import { firstValue, type SearchParams } from '../stats-pages/index.ts';
import { myTeamStart } from './my-team-start.ts';
import { stayAtHome } from './start-page.ts';

export async function startPageRedirect(
  view: LeagueView,
  search: SearchParams,
): Promise<string | undefined> {
  // Someone who asked for the league home (or a season of it) is shown it.
  if (firstValue(search['start']) === stayAtHome) return undefined;
  const asked = firstValue(search['season']);
  if (asked !== undefined && asked !== '') return undefined;
  const league = view.context.league;
  const ports = await webPorts();
  const account = view.context.account;
  const slug = await myTeamStart(ports, {
    leagueId: league.id,
    accountId: account === null ? null : account.accountId,
    holder: () => ports.accessOf(commandContextOf(view.context)),
    rememberedSlug: (await cookies()).get(myTeamCookieName(league.id))?.value,
  });
  return slug === undefined ? undefined : leagueUrl(league, 'team', { team: slug });
}
