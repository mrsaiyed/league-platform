// The public teams' ports on the database (step 2.93, parts 2 and 3, records 069 and 070):
// the league's start page for members, read from the league's own settings as League
// settings saves them, through the same lookup the stand-in uses (stand-in-world-reads.ts);
// one team's roster for its page; and the teams a signed-in member plays on, for a league
// whose start page is "my team".
//
// A roster shows people (T-81): its names come from core's one publicRosterLine, with the
// league's own name settings and its own audience read in the same transaction as the
// people (listPublicRoster reads the audience from the league's row). Each read is one
// transaction set to the league it is for, never one from the request (T-28); an id that
// is not a UUID is no row, asked of no database.
import { lookupSetting, membersStartPage, readNamePolicy } from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle } from '@srleagues/database';
import { isDatabaseId as isId } from './database-id.ts';
import type { PublicTeamsPorts } from './public-teams.ts';

/** What these ports use of packages/database. */
export type PublicTeamsQueries = Pick<
  typeof DatabaseModule,
  'withTransaction' | 'listSettingValues' | 'listPublicRoster' | 'listTeamsOfAccount'
>;

export function databasePublicTeams(
  database: PublicTeamsQueries,
  db: DatabaseHandle,
): PublicTeamsPorts {
  return {
    startPageOf: async (leagueId) => {
      // The league's own value only: the start page is a league setting.
      const rows = await database.withTransaction(db, { leagueId }, (scope) =>
        database.listSettingValues(scope, membersStartPage.key, {}),
      );
      return lookupSetting(
        membersStartPage,
        rows.filter((row) => row.level === 'league'),
      ).value;
    },
    rosterOf: async (leagueId, teamId, viewer) => {
      if (!isId(teamId)) return { lines: [] };
      return database.withTransaction(db, { leagueId }, async (scope) => {
        const policy = await readNamePolicy({
          settingRows: (key, places) => database.listSettingValues(scope, key, places),
        });
        return database.listPublicRoster(scope, teamId, { viewer, policy });
      });
    },
    // The account is the session's (the caller passes only that); it is set on the
    // transaction, and the query asks for that account's own places only.
    teamIdsOfAccount: async (leagueId, seasonId, accountId) => {
      if (!isId(seasonId) || !isId(accountId)) return [];
      return database.withTransaction(
        db,
        { leagueId, accountId: accountId.toLowerCase() },
        (scope) => database.listTeamsOfAccount(scope, seasonId),
      );
    },
  };
}
