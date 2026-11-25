// What a refused "Add team" marks and says (step 2.155; A-4): the box it is about, and a
// sentence from the message files that names that box. The fixed words of a command's
// error only, never anything typed (T-187).
import { catalogs } from '@srleagues/site';
import type { TextKey } from '../../server/messages.ts';

/** The form's boxes, in the order they are on the screen. */
export const createTeamFields = ['name', 'shortName', 'color', 'divisionId'] as const;
type Field = (typeof createTeamFields)[number];

const sentenceOf: Readonly<Record<Field, TextKey>> = {
  name: 'adminTeams.create.problem.name',
  shortName: 'adminTeams.create.problem.shortName',
  color: 'adminTeams.create.problem.color',
  divisionId: 'error.teams.create_team.division-not-found',
};

/** A refusal the command gives for one box, by its code. */
const fieldOfCode: Readonly<Record<string, Field>> = {
  'short-name-needed': 'shortName',
  'team-short-name-taken': 'shortName',
  'team-name-taken': 'name',
  'division-not-found': 'divisionId',
};

export type CreateTeamRefusal = { readonly wrong: readonly Field[]; readonly said: TextKey };

/**
 * The boxes to mark and the sentence to say beside the first: a box the input check
 * refused names its rule; a refusal of the command names the box it is about (its own
 * sentence, `error.teams.create_team.<code>`, when the message files have one).
 */
export function createTeamRefusal(
  code: string,
  issues: readonly { readonly path: string }[] = [],
): CreateTeamRefusal {
  if (code === 'invalid-input') {
    const wrong = createTeamFields.filter((field) =>
      issues.some((issue) => issue.path === field || issue.path.startsWith(`${field}.`)),
    );
    const first = wrong[0];
    return { wrong, said: first === undefined ? 'error.invalid-input' : sentenceOf[first] };
  }
  const field = fieldOfCode[code];
  const english = catalogs['en'] ?? {};
  const own = [`error.teams.create_team.${code}`, `error.${code}`].find((key) =>
    Object.hasOwn(english, key),
  );
  return {
    wrong: field === undefined ? [] : [field],
    said: (own ?? 'error.unknown') as TextKey,
  };
}
