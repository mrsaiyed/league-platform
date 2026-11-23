// What the scope's league's games are at its venues and courts (step 2.49): for each venue
// and court a game not in the bin names, how many of them have a final or forfeited result
// and how many have none yet (scheduled, postponed, or being played now); a cancelled game
// is in neither. And every season's schedule draft as stored, whose games core counts too
// (place-games.ts). Every statement names the league, so another league's games and drafts
// are never counted (T-28).
import type { PlaceGamesRecord } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findPlaceGames(scope: LeagueScope): Promise<PlaceGamesRecord> {
  const trx = transactionOf(scope);
  const rows = await trx
    .selectFrom('games as g')
    .select([
      'g.venue_id',
      'g.court_id',
      sql<number>`count(*) filter (where g.status in ('final', 'forfeit'))::int`.as('played'),
      sql<number>`count(*) filter (where g.status in ('scheduled', 'postponed', 'live'))::int`.as(
        'to_come',
      ),
    ])
    .where('g.league_id', '=', scope.leagueId)
    .where('g.deleted_at', 'is', null)
    .where('g.venue_id', 'is not', null)
    .groupBy(['g.venue_id', 'g.court_id'])
    .orderBy('g.venue_id')
    .orderBy('g.court_id')
    .execute();
  const drafts = await trx
    .selectFrom('schedule_drafts')
    .select(['season_id', 'changes'])
    .where('league_id', '=', scope.leagueId)
    .orderBy('season_id')
    .execute();
  return {
    published: rows.flatMap((row) =>
      row.venue_id === null
        ? []
        : [
            {
              venueId: row.venue_id,
              courtId: row.court_id,
              played: Number(row.played),
              toCome: Number(row.to_come),
            },
          ],
    ),
    drafts: drafts.map((d) => ({ seasonId: d.season_id, changes: d.changes })),
  };
}
