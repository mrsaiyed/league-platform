// The stand-in's one made-up world for a test, seeded as the app seeds it
// (stand-in-world-seed.ts), with the access rules the test gives: so a test of one
// area runs on the same rows every other area reads.
import { rulesOfGame, type AccessReader } from '@srleagues/core';
import { standInPeople, standInSeedCast } from './stand-in-cast.ts';
import { dayIn, momentIn } from './stand-in-world-clock.ts';
import { adultTimeZone, madeUpLeagues } from './stand-in-world-seed.ts';
import type { LeagueWorld } from './stand-in-world-state.ts';
import { madeUpWorld, type World } from './stand-in-world.ts';

/** Access where the made-up owner owns every league and nobody else holds anything. */
export const ownerOnly = (): AccessReader => ({
  ownerAccountId: async () => standInPeople.owner.accountId,
  leagueStatus: async () => 'live',
  activeGrantsOf: async () => [],
});

/**
 * The clock a test's world has unless the test gives its own (step 2.175): noon of today
 * in the made-up adult league's own time zone, running on from there as a clock does.
 * The seed places its games around the moment the world starts, and a day's list starts
 * at the league's midnight (S-59), so a world started at the real hour put the night's
 * first hours' final games on yesterday's list and failed tests that run then. Noon is
 * found in the league's zone, so it is noon on the days the clocks change too.
 */
export function atLeagueNoon(): () => Date {
  const real = Date.now();
  const today = dayIn(new Date(real), adultTimeZone);
  const offset = Date.parse(momentIn(today, '12:00', adultTimeZone)) - real;
  return () => new Date(Date.now() + offset);
}

/**
 * The world as the app seeds it, started at noon of the league's day (atLeagueNoon)
 * unless the test passes its own `now`, as a test about the hour does; `change` may alter
 * the seed first, as a test of one rule needs (a season that asks for unique numbers, say).
 */
export function testWorld(
  accessOf: (leagueId: string) => AccessReader = ownerOnly,
  now: () => Date = atLeagueNoon(),
  change: (leagues: LeagueWorld[]) => void = () => undefined,
): World {
  const leagues = madeUpLeagues(standInSeedCast, now());
  change(leagues);
  return madeUpWorld({
    leagues,
    accessOf,
    log: () => undefined,
    clock: { now: () => now().getTime() },
  });
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
