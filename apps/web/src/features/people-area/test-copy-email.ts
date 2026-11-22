// The test copy's rule for a contact email an admin types (step 2.205, T-13, T-201): a
// copy that is not production holds no real person's details, so on it a person's contact
// email must be made up (isMadeUpAddress), as at sign-up. Whether this is the test copy
// comes from the ports (`testCopy`), never from the form. Server only: the form itself is
// drawn in the browser, and this reads the kept-email rule of packages/providers.
import { isMadeUpAddress } from '@srleagues/providers';
import { changedBox, type PersonFields } from './person-input.ts';

/**
 * Whether the contact email the form would save is one the test copy does not take: a
 * changed, non-empty email that is not made up. An emptied box, one left as it was, and
 * anything off the test copy are taken.
 */
export function emailNotTakenHere(fields: PersonFields, testCopy: boolean): boolean {
  if (!testCopy || !changedBox(fields, 'contactEmail')) return false;
  const email = (fields['contactEmail'] ?? '').trim();
  return email !== '' && !isMadeUpAddress(email);
}
