// A signed-in person's own name (R-21, step 2.128): first and last, asked once right after
// the account is made, changed later on the account page. It belongs to the account, not to
// a league, so its commands take the account from the session (T-23) and no league.
import { z } from 'zod';
import { personName } from './person-fields.ts';

export type OwnName = { readonly firstName: string; readonly lastName: string };

/** Who is asking: the session's account, never one from the request (T-23). */
export type OwnNameContext = { readonly accountId: string; readonly requestId: string };

/** Where an account's own name is kept: its own profile (record 052). */
export type OwnNameStore = {
  /** Makes the account's own profile with this name, once. */
  readonly create: (accountId: string, name: OwnName) => Promise<'made' | 'already-has-one'>;
  /** Changes the name on the account's own profile; 'no-own-profile' when it has none. */
  readonly rename: (accountId: string, name: OwnName) => Promise<'renamed' | 'no-own-profile'>;
};

export type OwnNameDeps = { readonly ownNames: OwnNameStore };

/** Which of the two fields was refused, so the screen keeps what was typed and says which. */
export type OwnNameFieldError = {
  readonly code: 'invalid-name';
  readonly fields: readonly ('firstName' | 'lastName')[];
};

const ownNameInput = z.object({ firstName: personName, lastName: personName });

/** The name as given, trimmed; or which field is empty or too long. */
export function readOwnName(
  input: unknown,
): { readonly ok: true; readonly name: OwnName } | OwnNameFieldError {
  const parsed = ownNameInput.safeParse(input);
  if (parsed.success) return { ok: true, name: parsed.data };
  const fields = new Set<'firstName' | 'lastName'>();
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === 'firstName' || field === 'lastName') fields.add(field);
  }
  if (fields.size === 0) fields.add('firstName').add('lastName');
  return { code: 'invalid-name', fields: [...fields].sort() };
}
