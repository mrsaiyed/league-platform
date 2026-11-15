// What the public home and schedule pages need from outside (step 2.42): the league's own
// day and time zone, and the season's published schedule as the step 2.39 query shapes it.
// Bound to one league by the caller, so nothing here takes a league from the request (T-28).
// The seasons themselves come from the standings port (public-stats.ts), so both kinds of
// page offer the same seasons.
import type { PublicGame, PublicSchedule } from '@srleagues/core';

/** The league's own clock: the day it is there, and the zone its game times are written in. */
export type LeagueClock = {
  /** yyyy-mm-dd. */
  readonly today: string;
  /** This moment, as an ISO time: what "has it started yet" is measured against. */
  readonly now: string;
  /** An IANA zone name, such as `Europe/Paris`. */
  readonly timeZone: string;
};

/**
 * What a game's own page shows of the published schedule beside its scores: the game's
 * number, where it is played, and which season's schedule it is on. One game's facts, so
 * the page does not read and build a whole season to learn them.
 */
export type PublicGameFacts = Pick<PublicGame, 'number' | 'venue' | 'courtName'> & {
  readonly season: { readonly slug: string; readonly isCurrent: boolean };
};

export type PublicSchedulePorts = {
  readonly clockOf: (leagueId: string) => Promise<LeagueClock>;
  /**
   * One published game's number, place and season; undefined when the season is not one
   * the public may see or the game is not on its schedule. A database-backed source
   * answers this with one row.
   */
  readonly gameFactsOf: (
    leagueId: string,
    seasonId: string,
    gameId: string,
  ) => Promise<PublicGameFacts | undefined>;
  /** The season's published games by round; undefined when the season is not one the public may see. */
  readonly scheduleOf: (
    leagueId: string,
    seasonId: string,
    today: string,
  ) => Promise<PublicSchedule | undefined>;
};
