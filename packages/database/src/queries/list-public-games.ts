// A season's published games for the public pages, in time order (those with no time
// last), all of them or one team's (P7 §4, U-5). Built field by field (T-29): teams
// by name and color, the venue's name and place, scores, status, a final game's overtime
// periods (0021) and its regulation periods, and no person.
// A game in the bin, or one of a season still being set up, is not there.
import { sql } from 'kysely';
import {
  resultBeingCorrected,
  rulesOfGame,
  type MarkResult,
  type PublicGame,
} from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

/** A public game and the round it belongs to, if any. */
export type PublicGameInRound = PublicGame & { readonly roundId: string | null };

export async function listPublicGames(
  scope: LeagueScope,
  seasonId: string,
  teamId?: string,
): Promise<PublicGameInRound[]> {
  let query = transactionOf(scope)
    .selectFrom('games')
    .innerJoin('seasons', (join) =>
      join
        .onRef('seasons.league_id', '=', 'games.league_id')
        .onRef('seasons.id', '=', 'games.season_id'),
    )
    .innerJoin('leagues', 'leagues.id', 'games.league_id')
    .innerJoin('teams as home', (join) =>
      join
        .onRef('home.league_id', '=', 'games.league_id')
        .onRef('home.id', '=', 'games.home_team_id'),
    )
    .innerJoin('teams as away', (join) =>
      join
        .onRef('away.league_id', '=', 'games.league_id')
        .onRef('away.id', '=', 'games.away_team_id'),
    )
    .leftJoin('divisions', (join) =>
      join
        .onRef('divisions.league_id', '=', 'games.league_id')
        .onRef('divisions.id', '=', 'games.division_id'),
    )
    .leftJoin('venues', (join) =>
      join
        .onRef('venues.league_id', '=', 'games.league_id')
        .onRef('venues.id', '=', 'games.venue_id'),
    )
    .leftJoin('courts', (join) =>
      join
        .onRef('courts.league_id', '=', 'games.league_id')
        .onRef('courts.id', '=', 'games.court_id'),
    )
    .select([
      'games.id as id',
      'games.round_id as round_id',
      'games.game_number as game_number',
      'games.starts_at as starts_at',
      sql<string | null>`to_char(games.starts_at at time zone leagues.time_zone, 'YYYY-MM-DD')`.as(
        'local_date',
      ),
      'games.status as status',
      'games.home_score as home_score',
      'games.away_score as away_score',
      'games.overtime_periods as overtime_periods',
      // The rules it is played under, for its regulation periods only.
      'games.format as format',
      'seasons.rules as season_rules',
      'home.id as home_id',
      'home.slug as home_slug',
      'home.name as home_name',
      'home.color as home_color',
      sql<boolean>`home.deleted_at is not null`.as('home_removed'),
      'away.id as away_id',
      'away.slug as away_slug',
      'away.name as away_name',
      'away.color as away_color',
      sql<boolean>`away.deleted_at is not null`.as('away_removed'),
      'divisions.name as division_name',
      'venues.name as venue_name',
      'venues.address as venue_address',
      'venues.map_link as venue_map_link',
      'courts.name as court_name',
    ])
    .where('games.league_id', '=', scope.leagueId)
    .where('games.season_id', '=', seasonId)
    .where('games.deleted_at', 'is', null)
    .where('seasons.deleted_at', 'is', null)
    .where('seasons.status', 'in', ['active', 'completed']);
  if (teamId !== undefined) {
    query = query.where((eb) =>
      eb.or([eb('games.home_team_id', '=', teamId), eb('games.away_team_id', '=', teamId)]),
    );
  }
  const rows = await query
    .orderBy(sql`games.starts_at asc nulls last`)
    .orderBy(sql`games.game_number asc nulls last`)
    .orderBy('games.id')
    .execute();
  const stood = await resultsAsTheyStood(
    scope,
    rows.filter((row) => row.status !== 'final' && row.status !== 'forfeit').map((row) => row.id),
  );
  return rows.map((row) => ({
    id: row.id,
    roundId: row.round_id,
    number: row.game_number,
    startsAt: row.starts_at === null ? null : row.starts_at.toISOString(),
    localDate: row.local_date,
    status: row.status,
    homeTeam: {
      id: row.home_id,
      slug: row.home_slug,
      name: row.home_name,
      color: row.home_color,
      removed: row.home_removed,
    },
    awayTeam: {
      id: row.away_id,
      slug: row.away_slug,
      name: row.away_name,
      color: row.away_color,
      removed: row.away_removed,
    },
    homeScore: row.home_score,
    awayScore: row.away_score,
    overtimePeriods: row.overtime_periods,
    periods: rulesOfGame(row.format, row.season_rules).gameFormat.periods === 2 ? 2 : 4,
    divisionName: row.division_name,
    venue:
      row.venue_name === null
        ? null
        : { name: row.venue_name, address: row.venue_address, mapLink: row.venue_map_link },
    courtName: row.court_name,
    ...(stood.has(row.id) ? { beingCorrected: stood.get(row.id) } : {}),
  }));
}

const resultOf = (stored: unknown): MarkResult => {
  if (typeof stored !== 'object' || stored === null) return {};
  const field = (key: string) => (key in stored ? (stored as Record<string, unknown>)[key] : null);
  const number = (value: unknown) => (typeof value === 'number' ? value : null);
  const status = field('status');
  return {
    status: typeof status === 'string' ? status : null,
    homeScore: number(field('homeScore')),
    awayScore: number(field('awayScore')),
  };
};

/**
 * The result as it stood of each listed game a reopen is open on (S-47, T-383), read in one
 * go from the games' corrections under the league's filter, as
 * find-game-result-being-corrected.ts reads one game's. Only games not decided now are asked.
 */
async function resultsAsTheyStood(
  scope: LeagueScope,
  gameIds: readonly string[],
): Promise<Map<string, MarkResult>> {
  const found = new Map<string, MarkResult>();
  if (gameIds.length === 0) return found;
  const rows = await transactionOf(scope)
    .selectFrom('game_corrections')
    .innerJoin('games', (join) =>
      join
        .onRef('games.league_id', '=', 'game_corrections.league_id')
        .onRef('games.id', '=', 'game_corrections.game_id'),
    )
    .select([
      'game_corrections.game_id as game_id',
      'game_corrections.before as before',
      'game_corrections.after as after',
      'games.status as status',
    ])
    .where('game_corrections.league_id', '=', scope.leagueId)
    .where('game_corrections.game_id', 'in', [...gameIds])
    .orderBy('game_corrections.created_at', 'asc')
    .orderBy('game_corrections.id', 'asc')
    .execute();
  const byGame = new Map<string, typeof rows>();
  for (const row of rows) byGame.set(row.game_id, [...(byGame.get(row.game_id) ?? []), row]);
  for (const [gameId, corrections] of byGame) {
    const result = resultBeingCorrected(
      corrections.map((row) => ({
        on: '',
        before: resultOf(row.before),
        after: resultOf(row.after),
      })),
      { status: corrections[0]?.status ?? '' },
    );
    if (result !== undefined) found.set(gameId, result);
  }
  return found;
}
