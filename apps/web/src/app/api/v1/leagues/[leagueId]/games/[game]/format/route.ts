// GET and PUT /api/v1/leagues/{leagueId}/games/{game}/format: one game's own format (step
// 2.119, P7 §5.1), read by the tracker's start confirmation and the admin's games area,
// given or taken away by them. The handlers are server/game-format-endpoint.ts.
import { refusalAnswer } from '../../../../../../../../server/league-api.ts';
import {
  jsonBody,
  leagueEndpoint,
  respond,
} from '../../../../../../../../server/league-api-route.ts';
import {
  changeGameFormatRequest,
  readGameFormatRequest,
} from '../../../../../../../../server/game-format-endpoint.ts';

export const dynamic = 'force-dynamic';

type Params = { readonly params: Promise<{ readonly leagueId: string; readonly game: string }> };

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { game } = await params;
  const endpoint = await leagueEndpoint(['games', game, 'format']);
  if (!endpoint.ok) return respond(refusalAnswer(endpoint.refusal));
  return respond(await readGameFormatRequest(endpoint.context, game, endpoint.ports.tracker));
}

export async function PUT(request: Request, { params }: Params): Promise<Response> {
  const { game } = await params;
  const endpoint = await leagueEndpoint(['games', game, 'format']);
  if (!endpoint.ok) return respond(refusalAnswer(endpoint.refusal));
  return respond(
    await changeGameFormatRequest(
      endpoint.context,
      game,
      await jsonBody(request),
      endpoint.ports.tracker,
    ),
  );
}
