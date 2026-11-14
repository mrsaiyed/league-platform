import { StatsPage } from '../../../../features/stats-pages/index.ts';
import type { LeagueRouteProps } from '../../../../features/shell/index.ts';

export default async function Page({
  params,
  searchParams,
}: LeagueRouteProps & {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const { league } = await params;
  return <StatsPage league={league} search={await searchParams} />;
}
