// The public standings' and statistics' ports on the database (step 2.93, parts 2 and 3,
// records 069 and 070): the seasons a visitor may pick, the standings and the
// statistics, through packages/database's own standings read store, as the stand-in reads
// its one world (stand-in-public-stats.ts). Each read is one transaction set to the
// league it is for, never one from the request (T-28). An id that is not a UUID is no
// row, asked of no database.
//
// Names (T-81): who sees players' names is the league's own settings (step 2.126) and
// who plays there its own audience, read from the league's rows. A page that shows a
// name reads it through statisticsOf, where the statistics, the people and those settings
// are read in one transaction, so a name is shown by the setting saved when it was read.
// The read store alone (readStoreOf) does not read people: it refuses, so no page can put
// a name beside a setting read at another moment. The rules of who is shown and how stay
// in core (statisticsSource, showName); these ports only fetch.
import { fail, readNamePolicy, readStandings, type StandingsReadStore } from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle, LeagueScope } from '@srleagues/database';
import { isDatabaseId as isId } from './database-id.ts';
import type { PublicStatsPorts, PublicStatsSettings } from './public-stats.ts';

/** What these ports use of packages/database. */
export type PublicStatsQueries = Pick<
  typeof DatabaseModule,
  | 'withTransaction'
  | 'listPublicSeasons'
  | 'standingsReadStore'
  | 'findLeagueAudience'
  | 'listSettingValues'
>;

/**
 * The least number of games a player needs to be ranked among the leaders. No league
 * setting holds one yet, so on the database there is none (record 070: a question for
 * the founder; the made-up world's leagues carry one of their own).
 */
const noMinimumGames = 0;

export class NamesOnlyWithSettings extends Error {
  constructor() {
    super(
      'People are read only with the league’s name settings, in one transaction: use statisticsOf (record 070).',
    );
    this.name = 'NamesOnlyWithSettings';
  }
}

export function databasePublicStats(
  database: PublicStatsQueries,
  db: DatabaseHandle,
): PublicStatsPorts {
  const inLeague = <T>(leagueId: string, work: (scope: LeagueScope) => Promise<T>): Promise<T> =>
    database.withTransaction(db, { leagueId }, work);
  // The league's own audience and name settings, in the scope's transaction.
  const settingsIn = async (scope: LeagueScope): Promise<PublicStatsSettings> => ({
    audience: await database.findLeagueAudience(scope),
    namePolicy: await readNamePolicy({
      settingRows: (key, places) => database.listSettingValues(scope, key, places),
    }),
    minimumGames: noMinimumGames,
  });
  return {
    seasonsOf: async (leagueId) =>
      (await inLeague(leagueId, (scope) => database.listPublicSeasons(scope))).map((season) => ({
        id: season.id,
        name: season.name,
        slug: season.slug,
        isCurrent: season.isCurrent,
      })),
    settingsOf: (leagueId) => inLeague(leagueId, settingsIn),
    readStoreOf: (leagueId) =>
      readStore(
        (work) => inLeague(leagueId, (scope) => work(database.standingsReadStore(scope))),
        false,
      ),
    // The standings' five reads in one transaction: one snapshot of the season, never a
    // table half from before a result and half from after it.
    standingsOf: (leagueId, seasonId) =>
      isId(seasonId)
        ? inLeague(leagueId, (scope) =>
            readStandings(
              readStore((work) => work(database.standingsReadStore(scope)), false),
              { seasonId },
            ),
          )
        : Promise.resolve(fail({ code: 'season-not-found' })),
    // A page's statistics with the league's settings, all in one transaction (T-81).
    statisticsOf: (leagueId, work) =>
      inLeague(leagueId, async (scope) =>
        work({
          store: readStore((read) => read(database.standingsReadStore(scope)), true),
          settings: await settingsIn(scope),
        }),
      ),
  };
}

/**
 * A store's reads through `read`, each checking its ids first: a season id or a person
 * id that is not a UUID is no row, asked of no database. People are read only where
 * `withPeople` says the league's settings are read in the same transaction.
 */
function readStore(
  read: <T>(work: (store: StandingsReadStore) => Promise<T>) => Promise<T>,
  withPeople: boolean,
): StandingsReadStore {
  const ofSeason =
    <T>(none: T, work: (store: StandingsReadStore, seasonId: string) => Promise<T>) =>
    (seasonId: string): Promise<T> =>
      isId(seasonId) ? read((store) => work(store, seasonId)) : Promise.resolve(none);
  return {
    findSeason: ofSeason(undefined, (store, id) => store.findSeason(id)),
    seasonStatKeys: ofSeason(undefined, (store, id) => store.seasonStatKeys(id)),
    teams: ofSeason([], (store, id) => store.teams(id)),
    divisions: ofSeason([], (store, id) => store.divisions(id)),
    standingsRows: ofSeason([], (store, id) => store.standingsRows(id)),
    adjustments: ofSeason([], (store, id) => store.adjustments(id)),
    playerTotals: ofSeason([], (store, id) => store.playerTotals(id)),
    playerTeams: ofSeason([], (store, id) => store.playerTeams(id)),
    decidedGamesOf: (seasonId, personIds) =>
      isId(seasonId)
        ? read((store) => store.decidedGamesOf(seasonId, personIds.filter(isId)))
        : Promise.resolve([]),
    teamStatTotals: ofSeason([], (store, id) => store.teamStatTotals(id)),
    people: async (personIds) => {
      if (!withPeople) throw new NamesOnlyWithSettings();
      const ids = personIds.filter(isId);
      return ids.length === 0 ? [] : read((store) => store.people(ids));
    },
  };
}
