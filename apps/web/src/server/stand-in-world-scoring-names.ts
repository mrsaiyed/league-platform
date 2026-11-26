// LOCAL_SCORING_NAMES (step 2.226). FOR LOCAL WORK AND TESTS ONLY. Makes the named made-up
// league a youth league as the world is made, and on its game under way gives the home
// team's first player number 12, a child whose guardian asked for the name to be taken off,
// and the away team's first player an adult who asked for initials (the league lets adults
// ask), each named with a surname nobody else in the made-up world has (Robin Zabrowskiyy,
// Robin Quillfeatherz): so a browser test scores that game as R-33 names it and searches
// the bare surnames. No screen records a name request yet.
import { playersMayAskForInitials } from '@srleagues/core';
import type { LeagueWorld } from './stand-in-world-state.ts';

const surnamed = (lastName: string) => ({ firstName: 'Robin', lastName, publicName: null });

/** The two people it changed, by id; a league with no game under way stops the app. */
export function withScoringNames(
  leagues: LeagueWorld[],
  slug: string,
  savedAt: string,
): { readonly removed: string; readonly initials: string } {
  const league = leagues.find((l) => l.slug === slug);
  const game = league?.games.find((g) => g.status === 'live');
  const firstOf = (teamId: string) =>
    league?.roster
      .filter((r) => r.teamId === teamId && r.leftOn === null && r.role !== 'coach')
      .sort((a, b) => a.sort - b.sort)[0];
  const home = game === undefined ? undefined : firstOf(game.homeTeamId);
  const away = game === undefined ? undefined : firstOf(game.awayTeamId);
  if (league === undefined || home === undefined || away === undefined) {
    throw new Error(
      `LOCAL_SCORING_NAMES: no made-up league "${slug}" with a game under way and players on both teams.`,
    );
  }
  league.audience = 'youth';
  league.roster = league.roster.map((r) => (r.id === home.id ? { ...r, jerseyNumber: '12' } : r));
  league.people = league.people.map((p) => {
    if (p.id === home.personId) {
      const sensitive = { ...p.sensitive, isMinor: true };
      return { ...p, ...surnamed('Zabrowskiyy'), visibility: 'removed', sensitive };
    }
    if (p.id === away.personId) {
      const sensitive = { ...p.sensitive, isMinor: false };
      return { ...p, ...surnamed('Quillfeatherz'), visibility: 'initials', sensitive };
    }
    return p;
  });
  league.settings = [
    ...league.settings.filter((s) => s.key !== playersMayAskForInitials.key),
    {
      place: { level: 'league' },
      key: playersMayAskForInitials.key,
      document: { version: playersMayAskForInitials.version, value: true },
      version: 1,
      savedAt,
    },
  ];
  return { removed: home.personId, initials: away.personId };
}
