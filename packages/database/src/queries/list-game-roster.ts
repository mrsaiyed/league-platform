// The players (not coaches) on the rosters of a game's two teams in the scope's league,
// for the box score grid (step 2.64): those who have left the team since included
// (R-17), as they may have played the game. A person with several entries on one team
// is listed once, by the entry still open if there is one. A person in the bin, and a
// team in the bin, are not listed (A-5, T-45). Only names, the person's own request and
// the jersey are read, never birth dates or contact details (R-16): whether they are a
// child is worked out in SQL (R-28). Names leave only as the scoring screens' rule gives
// them (R-33, scoringNames, under the settings and the league's audience the caller read
// and hands in, scoringNameSettingsOf): no recorded name it keeps back is in the answer.
// One statement; every table is filtered to the league (T-28).
import {
  namedRoster,
  type GameRosterPlayer,
  type RecordedRosterPlayer,
  type ScoringNameView,
} from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { isMinorSql } from './minor-by-age-sql.ts';

export async function listGameRoster(
  scope: LeagueScope,
  gameId: string,
  names: ScoringNameView,
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
    .innerJoin('teams as t', (join) =>
      join.onRef('t.league_id', '=', 'r.league_id').onRef('t.id', '=', 'r.team_id'),
    )
    .innerJoin('people', (join) =>
      join.onRef('people.league_id', '=', 'r.league_id').onRef('people.id', '=', 'r.person_id'),
    )
    .select([
      'r.team_id',
      'r.person_id',
      'r.jersey_number',
      'r.left_on',
      'r.added_at_game_id',
      'r.needs_review',
      'people.first_name',
      'people.last_name',
      'people.visibility',
      // R-28: worked out here, so the birth date never leaves the database.
      isMinorSql().as('is_minor'),
      'g.home_team_id',
    ])
    .where('g.league_id', '=', scope.leagueId)
    .where('r.league_id', '=', scope.leagueId)
    .where('t.league_id', '=', scope.leagueId)
    .where('people.league_id', '=', scope.leagueId)
    .where('t.deleted_at', 'is', null)
    .where('people.deleted_at', 'is', null)
    .where('g.id', '=', gameId)
    .where('r.role', 'in', ['player', 'captain'])
    .orderBy('r.left_on', (o) => o.asc().nullsFirst())
    .orderBy('r.sort')
    .orderBy('r.id')
    .execute();
  const seen = new Set<string>();
  const players: RecordedRosterPlayer[] = [];
  for (const row of rows) {
    const key = `${row.team_id}/${row.person_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    players.push({
      teamId: row.team_id,
      personId: row.person_id,
      firstName: row.first_name,
      lastName: row.last_name,
      isMinor: row.is_minor,
      nameRequest: row.visibility,
      jerseyNumber: row.jersey_number,
      left: row.left_on !== null,
      // Added at a scorer's table, and waiting for review (S-6, S-45; record 058).
      addedAtGameId: row.added_at_game_id,
      needsReview: row.needs_review,
    });
  }
  // Home team first, each team's players in roster order (open entries first).
  const home = rows[0]?.home_team_id;
  const ordered = [
    ...players.filter((p) => p.teamId === home),
    ...players.filter((p) => p.teamId !== home),
  ];
  return namedRoster(ordered, names);
}
