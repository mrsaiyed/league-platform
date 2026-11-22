import { PeoplePage } from '../../../../features/people-area/index.ts';
import type { LeagueRouteProps } from '../../../../features/shell/index.ts';
import type { SearchProps } from '../../../../features/teams-area/index.ts';

export default async function Page({ params, searchParams }: LeagueRouteProps & SearchProps) {
  const { league } = await params;
  return <PeoplePage league={league} query={await searchParams} />;
}
