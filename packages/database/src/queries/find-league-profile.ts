// The profile of the league the scope is for (step 2.125): how people reach it, where it
// plays, its clock, its listing and who plays. Undefined if it is in the bin or out of sight.
import type { Audience, LeagueProfile } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findLeagueProfile(scope: LeagueScope): Promise<LeagueProfile | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('leagues')
    .select(['contact_email', 'city', 'time_zone', 'listed', 'audience'])
    .where('id', '=', scope.leagueId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (row === undefined) return undefined;
  return {
    contactEmail: row.contact_email,
    city: row.city,
    timeZone: row.time_zone,
    listed: row.listed,
    // The table allows only these three (0003, leagues_audience).
    audience: row.audience as Audience,
  };
}
