// Admin → Schedule's ports on the database (step 2.93 part 4), as the stand-in's
// (stand-in-schedule.ts): the league's seasons that the person may be told of, which
// Season settings lists too. A staff screen's read is an ordinary league transaction set
// to the league it is for (T-28), never one from the request.
//
// The list applies the scheduling module's one rule itself (`mayListSeason`, P4 §4,
// step 2.160): a season not public yet is named only to someone with `schedule.read` at
// its program, so no screen that lists seasons to staff can leave the rule out.
//
// packages/database is handed in, not imported: Node.js loads it when the app starts
// (container.ts), so Next.js never bundles it.
import { mayListSeason } from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle } from '@srleagues/database';
import { notOnTheDatabaseYet } from './not-on-the-database-yet.ts';
import type { ScheduleAdminPorts, ScheduleSeason } from './schedule-admin.ts';

/** What these ports use of packages/database. */
export type ScheduleAdminQueries = Pick<
  typeof DatabaseModule,
  'withTransaction' | 'listLeagueSeasons'
>;

export function databaseScheduleAdmin(
  database: ScheduleAdminQueries,
  db: DatabaseHandle,
): ScheduleAdminPorts {
  return {
    // The grid itself moves in the second half of this part.
    get deps(): ScheduleAdminPorts['deps'] {
      return notOnTheDatabaseYet('schedule grid');
    },
    teamsOf: async () => notOnTheDatabaseYet('schedule grid'),
    seasonsOf: async (leagueId, holder) => {
      const rows = await database.withTransaction(db, { leagueId }, (scope) =>
        database.listLeagueSeasons(scope),
      );
      const listed: readonly ScheduleSeason[] = rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        isCurrent: row.isCurrent,
        isPublic: row.isPublic,
        programId: row.programId,
      }));
      // Only what this holder may be told of: the scheduling module's one rule (P4 §4).
      return listed.filter((season) => mayListSeason(holder, season));
    },
  };
}
