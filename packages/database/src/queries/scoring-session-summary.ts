// What a scoring session query returns: built field by field (T-29), with its times
// in milliseconds as core and the tracker count them.
import type { ScoringSession } from '@srleagues/core';

export const scoringSessionColumns = [
  'id',
  'game_id',
  'account_id',
  'device_id',
  'created_at',
  'held_until',
] as const;

type ScoringSessionRow = {
  id: string;
  game_id: string;
  account_id: string;
  device_id: string;
  created_at: Date;
  held_until: Date;
};

export function scoringSessionSummary(row: ScoringSessionRow): ScoringSession {
  return {
    id: row.id,
    gameId: row.game_id,
    accountId: row.account_id,
    deviceId: row.device_id,
    since: row.created_at.getTime(),
    heldUntil: row.held_until.getTime(),
  };
}
