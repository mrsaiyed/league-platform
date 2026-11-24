// The date (YYYY-MM-DD, in the league's time zone) the game reads "Corrected" on in
// public, or undefined. Only the date: the reason stays private (S-7). Not every
// correction row marks it: only one whose next final differs from the result it took
// back (S-81, S-8; core's correctedMarkDate, step 2.56). The activity log keeps every
// reopen either way. A put back of the sheet ends the reopen it undid (S-98): its
// "after" is read so the mark compares the result it left, and whether each kept a
// sheet, so a put back ends the reopen whose sheet it restored (T-368).
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
  // One read: the game's corrections joined to the game itself (the pair names one league's
  // game) and its league's time zone, under one league filter. No rows: no mark.
  const rows = await transactionOf(scope)
    .selectFrom('game_corrections')
    .innerJoin('games', (join) =>
      join
        .onRef('games.league_id', '=', 'game_corrections.league_id')
        .onRef('games.id', '=', 'game_corrections.game_id'),
    )
    .innerJoin('leagues', 'leagues.id', 'game_corrections.league_id')
    .select([
      'game_corrections.before',
      'game_corrections.after',
      'games.status',
      'games.home_score',
      'games.away_score',
      sql<boolean>`(game_corrections.before -> 'sheet') is not null`.as('kept_sheet'),
      sql<string>`to_char(game_corrections.created_at at time zone leagues.time_zone, 'YYYY-MM-DD')`.as(
        'local_date',
      ),
    ])
    .where('game_corrections.league_id', '=', scope.leagueId)
    .where('game_corrections.game_id', '=', gameId)
    .orderBy('game_corrections.created_at', 'asc')
    .orderBy('game_corrections.id', 'asc')
    .execute();
  const [first] = rows;
  if (first === undefined) return undefined;
  return correctedMarkDate(
    rows.map((row) => ({
      on: row.local_date,
      before: resultOf(row.before),
      after: resultOf(row.after),
      keptSheet: row.kept_sheet,
    })),
    { status: first.status, homeScore: first.home_score, awayScore: first.away_score },
  );
}
