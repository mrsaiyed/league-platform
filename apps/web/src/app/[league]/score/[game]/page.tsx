import { NotBuilt } from '../../../../features/shell/index.ts';
import { loadLeaguePage } from '../../../../server/load-league-page.ts';

/** The courtside tracker for one game (P2 §4): a placeholder until it is rebuilt here. */
export default async function Page() {
  await loadLeaguePage('score');
  return <NotBuilt title="tracker.title" />;
}
