// One team's roster for its public page (P7 §2, R-17): those on it now, then those who
// left, marked as former, each by place. A name comes only from the one name function
// (T-81) under the league's audience and name rules; a person's id, birth date and
// contact details are never read into the answer (T-29, R-16).
import { publicRosterLine, type PublicDisplay, type PublicRoster } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listPublicRoster(
  scope: LeagueScope,
  teamId: string,
  display: PublicDisplay,
): Promise<PublicRoster> {
  const trx = transactionOf(scope);
  const league = await trx
    .selectFrom('leagues')
    .select('audience')
    .where('id', '=', scope.leagueId)
    .executeTakeFirst();
  const rows = await trx
    .selectFrom('roster_entries')
    .innerJoin('teams', (join) =>
      join
        .onRef('teams.league_id', '=', 'roster_entries.league_id')
        .onRef('teams.id', '=', 'roster_entries.team_id'),
    )
    .innerJoin('seasons', (join) =>
      join
        .onRef('seasons.league_id', '=', 'teams.league_id')
        .onRef('seasons.id', '=', 'teams.season_id'),
    )
    .innerJoin('people', (join) =>
      join
        .onRef('people.league_id', '=', 'roster_entries.league_id')
        .onRef('people.id', '=', 'roster_entries.person_id'),
    )
    .select([
      'roster_entries.id as entry_id',
      'roster_entries.jersey_number as jersey_number',
      'roster_entries.role as role',
      sql<string | null>`to_char(roster_entries.left_on, 'YYYY-MM-DD')`.as('left_on'),
      'people.first_name as first_name',
      'people.last_name as last_name',
      'people.is_minor as is_minor',
      'people.visibility as visibility',
      'people.deleted_at as person_deleted_at',
    ])
    .where('roster_entries.league_id', '=', scope.leagueId)
    .where('roster_entries.team_id', '=', teamId)
    .where('teams.deleted_at', 'is', null)
    .where('seasons.deleted_at', 'is', null)
    .where('seasons.status', 'in', ['active', 'completed'])
    .orderBy(sql`roster_entries.left_on asc nulls first`)
    .orderBy('roster_entries.sort')
    .orderBy('roster_entries.id')
    .execute();
  // An unknown audience is treated as youth: the careful reading.
  const audience =
    league?.audience === 'adult' || league?.audience === 'mixed' ? league.audience : 'youth';
  return {
    lines: rows.map((row) =>
      publicRosterLine(
        {
          entryId: row.entry_id,
          jerseyNumber: row.jersey_number,
          role: row.role,
          leftOn: row.left_on,
          firstName: row.first_name,
          lastName: row.last_name,
          isMinor: row.is_minor,
          nameRequest: row.visibility,
          personBinned: row.person_deleted_at !== null,
        },
        audience,
        display,
      ),
    ),
  };
}
