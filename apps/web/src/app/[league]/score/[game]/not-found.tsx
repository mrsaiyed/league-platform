import { LeagueNotFound, PlatformNotFound } from '../../../../features/shell/index.ts';
import { TrackerGameNotFound } from '../../../../features/tracker/index.ts';
import { leagueViewOfAddress, scorerViewOfAddress } from '../../../../server/load-league-page.ts';

/**
 * A game's scoring address that is no game of this league's (step 2.157). For someone who
 * scores here it is the tracker's own refusal, "Page not found", in the league's look, with
 * the way back to their games. For anyone else it is exactly what the league's own "not
 * found" is (`[league]/not-found.tsx`): the plain screen an address of no league gets when
 * the league may not be shown to them (U-9), so a hidden league is never given away.
 */
export default async function NotFoundAtScore() {
  const scorer = await scorerViewOfAddress();
  if (scorer !== null) return <TrackerGameNotFound view={scorer} />;
  const view = await leagueViewOfAddress();
  return view === null ? <PlatformNotFound /> : <LeagueNotFound league={view.context.league} />;
}
