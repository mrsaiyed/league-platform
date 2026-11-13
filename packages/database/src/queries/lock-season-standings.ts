// Takes a lock on one season's standings in the scope's league for the rest of the
// transaction. Two results of a season saved at once then rebuild its standings one
// after the other: the second waits, and its reads, each made after the wait at read
// committed, see the first's result. Without it, both would read before either wrote
// and the second would save standings missing the first game. The key names the
// league, so leagues never wait on each other (a hash shared by chance only waits).
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function lockSeasonStandings(scope: LeagueScope, seasonId: string): Promise<void> {
  const key = ['standings', scope.leagueId, seasonId.toLowerCase()].join(':');
  await sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`.execute(
    transactionOf(scope),
  );
}
