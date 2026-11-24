// The tracker's ports on the database (step 2.93 part 6, record 076): its commands (the
// scoring session, the taps, the state and rosters a scorer's device reads, ending,
// reopening, marking a game not started) run on the games commands' own transaction
// (database-games.ts), so a tracked game that ends moves the standings in the same
// transaction. The league comes from each call's context, never from the request (T-23).
//
// What a watcher reads (T6 §6): the game page and the snapshot endpoint read the game and
// the league's own name settings and audience in one snapshot of the league (gameReadsOf):
// REPEATABLE READ and READ ONLY, as every public page's reads (record 070), so a name is
// shown by the settings as they stood when the game was read, never a mix of two saves.
// The snapshot store alone (snapshotStoreOf) does not read people: it refuses, so nothing
// can put a name beside settings read at another moment. Who is shown and how stays in
// core (readGameSnapshot, showName); these ports only fetch.
//
// Live updates: none on the database yet (steps 2.124 and 2.116). A watcher's page asks
// for the snapshot again every 5 seconds (T-119, follow-game.ts), and the answer may be
// up to 2 seconds old from the cache in front of the site (s-maxage=2), so a watcher is
// at most about 7 seconds behind; the publisher here publishes nowhere.
//
// packages/database is handed in, not imported: Node.js loads it when the app starts
// (container.ts), so Next.js never bundles it.
import {
  readNamePolicy,
  type Clock,
  type CommandDeps,
  type GameSnapshotStore,
  type TrackerTx,
} from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle, LeagueScope } from '@srleagues/database';
import type { LivePublisher } from '@srleagues/providers';
import type { TrackerPorts } from './tracker-ports.ts';

/** What these ports use of packages/database. */
export type TrackerQueries = Pick<
  typeof DatabaseModule,
  | 'withTransaction'
  | 'gamesReadStore'
  | 'findLeagueAudience'
  | 'listSettingValues'
  | 'listAccessNames'
>;

export class GameNamesOnlyWithSettings extends Error {
  constructor() {
    super(
      'A game’s people are read only with the league’s name settings, in one snapshot: use gameReadsOf (record 076).',
    );
    this.name = 'GameNamesOnlyWithSettings';
  }
}

/** Nothing listens on the database yet: a watcher asks for the snapshot again. */
const publishesNowhere: LivePublisher = {
  publishGame: async () => {},
  publishLeagueScore: async () => {},
};

export function databaseTracker(
  database: TrackerQueries,
  db: DatabaseHandle,
  deps: CommandDeps<TrackerTx>,
  clock: Clock,
): TrackerPorts {
  const inSnapshot = <T>(leagueId: string, work: (scope: LeagueScope) => Promise<T>) =>
    database.withTransaction(db, { leagueId }, work, { snapshot: 'page' });
  // The league's own audience and name settings, in the scope's transaction.
  const namesIn = async (scope: LeagueScope) => ({
    audience: await database.findLeagueAudience(scope),
    policy: await readNamePolicy({
      settingRows: (key, places) => database.listSettingValues(scope, key, places),
    }),
  });
  return {
    deps,
    snapshotStoreOf: (leagueId): GameSnapshotStore => {
      const read = <T>(work: (store: GameSnapshotStore) => Promise<T>) =>
        inSnapshot(leagueId, (scope) => work(database.gamesReadStore(scope)));
      return {
        findGame: (gameId) => read((store) => store.findGame(gameId)),
        teams: (teamIds) => read((store) => store.teams(teamIds)),
        state: (gameId) => read((store) => store.state(gameId)),
        savedState: (gameId) => read((store) => store.savedState(gameId)),
        lines: (gameId) => read((store) => store.lines(gameId)),
        correctedOn: (gameId) => read((store) => store.correctedOn(gameId)),
        resultBeingCorrected: (gameId) => read((store) => store.resultBeingCorrected(gameId)),
        seasonStatistics: (seasonId) => read((store) => store.seasonStatistics(seasonId)),
        people: async () => {
          throw new GameNamesOnlyWithSettings();
        },
      };
    },
    gameReadsOf: (leagueId, work) =>
      inSnapshot(leagueId, async (scope) =>
        work({ store: database.gamesReadStore(scope), ...(await namesIn(scope)) }),
      ),
    namesShownOf: (leagueId) => inSnapshot(leagueId, namesIn),
    // The name the holder's account gives, as another scorekeeper is shown it (T6 §5): read
    // for the league's own staff only (access_list_names), '' for anyone else or none.
    displayNameOf: (leagueId, accountId) =>
      database.withTransaction(db, { leagueId }, async (scope) => {
        const found = (await database.listAccessNames(scope)).find(
          (row) => row.accountId === accountId.toLowerCase(),
        );
        return found?.displayName ?? '';
      }),
    publisher: publishesNowhere,
    clock,
  };
}
