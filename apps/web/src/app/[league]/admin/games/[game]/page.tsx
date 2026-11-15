import { BoxScorePage } from '../../../../../features/games-area/index.ts';

type GameRouteProps = {
  readonly params: Promise<{ readonly league: string; readonly game: string }>;
};

// The answer to a save never rides in the address (T-271, record 067), so the page reads
// no query.
export default async function Page({ params }: GameRouteProps) {
  const { league, game } = await params;
  return <BoxScorePage league={league} gameId={game} />;
}
