// GET /api/v1/leagues/{leagueId}/games/{game}/state: the engine's state for the
// scorekeeper's device (T-113, T-253). The handler is server/tracker-state-endpoint.ts.
import { trackerChangesHeader } from '@srleagues/contracts';
import { refusalAnswer } from '../../../../../../../../server/league-api.ts';
import { leagueEndpoint, respond } from '../../../../../../../../server/league-api-route.ts';
import { trackerStateRequest } from '../../../../../../../../server/tracker-state-endpoint.ts';

export const dynamic = 'force-dynamic';

type Params = { readonly params: Promise<{ readonly leagueId: string; readonly game: string }> };

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { game } = await params;
  const endpoint = await leagueEndpoint(['games', game, 'state']);
  if (!endpoint.ok) return respond(refusalAnswer(endpoint.refusal));
  const { context, ports } = endpoint;
  // The tracker of this release asks for the changes of players too (T-356).
  const withChanges = request.headers.get(trackerChangesHeader) === '1';
  return respond(await trackerStateRequest(context, game, ports.tracker, withChanges));
}
