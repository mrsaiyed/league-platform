// POST /api/v1/leagues/{leagueId}/games/{game}/commands: the tracker's taps (T6 §3,
// T-229). The handler is server/tracker-commands-endpoint.ts; once it has answered,
// the saved play is published for the people watching (T-117).
import { after } from 'next/server';
import { refusalAnswer } from '../../../../../../../../server/league-api.ts';
import {
  jsonBody,
  leagueEndpoint,
  respond,
} from '../../../../../../../../server/league-api-route.ts';
import { sendTrackerCommands } from '../../../../../../../../server/tracker-commands-endpoint.ts';

export const dynamic = 'force-dynamic';

type Params = { readonly params: Promise<{ readonly leagueId: string; readonly game: string }> };

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { game } = await params;
  const endpoint = await leagueEndpoint(['games', game, 'commands']);
  if (!endpoint.ok) return respond(refusalAnswer(endpoint.refusal));
  const { context, ports } = endpoint;
  const outcome = await sendTrackerCommands(
    context,
    game,
    await jsonBody(request),
    ports.tracker,
    ports.publishPlays,
  );
  if (outcome.afterwards !== null) after(outcome.afterwards);
  return respond(outcome.answer);
}
