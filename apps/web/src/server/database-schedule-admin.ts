// Admin → Schedule's ports on the database (step 2.93 part 4), as the stand-in's
// (stand-in-schedule.ts): the scheduling module's own transaction, made of
// packages/database's stores, which the grid's commands run on (the draft, its rounds,
// publishing); the names of a season's teams; and the league's seasons that the person
// may be told of, which Season settings lists too. A staff screen's reads and its
// commands are ordinary league transactions set to the league (and, for a command, the
// account) of the session, never one from the request (T-23, T-28), and never the page
// snapshot of the public pages (record 070).
//
// The list of seasons applies the scheduling module's one rule itself (`mayListSeason`,
// P4 §4, step 2.160): a season not public yet is named only to someone with
// `schedule.read` at its program, so no screen that lists seasons to staff can leave the
// rule out.
//
// packages/database is handed in, not imported: Node.js loads it when the app starts
// (container.ts), so Next.js never bundles it.
import {
  mayListSeason,
  type AccessHolder,
  type CommandContext,
  type CommandDeps,
  type SchedulingTx,
} from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle } from '@srleagues/database';
import { randomUUID } from 'node:crypto';
import { isDatabaseId } from './database-id.ts';
import type { ScheduleAdminPorts, ScheduleSeason } from './schedule-admin.ts';

/** What these ports use of packages/database. */
export type ScheduleAdminQueries = Pick<
  typeof DatabaseModule,
  | 'withTransaction'
  | 'commandTransaction'
  | 'jobsStore'
  | 'schedulingStore'
  | 'accessStore'
  | 'activityLogStore'
  | 'listLeagueSeasons'
  | 'listSeasonNames'
>;

export function databaseScheduleAdmin(
  database: ScheduleAdminQueries,
  db: DatabaseHandle,
  log: CommandDeps<SchedulingTx>['log'],
  /** What an account holds in a league, read fresh (the web ports' own accessOf). */
  accessOf: (context: CommandContext) => Promise<AccessHolder | undefined>,
): ScheduleAdminPorts {
  return {
    deps: {
      transaction: database.commandTransaction(db, (scope) => ({
        jobs: database.jobsStore(scope),
        scheduling: database.schedulingStore(scope),
        access: database.accessStore(scope),
        activity: database.activityLogStore(scope),
      })),
      // Core's handlers follow results only (the standings): nothing the grid sends.
      events: [],
      log,
      now: () => performance.now(),
    },
    // The season's teams not in the bin, by name: the names a fixtures file may use
    // (listSeasonNames, step 2.10's reader), its venues left aside.
    teamsOf: async (leagueId, seasonId) =>
      isDatabaseId(seasonId)
        ? (
            await database.withTransaction(db, { leagueId }, (scope) =>
              database.listSeasonNames(scope, seasonId),
            )
          ).teams
        : [],
    seasonsOf: async (leagueId, given) => {
      // Only the account is taken from what the caller hands in: what it holds is read
      // again for this very league, so a holder read in another league can never open
      // this league's seasons not public yet.
      const holder =
        given === undefined
          ? undefined
          : await accessOf({ leagueId, accountId: given.accountId, requestId: randomUUID() });
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
