// The result a game shows while it is being corrected (S-47, step 2.159): what its latest
// reopen took back, read from that correction's `before` (scores and how it was decided;
// the kept sheet is left where it is), while the game is not decided again. Undefined
// otherwise. Core's resultBeingCorrected says which correction that is (T-383).
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

export async function findGameResultBeingCorrected(
  scope: LeagueScope,
  gameId: string,
): Promise<MarkResult | undefined> {
  // One read: the game's corrections joined to the game itself, under one league filter.
  const rows = await transactionOf(scope)
    .selectFrom('game_corrections')
    .innerJoin('games', (join) =>
      join
        .onRef('games.league_id', '=', 'game_corrections.league_id')
        .onRef('games.id', '=', 'game_corrections.game_id'),
    )
    .select(['game_corrections.before', 'game_corrections.after', 'games.status'])
    .where('game_corrections.league_id', '=', scope.leagueId)
    .where('game_corrections.game_id', '=', gameId)
    .orderBy('game_corrections.created_at', 'asc')
    .orderBy('game_corrections.id', 'asc')
    .execute();
  const [first] = rows;
  if (first === undefined) return undefined;
  return resultBeingCorrected(
    rows.map((row) => ({ on: '', before: resultOf(row.before), after: resultOf(row.after) })),
    { status: first.status },
  );
}
