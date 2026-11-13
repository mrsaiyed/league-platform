// What a game query returns: built field by field (T-29).
import type { GameRecord } from '@srleagues/core';

export const gameSummaryColumns = [
  'id',
  'season_id',
  'division_id',
  'home_team_id',
  'away_team_id',
  'starts_at',
  'status',
  'capture_mode',
  'home_score',
  'away_score',
  'format',
  'finalized_at',
  'deleted_at',
  'version',
] as const;

type GameRow = {
  id: string;
  season_id: string;
  division_id: string | null;
  home_team_id: string;
  away_team_id: string;
  starts_at: Date | null;
  status: string;
  capture_mode: string;
  home_score: number | null;
  away_score: number | null;
  format: unknown;
  finalized_at: Date | null;
  deleted_at: Date | null;
  version: number;
};

export function gameSummary(row: GameRow): GameRecord {
  return {
    id: row.id,
    seasonId: row.season_id,
    divisionId: row.division_id,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    startsAt: row.starts_at === null ? null : row.starts_at.toISOString(),
    status: row.status,
    captureMode: row.capture_mode,
    homeScore: row.home_score,
    awayScore: row.away_score,
    format: row.format,
    finalizedAt: row.finalized_at === null ? null : row.finalized_at.toISOString(),
    binned: row.deleted_at !== null,
    version: row.version,
  };
}
