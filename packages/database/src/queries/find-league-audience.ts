// Who plays in the scope's league (adult, youth or mixed), which decides who counts as a
// child when their age is not known (R-15, R-25). A league that cannot be read, or an
// audience this code does not know, is treated as youth: the careful reading, as the
// public roster does (list-public-roster.ts).
import type { Audience } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findLeagueAudience(scope: LeagueScope): Promise<Audience> {
  const league = await transactionOf(scope)
    .selectFrom('leagues')
    .select('audience')
    .where('id', '=', scope.leagueId)
    .executeTakeFirst();
  return league?.audience === 'adult' || league?.audience === 'mixed' ? league.audience : 'youth';
}
