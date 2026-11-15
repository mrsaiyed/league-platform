// The public standings' ports on the database (step 2.93 part 2): the seasons a visitor
// may pick and the standings reads, through packages/database's own standings read
// store, as the stand-in reads its one world (stand-in-public-stats.ts). Each read, and
// the standings' reads together, is one transaction set to the league it is for, never
// one from the request (T-28). A season id that is not a UUID is no season.
//
// Only what shows teams has moved: the reads the standings and a team's record make
// (the season, its teams, divisions, standings rows and adjustments). The statistics'
// reads, which show people, and the league's name settings they need refuse until part
// 3, which reads who sees players' names from the league itself (step 2.126, T-81).
// The home page's leaders are such a read: it leaves them out when the read fails.
import { fail, readStandings, type StandingsReadStore } from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle, LeagueScope } from '@srleagues/database';
import { isDatabaseId as isId } from './database-id.ts';
import { notOnTheDatabaseYet } from './not-on-the-database-yet.ts';
import type { PublicStatsPorts } from './public-stats.ts';

/** What these ports use of packages/database. */
export type PublicStatsQueries = Pick<
  typeof DatabaseModule,
  'withTransaction' | 'listPublicSeasons' | 'standingsReadStore'
>;

const statistics = 'public statistics';
const refused = async (): Promise<never> => notOnTheDatabaseYet(statistics);

export function databasePublicStats(
  database: PublicStatsQueries,
  db: DatabaseHandle,
): PublicStatsPorts {
  const inLeague = <T>(leagueId: string, work: (scope: LeagueScope) => Promise<T>): Promise<T> =>
    database.withTransaction(db, { leagueId }, work);
  return {
    seasonsOf: async (leagueId) =>
      (await inLeague(leagueId, (scope) => database.listPublicSeasons(scope))).map((season) => ({
        id: season.id,
        name: season.name,
        slug: season.slug,
        isCurrent: season.isCurrent,
      })),
    settingsOf: refused,
    readStoreOf: (leagueId) =>
      readStore((work) => inLeague(leagueId, (scope) => work(database.standingsReadStore(scope)))),
    // The standings' five reads in one transaction: one snapshot of the season, never a
    // table half from before a result and half from after it.
    standingsOf: (leagueId, seasonId) =>
      isId(seasonId)
        ? inLeague(leagueId, (scope) =>
            readStandings(
              readStore((work) => work(database.standingsReadStore(scope))),
              { seasonId },
            ),
          )
        : Promise.resolve(fail({ code: 'season-not-found' })),
  };
}

/** A store's reads through `read`, each checking its season id first; the statistics' refuse. */
function readStore(
  read: <T>(work: (store: StandingsReadStore) => Promise<T>) => Promise<T>,
): StandingsReadStore {
  // A season id that is not a UUID is no season, asked of no database.
  const ofSeason =
    <T>(none: T, work: (store: StandingsReadStore, seasonId: string) => Promise<T>) =>
    (seasonId: string): Promise<T> =>
      isId(seasonId) ? read((store) => work(store, seasonId)) : Promise.resolve(none);
  return {
    findSeason: ofSeason(undefined, (store, id) => store.findSeason(id)),
    teams: ofSeason([], (store, id) => store.teams(id)),
    divisions: ofSeason([], (store, id) => store.divisions(id)),
    standingsRows: ofSeason([], (store, id) => store.standingsRows(id)),
    adjustments: ofSeason([], (store, id) => store.adjustments(id)),
    seasonStatKeys: refused,
    playerTotals: refused,
    playerTeams: refused,
    decidedGamesOf: refused,
    teamStatTotals: refused,
    people: refused,
  };
}
