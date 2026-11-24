// The result as it stood of each named game a reopen is open on (S-47, step 2.159, T-383):
// what its latest reopen took back, read from that correction's `before` (scores and how it
// was decided; the kept sheet is left where it is), while the game is not decided again.
// Core's resultBeingCorrected says which correction that is. A game with no such reopen is
// not in the answer. Read by the public games list and by one game's page (one query of the
// corrections under one league filter, so the two-league test reaches it on its own).
import { resultBeingCorrected, type MarkResult } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

const resultOf = (stored: unknown): MarkResult => {
  if (typeof stored !== 'object' || stored === null) return {};
  const field = (key: string) => (key in stored ? (stored as Record<string, unknown>)[key] : null);
  const number = (value: unknown) => (typeof value === 'number' ? value : null);
  const status = field('status');
  return {
    status: typeof status === 'string' ? status : null,
    homeScore: number(field('homeScore')),
    awayScore: number(field('awayScore')),
  };
};

export async function listResultsBeingCorrected(
  scope: LeagueScope,
  gameIds: readonly string[],
): Promise<Map<string, MarkResult>> {
  const found = new Map<string, MarkResult>();
  if (gameIds.length === 0) return found;
  // The games' corrections joined to the games themselves, under one league filter.
  const rows = await transactionOf(scope)
    .selectFrom('game_corrections')
    .innerJoin('games', (join) =>
      join
        .onRef('games.league_id', '=', 'game_corrections.league_id')
        .onRef('games.id', '=', 'game_corrections.game_id'),
    )
    .select([
      'game_corrections.game_id as game_id',
      'game_corrections.before as before',
      'game_corrections.after as after',
      'games.status as status',
    ])
    .where('game_corrections.league_id', '=', scope.leagueId)
    .where('game_corrections.game_id', 'in', [...gameIds])
    .orderBy('game_corrections.created_at', 'asc')
    .orderBy('game_corrections.id', 'asc')
    .execute();
  const byGame = new Map<string, typeof rows>();
  for (const row of rows) byGame.set(row.game_id, [...(byGame.get(row.game_id) ?? []), row]);
  for (const [gameId, corrections] of byGame) {
    const result = resultBeingCorrected(
      corrections.map((row) => ({
        on: '',
        before: resultOf(row.before),
        after: resultOf(row.after),
      })),
      { status: corrections[0]?.status ?? '' },
    );
    if (result !== undefined) found.set(gameId, result);
  }
  return found;
}
