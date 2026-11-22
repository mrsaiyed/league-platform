// Admin → Games and "My games to score" on the database (step 2.93 part 6, record 076): the
// games module's own transaction, made of packages/database's stores, as the stand-in
// hands its one world's (stand-in-games.ts). The games commands run on it, so every rule
// (who may score which game under the league's scorekeepers' rule, who may decide or
// correct one, the version checks, the reopening window) is the product's own. Each
// command and each of its reads is an ordinary league transaction, set to the league and
// the account of the command's context, which comes from the session (T-23, T-28), never
// a page snapshot of the public pages (record 070). namesOf is the one read that is not a
// command: its transaction is set to the league only, with no account, as it reads only
// the league's own rows (its teams, seasons, game assignments, and its staff's names
// through access_list_names), none of which the fence opens to one account more than
// another. A page shows its names only beside the games a games command gave the person,
// whose own check decides what they may see. The tracker's ports (database-tracker.ts)
// run on the same transaction: reopening a game hands a tracked one back (step 2.30).
//
// A result moves the standings in the same transaction (T-24): core's event handlers run
// inside each command's transaction, which holds the standings store besides the games
// module's own. Never an empty list of handlers here.
//
// packages/database is handed in, not imported: Node.js loads it when the app starts
// (container.ts), so Next.js never bundles it.
import type { Clock, CommandDeps, TrackerTx } from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle, LeagueScope } from '@srleagues/database';
import { coreEventHandlers } from './database-event-handlers.ts';
import type { GameNames, GamesAreaPorts } from './games-area-ports.ts';

/** What these ports use of packages/database. */
export type GamesQueries = Pick<
  typeof DatabaseModule,
  | 'commandTransaction'
  | 'withTransaction'
  | 'jobsStore'
  | 'gamesStore'
  | 'accessStore'
  | 'activityLogStore'
  | 'scoringSessionsStore'
  | 'liveGamesStore'
  | 'standingsStore'
  | 'listGameNames'
  | 'listAccessNames'
>;

export type DatabaseGamesOptions = {
  readonly log: CommandDeps<TrackerTx>['log'];
  /** The server's clock: the tracker's sessions and the reopening window are timed by it. */
  readonly clock: Clock;
};

/** The games commands' deps on the database: one league transaction per command. */
export function databaseGamesDeps(
  database: GamesQueries,
  db: DatabaseHandle,
  options: DatabaseGamesOptions,
): CommandDeps<TrackerTx> {
  return {
    transaction: database.commandTransaction(db, (scope: LeagueScope) => ({
      jobs: database.jobsStore(scope),
      games: database.gamesStore(scope),
      access: database.accessStore(scope),
      activity: database.activityLogStore(scope),
      scoringSessions: database.scoringSessionsStore(scope),
      liveGames: database.liveGamesStore(scope),
      clock: options.clock,
      standings: database.standingsStore(scope),
    })),
    // Core's handlers, from the one place every database port takes them.
    events: coreEventHandlers<TrackerTx>(),
    log: options.log,
    now: () => performance.now(),
  };
}

export function databaseGames(
  database: GamesQueries,
  db: DatabaseHandle,
  deps: CommandDeps<TrackerTx>,
): GamesAreaPorts {
  return {
    deps,
    // The words beside the games, read in one transaction set to the league: its teams and
    // seasons by id, and each game's scorekeepers by the name their account gives (an
    // account that has given none, or holds nothing in the league any more, is '').
    namesOf: (leagueId) =>
      database.withTransaction(db, { leagueId }, async (scope): Promise<GameNames> => {
        const rows = await database.listGameNames(scope);
        const named = new Map(
          (await database.listAccessNames(scope)).map((row) => [row.accountId, row.displayName]),
        );
        const scorekeepers: Record<string, string[]> = {};
        for (const a of rows.assignments) {
          (scorekeepers[a.gameId] ??= []).push(named.get(a.accountId) ?? '');
        }
        return {
          teams: Object.fromEntries(rows.teams.map((t) => [t.id, t.name])),
          scorekeepers,
          seasons: Object.fromEntries(rows.seasons.map((s) => [s.id, s.name])),
        };
      }),
  };
}
