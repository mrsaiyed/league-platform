import { GamesPage } from '../../../../features/games-area/index.ts';
import type { LeagueRouteProps } from '../../../../features/shell/index.ts';

// The answer to a tap never rides in the address (T-271, record 067). The page reads two
// values of the query only, places to look, never a form's answer: which round of earlier
// games to show (step 2.156), and which later games (step 2.56: "all", or a team).
export default async function Page({
  params,
  searchParams,
}: LeagueRouteProps & {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const { league } = await params;
  const query = await searchParams;
  const asked = query['round'];
  const round = typeof asked === 'string' && asked !== '' ? asked : undefined;
  const laterAsked = query['later'];
  const later = typeof laterAsked === 'string' && laterAsked !== '' ? laterAsked : undefined;
  return <GamesPage league={league} round={round} later={later} />;
}
