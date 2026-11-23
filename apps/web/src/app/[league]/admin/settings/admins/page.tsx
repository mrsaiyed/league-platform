import { AdminsPage } from '../../../../../features/access-area/index.ts';
import type { LeagueRouteProps } from '../../../../../features/shell/index.ts';

export default async function Page({ params }: LeagueRouteProps) {
  const { league } = await params;
  return <AdminsPage league={league} />;
}
