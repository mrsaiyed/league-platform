// Each league's name and design on the database (step 2.93 part 3, record 070): the name
// its owner gave it, read from the league's own row in a transaction set to that league
// (findLeagueName reads the name and nothing else). The database holds no design yet: the
// design editor and its tables (T3's `sites` and `site_releases`) come later, so every
// league here takes the neutral starting design (league-site.ts). Asked only for a league
// the gate has already let the person see (U-9).
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle } from '@srleagues/database';
import { isDatabaseId as isId } from './database-id.ts';
import type { LeagueSiteLookup } from './league-site.ts';

/** What this source uses of packages/database. */
export type LeagueSitesQueries = Pick<typeof DatabaseModule, 'withTransaction' | 'findLeagueName'>;

export function databaseLeagueSites(
  database: LeagueSitesQueries,
  db: DatabaseHandle,
): LeagueSiteLookup {
  return async (leagueId) => {
    if (!isId(leagueId)) return undefined;
    const name = await database.withTransaction(db, { leagueId: leagueId.toLowerCase() }, (scope) =>
      database.findLeagueName(scope),
    );
    return name === undefined ? undefined : { name };
  };
}
