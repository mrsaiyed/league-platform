// GET /api/v1/leagues/{leagueId}/games/{game}/state: the engine's state for the
// scorekeeper's device (T-113, T-253). The handler is server/tracker-state-endpoint.ts.
import { refusalAnswer } from '../../../../../../../../server/league-api.ts';
import { leagueEndpoint, respond } from '../../../../../../../../server/league-api-route.ts';
import { trackerStateRequest } from '../../../../../../../../server/tracker-state-endpoint.ts';

export const dynamic = 'force-dynamic';

type Params = { readonly params: Promise<{ readonly leagueId: string; readonly game: string }> };

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { game } = await params;
  const endpoint = await leagueEndpoint(['games', game, 'state']);
  if (!endpoint.ok) return respond(refusalAnswer(endpoint.refusal));
  const { context, ports } = endpoint;
  return respond(await trackerStateRequest(context, game, ports.tracker));
}
