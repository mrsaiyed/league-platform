// Creates the scope's league and its default program (U-3, U-12). The scope's league
// id is the new league's id: the caller picked it first so row-level security
// accepts the rows (0005). Both rows go in one transaction, which the database
// checks when it commits (0003). Returns the league, or why it was refused; after a
// refusal the transaction is unusable, so the caller rolls it back.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';
import { currentLeague, leagueColumns, type CurrentLeague } from './find-current-league.ts';

export type NewLeagueRows = {
  slug: string;
  name: string;
  timeZone: string;
  audience: string;
  listed: boolean;
  ownerAccountId: string;
  defaultProgram: { slug: string; name: string; sportKey: string };
};

export type InsertLeagueRefusal = 'short-name-taken' | 'league-exists' | 'owner-not-found';

const refusals: Record<string, InsertLeagueRefusal> = {
  leagues_slug_key: 'short-name-taken',
  leagues_slug_not_forwarding: 'short-name-taken',
  leagues_pkey: 'league-exists',
  leagues_owner_account_id_fkey: 'owner-not-found',
};

export async function insertLeague(
  scope: LeagueScope,
  league: NewLeagueRows,
): Promise<CurrentLeague | InsertLeagueRefusal> {
  const trx = transactionOf(scope);
  try {
    const row = await trx
      .insertInto('leagues')
      .values({
        id: scope.leagueId,
        slug: league.slug,
        name: league.name,
        time_zone: league.timeZone,
        audience: league.audience,
        listed: league.listed,
        owner_account_id: league.ownerAccountId,
      })
      .returning(leagueColumns)
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('programs')
      .values({
        league_id: scope.leagueId,
        slug: league.defaultProgram.slug,
        name: league.defaultProgram.name,
        sport_key: league.defaultProgram.sportKey,
        is_default: true,
      })
      .execute();
    return currentLeague(row);
  } catch (error) {
    const refusal = refusals[constraintOf(error)?.constraint ?? ''];
    if (refusal === undefined) throw error;
    return refusal;
  }
}
