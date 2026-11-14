import { GamesPage, type SearchParams } from '../../../../features/games-area/index.ts';
import type { LeagueRouteProps } from '../../../../features/shell/index.ts';

export default async function Page({
  params,
  searchParams,
}: LeagueRouteProps & { readonly searchParams: Promise<SearchParams> }) {
  const { league } = await params;
  return <GamesPage league={league} search={await searchParams} />;
}
