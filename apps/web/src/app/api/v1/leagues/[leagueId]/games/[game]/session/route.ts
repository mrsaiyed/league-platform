// POST /api/v1/leagues/{leagueId}/games/{game}/session: open, renew, take over or
// release this device's scoring session (T6 §5, T-116). The handler is
// server/scoring-session-endpoint.ts.
import { refusalAnswer } from '../../../../../../../../server/league-api.ts';
import {
  jsonBody,
  leagueEndpoint,
  respond,
} from '../../../../../../../../server/league-api-route.ts';
import { scoringSessionRequest } from '../../../../../../../../server/scoring-session-endpoint.ts';

export const dynamic = 'force-dynamic';

type Params = { readonly params: Promise<{ readonly leagueId: string; readonly game: string }> };

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { game } = await params;
  const endpoint = await leagueEndpoint(['games', game, 'session']);
  if (!endpoint.ok) return respond(refusalAnswer(endpoint.refusal));
  const { context, ports } = endpoint;
  return respond(
    await scoringSessionRequest(context, game, await jsonBody(request), ports.tracker),
  );
}
