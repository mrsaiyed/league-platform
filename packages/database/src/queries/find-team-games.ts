// What a team of the scope's league has of games, for whether it may go to the bin (A-17):
// how many of its games not in the bin have a final or forfeited result, and those without
// a result yet (scheduled, postponed, or being played now), each with its day in the
// league's own time zone and its round's number, by day. A cancelled game is in neither. A
// team of another league has none.
import type { TeamGameToPlay } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findTeamGames(
  scope: LeagueScope,
  teamId: string,
): Promise<{ readonly played: number; readonly toPlay: readonly TeamGameToPlay[] }> {
  const rows = await transactionOf(scope)
    .selectFrom('games as g')
    .innerJoin('leagues as l', 'l.id', 'g.league_id')
    .leftJoin('rounds as r', (join) =>
      join.onRef('r.league_id', '=', 'g.league_id').onRef('r.id', '=', 'g.round_id'),
    )
    .select([
      'g.id',
      'r.number as round',
      sql<boolean>`g.status in ('final', 'forfeit')`.as('decided'),
      sql<string | null>`to_char(g.starts_at at time zone l.time_zone, 'YYYY-MM-DD')`.as('day'),
    ])
    .where('g.league_id', '=', scope.leagueId)
    .where('g.deleted_at', 'is', null)
    .where((eb) => eb.or([eb('g.home_team_id', '=', teamId), eb('g.away_team_id', '=', teamId)]))
    .where('g.status', 'in', ['final', 'forfeit', 'scheduled', 'postponed', 'live'])
    .orderBy(sql`g.starts_at asc nulls last`)
    .orderBy('g.id')
    .execute();
  return {
    played: rows.filter((row) => row.decided).length,
    toPlay: rows
      .filter((row) => !row.decided)
      .map((row) => ({ id: row.id, date: row.day, round: row.round })),
  };
}
