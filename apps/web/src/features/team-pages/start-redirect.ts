// Where the league home sends someone first (U-5), on the server: reads the league's
// setting, the signed-in account's teams and the device's remembered team, and gives the
// team page's address, or nothing when the person stays on the league home.
import { leagueUrl } from '@srleagues/core';
import { cookies } from 'next/headers';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import type { LeagueView } from '../../server/league-gate.ts';
import { myTeamCookieName } from '../../server/my-team-cookie.ts';
import { chooseSeason, firstValue, type SearchParams } from '../stats-pages/index.ts';
import { chooseMyTeam, stayAtHome, teamIdsFromGrants } from './start-page.ts';

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
  if ((await ports.publicTeams.startPageOf(league.id)) !== 'myTeam') return undefined;
  const season = chooseSeason(await ports.publicStats.seasonsOf(league.id), undefined);
  if (season === undefined) return undefined;
  const teams = await ports.publicStats.readStoreOf(league.id).teams(season.id);
  const account = view.context.account;
  const holder =
    account === null ? undefined : await ports.accessOf(commandContextOf(view.context));
  const slug = chooseMyTeam({
    teams,
    grantTeamIds: teamIdsFromGrants(holder),
    rosterTeamIds:
      account === null
        ? []
        : await ports.publicTeams.teamIdsOfAccount(league.id, season.id, account.accountId),
    rememberedSlug: (await cookies()).get(myTeamCookieName(league.id))?.value,
  });
  return slug === undefined ? undefined : leagueUrl(league, 'team', { team: slug });
}
