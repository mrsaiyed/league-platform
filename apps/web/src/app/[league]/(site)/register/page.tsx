import { LeagueSitePage, type LeagueRouteProps } from '../../../../features/shell/index.ts';

export default async function Page({ params }: LeagueRouteProps) {
  const { league } = await params;
  return <LeagueSitePage league={league} title="nav.register" />;
}
