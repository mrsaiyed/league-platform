// How many different people are on the current rosters of these teams of the season (not
// in the bin) in the scope's league, for "4 teams and 38 people affected" (P7 §4.4). A
// person on two of the teams counts once; one who left a team, or is in the bin, does not.
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function countPeopleOnTeams(
  scope: LeagueScope,
  seasonId: string,
  teamIds: readonly string[],
): Promise<number> {
  if (teamIds.length === 0) return 0;
  const row = await transactionOf(scope)
    .selectFrom('roster_entries as r')
    .innerJoin('teams as t', (join) =>
      join.onRef('t.league_id', '=', 'r.league_id').onRef('t.id', '=', 'r.team_id'),
    )
    .innerJoin('people as p', (join) =>
      join.onRef('p.league_id', '=', 'r.league_id').onRef('p.id', '=', 'r.person_id'),
    )
    .select(sql<string>`count(distinct r.person_id)`.as('people'))
    .where('r.league_id', '=', scope.leagueId)
    .where('t.season_id', '=', seasonId)
    .where('t.deleted_at', 'is', null)
    .where('r.team_id', 'in', [...teamIds])
    .where('r.left_on', 'is', null)
    .where('p.deleted_at', 'is', null)
    .executeTakeFirst();
  return Number(row?.people ?? 0);
}
