// A season's schedule and results by round for the public schedule page (P7 §4): rounds
// in order, each marked past, current or upcoming as of the league's own `today`
// (yyyy-mm-dd), and published games with no round after them. Only published games.
import { placeRounds, type PublicGame, type PublicSchedule } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { findPublicSeason } from './find-public-season.ts';
import { listPublicGames } from './list-public-games.ts';

export async function listPublicSchedule(
  scope: LeagueScope,
  seasonId: string,
  today: string,
): Promise<PublicSchedule | undefined> {
  const found = await findPublicSeason(scope, { seasonId });
  if (found === undefined) return undefined;
  const games = await listPublicGames(scope, seasonId);
  const rounds = await transactionOf(scope)
    .selectFrom('rounds')
    .innerJoin('seasons', (join) =>
      join
        .onRef('seasons.league_id', '=', 'rounds.league_id')
        .onRef('seasons.id', '=', 'rounds.season_id'),
    )
    .select([
      'rounds.id as id',
      'rounds.number as number',
      'rounds.label as label',
      sql<string | null>`to_char(rounds.date, 'YYYY-MM-DD')`.as('date'),
    ])
    .where('rounds.league_id', '=', scope.leagueId)
    .where('rounds.season_id', '=', seasonId)
    .where('seasons.deleted_at', 'is', null)
    .where('seasons.status', 'in', ['active', 'completed'])
    .orderBy('rounds.number')
    .execute();
  const { id: _id, ...choice } = found;
  const byRound = new Map<string, PublicGame[]>();
  const unplacedGames: PublicGame[] = [];
  for (const { roundId, ...game } of games) {
    if (roundId === null) unplacedGames.push(game);
    else byRound.set(roundId, [...(byRound.get(roundId) ?? []), game]);
  }
  return {
    season: choice,
    rounds: placeRounds(
      rounds.map((round) => ({
        id: round.id,
        number: round.number,
        label: round.label,
        date: round.date,
        games: byRound.get(round.id) ?? [],
      })),
      today,
    ),
    unplacedGames,
  };
}
