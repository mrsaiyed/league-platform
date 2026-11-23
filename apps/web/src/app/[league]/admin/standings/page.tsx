import { StandingsAreaPage } from '../../../../features/standings-area/index.ts';
import type { LeagueRouteProps } from '../../../../features/shell/index.ts';

export default async function Page({
  params,
  searchParams,
}: LeagueRouteProps & {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const { league } = await params;
  return <StandingsAreaPage league={league} search={await searchParams} />;
}
