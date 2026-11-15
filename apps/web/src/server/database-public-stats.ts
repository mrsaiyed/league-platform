// The public standings' ports on the database (step 2.93 part 2): the seasons a visitor
// may pick and the standings reads, through packages/database's own standings read
// store, as the stand-in reads its one world (stand-in-public-stats.ts). Each read is
// one transaction set to the league it is for, never one from the request (T-28).
//
// Only what shows teams has moved: the reads the standings and a team's record make
// (the season, its teams, divisions, standings rows and adjustments). The statistics'
// reads, which show people, and the league's name settings they need refuse until part
// 3, which reads who sees players' names from the league itself (step 2.126, T-81).
// The home page's leaders are such a read: it leaves them out when the read fails.
import type { StandingsReadStore } from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle, LeagueScope } from '@srleagues/database';
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
    readStoreOf: (leagueId): StandingsReadStore => {
      const read = <T>(work: (store: StandingsReadStore) => Promise<T>) =>
        inLeague(leagueId, (scope) => work(database.standingsReadStore(scope)));
      return {
        findSeason: (seasonId) => read((store) => store.findSeason(seasonId)),
        teams: (seasonId) => read((store) => store.teams(seasonId)),
        divisions: (seasonId) => read((store) => store.divisions(seasonId)),
        standingsRows: (seasonId) => read((store) => store.standingsRows(seasonId)),
        adjustments: (seasonId) => read((store) => store.adjustments(seasonId)),
        seasonStatKeys: refused,
        playerTotals: refused,
        playerTeams: refused,
        decidedGamesOf: refused,
        teamStatTotals: refused,
        people: refused,
      };
    },
  };
}
