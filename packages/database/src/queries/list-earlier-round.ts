// One round of the scope's earlier games (step 2.156), as list-earlier-rounds.ts counts
// them: the round's games, or a season's games in no round, that started before the
// league's today and are final, forfeited, postponed or cancelled; in no bin, of a season
// in no bin; of those, the ones in the person's reach (before the cut); soonest first, at
// most `limit`. Each with its season's program, its day in the league's time zone and
// whether the account is assigned to it. Every table read is filtered to the scope's
// league (T-28).
import type { EarlierRoundRef, GamesWindow, ScoringReach } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import { gameInList, gamesForLists, inReachOf, leagueDayOf } from './games-for-lists.ts';
import { overOrCalledOff } from './list-earlier-rounds.ts';

export async function listEarlierRound(
  scope: LeagueScope,
  accountId: string,
  reach: ScoringReach,
  round: EarlierRoundRef,
  limit: number,
): Promise<GamesWindow> {
  const league = await leagueDayOf(scope);
  if (league === undefined) return { today: '', games: [] };
  const games = gamesForLists(scope, accountId, league)
    .where('g.starts_at', '<', league.from_at)
    .where('g.status', 'in', overOrCalledOff)
    .where(inReachOf(scope, accountId, reach));
  const inRound =
    'roundId' in round
      ? games.where('g.round_id', '=', round.roundId)
      : games.where('g.round_id', 'is', null).where('g.season_id', '=', round.seasonId);
  const rows = await inRound.orderBy('g.starts_at').orderBy('g.id').limit(limit).execute();
  return { today: league.today, games: rows.map(gameInList) };
}
