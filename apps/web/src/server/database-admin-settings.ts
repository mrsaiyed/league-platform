// Admin → League settings and Admin → Season settings on the database (step 2.93 part 4):
// the leagues module's own transaction, made of packages/database's stores, as the
// stand-in hands its one world's (stand-in-admin-settings.ts). The settings commands, the
// list of settings and the season commands run on it, so every rule (who may change what,
// the limits, the version check) is the product's own. A staff screen's reads and its
// commands are ordinary league transactions, set to the league and the account of the
// command's context, which comes from the session (T-23, T-28), never the page snapshot
// of the public pages (record 070). Saving a season's rules (step 2.47) previews and
// rebuilds the season's standings in the same transaction, so the standings and games
// stores are in it too, as in Admin → Teams' (database-admin-teams.ts).
//
// packages/database is handed in, not imported: Node.js loads it when the app starts
// (container.ts), so Next.js never bundles it.
import type { CommandDeps, LeaguesTx, StandingsTx } from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle } from '@srleagues/database';
import type { AdminSettingsPorts } from './admin-settings.ts';

/** What these ports use of packages/database. */
export type AdminSettingsQueries = Pick<
  typeof DatabaseModule,
  | 'commandTransaction'
  | 'jobsStore'
  | 'leaguesStore'
  | 'divisionsStore'
  | 'accessStore'
  | 'activityLogStore'
  | 'standingsStore'
  | 'gamesStore'
>;

export function databaseAdminSettings(
  database: AdminSettingsQueries,
  db: DatabaseHandle,
  log: CommandDeps<LeaguesTx & StandingsTx>['log'],
): AdminSettingsPorts {
  // No account is our own staff here, as on the stand-in: staff are not a league role
  // (A-3) and the app names none yet.
  const transaction = database.commandTransaction(db, (scope): LeaguesTx & StandingsTx => ({
    jobs: database.jobsStore(scope),
    leagues: database.leaguesStore(scope),
    divisions: database.divisionsStore(scope),
    access: database.accessStore(scope),
    activity: database.activityLogStore(scope),
    standings: database.standingsStore(scope),
    games: database.gamesStore(scope),
  }));
  const now = () => performance.now();
  return {
    deps: { transaction, events: [], log, now },
    seasons: { transaction, events: [], log, now },
  };
}
