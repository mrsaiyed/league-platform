// POST /api/v1/leagues/{leagueId}/games/{game}/copy: a copy of a game, saved on the
// scoring device, uploaded from any phone or computer (S-5, T-129, step 2.70). The
// handler is server/game-copy-upload-endpoint.ts: it sends the copy's commands through
// the tracker's commands door. Once it has answered, the saved plays are published for
// the people watching (T-117).
import { after } from 'next/server';
import {
  maxCopyUploadBytes,
  uploadGameCopy,
} from '../../../../../../../../server/game-copy-upload-endpoint.ts';
import { refusalAnswer } from '../../../../../../../../server/league-api.ts';
import {
  jsonBody,
  leagueEndpoint,
  respond,
} from '../../../../../../../../server/league-api-route.ts';

export const dynamic = 'force-dynamic';

type Params = { readonly params: Promise<{ readonly leagueId: string; readonly game: string }> };

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { game } = await params;
  const endpoint = await leagueEndpoint(['games', game, 'copy']);
  if (!endpoint.ok) return respond(refusalAnswer(endpoint.refusal));
  const { context, ports } = endpoint;
  const outcome = await uploadGameCopy(
    context,
    game,
    await jsonBody(request, maxCopyUploadBytes),
    ports.tracker,
    ports.publishPlays,
  );
  if (outcome.afterwards !== null) after(outcome.afterwards);
  return respond(outcome.answer);
}
