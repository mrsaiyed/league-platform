// POST /api/v1/leagues/{leagueId}/games/{game}/not-started: mark a game that went live
// by mistake "not started" (step 2.121, S-40). The handler is
// server/not-started-endpoint.ts; once it has answered, the game's message goes out
// for the people watching (T-117), so open pages stop saying Live.
import { after } from 'next/server';
import { refusalAnswer } from '../../../../../../../../server/league-api.ts';
import {
  jsonBody,
  leagueEndpoint,
  respond,
} from '../../../../../../../../server/league-api-route.ts';
import { markNotStartedRequest } from '../../../../../../../../server/not-started-endpoint.ts';

export const dynamic = 'force-dynamic';

type Params = { readonly params: Promise<{ readonly leagueId: string; readonly game: string }> };

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { game } = await params;
  const endpoint = await leagueEndpoint(['games', game, 'not-started']);
  if (!endpoint.ok) return respond(refusalAnswer(endpoint.refusal));
  const { context, ports } = endpoint;
  const outcome = await markNotStartedRequest(
    context,
    game,
    await jsonBody(request),
    ports.tracker,
    ports.publishPlays,
  );
  if (outcome.afterwards !== null) after(outcome.afterwards);
  return respond(outcome.answer);
}
