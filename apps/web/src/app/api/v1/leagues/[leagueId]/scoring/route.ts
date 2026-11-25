// GET /api/v1/leagues/{leagueId}/scoring?games=…[&correct=…]: which of a public page's games the person
// signed in here may score (step 2.153). The handler is server/scoring-offers-endpoint.ts,
// which also runs the league gate (U-9), as the snapshot's does.
import { leagueEndpoint, respond } from '../../../../../../server/league-api-route.ts';
import { scoringOffersRequest } from '../../../../../../server/scoring-offers-endpoint.ts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  // A session that no longer works is a visitor here, as on the page that asks.
  const endpoint = await leagueEndpoint(['scoring'], 'visitor');
  const asked = new URL(request.url).searchParams;
  const games = asked.get('games');
  const correct = asked.get('correct');
  if (!endpoint.ok) return respond(await scoringOffersRequest(endpoint, games, correct));
  const { context, holder, ports } = endpoint;
  const read = {
    // What the gate read already (league-api.ts), not read a second time.
    accessOf: async () => holder,
    // The games area's ports are reached only for someone who may see the league.
    games: () => ports.games.deps,
  };
  return respond(await scoringOffersRequest({ ok: true, context, ports: read }, games, correct));
}
