// One published game's number, where it is played and which season's schedule it is on,
// for the top of the game's public page (step 2.93): one row, not a whole season. Built
// field by field (T-29): no team, score or person. Undefined when the game is not in that
// season, is in the bin, or its season is still being set up (or in the bin), as on the
// public schedule (list-public-games.ts).
import type { PublicGame } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export type PublicGameFactsRow = Pick<PublicGame, 'number' | 'venue' | 'courtName'> & {
  readonly season: { readonly slug: string; readonly isCurrent: boolean };
};

export async function findPublicGameFacts(
  scope: LeagueScope,
  seasonId: string,
  gameId: string,
): Promise<PublicGameFactsRow | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('games')
    .innerJoin('seasons', (join) =>
      join
        .onRef('seasons.league_id', '=', 'games.league_id')
        .onRef('seasons.id', '=', 'games.season_id'),
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
      'games.game_number as game_number',
      'venues.name as venue_name',
      'venues.address as venue_address',
      'venues.map_link as venue_map_link',
      'courts.name as court_name',
      'seasons.slug as season_slug',
      'seasons.is_current as is_current',
    ])
    .where('games.league_id', '=', scope.leagueId)
    .where('games.season_id', '=', seasonId)
    .where('games.id', '=', gameId)
    .where('games.deleted_at', 'is', null)
    .where('seasons.deleted_at', 'is', null)
    .where('seasons.status', 'in', ['active', 'completed'])
    .executeTakeFirst();
  if (row === undefined) return undefined;
  return {
    number: row.game_number,
    venue:
      row.venue_name === null
        ? null
        : { name: row.venue_name, address: row.venue_address, mapLink: row.venue_map_link },
    courtName: row.court_name,
    season: { slug: row.season_slug, isCurrent: row.is_current },
  };
}
