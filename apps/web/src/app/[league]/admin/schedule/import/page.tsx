import { ImportPage, type SearchParams } from '../../../../../features/fixture-import/index.ts';
import type { LeagueRouteProps } from '../../../../../features/shell/index.ts';

export default async function Page({
  params,
  searchParams,
}: LeagueRouteProps & { readonly searchParams: Promise<SearchParams> }) {
  const { league } = await params;
  return <ImportPage league={league} search={await searchParams} />;
}
