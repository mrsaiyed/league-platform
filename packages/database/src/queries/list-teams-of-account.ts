// The teams of one season the scope's account has a roster place on now, by team id: what
// a league whose start page is "my team" sends a signed-in member to (U-5, step 2.44; on
// the database, step 2.93 part 3). The account is the transaction's own (the session's,
// never one from the request), and its person is the one linked to the profile the
// account is itself ('self', as the made-up world's person "is" an account); a place it
// has left, a team in the bin and a person in the bin do not count. Team ids only: no
// name, no person, nothing else of anyone. No account set reads nothing.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listTeamsOfAccount(scope: LeagueScope, seasonId: string): Promise<string[]> {
  const accountId = scope.accountId;
  if (accountId === null) return [];
  const rows = await transactionOf(scope)
    .selectFrom('roster_entries')
    .innerJoin('teams', (join) =>
      join
        .onRef('teams.league_id', '=', 'roster_entries.league_id')
        .onRef('teams.id', '=', 'roster_entries.team_id'),
    )
    .innerJoin('people', (join) =>
      join
        .onRef('people.league_id', '=', 'roster_entries.league_id')
        .onRef('people.id', '=', 'roster_entries.person_id'),
    )
    // profile_access belongs to no league: it is fenced to the transaction's account
    // (0005), and asked here for that account only.
    .innerJoin('profile_access', 'profile_access.profile_id', 'people.profile_id')
    .select('roster_entries.team_id as team_id')
    .distinct()
    .where('roster_entries.league_id', '=', scope.leagueId)
    .where('teams.league_id', '=', scope.leagueId)
    .where('people.league_id', '=', scope.leagueId)
    .where('teams.season_id', '=', seasonId)
    .where('profile_access.account_id', '=', accountId)
    .where('profile_access.relation', '=', 'self')
    .where('roster_entries.left_on', 'is', null)
    .where('teams.deleted_at', 'is', null)
    .where('people.deleted_at', 'is', null)
    .orderBy('roster_entries.team_id')
    .execute();
  return rows.map((row) => row.team_id);
}
