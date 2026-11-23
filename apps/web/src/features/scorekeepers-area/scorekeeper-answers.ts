// Which sentence a refusal on Admin → Games → Scorekeepers says, and which box it marks
// (step 2.56, record 067). The commands check everything; this only words their answers.
import type { TextKey } from '../../server/messages.ts';

const known = [
  'already-assigned',
  'cannot-score-game',
  'game-closed',
  'game-not-found',
  'not-allowed',
  'not-assigned',
  'person-missing',
  'season-not-found',
] as const;

/** The boxes a refusal marks: the person chosen, when it is about them. */
export function wrongScorekeeperFields(code: string): readonly string[] {
  return ['already-assigned', 'cannot-score-game', 'person-missing'].includes(code)
    ? ['person']
    : [];
}

/** The sentence beside the box or the button. */
export function scorekeeperProblemKey(code: string): TextKey {
  const found = known.find((k) => k === code);
  return found === undefined
    ? 'adminScorekeepers.problem.unknown'
    : (`adminScorekeepers.problem.${found}` as TextKey);
}
