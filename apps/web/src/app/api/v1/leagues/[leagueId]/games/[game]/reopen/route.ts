// /api/v1/leagues/{leagueId}/games/{game}/reopen (step 2.120, S-36): GET tells the
// scorekeeper's device whether Reopen is offered, until when and who ended the game;
// POST reopens it, with a reason, within the league's minutes. The handlers are in
// server/reopen-game-endpoint.ts; once a game is reopened it is published for the people
// watching (T-117), after the answer.
import { after } from 'next/server';
import { refusalAnswer } from '../../../../../../../../server/league-api.ts';
import {
  jsonBody,
  leagueEndpoint,
  respond,
} from '../../../../../../../../server/league-api-route.ts';
import {
  reopenOfferRequest,
  reopenTrackedGameRequest,
} from '../../../../../../../../server/reopen-game-endpoint.ts';

export const dynamic = 'force-dynamic';

type Params = { readonly params: Promise<{ readonly leagueId: string; readonly game: string }> };

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { game } = await params;
  const endpoint = await leagueEndpoint(['games', game, 'reopen']);
  if (!endpoint.ok) return respond(refusalAnswer(endpoint.refusal));
  const { context, ports } = endpoint;
  return respond(await reopenOfferRequest(context, game, ports.tracker));
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { game } = await params;
  const endpoint = await leagueEndpoint(['games', game, 'reopen']);
  if (!endpoint.ok) return respond(refusalAnswer(endpoint.refusal));
  const { context, ports } = endpoint;
  const outcome = await reopenTrackedGameRequest(
    context,
    game,
    await jsonBody(request),
    ports.tracker,
    ports.publishPlays,
  );
  if (outcome.afterwards !== null) after(outcome.afterwards);
  return respond(outcome.answer);
}
