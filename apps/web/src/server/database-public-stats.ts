// The public standings' and statistics' ports on the database (step 2.93, parts 2 and 3,
// records 069 and 070): the seasons a visitor may pick, the standings and the
// statistics, through packages/database's own standings read store, as the stand-in reads
// its one world (stand-in-public-stats.ts). Each read is one transaction set to the
// league it is for, never one from the request (T-28), opened as a page's read: one
// snapshot (REPEATABLE READ) that writes nothing (READ ONLY), so every statement in it
// sees the league as it was at the first (record 070). An id that is not a UUID is no
// row, asked of no database.
//
// Names (T-81): who sees players' names is the league's own settings (step 2.126) and
// who plays there its own audience, read from the league's rows. A page that shows a
// name reads it through statisticsOf, where the statistics, the people, a team's
// roster and those settings are read in that one snapshot, so a name is shown by the settings as
// they all stood at one moment, never a mix of two saves.
// The read store alone (readStoreOf) does not read people: it refuses, so no page can put
// a name beside a setting read at another moment. The rules of who is shown and how stay
// in core (statisticsSource, showName); these ports only fetch.
import {
  fail,
  lookupSetting,
  minimumGamesToRank,
  readNamePolicy,
  readStandings,
  type StandingsReadStore,
} from '@srleagues/core';
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
  | 'listPublicRoster'
>;

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
    database.withTransaction(db, { leagueId }, work, { snapshot: 'page' });
  // The league's own audience and name settings, in the scope's transaction.
  const settingsIn = async (scope: LeagueScope): Promise<PublicStatsSettings> => ({
    audience: await database.findLeagueAudience(scope),
    namePolicy: await readNamePolicy({
      settingRows: (key, places) => database.listSettingValues(scope, key, places),
    }),
    // The league's own minimum games for leaders, as League settings saves it (P7 §6).
    minimumGames: lookupSetting(
      minimumGamesToRank,
      (await database.listSettingValues(scope, minimumGamesToRank.key, {})).filter(
        (row) => row.level === 'league',
      ),
    ).value,
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
    // The standings' five reads in one snapshot of the season (above), never a table
    // half from before a result and half from after it.
    standingsOf: (leagueId, seasonId) =>
      isId(seasonId)
        ? inLeague(leagueId, (scope) =>
            readStandings(
              readStore((work) => work(database.standingsReadStore(scope)), false),
              { seasonId },
            ),
          )
        : Promise.resolve(fail({ code: 'season-not-found' })),
    // A page's statistics and a team's roster with the league's settings, all in one
    // snapshot (T-81). The roster's names come from core's one publicRosterLine, under the
    // same name settings (listPublicRoster reads the audience from the league's row, in the
    // same snapshot as findLeagueAudience).
    statisticsOf: (leagueId, work) =>
      inLeague(leagueId, async (scope) => {
        const settings = await settingsIn(scope);
        return work({
          store: readStore((read) => read(database.standingsReadStore(scope)), true),
          settings,
          rosterOf: async (teamId, viewer) =>
            isId(teamId)
              ? database.listPublicRoster(scope, teamId, { viewer, policy: settings.namePolicy })
              : { lines: [] },
        });
      }),
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
