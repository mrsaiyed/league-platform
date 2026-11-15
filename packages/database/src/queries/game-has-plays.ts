// Whether the tracker has recorded any play of a game in the scope's league (T3 §8
// `game_events`): such a game is corrected through the tracker's commands (T-122),
// never by replacing its box score. The players the scorer's table added, changed or
// took off (record 058) are kept as events too, but they are not plays: a game with
// only those can still have its box score entered from a paper sheet. A game marked not
// started (S-40, record 061) has its events still, behind its last `reset` marker: only
// what came after that counts. Both as the database's own rule reads them
// (public.game_tracked_past_marker, migration 0016).
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function gameHasPlays(scope: LeagueScope, gameId: string): Promise<boolean> {
  const { rows } = await sql<{ tracked: boolean }>`
    select public.game_tracked_past_marker(${scope.leagueId}::uuid, ${gameId}::uuid) as tracked
  `.execute(transactionOf(scope));
  return rows[0]?.tracked === true;
}
