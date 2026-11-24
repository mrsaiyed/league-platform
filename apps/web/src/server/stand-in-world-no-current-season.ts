// LOCAL_NO_CURRENT_SEASON (step 2.130). FOR LOCAL WORK AND TESTS ONLY. Leaves the named
// made-up league with no current season as the world is made, its seasons kept as they
// are, as a league is once its admin has never made one current: so a browser test sees
// where Teams sends an admin then (to "Start a new season"). No screen can do it.
import type { LeagueWorld } from './stand-in-world-state.ts';

/** Unmarks the league's current season; a league that is not there, or has none, stops the app. */
export function leaveWithoutCurrentSeason(leagues: LeagueWorld[], slug: string): void {
  const league = leagues.find((l) => l.slug === slug);
  if (league === undefined || league.currentSeasonId === null) {
    throw new Error(
      `LOCAL_NO_CURRENT_SEASON: no made-up league "${slug}" with a current season to unmark.`,
    );
  }
  league.currentSeasonId = null;
}
