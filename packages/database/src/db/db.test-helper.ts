// Test-only ways past the fences, to prove each fence on its own.
import type { DatabaseHandle } from './database-handle.ts';
import { kyselyOf } from './database-handle.ts';
import { closeScope, openScope, type LeagueScope } from './transaction-scope.ts';

/**
 * Runs `work` with a LeagueScope whose transaction is NOT fenced by row-level
 * security: it stays the login role (the superuser, on PGlite) and sets no league.
 * Only the query's own league filter (T-28, fence 2) keeps other leagues out.
 */
export function withUnfencedScope<T>(
  db: DatabaseHandle,
  leagueId: string,
  work: (scope: LeagueScope) => Promise<T>,
): Promise<T> {
  return kyselyOf(db)
    .transaction()
    .execute(async (trx) => {
      const scope = openScope(trx, leagueId, null) as LeagueScope;
      try {
        return await work(scope);
      } finally {
        closeScope(scope);
      }
    });
}
