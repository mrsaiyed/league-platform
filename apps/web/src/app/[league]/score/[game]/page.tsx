import { NotBuilt, type LeagueRouteProps } from '../../../../features/shell/index.ts';
import { loadLeaguePage } from '../../../../server/load-league-page.ts';

/** The courtside tracker for one game (P2 §4): a placeholder until it is rebuilt here. */
export default async function Page({ params }: LeagueRouteProps) {
  await loadLeaguePage((await params).league, 'score');
  return <NotBuilt title="tracker.title" />;
}
