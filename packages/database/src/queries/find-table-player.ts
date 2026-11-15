// A person's current entry (not left) on a team of the scope's league, with the name on
// their person and where the entry was added (0010), for the scorer's table (record
// 058). A person or a team in the bin is not found. Every table is filtered to the
// league (T-28).
import type { TablePlayer } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findTablePlayer(
  scope: LeagueScope,
  teamId: string,
  personId: string,
): Promise<TablePlayer | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('roster_entries as r')
    .innerJoin('people as p', (join) =>
      join.onRef('p.league_id', '=', 'r.league_id').onRef('p.id', '=', 'r.person_id'),
    )
    .innerJoin('teams as t', (join) =>
      join.onRef('t.league_id', '=', 'r.league_id').onRef('t.id', '=', 'r.team_id'),
    )
    .select([
      'r.id',
      'r.team_id',
      'r.person_id',
      'r.jersey_number',
      'r.added_at_game_id',
      'p.first_name',
      'p.last_name',
    ])
    .where('r.league_id', '=', scope.leagueId)
    .where('p.league_id', '=', scope.leagueId)
    .where('t.league_id', '=', scope.leagueId)
    .where('r.team_id', '=', teamId)
    .where('r.person_id', '=', personId)
    .where('r.left_on', 'is', null)
    .where('p.deleted_at', 'is', null)
    .where('t.deleted_at', 'is', null)
    .executeTakeFirst();
  return row === undefined
    ? undefined
    : {
        entryId: row.id,
        teamId: row.team_id,
        personId: row.person_id,
        jerseyNumber: row.jersey_number,
        firstName: row.first_name,
        lastName: row.last_name,
        addedAtGameId: row.added_at_game_id,
      };
}
