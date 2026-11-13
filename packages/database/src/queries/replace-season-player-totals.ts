// Makes a season's player totals in the scope's league exactly these (T3 §9): each
// person's row is written over in place, keeping its id, and rows of people not given
// are removed. `stats` is the versioned document of migration 0010: each stat's total
// and the games it was recorded in (averages are worked out from those when shown),
// and the teams the person played for, so a page can tell whose numbers it may show
// (S-22, record 033).
import type { PlayerSeasonTotals } from '@srleagues/sports';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

function statsDocument(totals: PlayerSeasonTotals) {
  return {
    version: 1,
    teamIds: totals.teamIds,
    stats: Object.fromEntries(
      Object.entries(totals.stats).map(([key, stat]) => [
        key,
        { total: stat.total, gamesRecorded: stat.gamesRecorded },
      ]),
    ),
  };
}

export async function replaceSeasonPlayerTotals(
  scope: LeagueScope,
  seasonId: string,
  totals: readonly PlayerSeasonTotals[],
): Promise<void> {
  const trx = transactionOf(scope);
  let removal = trx
    .deleteFrom('season_player_totals')
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId);
  if (totals.length > 0) {
    removal = removal.where(
      'person_id',
      'not in',
      totals.map((t) => t.personId),
    );
  }
  await removal.execute();
  if (totals.length === 0) return;
  await trx
    .insertInto('season_player_totals')
    .values(
      totals.map((t) => ({
        league_id: scope.leagueId,
        season_id: seasonId,
        person_id: t.personId,
        games_played: t.gamesPlayed,
        seconds_played: t.seconds.total,
        seconds_games: t.seconds.gamesRecorded,
        stats: statsDocument(t),
      })),
    )
    .onConflict((conflict) =>
      conflict.columns(['league_id', 'season_id', 'person_id']).doUpdateSet((excluded) => ({
        games_played: excluded.ref('excluded.games_played'),
        seconds_played: excluded.ref('excluded.seconds_played'),
        seconds_games: excluded.ref('excluded.seconds_games'),
        stats: excluded.ref('excluded.stats'),
      })),
    )
    .execute();
}
