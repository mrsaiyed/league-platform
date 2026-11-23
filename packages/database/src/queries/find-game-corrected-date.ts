// The date (YYYY-MM-DD, in the league's time zone) the game reads "Corrected" on in
// public, or undefined. Only the date: the reason stays private (S-7). Not every
// correction row marks it: only one whose next final differs from the result it took
// back (S-81, S-8; core's correctedMarkDate, step 2.56). The activity log keeps every
// reopen either way.
import { correctedMarkDate, type MarkResult } from '@srleagues/core';
import { sql } from 'kysely';
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

export async function findGameCorrectedDate(
  scope: LeagueScope,
  gameId: string,
): Promise<string | undefined> {
  const tx = transactionOf(scope);
  const game = await tx
    .selectFrom('games')
    .select(['status', 'home_score', 'away_score'])
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', gameId)
    .executeTakeFirst();
  if (game === undefined) return undefined;
  const rows = await tx
    .selectFrom('game_corrections')
    .innerJoin('leagues', 'leagues.id', 'game_corrections.league_id')
    .select([
      'game_corrections.before',
      sql<string>`to_char(game_corrections.created_at at time zone leagues.time_zone, 'YYYY-MM-DD')`.as(
        'local_date',
      ),
    ])
    .where('game_corrections.league_id', '=', scope.leagueId)
    .where('game_corrections.game_id', '=', gameId)
    .orderBy('game_corrections.created_at', 'asc')
    .execute();
  return correctedMarkDate(
    rows.map((row) => ({ on: row.local_date, before: resultOf(row.before) })),
    { status: game.status, homeScore: game.home_score, awayScore: game.away_score },
  );
}
