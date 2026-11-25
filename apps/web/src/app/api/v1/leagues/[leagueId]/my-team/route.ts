// GET /api/v1/leagues/{leagueId}/my-team: what a public page marks as the person's own team,
// or the one this device chose (step 2.168). The handler is server/my-team-endpoint.ts,
// which also runs the league gate (U-9), as the other public reads do.
import type { AccessHolder } from '@srleagues/core';
import { cookies } from 'next/headers';
import { chosenTeamOf, myTeamsOf } from '../../../../../../features/team-pages/index.ts';
import { leagueEndpoint, respond } from '../../../../../../server/league-api-route.ts';
import { myTeamRequest } from '../../../../../../server/my-team-endpoint.ts';
import { myTeamCookieName } from '../../../../../../server/my-team-cookie.ts';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  // A session that no longer works is a visitor here, as on the page that asks.
  const endpoint = await leagueEndpoint(['my-team'], 'visitor');
  if (!endpoint.ok) return respond(await myTeamRequest(endpoint, undefined));
  const { context, holder, ports } = endpoint;
  const remembered = (await cookies()).get(myTeamCookieName(context.league.id))?.value;
  const read = {
    // What the gate read already (league-api.ts), not read a second time.
    accessOf: async () => holder,
    // The grants the read already holds, not read a second time.
    myTeams: (leagueId: string, accountId: string, holder: AccessHolder | undefined) =>
      myTeamsOf(ports, { leagueId, accountId, holder: async () => holder }),
    chosenTeam: (leagueId: string, slug: string | undefined) => chosenTeamOf(ports, leagueId, slug),
  };
  return respond(await myTeamRequest({ ok: true, context, ports: read }, remembered));
}
