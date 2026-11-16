// Admin → Games and "My games to score" on the database (step 2.93 part 6, record 076): the
// games module's own transaction, made of packages/database's stores, as the stand-in
// hands its one world's (stand-in-games.ts). The games commands run on it, so every rule
// (who may score which game under the league's scorekeepers' rule, who may decide or
// correct one, the version checks, the reopening window) is the product's own. Each read
// and command is an ordinary league transaction, set to the league and the account of the
// command's context, which comes from the session (T-23, T-28), never a page snapshot of
// the public pages (record 070). The tracker's ports (database-tracker.ts) run on the same
// transaction: reopening a game hands a tracked one back (step 2.30).
//
// A result moves the standings in the same transaction (T-24): core's event handlers run
// inside each command's transaction, which holds the standings store besides the games
// module's own. Never an empty list of handlers here.
//
// packages/database is handed in, not imported: Node.js loads it when the app starts
// (container.ts), so Next.js never bundles it.
import {
  eventHandlers,
  type Clock,
  type CommandDeps,
  type EventHandler,
  type StandingsTx,
  type TrackerTx,
} from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle, LeagueScope } from '@srleagues/database';
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

/** The games module's transaction with the standings store its event handlers write to. */
type GamesAreaTx = TrackerTx & StandingsTx;

/** Whether the command's transaction is this file's, standings store included. */
const holdsStandings = (tx: TrackerTx): tx is GamesAreaTx =>
  'standings' in tx && tx.standings !== undefined;

/**
 * Core's handlers (standings and player totals follow every result, T-24), each given the
 * whole transaction its command runs in. The command hands a handler its own copy of the
 * transaction with a checked job queue (define-command.ts), so every store is still there.
 */
const standingsFollow: readonly EventHandler<TrackerTx>[] = eventHandlers.map((handler) => ({
  type: handler.type,
  handle: async (event, tx) => {
    if (!holdsStandings(tx)) throw new Error('A games transaction without its standings store.');
    await handler.handle(event, tx);
  },
}));

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
    transaction: database.commandTransaction(
      db,
      (scope: LeagueScope): GamesAreaTx => ({
        jobs: database.jobsStore(scope),
        games: database.gamesStore(scope),
        access: database.accessStore(scope),
        activity: database.activityLogStore(scope),
        scoringSessions: database.scoringSessionsStore(scope),
        liveGames: database.liveGamesStore(scope),
        clock: options.clock,
        standings: database.standingsStore(scope),
      }),
    ),
    events: standingsFollow,
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
