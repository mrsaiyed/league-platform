// The players of a game's two teams in the scope's league (T3 §7): everyone with a
// player's or captain's roster entry on either team, with the number on it, and
// whether that entry was on the team on the game's day. An entry is on the team from
// its joining date to the day before its leaving date; a missing date is open at that
// end (roster_entries, migration 0008). The game's day is its start in the league's
// time zone, or the league's today for a game with no time yet. So a game played
// months ago and transferred later (step 2.58) is judged by the roster it was played
// with, not today's. One who left and joined again is listed with the entry they were
// on that day first, then the one they are on now. Names are not read: a box score
// line never copies one (T-220).
import { sql } from 'kysely';
import type { GamePlayer } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listGamePlayers(scope: LeagueScope, gameId: string): Promise<GamePlayer[]> {
  const day = sql<string>`coalesce(
    (games.starts_at at time zone leagues.time_zone)::date,
    (now() at time zone leagues.time_zone)::date
  )`;
  const onGameDay = sql<boolean>`(
    (roster_entries.joined_on is null or roster_entries.joined_on <= ${day})
    and (roster_entries.left_on is null or ${day} < roster_entries.left_on)
  )`;
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
    .innerJoin('leagues', 'leagues.id', 'games.league_id')
    .select([
      'roster_entries.person_id',
      'roster_entries.team_id',
      'roster_entries.jersey_number',
      onGameDay.as('on_game_day'),
    ])
    .where('roster_entries.league_id', '=', scope.leagueId)
    .where('games.id', '=', gameId)
    .where('roster_entries.role', 'in', ['player', 'captain'])
    .orderBy('roster_entries.team_id')
    .orderBy('roster_entries.person_id')
    .orderBy(onGameDay, (o) => o.desc())
    .orderBy('roster_entries.left_on', (o) => o.asc().nullsFirst())
    .execute();
  return rows.map((row) => ({
    personId: row.person_id,
    teamId: row.team_id,
    jerseyNumber: row.jersey_number,
    onGameDay: row.on_game_day,
  }));
}
