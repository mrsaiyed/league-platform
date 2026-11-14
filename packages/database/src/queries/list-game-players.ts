// The players of a game's two teams in the scope's league (T3 §7): everyone with a
// player's or captain's roster entry on either team, with the number on it. One who
// left and joined again is listed with the entry they are on now first. Names are
// not read: a box score line never copies one (T-220).
import type { GamePlayer } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listGamePlayers(scope: LeagueScope, gameId: string): Promise<GamePlayer[]> {
  const rows = await transactionOf(scope)
    .selectFrom('roster_entries')
    .innerJoin('games', (join) =>
      join
        .onRef('games.league_id', '=', 'roster_entries.league_id')
        .on((eb) =>
          eb.or([
            eb('games.home_team_id', '=', eb.ref('roster_entries.team_id')),
            eb('games.away_team_id', '=', eb.ref('roster_entries.team_id')),
          ]),
        ),
    )
    .select(['roster_entries.person_id', 'roster_entries.team_id', 'roster_entries.jersey_number'])
    .where('roster_entries.league_id', '=', scope.leagueId)
    .where('games.id', '=', gameId)
    .where('roster_entries.role', 'in', ['player', 'captain'])
    .orderBy('roster_entries.team_id')
    .orderBy('roster_entries.person_id')
    .orderBy('roster_entries.left_on', (o) => o.asc().nullsFirst())
    .execute();
  return rows.map((row) => ({
    personId: row.person_id,
    teamId: row.team_id,
    jerseyNumber: row.jersey_number,
  }));
}
