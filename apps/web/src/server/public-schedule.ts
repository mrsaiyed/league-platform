// What the public home and schedule pages need from outside (step 2.42): the league's own
// day and time zone, and the season's published schedule as the step 2.39 query shapes it.
// Bound to one league by the caller, so nothing here takes a league from the request (T-28).
// The seasons themselves come from the standings port (public-stats.ts), so both kinds of
// page offer the same seasons.
import type { PublicSchedule } from '@srleagues/core';

/** The league's own clock: the day it is there, and the zone its game times are written in. */
export type LeagueClock = {
  /** yyyy-mm-dd. */
  readonly today: string;
  /** An IANA zone name, such as `Europe/Paris`. */
  readonly timeZone: string;
};

export type PublicSchedulePorts = {
  readonly clockOf: (leagueId: string) => Promise<LeagueClock>;
  /** The season's published games by round; undefined when the season is not one the public may see. */
  readonly scheduleOf: (
    leagueId: string,
    seasonId: string,
    today: string,
  ) => Promise<PublicSchedule | undefined>;
};
