// Admin → Teams on the database (step 2.93 part 5): the teams and people modules' own
// transaction, made of packages/database's stores, as the stand-in hands its one world's
// (stand-in-admin-teams.ts). Every command the screens send (a team added, changed, its
// statistics' audience set and removed; a person added to the league list or taken off
// it; a roster line added with its number and role, changed, moved, marked as left and
// put back) runs on it, so every rule (who may change what at which program, a number
// worn twice, a person still on a roster, the version checks) is the product's own. Each
// command is an ordinary league transaction set to the league and the account of its
// context, which comes from the session (T-23, T-28), never the request.
//
// The screens' three reads that are not commands (the league's current season, its
// divisions and its teams) are transactions set to the league of the session's context;
// they name no person, and each answers only someone who may manage the season's teams
// (mayListSeasonTeams), what they hold read afresh, so they are safe whatever page asks.
// An id that cannot be a row's is no row, asked of no database.
//
// Whether a person is a child (R-28) is worked out in SQL, by the database's own reads and
// by the people store's answer to the commands (record 080), so a birth date never leaves
// the database unless a command hands it to someone allowed to see it
// (people.read_sensitive, T-76).
//
// Core's event handlers (standings follow every result, T-24) run in each command's
// transaction, which therefore holds the standings and games stores they read and write
// besides the teams and people modules' own. No teams command announces an event today;
// the list is never empty all the same, so the day one does, the database does what the
// made-up world does (stand-in-world.ts).
//
// packages/database is handed in, not imported: Node.js loads it when the app starts
// (container.ts), so Next.js never bundles it.
import type { AccessHolder, CommandContext, CommandDeps } from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle, LeagueScope } from '@srleagues/database';
import { mayListSeasonTeams, type AdminTeamsPorts, type AdminTeamsTx } from './admin-teams.ts';
import { coreEventHandlers } from './database-event-handlers.ts';
import { isDatabaseId } from './database-id.ts';

/** What these ports use of packages/database. */
export type AdminTeamsQueries = Pick<
  typeof DatabaseModule,
  | 'withTransaction'
  | 'commandTransaction'
  | 'jobsStore'
  | 'teamsStore'
  | 'peopleStore'
  | 'accessStore'
  | 'activityLogStore'
  | 'standingsStore'
  | 'gamesStore'
  | 'listLeagueSeasons'
  | 'seasonIsArchived'
  | 'listDivisions'
  | 'listStaffSeasonTeams'
>;

export function databaseAdminTeams(
  database: AdminTeamsQueries,
  db: DatabaseHandle,
  log: CommandDeps<AdminTeamsTx>['log'],
  /** What an account holds in a league, read fresh (the web ports' own accessOf). */
  accessOf: (context: CommandContext) => Promise<AccessHolder | undefined>,
): AdminTeamsPorts {
  return {
    deps: {
      // No account is our own staff here, as on the stand-in: staff are not a league
      // role (A-3) and the app names none yet.
      transaction: database.commandTransaction(db, (scope: LeagueScope) => ({
        jobs: database.jobsStore(scope),
        teams: database.teamsStore(scope),
        people: database.peopleStore(scope),
        access: database.accessStore(scope),
        activity: database.activityLogStore(scope),
        standings: database.standingsStore(scope),
        games: database.gamesStore(scope),
      })),
      events: coreEventHandlers<AdminTeamsTx>(),
      log,
      now: () => performance.now(),
    },
    // The league's current season, as the stand-in's: the one marked current, first among
    // the league's seasons as listLeagueSeasons orders them (one per program at most),
    // and only to someone who may manage its teams.
    currentSeason: async (context) => {
      const current = (await seasonsOf(context)).find((season) => season.isCurrent);
      if (current === undefined) return undefined;
      const archived = await database.withTransaction(db, { leagueId: context.leagueId }, (scope) =>
        database.seasonIsArchived(scope, current.id),
      );
      return { id: current.id, name: current.name, archived };
    },
    // Not in the bin, in order: by their place, then name (list-divisions.ts).
    divisions: async (context, seasonId) =>
      (await mayList(context, seasonId))
        ? (
            await database.withTransaction(db, { leagueId: context.leagueId }, (scope) =>
              database.listDivisions(scope, seasonId),
            )
          ).map(({ id, name }) => ({ id, name }))
        : [],
    // Not in the bin, by name, whatever the season's state (list-staff-season-teams.ts).
    teams: async (context, seasonId) =>
      (await mayList(context, seasonId))
        ? database.withTransaction(db, { leagueId: context.leagueId }, (scope) =>
            database.listStaffSeasonTeams(scope, seasonId),
          )
        : [],
  };

  /** The league's seasons whose teams this person may manage, what they hold read afresh. */
  async function seasonsOf(context: CommandContext) {
    const holder = await accessOf(context);
    if (holder === undefined) return [];
    const seasons = await database.withTransaction(db, { leagueId: context.leagueId }, (scope) =>
      database.listLeagueSeasons(scope),
    );
    return seasons.filter((season) => mayListSeasonTeams(holder, season.programId));
  }

  /** Whether the season is the league's (an id that cannot be a row's is not) and theirs. */
  async function mayList(context: CommandContext, seasonId: string) {
    if (!isDatabaseId(seasonId)) return false;
    const id = seasonId.toLowerCase();
    return (await seasonsOf(context)).some((season) => season.id === id);
  }
}
