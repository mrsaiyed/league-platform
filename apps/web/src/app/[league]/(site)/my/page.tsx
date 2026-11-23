import type { LeagueRouteProps } from '../../../../features/shell/index.ts';
import { MyPage } from '../../../../features/team-pages/index.ts';

export default async function Page({ params }: LeagueRouteProps) {
  const { league } = await params;
  return <MyPage league={league} />;
}
