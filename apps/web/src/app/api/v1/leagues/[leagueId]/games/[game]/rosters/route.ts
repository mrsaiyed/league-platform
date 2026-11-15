// GET /api/v1/leagues/{leagueId}/games/{game}/rosters: the game's two rosters for the
// scorekeeper's device to refresh (record 058, T-261). The handler is
// server/tracker-rosters-endpoint.ts.
import { refusalAnswer } from '../../../../../../../../server/league-api.ts';
import { leagueEndpoint, respond } from '../../../../../../../../server/league-api-route.ts';
import { trackerRostersRequest } from '../../../../../../../../server/tracker-rosters-endpoint.ts';

export const dynamic = 'force-dynamic';

type Params = { readonly params: Promise<{ readonly leagueId: string; readonly game: string }> };

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { game } = await params;
  const endpoint = await leagueEndpoint(['games', game, 'rosters']);
  if (!endpoint.ok) return respond(refusalAnswer(endpoint.refusal));
  const { context, ports } = endpoint;
  return respond(await trackerRostersRequest(context, game, ports.tracker));
}
