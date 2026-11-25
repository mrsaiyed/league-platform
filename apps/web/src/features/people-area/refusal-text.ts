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

/**
 * "Put them back" refused (a one-time notice, `notPutBack.<code>`): "Not put back: <name>.
 * <why>", the name read from the bin listing, never the form; "Not put back. <why>" when
 * the bin no longer lists them. Undefined for any other notice.
 */
export function notPutBackText(said: string, name: string | undefined): string | undefined {
  if (!said.startsWith('notPutBack.')) return undefined;
  const problem =
    said === 'notPutBack.person-profile-taken'
      ? t('error.leagues.restore_person.person-profile-taken')
      : t('error.leagues.restore_person.person-not-found');
  return name === undefined || name === ''
    ? t('adminPeople.putBack.notPutBack', { problem })
    : t('adminPeople.putBack.notPutBackNamed', { name, problem });
}
