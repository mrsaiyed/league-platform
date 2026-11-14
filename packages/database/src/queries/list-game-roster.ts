// The players (not coaches) on the rosters of a game's two teams in the scope's league,
// for the box score grid (step 2.64): those who have left the team since included
// (R-17), as they may have played the game. A person with several entries on one team
// is listed once, by the entry still open if there is one. Only names and the jersey
// are read, never birth dates or contact details (R-16). Every table is filtered to
// the league (T-28).
import type { GameRosterPlayer } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listGameRoster(
  scope: LeagueScope,
  gameId: string,
): Promise<GameRosterPlayer[]> {
  const rows = await transactionOf(scope)
    .selectFrom('games as g')
    .innerJoin('roster_entries as r', (join) =>
      join
        .onRef('r.league_id', '=', 'g.league_id')
        .on((eb) =>
          eb.or([
            eb('r.team_id', '=', eb.ref('g.home_team_id')),
            eb('r.team_id', '=', eb.ref('g.away_team_id')),
          ]),
        ),
    )
    .innerJoin('people as p', (join) =>
      join.onRef('p.league_id', '=', 'r.league_id').onRef('p.id', '=', 'r.person_id'),
    )
    .select([
      'r.team_id',
      'r.person_id',
      'r.jersey_number',
      'r.left_on',
      'p.first_name',
      'p.last_name',
      'g.home_team_id',
    ])
    .where('g.league_id', '=', scope.leagueId)
    .where('r.league_id', '=', scope.leagueId)
    .where('p.league_id', '=', scope.leagueId)
    .where('g.id', '=', gameId)
    .where('r.role', 'in', ['player', 'captain'])
    .orderBy('r.left_on', (o) => o.asc().nullsFirst())
    .orderBy('r.sort')
    .orderBy('r.id')
    .execute();
  const seen = new Set<string>();
  const players: GameRosterPlayer[] = [];
  for (const row of rows) {
    const key = `${row.team_id}/${row.person_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    players.push({
      teamId: row.team_id,
      personId: row.person_id,
      firstName: row.first_name,
      lastName: row.last_name,
      jerseyNumber: row.jersey_number,
      left: row.left_on !== null,
    });
  }
  // Home team first, each team's players in roster order (open entries first).
  const home = rows[0]?.home_team_id;
  return [...players.filter((p) => p.teamId === home), ...players.filter((p) => p.teamId !== home)];
}
