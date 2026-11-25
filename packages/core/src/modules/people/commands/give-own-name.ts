// The one screen after the account is made (R-21, step 2.128): the person gives their first
// and last name, which becomes their own profile (create-own-profile, record 052). Asked
// once: an account that has its own profile already is refused, and nothing changes.
import { fail, ok, type Result } from '../../../command/index.ts';
import {
  readOwnName,
  type OwnName,
  type OwnNameContext,
  type OwnNameDeps,
  type OwnNameFieldError,
} from '../own-name.ts';

export type GiveOwnNameError = OwnNameFieldError | { readonly code: 'already-named' };

export async function giveOwnName(
  context: OwnNameContext,
  input: unknown,
  deps: OwnNameDeps,
): Promise<Result<OwnName, GiveOwnNameError>> {
  const read = readOwnName(input);
  if (!('ok' in read)) return fail(read);
  const made = await deps.ownNames.create(context.accountId, read.name);
  if (made === 'already-has-one') return fail({ code: 'already-named' });
  return ok(read.name);
}
