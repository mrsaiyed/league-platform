import { TeamsPage, type SearchProps } from '../../../../features/teams-area/index.ts';
import type { LeagueRouteProps } from '../../../../features/shell/index.ts';

export default async function Page({ params, searchParams }: LeagueRouteProps & SearchProps) {
  const { league } = await params;
  return <TeamsPage league={league} query={await searchParams} />;
}
