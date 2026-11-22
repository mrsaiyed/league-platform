// A person's form, as typed, turned into the people commands' input (step 2.50). The
// boxes with limits are checked by core's own rule (wrongPersonFields), so the screen
// marks the box that is wrong with no second copy of the limits. Only the boxes the form
// posted are sent: a form drawn without the private details (for a role that may not see
// them, R-16) sends none, and the command then leaves them as they are.
import { wrongPersonFields, type PersonFieldName } from '@srleagues/core';

/** What a form posted: text only, by field name. */
export type PersonFields = Readonly<Record<string, string | undefined>>;

/** The boxes of the form, in its order: the ones with limits, then the child-or-adult choice. */
export type PersonBox = PersonFieldName | 'child';

const has = (fields: PersonFields, name: string): boolean => fields[name] !== undefined;
const trimmed = (value: string | undefined): string => (value ?? '').trim();

/** The child-or-adult choice as the record keeps it: unknown, a child, or an adult. */
function minorOf(choice: string | undefined): boolean | null | 'wrong' {
  if (choice === '' || choice === undefined) return null;
  if (choice === 'child') return true;
  if (choice === 'adult') return false;
  return 'wrong';
}

/** The boxes that are wrong, in the form's order; a birth date on the league's today. */
export function wrongBoxes(fields: PersonFields, leagueToday: string): readonly PersonBox[] {
  const typed: Partial<Record<PersonFieldName, string>> = {};
  for (const name of ['firstName', 'lastName', 'contactEmail', 'birthDate'] as const) {
    const value = fields[name];
    if (value !== undefined) typed[name] = value;
  }
  const wrong: PersonBox[] = [...wrongPersonFields(typed, leagueToday)];
  if (has(fields, 'child') && minorOf(fields['child']) === 'wrong') wrong.push('child');
  return wrong;
}

/** Adding someone: the names, and the private details only where they were typed. */
export function newPersonInput(fields: PersonFields): Record<string, unknown> {
  const email = trimmed(fields['contactEmail']);
  const birthDate = trimmed(fields['birthDate']);
  const minor = minorOf(fields['child']);
  return {
    firstName: fields['firstName'] ?? '',
    lastName: fields['lastName'] ?? '',
    ...(email === '' ? {} : { contactEmail: email }),
    ...(birthDate === '' ? {} : { birthDate }),
    ...(minor === null || minor === 'wrong' ? {} : { isMinor: minor }),
  };
}

/**
 * The test copy's refusal of a contact email that is not made up (step 2.205): the form
 * reads it to say the test copy's sentence at the email box (test-copy-email.ts judges it).
 */
export const onlyMadeUpEmailCode = 'only-made-up-email';

/** The hidden field that holds what a box held when the form was drawn. */
export const wasField = (box: PersonBox): string => `was.${box}`;

/**
 * Whether this person changed a box: it was posted and differs from what it held when the
 * form was drawn. A form that did not say what a box held counts it as changed.
 */
/**
 * A name as two people of it are compared: first and last, trimmed, with no regard to
 * capitals or a curly apostrophe. The "Add another?" tick carries it, so a tick given for
 * one name never lets a different name typed with it through.
 */
export function sameNameKey(firstName: string | undefined, lastName: string | undefined): string {
  return `${(firstName ?? '').trim()} ${(lastName ?? '').trim()}`
    .replace(/\s+/g, ' ')
    .replace(/[‘’]/g, "'")
    .toLowerCase();
}

export function changedBox(fields: PersonFields, box: PersonBox): boolean {
  if (!has(fields, box)) return false;
  const was = fields[wasField(box)];
  return was === undefined || fields[box] !== was;
}

/**
 * Fixing someone's details: every box this person changed, an emptied email or birth date
 * clearing it and "Not recorded" clearing the choice; a box they did not touch, or did not
 * post, is left as it is, so a save sent again after a refusal never clears what someone
 * else saved meanwhile (a child choice, a date, an email). With nothing changed the first
 * name as it stands is sent, which changes nothing.
 */
export function personChangeInput(fields: PersonFields): Record<string, unknown> {
  const version = trimmed(fields['version']);
  const minor = minorOf(fields['child']);
  const sent = (box: PersonBox) => changedBox(fields, box);
  const cleared = (name: string) => {
    const value = trimmed(fields[name]);
    return value === '' ? null : value;
  };
  const changes = {
    ...(sent('firstName') ? { firstName: fields['firstName'] } : {}),
    ...(sent('lastName') ? { lastName: fields['lastName'] } : {}),
    ...(sent('contactEmail') ? { contactEmail: cleared('contactEmail') } : {}),
    ...(sent('birthDate') ? { birthDate: cleared('birthDate') } : {}),
    ...(sent('child') && minor !== 'wrong' ? { isMinor: minor } : {}),
  };
  return {
    personId: trimmed(fields['personId']),
    version: /^\d{1,9}$/.test(version) ? Number(version) : undefined,
    ...(Object.keys(changes).length === 0 && has(fields, 'firstName')
      ? { firstName: fields['firstName'] }
      : changes),
  };
}
