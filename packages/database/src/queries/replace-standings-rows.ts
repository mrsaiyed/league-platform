// Makes a season's standings rows in the scope's league exactly these (T3 §9): each
// team's row is written over in place, keeping its id, and rows of teams not given
// are removed. Seeds are checked when the transaction ends, so teams may swap seeds
// here in any order (migration 0010). Win percentage and point difference are not
// stored; they follow from the counts. The footnotes of adjustments come from
// standings_adjustments, not from here.
import type { StandingsRow } from '@srleagues/sports';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

function columnsOf(row: StandingsRow) {
  return {
    division_id: row.divisionId,
    rank: row.rank,
    seed: row.seed,
    games_played: row.gamesPlayed,
    wins: row.wins,
    losses: row.losses,
    ties: row.ties,
    points_for: row.pointsFor,
    points_against: row.pointsAgainst,
    standings_points: row.points,
    streak_result: row.streak?.result ?? null,
    streak_length: row.streak?.length ?? null,
    decided_by: row.decidedBy,
  };
}

export async function replaceStandingsRows(
  scope: LeagueScope,
  seasonId: string,
  rows: readonly StandingsRow[],
): Promise<void> {
  const trx = transactionOf(scope);
  let removal = trx
    .deleteFrom('standings_rows')
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId);
  if (rows.length > 0) {
    removal = removal.where(
      'team_id',
      'not in',
      rows.map((row) => row.teamId),
    );
  }
  await removal.execute();
  if (rows.length === 0) return;
  await trx
    .insertInto('standings_rows')
    .values(
      rows.map((row) => ({
        league_id: scope.leagueId,
        season_id: seasonId,
        team_id: row.teamId,
        ...columnsOf(row),
      })),
    )
    .onConflict((conflict) =>
      conflict.columns(['league_id', 'season_id', 'team_id']).doUpdateSet((excluded) => ({
        division_id: excluded.ref('excluded.division_id'),
        rank: excluded.ref('excluded.rank'),
        seed: excluded.ref('excluded.seed'),
        games_played: excluded.ref('excluded.games_played'),
        wins: excluded.ref('excluded.wins'),
        losses: excluded.ref('excluded.losses'),
        ties: excluded.ref('excluded.ties'),
        points_for: excluded.ref('excluded.points_for'),
        points_against: excluded.ref('excluded.points_against'),
        standings_points: excluded.ref('excluded.standings_points'),
        streak_result: excluded.ref('excluded.streak_result'),
        streak_length: excluded.ref('excluded.streak_length'),
        decided_by: excluded.ref('excluded.decided_by'),
      })),
    )
    .execute();
}
