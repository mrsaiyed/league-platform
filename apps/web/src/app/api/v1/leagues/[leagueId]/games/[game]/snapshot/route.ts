// GET /api/v1/leagues/{leagueId}/games/{game}/snapshot: the game as it stands, for a
// viewer's page (T6 §6; T-118, T-119). The handler is server/game-snapshot-endpoint.ts.
import { refusalAnswer } from '../../../../../../../../server/league-api.ts';
import { commandContextOf } from '../../../../../../../../server/context.ts';
import { gameSnapshot } from '../../../../../../../../server/game-snapshot-endpoint.ts';
import {
  carriesSignInCookies,
  leagueEndpoint,
  respond,
} from '../../../../../../../../server/league-api-route.ts';

export const dynamic = 'force-dynamic';

type Params = { readonly params: Promise<{ readonly leagueId: string; readonly game: string }> };

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { game } = await params;
  const endpoint = await leagueEndpoint(['games', game, 'snapshot'], 'visitor');
  if (!endpoint.ok) return respond(refusalAnswer(endpoint.refusal));
  const { context, ports } = endpoint;
  const holder =
    context.account === null ? undefined : await ports.accessOf(commandContextOf(context));
  const carriesSignIn = await carriesSignInCookies();
  return respond(await gameSnapshot({ context, holder, carriesSignIn }, game, ports.tracker));
}
