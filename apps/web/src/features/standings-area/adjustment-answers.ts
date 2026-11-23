// What the adjustments forms of Admin → Standings and stats read from what was typed, and
// which box a refusal marks with which sentence (step 2.56, record 067). The numbers are
// read here, so a box holding "two" is refused beside that box before any command runs;
// the command itself checks everything again.
import { adjustmentLimits } from '@srleagues/core';
import type { TextKey } from '../../server/messages.ts';

export const adjustmentCounts = ['wins', 'losses', 'ties', 'points'] as const;
export type AdjustmentCount = (typeof adjustmentCounts)[number];

/** A count as typed: empty is 0, a whole number is itself, anything else is not one. */
export function countOf(typed: string | undefined): number | undefined {
  const text = (typed ?? '').trim().replace(/^−/, '-');
  if (text === '') return 0;
  return /^[+-]?\d{1,5}$/.test(text) ? Number(text) : undefined;
}

export type AdjustmentRead =
  | { readonly ok: true; readonly counts: Readonly<Record<AdjustmentCount, number>> }
  | { readonly ok: false; readonly code: string; readonly box: string };

/** The largest change a box may make, either way: the command's own limits. */
const limitOf = (name: AdjustmentCount) =>
  name === 'points' ? adjustmentLimits.points : adjustmentLimits.count;

/** The limits, for the sentence that names them. */
export const adjustmentLimitWords = {
  count: String(adjustmentLimits.count),
  points: String(adjustmentLimits.points),
} as const;

/** The four counts of an adjustment form, or the first box that is not a whole number
 * or is past the limits the command takes. */
export function readCounts(typed: Readonly<Record<string, string>>): AdjustmentRead {
  const counts: Partial<Record<AdjustmentCount, number>> = {};
  for (const name of adjustmentCounts) {
    const value = countOf(typed[name]);
    if (value === undefined) return { ok: false, code: 'invalid-number', box: name };
    if (Math.abs(value) > limitOf(name)) return { ok: false, code: 'number-too-big', box: name };
    counts[name] = value;
  }
  const { wins = 0, losses = 0, ties = 0, points = 0 } = counts;
  if (wins === 0 && losses === 0 && ties === 0 && points === 0) {
    return { ok: false, code: 'nothing-changes', box: 'wins' };
  }
  return { ok: true, counts: { wins, losses, ties, points } };
}

/** The reason box: said, and not too long. */
export function reasonProblem(typed: string | undefined): string | undefined {
  const reason = (typed ?? '').trim();
  if (reason === '') return 'reason-missing';
  return reason.length > 500 ? 'reason-too-long' : undefined;
}

const known = [
  'adjustment-not-counted',
  'adjustment-not-found',
  'invalid-number',
  'flip-not-found',
  'game-already-overturned',
  'game-has-no-winner',
  'game-not-found',
  'not-allowed',
  'not-confirmed',
  'nothing-changes',
  'number-too-big',
  'place-twice',
  'reason-missing',
  'reason-too-long',
  'same-team',
  'season-not-found',
  'team-not-found',
  'teams-not-level',
] as const;

/** The boxes a refusal marks. */
export function wrongAdjustmentFields(code: string, box?: string): readonly string[] {
  if (box !== undefined) return [box];
  if (code === 'team-not-found') return ['team'];
  return [];
}

/** The sentence beside the box or the button. */
export function adjustmentProblemKey(code: string): TextKey {
  const found = known.find((k) => k === code);
  return found === undefined
    ? 'adminStandings.problem.unknown'
    : (`adminStandings.problem.${found}` as TextKey);
}
