// The sentence a refused People form says beside its button (step 2.50; named, step 2.155
// part 5): the command's own words when the message file has them, else the general ones.
import { catalogs } from '@srleagues/site';
import { t, type TextKey } from '../../server/messages.ts';

/** The sentence for a refusal: the command's own when the message file has one. */
export function peopleRefusalText(command: string, code: string, name?: string): string {
  const english = catalogs['en'] ?? {};
  // "Not saved" is never the word for a removal, and a removal refused names who (step 2.155).
  const lead =
    command !== 'remove_person'
      ? 'adminPeople.refused'
      : name === undefined || name === ''
        ? 'adminPeople.notRemoved'
        : 'adminPeople.notRemovedNamed';
  const problem = [`error.people.${command}.${code}`, `error.${code}`].find((key) =>
    Object.hasOwn(english, key),
  );
  return t(lead, { name: name ?? '', problem: t((problem ?? 'error.unknown') as TextKey) });
}
