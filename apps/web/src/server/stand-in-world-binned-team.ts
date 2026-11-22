// LOCAL_BINNED_TEAM (step 2.180). FOR LOCAL WORK AND TESTS ONLY. Puts a team of the first
// made-up league's current season in the bin as the world is made, with its games and
// results, as a team could be put there before A-17 held a team with games. Since A-17 no
// screen can do it, so this is how a browser test and the pictures see what every screen
// shows of such a team: "(removed)" in the grid, its row kept in the standings.
import type { LeagueWorld } from './stand-in-world-state.ts';

/** Bins the named team; a name the first league's current season has not stops the app. */
export function binTeamOfFirstLeague(leagues: LeagueWorld[], slug: string): void {
  const league = leagues[0];
  const team = league?.teams.find(
    (t) => t.slug === slug && t.seasonId === league.currentSeasonId && !t.binned,
  );
  if (league === undefined || team === undefined) {
    throw new Error(
      `LOCAL_BINNED_TEAM: the first made-up league's current season has no team "${slug}".`,
    );
  }
  league.teams = league.teams.map((t) =>
    t === team ? { ...t, binned: true, version: t.version + 1 } : t,
  );
}
