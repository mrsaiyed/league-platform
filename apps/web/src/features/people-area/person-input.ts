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

/** The boxes that are wrong, in the form's order. */
export function wrongBoxes(fields: PersonFields): readonly PersonBox[] {
  const typed: Partial<Record<PersonFieldName, string>> = {};
  for (const name of ['firstName', 'lastName', 'contactEmail', 'birthDate'] as const) {
    const value = fields[name];
    if (value !== undefined) typed[name] = value;
  }
  const wrong: PersonBox[] = [...wrongPersonFields(typed)];
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
 * Fixing someone's details: every box the form posted, an emptied email or birth date
 * clearing it and "Not recorded" clearing the choice; what the form did not post is left
 * as it is.
 */
export function personChangeInput(fields: PersonFields): Record<string, unknown> {
  const version = trimmed(fields['version']);
  const minor = minorOf(fields['child']);
  const cleared = (name: string) => {
    const value = trimmed(fields[name]);
    return value === '' ? null : value;
  };
  return {
    personId: trimmed(fields['personId']),
    version: /^\d{1,9}$/.test(version) ? Number(version) : undefined,
    ...(has(fields, 'firstName') ? { firstName: fields['firstName'] } : {}),
    ...(has(fields, 'lastName') ? { lastName: fields['lastName'] } : {}),
    ...(has(fields, 'contactEmail') ? { contactEmail: cleared('contactEmail') } : {}),
    ...(has(fields, 'birthDate') ? { birthDate: cleared('birthDate') } : {}),
    ...(has(fields, 'child') && minor !== 'wrong' ? { isMinor: minor } : {}),
  };
}
