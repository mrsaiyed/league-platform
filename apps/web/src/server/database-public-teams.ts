// The public teams' ports on the database, as far as step 2.93 part 2 needs them (record
// 069): the league's start page for members, which the league home reads before it shows
// anything (start-redirect.ts), read from the league's own settings as League settings
// saves them, through the same lookup the stand-in uses (stand-in-world-reads.ts). The
// team pages' rosters and a member's teams show people: they refuse until part 3.
import { lookupSetting, membersStartPage } from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle } from '@srleagues/database';
import { notOnTheDatabaseYet } from './not-on-the-database-yet.ts';
import type { PublicTeamsPorts } from './public-teams.ts';

/** What these ports use of packages/database. */
export type PublicTeamsQueries = Pick<
  typeof DatabaseModule,
  'withTransaction' | 'listSettingValues'
>;

const teamPages = 'public teams pages';

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
    rosterOf: async () => notOnTheDatabaseYet(teamPages),
    teamIdsOfAccount: async () => notOnTheDatabaseYet(teamPages),
  };
}
