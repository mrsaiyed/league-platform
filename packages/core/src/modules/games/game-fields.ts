// Words and checks the games commands share.
import type { SeasonRules } from '@srleagues/contracts';
import { z } from 'zod';

/** The database spells recording modes final, box and live; season rules say final-score, box-score and live. */
export function recordingOf(captureMode: string): SeasonRules['recording'] | undefined {
  if (captureMode === 'final') return 'final-score';
  if (captureMode === 'box') return 'box-score';
  if (captureMode === 'live') return 'live';
  return undefined;
}

/** A score the database accepts (0 to 999). */
export const gameScore = z.number().int().min(0).max(999);

export const gameVersion = z.number().int().positive();

/** Why a decided game is reopened: kept in the correction (S-7), never shown on the public page. */
export const correctionReason = z.string().trim().min(1).max(1000);

export const isDecided = (status: string) => status === 'final' || status === 'forfeit';
