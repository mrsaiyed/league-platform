import { AdminArea, type LeagueRouteProps } from '../../../features/shell/index.ts';
import { MyGamesPage, scoresOnly } from '../../../features/tracker/index.ts';
import { loadLeaguePage } from '../../../server/load-league-page.ts';

/** The admin's home; for someone who only scores, their games and nothing else (P4 §4). */
export default async function Page({ params }: LeagueRouteProps) {
  const { league } = await params;
  const view = await loadLeaguePage(league, 'admin');
  if (scoresOnly(view.areas)) return <MyGamesPage view={view} />;
  return <AdminArea league={league} area={null} />;
}
