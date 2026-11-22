import { VenuesPage } from '../../../../../features/venues-area/index.ts';
import type { LeagueRouteProps } from '../../../../../features/shell/index.ts';

export default async function Page({ params }: LeagueRouteProps) {
  const { league } = await params;
  return <VenuesPage league={league} />;
}
