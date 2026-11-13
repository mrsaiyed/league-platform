// Changes a game of the scope's league that a publication moves or re-records (P7 §4.4).
// A game that is live or decided is never changed here: false then, as for a game that is
// not in the season or is in the bin. A time is read in the league's own time zone and a
// court is found by name at its venue.
import type { PublishedGameChange } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function updatePublishedGame(
  scope: LeagueScope,
  seasonId: string,
  gameId: string,
  change: PublishedGameChange,
): Promise<boolean> {
  const trx = transactionOf(scope);
  const league = await trx
    .selectFrom('leagues')
    .select('time_zone')
    .where('id', '=', scope.leagueId)
    .executeTakeFirst();
  const zone = league?.time_zone ?? 'UTC';
  const slot = change.slot;
  const row = await trx
    .updateTable('games')
    .set({
      ...(change.captureMode === undefined ? {} : { capture_mode: change.captureMode }),
      ...(slot === undefined
        ? {}
        : {
            round_id: slot.roundId,
            venue_id: slot.venueId,
            court_id: sql<string | null>`(
              select c.id from courts c
              where c.league_id = ${scope.leagueId} and c.venue_id = ${slot.venueId}
                and c.name = ${slot.court} and c.deleted_at is null)`,
            starts_at: sql<Date>`(${slot.date}::date + ${slot.time}::time) at time zone ${zone}`,
          }),
    })
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('id', '=', gameId)
    .where('deleted_at', 'is', null)
    .where('status', 'not in', ['live', 'final', 'forfeit'])
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}
