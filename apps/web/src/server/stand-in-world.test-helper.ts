// The stand-in's one made-up world for a test, seeded as the app seeds it
// (stand-in-world-seed.ts), with the access rules the test gives: so a test of one
// area runs on the same rows every other area reads.
import { rulesOfGame, type AccessReader } from '@srleagues/core';
import { standInPeople, standInSeedCast } from './stand-in-cast.ts';
import { madeUpLeagues } from './stand-in-world-seed.ts';
import type { LeagueWorld } from './stand-in-world-state.ts';
import { madeUpWorld, type World } from './stand-in-world.ts';

/** Access where the made-up owner owns every league and nobody else holds anything. */
export const ownerOnly = (): AccessReader => ({
  ownerAccountId: async () => standInPeople.owner.accountId,
  leagueStatus: async () => 'live',
  activeGrantsOf: async () => [],
});

/**
 * The world as the app seeds it; `change` may alter the seed first, as a test of one rule
 * needs (a season that asks for unique numbers, say).
 */
export function testWorld(
  accessOf: (leagueId: string) => AccessReader = ownerOnly,
  now: () => Date = () => new Date(),
  change: (leagues: LeagueWorld[]) => void = () => undefined,
): World {
  const leagues = madeUpLeagues(standInSeedCast, now());
  change(leagues);
  return madeUpWorld({ leagues, accessOf, log: () => undefined, now });
}

/** Has every season of the leagues ask for a different number for each player (0008). */
export function withUniqueJerseys(leagues: LeagueWorld[]): void {
  for (const league of leagues) {
    league.seasons = league.seasons.map((season) => {
      const rules = rulesOfGame(null, season.rules);
      return { ...season, rules: { ...rules, rosters: { ...rules.rosters, uniqueJerseys: true } } };
    });
  }
}
