// What a refused form of a team's own page marks and says (step 2.155; A-4): the box the
// refusal is about, and a sentence from the message files that names that box ("Name:
// Another team of this season already has that name."). The fixed words of a command's
// error only, never anything typed (T-187).
import { t, type TextKey } from '../../server/messages.ts';
import { problemKey } from './answer.ts';
import type { Fields } from './form-input.ts';

/** The forms of a team's page that answer in the response to the post. */
export type TeamFormName = 'details' | 'newPlayer' | 'stats' | 'fromList' | 'entry';

/** Each form's boxes, in the order they are on the screen, with their labels. */
const boxesOf: Readonly<Record<TeamFormName, Readonly<Record<string, TextKey>>>> = {
  details: {
    name: 'adminTeams.field.name',
    shortName: 'adminTeams.field.shortName',
    color: 'adminTeams.field.color',
    divisionId: 'adminTeams.field.division',
  },
  newPlayer: {
    firstName: 'adminTeams.newPerson.firstName',
    lastName: 'adminTeams.newPerson.lastName',
    jerseyNumber: 'adminTeams.add.number',
    role: 'adminTeams.roster.role',
  },
  stats: { statsVisibility: 'adminTeams.field.statsVisibility' },
  fromList: {
    personId: 'adminTeams.add.person',
    jerseyNumber: 'adminTeams.add.number',
    role: 'adminTeams.roster.role',
  },
  entry: {
    jerseyNumber: 'adminTeams.roster.number',
    role: 'adminTeams.roster.role',
  },
};

/** A refusal a command gives for one box, by its code. */
const boxOfCode: Readonly<Record<string, string>> = {
  'team-name-taken': 'name',
  'team-short-name-taken': 'shortName',
  'short-name-needed': 'shortName',
  'division-not-found': 'divisionId',
  'jersey-taken': 'jerseyNumber',
  'person-not-found': 'personId',
  'already-on-team': 'personId',
};

/** The jersey number core's roster-fields.ts accepts: 0 to 99, or 00. */
const jerseyShape = /^(0|00|[1-9][0-9]?)$/;

export type TeamFormRefusal = { readonly wrong: readonly string[]; readonly said: string };

/**
 * The boxes to mark and the sentence to say beside the first. A refusal about no one box
 * (the team changed meanwhile, say) marks none and is said beside the button.
 */
export function teamFormRefusal(
  form: TeamFormName,
  command: string,
  code: string,
  typed: Fields,
  issues: readonly { readonly path: string }[] = [],
): TeamFormRefusal {
  const boxes = boxesOf[form];
  const why = t(problemKey({ problem: `${command}.${code}` }) ?? 'error.unknown');
  let wrong = Object.keys(boxes).filter((box) =>
    issues.some((issue) => issue.path === box || issue.path.startsWith(`${box}.`)),
  );
  const own = boxOfCode[code];
  if (own !== undefined && own in boxes) wrong = [own];
  // A number that is not one: the box a form with a number is refused for when the
  // command names none (a new player is checked before anyone is made).
  const number = (typed['jerseyNumber'] ?? '').trim();
  if (wrong.length === 0 && code === 'invalid-input' && 'jerseyNumber' in boxes && number !== '') {
    if (!jerseyShape.test(number)) wrong = ['jerseyNumber'];
  }
  const first = wrong[0];
  const label = first === undefined ? undefined : boxes[first];
  return {
    wrong,
    said: label === undefined ? why : t('adminTeams.fieldRefused', { field: t(label), why }),
  };
}
