// Whether a game in the scope's league was ever final or forfeited: a correction for it,
// or an `end` or `reopen` in its event log (S-40, record 061). Such a game is never
// marked not started; the database's own check reads the same function (migration 0016).
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function gameWasDecided(scope: LeagueScope, gameId: string): Promise<boolean> {
  const { rows } = await sql<{ decided: boolean }>`
    select public.game_ever_decided(${scope.leagueId}::uuid, ${gameId}::uuid) as decided
  `.execute(transactionOf(scope));
  return rows[0]?.decided === true;
}
