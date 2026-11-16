// GET /api/v1/leagues/{leagueId}/scoring?games=…: which of a public page's games the person
// signed in here may score (step 2.153). The handler is server/scoring-offers-endpoint.ts.
import { refusalAnswer } from '../../../../../../server/league-api.ts';
import { leagueEndpoint, respond } from '../../../../../../server/league-api-route.ts';
import { scoringOffers } from '../../../../../../server/scoring-offers-endpoint.ts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  // A session that no longer works is a visitor here, as on the page that asks.
  const endpoint = await leagueEndpoint(['scoring'], 'visitor');
  if (!endpoint.ok) return respond(refusalAnswer(endpoint.refusal));
  const games = new URL(request.url).searchParams.get('games');
  // The games area's ports are reached only for a signed-in person (container.ts).
  return respond(await scoringOffers(endpoint.context, games, () => endpoint.ports.games.deps));
}
