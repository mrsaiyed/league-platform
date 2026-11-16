import type { LeagueRouteProps } from '../../../../features/shell/index.ts';
import { AdminArea } from '../../../../features/staff/index.ts';

export default async function Page({ params }: LeagueRouteProps) {
  const { league } = await params;
  return <AdminArea league={league} area="registration" />;
}
