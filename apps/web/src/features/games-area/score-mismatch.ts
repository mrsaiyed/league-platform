// Whether a team score typed into the box score grid differs from the total of its
// players' points (step 2.64, S-26). Such a sheet is not refused, as the admin may know
// better than the sheet; the page warns before saving, and the score typed is the one
// saved. No warning while the score box is empty (the total is used) or while no
// player of the team has points filled in (the sheet did not keep them).
import { boxScoreField, type BoxScoreFields } from './box-score-form.ts';

/** One team of the grid: its score box and its players. */
export type ScoreCheckTeam = {
  readonly scoreField: 'homeScore' | 'awayScore';
  readonly personIds: readonly string[];
};

const count = (text: string | undefined): number | undefined => {
  const trimmed = (text ?? '').trim();
  return /^\d{1,4}$/.test(trimmed) ? Number(trimmed) : undefined;
};

/** The typed score and the players' total when they differ, else undefined. */
export function scoreMismatch(
  team: ScoreCheckTeam,
  fields: BoxScoreFields,
): { readonly score: number; readonly points: number } | undefined {
  const score = count(fields[team.scoreField]);
  if (score === undefined) return undefined;
  let points = 0;
  let kept = false;
  for (const personId of team.personIds) {
    const value = count(fields[boxScoreField.stat(personId, 'points')]);
    if (value === undefined) continue;
    kept = true;
    points += value;
  }
  return kept && points !== score ? { score, points } : undefined;
}
