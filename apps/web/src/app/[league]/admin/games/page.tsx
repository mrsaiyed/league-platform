import { GamesPage } from '../../../../features/games-area/index.ts';
import type { LeagueRouteProps } from '../../../../features/shell/index.ts';

// The answer to a tap never rides in the address (T-271, record 067). The page reads one
// value of the query only: which round of earlier games to show (step 2.156), a place to
// look, never a form's answer.
export default async function Page({
  params,
  searchParams,
}: LeagueRouteProps & {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const { league } = await params;
  const asked = (await searchParams)['round'];
  const round = typeof asked === 'string' && asked !== '' ? asked : undefined;
  return <GamesPage league={league} round={round} />;
}
