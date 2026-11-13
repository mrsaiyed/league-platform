// Test-only ways past the fences, to prove each fence on its own.
import { sql } from 'kysely';
import type { DatabaseHandle } from './database-handle.ts';
import { kyselyOf } from './database-handle.ts';
import { closeScope, openScope, type LeagueScope } from './transaction-scope.ts';

/**
 * Runs `work` with a LeagueScope whose transaction is NOT fenced by row-level
 * security: it stays the login role (the superuser, on PGlite) and sets no league.
 * Only the query's own league filter (T-28, fence 2) keeps other leagues out. The
 * scope names `accountId` as the one acting (commands read it), though the database
 * is told nothing.
 */
export function withUnfencedScope<T>(
  db: DatabaseHandle,
  leagueId: string,
  work: (scope: LeagueScope) => Promise<T>,
  accountId: string | null = null,
): Promise<T> {
  return kyselyOf(db)
    .transaction()
    .execute(async (trx) => {
      const scope = openScope(trx, leagueId, accountId) as LeagueScope;
      try {
        return await work(scope);
      } finally {
        closeScope(scope);
      }
    });
}

/** What the database is told a transaction is for; missing means none. */
export type FenceSetting = { leagueId?: string; accountId?: string };

/**
 * Runs `work` with a LeagueScope naming `scopeLeagueId` while the database is set
 * to something else: the transaction is the app's role (app_user, T-60) with the
 * league and account of `fence`, or none. The query's own filter points at
 * `scopeLeagueId`, so only row-level security (T-61, T-62, fence 3) can keep that
 * league out. The scope names the fence's account as the one acting.
 */
export function withFenceSetTo<T>(
  db: DatabaseHandle,
  fence: FenceSetting,
  scopeLeagueId: string,
  work: (scope: LeagueScope) => Promise<T>,
): Promise<T> {
  return kyselyOf(db)
    .transaction()
    .execute(async (trx) => {
      await sql`set local role app_user`.execute(trx);
      await sql`select set_config('app.league_id', ${fence.leagueId ?? ''}, true),
                       set_config('app.account_id', ${fence.accountId ?? ''}, true)`.execute(trx);
      const scope = openScope(trx, scopeLeagueId, fence.accountId ?? null) as LeagueScope;
      try {
        return await work(scope);
      } finally {
        closeScope(scope);
      }
    });
}
