import { GamesPage } from '../../../../features/games-area/index.ts';
import type { LeagueRouteProps } from '../../../../features/shell/index.ts';

// The answer to a tap never rides in the address (T-271, record 067), so the page reads
// no query.
export default async function Page({ params }: LeagueRouteProps) {
  const { league } = await params;
  return <GamesPage league={league} />;
}
