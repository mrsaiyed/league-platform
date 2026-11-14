// The try did not count (there was no code to check): both of its counts are taken
// back, with any lock they set.
import type { SignInScope } from '../db/sign-in-transaction.ts';
import { normalizedUuid } from '../db/uuid.ts';
import { uncountGuess } from './guess-counts.ts';

export async function cancelGuess(scope: SignInScope, ticket: string): Promise<void> {
  if (normalizedUuid(ticket) !== ticket) return;
  await uncountGuess(scope, ticket, 'network');
  await uncountGuess(scope, ticket, 'email');
}
