// Gives the scope's league a new short name, only if it is still at `version`, and
// keeps the old one forwarding until `forwardMonths` from now (U-7). The database
// refuses a name another league holds, or whose forwarding still points at another
// league (0003); that comes back as 'taken', and the transaction is then unusable:
// the caller rolls it back.
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';

const takenBy = new Set(['leagues_slug_key', 'leagues_slug_not_forwarding']);

/** The new version, 'taken', or undefined if the league moved on, is in the bin or out of sight. */
export async function renameLeagueSlug(
  scope: LeagueScope,
  slug: string,
  version: number,
  forwardMonths: number,
): Promise<number | 'taken' | undefined> {
  const trx = transactionOf(scope);
  const before = await trx
    .selectFrom('leagues')
    .select('slug')
    .where('id', '=', scope.leagueId)
    .where('version', '=', version)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (before === undefined) return undefined;
  try {
    const row = await trx
      .updateTable('leagues')
      .set({ slug })
      .where('id', '=', scope.leagueId)
      .where('version', '=', version)
      .returning('version')
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('league_slug_history')
      .values({
        league_id: scope.leagueId,
        old_slug: before.slug,
        expires_at: sql<Date>`now() + make_interval(months => ${forwardMonths})`,
      })
      .execute();
    return row.version;
  } catch (error) {
    if (takenBy.has(constraintOf(error)?.constraint ?? '')) return 'taken';
    throw error;
  }
}
