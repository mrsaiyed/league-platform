// The public home and schedule pages' ports on the database (step 2.93 part 2): the
// league's own clock, a season's published schedule by round, and one game's place on
// it, read through packages/database as the stand-in reads its one world
// (stand-in-public-schedule.ts). Each read is one transaction set to the league it is
// for: the league id comes from the page's own league, never from the request (T-28),
// and, as a page's read, one snapshot that writes nothing (record 070).
//
// packages/database is handed in, not imported: Node.js loads it when the app starts
// (container.ts), so Next.js never bundles it.
import { dayIn } from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle, LeagueScope } from '@srleagues/database';
import { isDatabaseId as isId } from './database-id.ts';
import type { PublicSchedulePorts } from './public-schedule.ts';

/** What these ports use of packages/database. */
export type PublicScheduleQueries = Pick<
  typeof DatabaseModule,
  'withTransaction' | 'findLeagueTimeZone' | 'listPublicSchedule' | 'findPublicGameFacts'
>;

export function databasePublicSchedule(
  database: PublicScheduleQueries,
  db: DatabaseHandle,
  now: () => Date,
): PublicSchedulePorts {
  const inLeague = <T>(leagueId: string, work: (scope: LeagueScope) => Promise<T>): Promise<T> =>
    database.withTransaction(db, { leagueId }, work, { snapshot: 'page' });
  return {
    clockOf: async (leagueId) => {
      // A league that cannot be read keeps UTC, as on the stand-in.
      const timeZone =
        (await inLeague(leagueId, (scope) => database.findLeagueTimeZone(scope))) ?? 'UTC';
      const at = now();
      return { today: dayIn(timeZone, at.getTime()), now: at.toISOString(), timeZone };
    },
    scheduleOf: async (leagueId, seasonId, today) =>
      isId(seasonId)
        ? inLeague(leagueId, (scope) => database.listPublicSchedule(scope, seasonId, today))
        : undefined,
    gameFactsOf: async (leagueId, seasonId, gameId) =>
      isId(seasonId) && isId(gameId)
        ? inLeague(leagueId, (scope) => database.findPublicGameFacts(scope, seasonId, gameId))
        : undefined,
  };
}
