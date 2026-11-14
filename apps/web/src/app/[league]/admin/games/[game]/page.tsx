import { BoxScorePage, type SearchParams } from '../../../../../features/games-area/index.ts';

type GameRouteProps = {
  readonly params: Promise<{ readonly league: string; readonly game: string }>;
  readonly searchParams: Promise<SearchParams>;
};

export default async function Page({ params, searchParams }: GameRouteProps) {
  const { league, game } = await params;
  return <BoxScorePage league={league} gameId={game} search={await searchParams} />;
}
