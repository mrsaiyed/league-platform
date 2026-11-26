// The account page's "Your name" (step 2.128): the signed-in person changes the first and
// last name on their own profile. Someone who has not yet given one is refused: they are
// asked on the one screen first (give-own-name.ts).
import { fail, ok, type Result } from '../../../command/index.ts';
import {
  readOwnName,
  type OwnName,
  type OwnNameContext,
  type OwnNameDeps,
  type OwnNameFieldError,
} from '../own-name.ts';

export type ChangeOwnNameError = OwnNameFieldError | { readonly code: 'no-name-yet' };

export async function changeOwnName(
  context: OwnNameContext,
  input: unknown,
  deps: OwnNameDeps,
): Promise<Result<OwnName, ChangeOwnNameError>> {
  const read = readOwnName(input);
  if (!('ok' in read)) return fail(read);
  const renamed = await deps.ownNames.rename(context.accountId, read.name);
  if (renamed === 'no-own-profile') return fail({ code: 'no-name-yet' });
  return ok(read.name);
}
