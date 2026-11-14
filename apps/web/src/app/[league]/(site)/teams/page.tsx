import type { LeagueRouteProps } from '../../../../features/shell/index.ts';
import { TeamsPage } from '../../../../features/team-pages/index.ts';

export default async function Page({
  params,
  searchParams,
}: LeagueRouteProps & {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const { league } = await params;
  return <TeamsPage league={league} search={await searchParams} />;
}
