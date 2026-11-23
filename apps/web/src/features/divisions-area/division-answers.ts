// What a refused change to a division says, and which box it marks (step 2.49; record 067):
// the words come from the message files, never from the command's code shown as it is.
import type { TextKey } from '../../server/messages.ts';

const known = [
  'changed-since-read',
  'division-has-subdivisions',
  'division-has-teams',
  'division-name-taken',
  'division-not-found',
  'division-parent-in-bin',
  'divisions-incomplete',
  'invalid-input',
  'not-allowed',
  'not-confirmed',
  'season-not-found',
] as const;

/** The sentence for a refusal. A name taken when putting one back says what to rename. */
export function divisionProblemKey(code: string, putBack = false): TextKey {
  if (putBack && code === 'division-name-taken') return 'adminDivisions.problem.restore-name-taken';
  const found = known.find((k) => k === code);
  return found === undefined
    ? 'adminDivisions.problem.unknown'
    : (`adminDivisions.problem.${found}` as TextKey);
}

/** The box a refusal is about: the name, for a name that is empty, too long or taken. */
export function wrongDivisionFields(code: string): readonly string[] {
  return code === 'invalid-input' || code === 'division-name-taken' ? ['name'] : [];
}
