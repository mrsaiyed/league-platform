// Whether the person is on a roster of the scope's league now: an entry with no
// leaving date (R-17: a player who left stays in the history with a date), on a team
// that is not in the bin (A-16: a place on a team in the bin does not hold a person in
// the league, so they can still be taken off the league list; bringing the team back
// brings its roster back as it was).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function isPersonOnRoster(scope: LeagueScope, personId: string): Promise<boolean> {
  const row = await transactionOf(scope)
    .selectFrom('roster_entries as r')
    .innerJoin('teams as t', (join) =>
      join.onRef('t.league_id', '=', 'r.league_id').onRef('t.id', '=', 'r.team_id'),
    )
    .select('r.id')
    .where('r.league_id', '=', scope.leagueId)
    .where('t.league_id', '=', scope.leagueId)
    .where('r.person_id', '=', personId)
    .where('r.left_on', 'is', null)
    .where('t.deleted_at', 'is', null)
    .limit(1)
    .executeTakeFirst();
  return row !== undefined;
}
