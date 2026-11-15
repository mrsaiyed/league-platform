// POST /api/v1/leagues/{leagueId}/games/{game}/reopen: the scorekeeper who ended a
// game reopens it, with a reason, within the league's minutes (step 2.120, S-36). The
// handler is server/reopen-game-endpoint.ts; once it has answered, the reopened game is
// published for the people watching (T-117).
import { after } from 'next/server';
import { refusalAnswer } from '../../../../../../../../server/league-api.ts';
import {
  jsonBody,
  leagueEndpoint,
  respond,
} from '../../../../../../../../server/league-api-route.ts';
import { reopenTrackedGameRequest } from '../../../../../../../../server/reopen-game-endpoint.ts';

export const dynamic = 'force-dynamic';

type Params = { readonly params: Promise<{ readonly leagueId: string; readonly game: string }> };

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
