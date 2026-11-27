// A person's name on the admin's screens; the order of its parts is the message file's
// (T-187). A player added at the scorer's table by number only has no name at all: they
// are "#12" (S-34), never a blank line.
import { t } from '../../server/messages.ts';

export function rosterName(person: {
  readonly firstName: string;
  readonly lastName: string;
  readonly jerseyNumber?: string | null;
}): string {
  const name = t('adminTeams.personName', {
    firstName: person.firstName,
    lastName: person.lastName,
  }).trim();
  if (name !== '') return name;
  return person.jerseyNumber === null || person.jerseyNumber === undefined
    ? t('adminTeams.noName')
    : t('adminTeams.byNumber', { number: person.jerseyNumber });
}

/**
 * "Show as: initials" or "Show as: removed", said beside the recorded name on the admin's
 * lists (R-33, step 2.146): what the person or their guardian asked for on public pages.
 * Undefined when they asked for nothing, or it was not read: the name alone is the line.
 */
export function showAsOf(person: {
  readonly nameRequest?: string | undefined;
}): string | undefined {
  if (person.nameRequest === 'initials') return t('adminPeople.showAs.list.initials');
  if (person.nameRequest === 'removed') return t('adminPeople.showAs.list.removed');
  return undefined;
}

/** Whether the person has a name, so a row can say their number before it without saying it twice. */
export const hasName = (person: { readonly firstName: string; readonly lastName: string }) =>
  `${person.firstName}${person.lastName}`.trim() !== '';

/**
 * The numbers more than one player on the roster wears now. A player added at the
 * scorer's table is taken with a number already worn (S-44), so the admin sees the clash
 * on both players and puts it right before confirming them.
 */
export function numbersWornTwice(
  lines: readonly { readonly jerseyNumber: string | null; readonly leftOn: string | null }[],
): ReadonlySet<string> {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const line of lines) {
    if (line.jerseyNumber === null || line.leftOn !== null) continue;
    if (seen.has(line.jerseyNumber)) twice.add(line.jerseyNumber);
    seen.add(line.jerseyNumber);
  }
  return twice;
}
