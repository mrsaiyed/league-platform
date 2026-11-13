import { AdminArea, type LeagueRouteProps } from '../../../../features/shell/index.ts';

export default async function Page({ params }: LeagueRouteProps) {
  const { league } = await params;
  return <AdminArea league={league} area="site" />;
}
